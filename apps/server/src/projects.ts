// project.json storage (spec §6.1, §8): list, read, validated atomic writes with a 20-version history.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import type { ServerResponse } from 'node:http';
import { parseProject, ProjectError, type Project } from '@tellcut/engine';
import { contentType, PROJECT_HISTORY_KEEP, PROJECT_ID, projectHash, sendFile, withImportQuery, writeProjectFile } from '@tellcut/media-node';
import { HttpError, readJson, sendJson, type Router } from './http.ts';

export const HISTORY_KEEP = PROJECT_HISTORY_KEEP;
/** an editor page's id (X-Tellcut-Client on its saves, ?client= on its live stream) */
export const CLIENT_ID = /^[\w-]{1,64}$/;
const ID = PROJECT_ID;

/** The frame the home page shows for a project: a moment into its first clip (the main track's, else any video track's). */
export function posterOf(p: Project): { source: string; t: number } | null {
  const tracks = (p.tracks as any[]).filter((t) => t.kind === 'video' && t.items.length).sort((a, b) => (b.magnetic ? 1 : 0) - (a.magnetic ? 1 : 0));
  const first = tracks[0]?.items.slice().sort((a: any, b: any) => a.start - b.start)[0];
  const src = first && p.sources[first.source];
  if (!src) return null;
  if (src.kind === 'image') return { source: first.source, t: 0 };
  const len = first.end - first.start;
  return { source: first.source, t: Math.round(Math.min(src.duration - 0.05, first.in + Math.min(1, len / 2) * first.speed) * 1000) / 1000 };
}

/**
 * Headers for a file out of a project folder (assets, demo kits, exports, history): an HTML or SVG page there opened on this
 * server would run its scripts as this origin, which passes the Origin check. As a document it is sandboxed with nothing
 * allowed; as an <img>, a fetch or a module import the page's own policy applies, not this one. Video and audio keep no
 * sandbox: opened in a tab, the browser's player page loads the file again, which `default-src 'none'` would refuse.
 */
export function fileHeaders(res: ServerResponse, path: string): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const type = contentType(path);
  if (!type.startsWith('video/') && !type.startsWith('audio/')) res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
}
const MODULE = /\.m?js$/i, VERSION = /^[\w.-]{1,64}$/;
/** sendFile with fileHeaders. A module asked for with a version (`?v=…`: browser-fx's importFx, the editor reloading fx) comes with
 *  that version on each of its relative imports: the browser keeps a module by its URL for the page's life, so with the version on
 *  the file meta.fx names alone, an edited helper (./util.js) kept coming out of that cache (Node's side: media-node fx.ts) */
export function sendProjectFile(req: Parameters<typeof sendFile>[0], res: ServerResponse, path: string) {
  fileHeaders(res, path);
  const v = MODULE.test(path) && !req.headers.range ? new URL(req.url ?? '/', 'http://x').searchParams.get('v') : null;
  if (v && VERSION.test(v)) {
    let src: string | null = null;
    try { if (statSync(path).isFile()) src = readFileSync(path, 'utf8'); } catch { /* missing: sendFile answers */ }
    if (src !== null) {
      const body = withImportQuery(src, `v=${v}`);
      res.writeHead(200, { 'Content-Type': contentType(path), 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
  }
  return sendFile(req, res, path);
}

export class ProjectStore {
  /** hash of the project.json each project was last saved with by this server (outside writes differ: live.ts) */
  readonly lastHash = new Map<string, string>();
  /** told after an editor's PUT, with the page that wrote it (its client id, when it sent one): live.ts tells the other tabs */
  readonly saved = new Set<(id: string, writer: string | undefined) => void>();
  constructor(readonly root: string) {}

  dir(id: string): string {
    if (!ID.test(id)) throw new HttpError(400, `Invalid project id "${id}"`);
    const d = join(this.root, id);
    if (!existsSync(join(d, 'project.json'))) throw new HttpError(404, `No project "${id}"`);
    // NTFS finds the folder demo for Demo: one project under two ids had two chat turns at once (the turn lock is this process's,
    // so free to it), and a delete that missed the other id's turn and jobs. Every route comes through here, so only the
    // folder's own spelling is a project (a junction named otherwise, its target's name unlike the id, is left alone)
    let real = id;
    try { real = basename(realpathSync.native(d)); } catch { /* unreadable: as it was */ }
    if (real !== id && real.toLowerCase() === id.toLowerCase()) throw new HttpError(404, `No project "${id}" (it is "${real}")`);
    return d;
  }

  list() {
    return readdirSync(this.root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && ID.test(e.name) && existsSync(join(this.root, e.name, 'project.json')))
      .map((e) => e.name).sort()
      .map((id) => {
        try {
          const p = this.read(id), dir = join(this.root, id);
          // footage that is not on this PC (a sample project handed over without its sources): the home page says so
          const gone = new Set(Object.entries(p.sources).filter(([, s]) => !existsSync(resolve(dir, s.path))).map(([k]) => k));
          const poster = posterOf(p);
          return { id, name: p.meta.name, width: p.meta.width, height: p.meta.height, duration: p.meta.duration,
            poster: poster && gone.has(poster.source) ? null : poster, ...(gone.size ? { missing: gone.size } : {}) };
        }
        catch (err) {
          const issues = (err as HttpError).body?.issues as string[] | undefined;
          return { id, error: (err as Error).message + (issues ? `: ${issues.join('; ')}` : '') };
        }
      });
  }

  /** a deleted project: nothing of it kept */
  forget(id: string): void { this.lastHash.delete(id); this.parsed.delete(id); }

  raw(id: string): unknown {
    const f = join(this.dir(id), 'project.json');
    try { return JSON.parse(readFileSync(f, 'utf8')); }
    catch (e) { throw new HttpError(422, 'project.json is not valid JSON', { issues: [(e as Error).message] }); }
  }

  /** the last project.json read per project, by its size and times: media requests (dozens a second while seeking)
   *  read the project each time, and reading + validating it was most of their cost */
  private parsed = new Map<string, { key: string; p: Project }>();

  read(id: string): Project {
    const f = join(this.dir(id), 'project.json'), st = statSync(f), key = `${st.size}|${st.mtimeMs}|${st.ctimeMs}`;
    const hit = this.parsed.get(id);
    if (hit?.key === key) return structuredClone(hit.p);   // a copy: callers may change what they get
    let p: Project;
    try { p = parseProject(this.raw(id)); }
    catch (e) { if (e instanceof ProjectError) throw new HttpError(422, 'Invalid project.json', { issues: e.issues }); throw e; }
    this.parsed.set(id, { key, p });
    return structuredClone(p);
  }

  /** project.json read once, checked, and the hash of that same text (its ETag): read three times, a save landing between the
   *  reads paired the new body with the old tag, and the editor's next save got a 409 for nothing */
  snapshot(id: string): { raw: unknown; version: string } {
    const text = readFileSync(join(this.dir(id), 'project.json'), 'utf8');
    let raw: unknown;
    try { raw = JSON.parse(text); } catch (e) { throw new HttpError(422, 'project.json is not valid JSON', { issues: [(e as Error).message] }); }
    try { parseProject(raw); }
    catch (e) { if (e instanceof ProjectError) throw new HttpError(422, 'Invalid project.json', { issues: e.issues }); throw e; }
    return { raw, version: projectHash(text) };
  }

  /** the version of project.json on disk: the hash of its text (an ETag) */
  version(id: string): string { return projectHash(readFileSync(join(this.dir(id), 'project.json'), 'utf8')); }

  /** base: the version the editor started from; another one on disk now (a second tab, Claude) is a 409, nothing written */
  write(id: string, body: unknown, base?: string): Project {
    const d = this.dir(id);
    let p: Project;
    try { p = parseProject(body); }
    catch (e) { if (e instanceof ProjectError) throw new HttpError(400, 'Invalid project', { issues: e.issues }); throw e; }
    if (base !== undefined && base !== this.version(id)) throw new HttpError(409, '專案在別的地方被改過（另一個分頁或 Agent）', { conflict: true, code: 'project.conflict' });
    // the same writer as npm run cut / new (media-node projectfile.ts): one history, one way of keeping it short
    this.lastHash.set(id, writeProjectFile(d, body, 'editor'));
    return p;
  }

  history(id: string): string[] {
    const h = join(this.dir(id), '.history');
    return existsSync(h) ? readdirSync(h).filter((f) => f.endsWith('.json')).sort().reverse() : [];
  }

  historyFile(id: string, name: string): string {
    if (!/^[\w.-]+\.json$/.test(name) || name.includes('..')) throw new HttpError(400, 'Invalid history name');
    const f = join(this.dir(id), '.history', name);
    if (!existsSync(f)) throw new HttpError(404, `No history version "${name}"`);
    return f;
  }

  /** A file inside the project directory (never outside it). */
  file(id: string, rel: string): string {
    const d = resolve(this.dir(id)), f = resolve(d, rel);
    if (!f.startsWith(d + sep)) throw new HttpError(404, 'Not found');
    return f;
  }
}

export function projectRoutes(r: Router, store: ProjectStore) {
  r.get('/api/projects', (_req, res) => sendJson(res, 200, store.list()));
  // ETag / If-Match: a save made from an older version than the one on disk is refused (two tabs must not undo each other)
  const tag = (v: string) => `"${v}"`;
  r.get('/api/projects/:id', (_req, res, { id }) => { const s = store.snapshot(id); sendJson(res, 200, s.raw, { ETag: tag(s.version) }); });
  r.put('/api/projects/:id', async (req, res, { id }) => {
    const m = req.headers['if-match'], base = typeof m === 'string' ? m.replace(/^W\//, '').replace(/"/g, '') : undefined;
    store.write(id, await readJson(req), base);
    // the page that saved (api.ts sends its id): the other tabs on this project must hear of it, it must not
    const c = req.headers['x-tellcut-client'], writer = typeof c === 'string' && CLIENT_ID.test(c) ? c : undefined;
    for (const f of store.saved) f(id, writer);
    sendJson(res, 200, { ok: true }, { ETag: tag(store.lastHash.get(id)!) });
  });
  r.get('/api/projects/:id/history', (_req, res, { id }) => sendJson(res, 200, store.history(id)));
  r.get('/api/projects/:id/history/:name', (req, res, { id, name }) => sendProjectFile(req, res, store.historyFile(id, name)));
  r.get('/api/projects/:id/files/*', (req, res, { id, rest }) => sendProjectFile(req, res, store.file(id, rest)));
}
