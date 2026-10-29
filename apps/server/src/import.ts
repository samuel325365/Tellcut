// The media panel's Import (spec 2026-10-29-media-import): files and folders on this PC looked at and named the way `npm run new`
// names them, handed back to the editor, which adds them as one undoable edit and saves them itself. project.json is never written
// here: a write from the server would collide with the editor's unsaved edits.
import { isAbsolute, resolve } from 'node:path';
import { expandInputs, ingestFiles, kindOf, samePath, type Skipped } from '@tellcut/media-node';
import { HttpError, readJson, type Router } from './http.ts';
import type { ProjectStore } from './projects.ts';

/** at most this many media files in one import (a whole drive picked by mistake is refused before anything is read) */
export const IMPORT_MAX = 200;
/** and the folder walk gives up after looking at this many names (a drive of mostly other files) */
export const IMPORT_SCAN_MAX = 10000;

type Body = { paths: string[]; taken: string[]; have: Array<{ id: string; path: string }> };
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');

function body(raw: unknown): Body {
  const b = raw as Partial<Body> | undefined;
  const have = b?.have ?? [];
  if (!b || !strings(b.paths) || !strings(b.taken ?? []) || !Array.isArray(have) || !have.every((h) => typeof h?.id === 'string' && typeof h?.path === 'string'))
    throw new HttpError(400, 'Expected { paths: string[], taken: string[], have: { id, path }[] }');
  return { paths: b.paths, taken: b.taken ?? [], have };
}

export function importRoutes(r: Router, store: ProjectStore) {
  // one import per project at a time: two converting the same HEIC would pick the same free name in media/
  const chains = new Map<string, Promise<unknown>>();
  r.post('/api/projects/:id/import', async (req, res, { id }) => {
    const dir = store.dir(id), b = body(await readJson(req));
    const urls = b.paths.filter((p) => /^https?:\/\//i.test(p)), local = b.paths.filter((p) => !urls.includes(p));
    const rel = local.find((p) => !isAbsolute(p));
    if (rel !== undefined) throw new HttpError(400, `請給完整路徑：${rel}`, { code: 'fs.notAbsolute' });
    const x = await expandInputs(local, { maxMedia: IMPORT_MAX, maxEntries: IMPORT_SCAN_MAX }), media = x.files.filter((f) => kindOf(f));
    if (x.cut || media.length > IMPORT_MAX) {
      // a walk that stopped early knows only that there are more than the limit it passed
      const n = !x.cut ? media.length : media.length > IMPORT_MAX ? `${IMPORT_MAX}+` : `${IMPORT_SCAN_MAX}+`;
      throw new HttpError(400, `一次最多加 ${IMPORT_MAX} 個檔案（這次有 ${n} 個）`, { code: 'import.tooMany', params: { n, max: IMPORT_MAX } });
    }
    // already in the project: by the paths the editor holds now (the disk may lag behind it)
    const owned = new Map(b.have.map((h) => [samePath(resolve(dir, h.path)), h.id]));
    const same = x.files.filter((f) => owned.has(samePath(f))).map((f) => ({ path: f, id: owned.get(samePath(f))! }));
    const files = x.files.filter((f) => !owned.has(samePath(f)));
    const skipped: Skipped[] = [...urls.map((u) => ({ path: u, code: 'import.url' as const, params: { path: u }, message: `${u}: a URL (ask the Agent)` })), ...x.skipped];

    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
    const send = (o: unknown) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
    const run = (chains.get(id) ?? Promise.resolve()).catch(() => {}).then(() =>
      ingestFiles(dir, files, new Set(b.taken), { onFile: (done, total) => send({ progress: done, total }) }));
    chains.set(id, run);
    try {
      const got = await run;
      send({ done: true, sources: got.sources, media: got.music, skipped: [...skipped, ...got.skipped], same, others: x.others });
    } catch (e) {
      send({ error: (e as Error).message, code: 'import.failed', params: { why: (e as Error).message } });
    } finally {
      if (chains.get(id) === run) chains.delete(id);
      res.end();
    }
  });
}

