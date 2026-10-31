// Live link between Claude's command line and the open editor (spec 2026-10-15-proposals-magnetic §5): SSE per open
// project, proposals, accept/reject relayed to the editor, outside writes to project.json, the editor's selection.
import { mkdirSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { ServerResponse } from 'node:http';
import { OpError } from '@tellcut/engine';
import { closeProposal, fxState, makeProposal, projectHash, proposalsDir, readProposal, saveProposal } from '@tellcut/media-node';
import { HttpError, readJson, sendJson, type Router } from './http.ts';
import { CLIENT_ID, type ProjectStore } from './projects.ts';

/** clients: each editor's stream, with the page's id when it sent one (?client=) */
interface Room { clients: Set<ServerResponse>; ids: Map<ServerResponse, string>; watchers: FSWatcher[]; state: { selection: string[]; playhead: number; at: number | null };
  waiters: Map<string, (r: { outcome: string; reason?: string }) => void>; /** watching failed this many times in a row; the restart waiting */ fails: number; retry?: NodeJS.Timeout }

/** the first wait before watching again after a watcher failed, doubled each time it fails again (at most RETRY_MAX) */
const RETRY_MS = 1000;
const RETRY_MAX = 30000;

export function liveRoutes(r: Router, store: ProjectStore, o: { timeout?: number } = {}) {
  const rooms = new Map<string, Room>();
  const room = (id: string) => {
    let x = rooms.get(id);
    if (!x) rooms.set(id, (x = { clients: new Set(), ids: new Map(), watchers: [], state: { selection: [], playhead: 0, at: null }, waiters: new Map(), fails: 0 }));
    return x;
  };
  const push = (id: string, m: unknown) => { for (const c of room(id).clients) c.write(`data: ${JSON.stringify(m)}\n\n`); };
  // a save from one tab: project.json is the one this server wrote (lastHash), so the watcher stays quiet; the other tabs
  // still hold the version before it: untold, their next edit 409s and 忽略 (Ignore) writes over this save
  store.saved.add((id, writer) => {
    const x = rooms.get(id);
    if (!x || !writer) return;   // a save that sent no id (a page from before this) cannot be told apart from the others
    for (const c of x.clients) if (x.ids.get(c) !== writer) c.write(`data: ${JSON.stringify({ type: 'changed-on-disk', by: writer })}\n\n`);
  });
  const debounce = (f: () => void) => { let t: NodeJS.Timeout | undefined; return () => { clearTimeout(t); t = setTimeout(f, 100); }; };

  function stopWatch(x: Room) { clearTimeout(x.retry); x.retry = undefined; for (const w of x.watchers) w.close(); x.watchers = []; }
  function startWatch(id: string) {
    const dir = store.dir(id), pdir = proposalsDir(dir), x = room(id);
    mkdirSync(pdir, { recursive: true });
    stopWatch(x);
    let last = JSON.stringify(readProposal(dir));
    x.watchers.push(watch(pdir, debounce(() => {
      const now = JSON.stringify(readProposal(dir));
      if (now !== last) { last = now; push(id, { type: 'proposal', proposal: JSON.parse(now) }); }
    })));
    // the project's own fx modules too: an fx edited without touching project.json left the open preview drawing the old one; also
    // a copy of My blocks (fx/lib/<slug>/…, put in place by renaming its folder: the event names the folder) and links.json, written
    // after every copy or Update, so the other tabs load it too (a copy's temporary .<slug>.tmp-… folder is left out)
    x.watchers.push(watch(dir, { recursive: true }, (_e, f) => {
      const name = String(f ?? '').replace(/\\/g, '/');
      if (name === 'project.json') onProject();
      else if (/^fx\/[^/]+\.m?js$/.test(name) || /^fx\/lib\/(?:links\.json|[a-z0-9][a-z0-9-]*(?:\/.*)?)$/.test(name)) onFx();
    }));
    // `fx`: what the fx folder is now (fxState); a tab that already loaded that state (its own Update: library.ts) skips the reload
    const onFx = debounce(() => push(id, { type: 'fx-changed', fx: fxState(dir) }));
    const onProject = debounce(() => {
      // deleted, moved or held by an antivirus between the event and the read: this tick is skipped (thrown in a timer, it
      // ended the server)
      let h: string;
      try { h = projectHash(readFileSync(join(dir, 'project.json'), 'utf8')); } catch { return; }
      if (h !== store.lastHash.get(id)) { store.lastHash.set(id, h); push(id, { type: 'changed-on-disk' }); }
    });
    // a watcher that fails (its folder gone from under it, a network drive dropping) would throw an 'error' nobody listens to, and
    // that ends the server: this project's watching stops instead, and starts again after a wait while an editor is still open
    // (it never did: only a first client started it). Not seen on Windows 11 with rd or rmSync, which end it quietly
    const mine = x.watchers;
    for (const w of mine) w.on('error', () => {
      if (x.watchers !== mine) return;   // one restart for all of this start's watchers
      stopWatch(x);
      const wait = Math.min(RETRY_MAX, RETRY_MS * 2 ** x.fails++);
      x.retry = setTimeout(() => {
        x.retry = undefined;
        if (rooms.get(id) !== x || !x.clients.size) return;
        try { startWatch(id); } catch { /* the project is gone: nothing to watch; its editors are told on their next request */ }
      }, wait);
    });
  }

  r.get('/api/projects/:id/events', (req, res, { id }) => {
    const dir = store.dir(id), x = room(id);
    if (!store.lastHash.has(id)) store.lastHash.set(id, projectHash(readFileSync(join(dir, 'project.json'), 'utf8')));
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    if (!x.clients.size) { x.fails = 0; startWatch(id); }
    x.clients.add(res);
    const client = new URL(req.url ?? '', 'http://x').searchParams.get('client');
    if (client && CLIENT_ID.test(client)) x.ids.set(res, client);
    res.write(`data: ${JSON.stringify({ type: 'hello', proposal: readProposal(dir) })}\n\n`);
    const bye = () => {
      if (!x.clients.delete(res)) return;
      x.ids.delete(res);
      if (!x.clients.size) stopWatch(x);
    };
    req.on('close', bye); res.on('close', bye);
  });

  r.get('/api/projects/:id/proposal', (_req, res, { id }) => sendJson(res, 200, readProposal(store.dir(id))));
  r.put('/api/projects/:id/proposal', async (req, res, { id }) => {
    const b: any = await readJson(req), dir = store.dir(id);
    if (typeof b?.label !== 'string' || !Array.isArray(b?.ops)) throw new HttpError(400, 'body: { label, ops[] }');
    let p;
    try { p = makeProposal(dir, b.label, b.ops, store.read(id)); }
    catch (e) { if (e instanceof OpError) throw new HttpError(400, e.message); throw e; }
    // an accept / reject still waiting on the proposal this one replaces is answered now (it waited until a 504 before)
    const old = readProposal(dir), x = room(id), w = old && old.id !== p.id ? x.waiters.get(old.id) : undefined;
    if (old && w) { x.waiters.delete(old.id); w({ outcome: 'superseded', reason: '編輯器還沒回應前，送來了新的提議：舊的作廢，改看新的' }); }
    saveProposal(dir, p);
    sendJson(res, 200, p);
  });

  for (const action of ['accept', 'reject'] as const) r.post(`/api/projects/:id/proposal/${action}`, async (_req, res, { id }) => {
    const p = readProposal(store.dir(id)), x = room(id);
    if (!p) throw new HttpError(404, '沒有待處理的提議');
    if (!x.clients.size) throw new HttpError(409, '編輯器沒開');
    // a second accept/reject while the editor is still deciding the first would take over its answer (the first got a 504)
    if (x.waiters.has(p.id)) throw new HttpError(409, '這個提議正在處理中');
    const result = await new Promise<{ outcome: string; reason?: string } | null>((resolve) => {
      const t = setTimeout(() => { x.waiters.delete(p.id); resolve(null); }, o.timeout ?? 10000);
      x.waiters.set(p.id, (r) => { clearTimeout(t); resolve(r); });
      // one editor decides (the newest one): two tabs must not both apply it
      const newest = [...x.clients].at(-1)!;
      newest.write(`data: ${JSON.stringify({ type: `${action}-request`, id: p.id })}\n\n`);
    });
    if (!result) throw new HttpError(504, '編輯器沒有回應');
    sendJson(res, 200, result);
  });

  r.post('/api/projects/:id/proposal/result', async (req, res, { id }) => {
    const b: any = await readJson(req);
    if (!['accepted', 'rejected', 'stale'].includes(b?.outcome)) throw new HttpError(400, 'outcome: accepted | rejected | stale');
    const closed = closeProposal(store.dir(id), String(b.id), b.outcome, b.reason);
    if (!closed) throw new HttpError(409, '這個提議已經結案');
    const w = room(id).waiters.get(closed.id);
    room(id).waiters.delete(closed.id);
    w?.({ outcome: b.outcome, ...(b.reason ? { reason: b.reason } : {}) });
    push(id, { type: 'proposal', proposal: null, outcome: b.outcome });
    sendJson(res, 200, closed);
  });

  r.put('/api/projects/:id/editor-state', async (req, res, { id }) => {
    store.dir(id);
    const b: any = await readJson(req);
    room(id).state = { selection: Array.isArray(b?.selection) ? b.selection.map(String) : [], playhead: Number(b?.playhead) || 0, at: Date.now() };
    sendJson(res, 200, { ok: true });
  });
  r.get('/api/projects/:id/editor-state', (_req, res, { id }) => {
    store.dir(id);
    const x = room(id);
    sendJson(res, 200, { connected: x.clients.size > 0, ...x.state });
  });
  return {
    /** a project about to be deleted: its folder watchers closed (they hold the folder open), its editors' streams ended */
    forget(id: string) {
      const x = rooms.get(id);
      if (!x) return;
      stopWatch(x);
      for (const c of x.clients) c.end();
      rooms.delete(id);
    },
  };
}
