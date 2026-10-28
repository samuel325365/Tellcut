// The Tellcut server: project API, jobs, media and export endpoints, and the built player. Loopback only.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve, sep } from 'node:path';
import { createRegistry, type Registry } from '@tellcut/engine';
import { LOOPBACK_HOST, projectRegistry, sendFile } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { HttpError, router, sendJson } from './http.ts';
import { ProjectStore, projectRoutes } from './projects.ts';
import { JobQueue, jobRoutes, type JobInfo } from './jobs.ts';
import { mediaRoutes } from './media.ts';
import { exportRoutes } from './export.ts';
import { galleryRoutes } from './gallery.ts';
import { liveRoutes } from './live.ts';
import { deleteRoutes } from './delete.ts';
import { requestRoutes } from './requests.ts';
import { ChatRunner } from './chat/runner.ts';
import { chatRoutes } from './chat/routes.ts';
import { fsRoutes } from './fs.ts';
import { importRoutes } from './import.ts';
import { presetRoutes } from './presets.ts';
import type { PresetDirs } from '@tellcut/media-node';
import { sourceRoutes } from './sources.ts';
import { TELLCUT_ROOT, claudeCmd, type Sources } from '@tellcut/media-node';
import { join } from 'node:path';

/** extras: contact sheets and transcripts after each analysis (test servers turn them off: each one loads Whisper) */
/** liveTimeout: how long an accept/reject from the chat waits for the editor (ms; tests shorten it) */
export interface AppOptions { projectsDir: string; playerDist?: string; editorDist?: string; registry?: Registry; extras?: boolean; liveTimeout?: number;
  /** the claude command for the chat (tests point it at a fake); default TELLCUT_CLAUDE or claude */
  claude?: string;
  /** where the presets are read from (tests point them at a temporary folder); default guides/presets and <projectsDir>/_presets */
  presetDirs?: PresetDirs;
  /** the outside sources the API menu lists (tests pass their own); default tellcut/sources.json and sources.local.json */
  sources?: () => Sources }

// a page may change things only from this server's own address: the editor's Vite dev server proxies /api here keeping its
// Host (127.0.0.1:5173), so its pages still match; a page on any other local port (another dev server, a notebook) does not
const ownOrigin = (origin: string, host: string | undefined) => origin.toLowerCase() === `http://${(host ?? '').toLowerCase()}`;
// the editor and the player: script files only from here (no inline script), never inside another site's frame
const PAGE_CSP = "script-src 'self'; frame-ancestors 'self'";

export function createApp(o: AppOptions) {
  const store = new ProjectStore(o.projectsDir);
  const registry = o.registry ?? createRegistry(plugins);
  const r = router();
  const queue = new JobQueue(2);
  projectRoutes(r, store);
  jobRoutes(r, queue);
  // a project's analysis finished: its chat may be waiting for it (set once the chat routes exist)
  let analyzed = (_id: string, _since: number, _jobs: JobInfo[]) => {};
  mediaRoutes(r, store, queue, { extras: o.extras !== false, onAnalyzed: (id, since, jobs) => analyzed(id, since, jobs) });
  exportRoutes(r, store, queue, async (dir, p) => { if (o.registry) return { registry: o.registry, fxErrors: [] }; const x = await projectRegistry(dir, plugins, p); return { registry: x.registry, fxErrors: x.fx.errors }; });
  const live = liveRoutes(r, store, { timeout: o.liveTimeout });
  requestRoutes(r, store);
  galleryRoutes(r, { plugins, projectsDir: o.projectsDir });
  const tellcutDir = TELLCUT_ROOT;
  const presetDirs = o.presetDirs ?? { repo: join(tellcutDir, 'guides', 'presets'), user: join(o.projectsDir, '_presets') };
  presetRoutes(r, presetDirs);
  sourceRoutes(r, o.sources);
  const chat = new ChatRunner({ cmd: o.claude ?? claudeCmd(), cwd: tellcutDir, promptFiles: ['apps/server/chat-prompt.md', 'guides/quality.md', 'guides/workflow.md'].map((f) => join(tellcutDir, f)),
    settingsFile: join(tellcutDir, 'apps/server/chat-settings.json'), projectsDir: o.projectsDir });
  analyzed = chatRoutes(r, store, chat, queue, presetDirs).afterAnalysis;
  deleteRoutes(r, store, { queue, chat, live });
  fsRoutes(r);
  importRoutes(r, store);
  const all: Array<[string, string | undefined]> = [['/player/', o.playerDist], ['/editor/', o.editorDist]];
  const mounts = all.filter((m): m is [string, string] => !!m[1]).map(([prefix, dir]) => [prefix, resolve(dir)] as const);
  const server: Server = createServer(async (req, res) => {
    try {
      // loopback binding alone does not stop DNS rebinding or cross-site form posts from a page in the user's browser
      if (!LOOPBACK_HOST.test(req.headers.host ?? '')) throw new HttpError(403, 'Forbidden host');
      const origin = req.headers.origin;
      if (origin && req.method !== 'GET' && req.method !== 'HEAD' && !ownOrigin(origin, req.headers.host)) throw new HttpError(403, 'Forbidden origin');
      // a GET from a page on another site or another local port (an <img> pointing here) could start proxies and thumbnails: the
      // browser says where it comes from; the tools send no such header, and a link opening the editor (not /api/) still works
      const site = req.headers['sec-fetch-site'];
      if ((site === 'cross-site' || site === 'same-site') && (req.url ?? '').startsWith('/api/')) throw new HttpError(403, 'Forbidden cross-site request');
      if (await r.handle(req, res)) return;
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      if (req.method === 'GET' && path === '/') { res.writeHead(302, { Location: '/editor/' }); res.end(); return; }
      for (const [prefix, dir] of mounts) {
        if (req.method !== 'GET' || !path.startsWith(prefix)) continue;
        const f = resolve(dir, path.slice(prefix.length) || 'index.html');
        if (!f.startsWith(dir + sep)) continue;
        res.setHeader('Content-Security-Policy', PAGE_CSP);
        return sendFile(req, res, f);
      }
      throw new HttpError(404, 'Not found');
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message, ...(e.body ?? {}) });
      if (e instanceof URIError) return sendJson(res, 400, { error: 'Malformed URL escape' });
      console.error(e);
      sendJson(res, 500, { error: (e as Error)?.message ?? String(e) });
    }
  });
  return {
    store, registry, queue,
    listen: (port = 0) => new Promise<number>((ok) => server.listen(port, '127.0.0.1', () => { const p = (server.address() as AddressInfo).port; chat.serverUrl = `http://127.0.0.1:${p}`; ok(p); })),
    close: () => new Promise<void>((ok) => { chat.stopAll(); queue.cancelAll(); server.closeAllConnections(); server.close(() => ok()); }),
  };
}
