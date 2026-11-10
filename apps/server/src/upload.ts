// Files dropped on the editor from Explorer or Finder (spec 2026-11-10-media-panel-visual §4). A page is never told where a dropped
// file is on disk, so the editor sends its bytes: each goes into the project's media/import/ under its own name (another -2, -3 …
// when taken), keeping its modified time so analysis shares its results with another project that has the same file. `check` asks
// first whether the project already has each one (same name, size and time: the project's own files and what media/import holds),
// so dropping a file twice adds it once and sends nothing. The editor then imports the paths given back, the way Import does.
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, renameSync, statSync, unlinkSync, utimesSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { mediaKindOfName } from '@tellcut/protocol';
import { HttpError, readJson, sendJson, type Router } from './http.ts';
import type { ProjectStore } from './projects.ts';
import type { ProjectHolds } from './delete.ts';

/** two times this close are the same file's (FAT and zip keep two-second times) */
const SAME_TIME_MS = 2000;
/** a name with no folder part and nothing the file system refuses (a Mac's name can hold a colon, a Windows one cannot) */
export function uploadName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  return base.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '');
}
/** the file's name as it was dropped: a copy named apart (name-2.mp4) answers to name.mp4 too */
const dropNames = (file: string) => { const a = file.toLowerCase(), b = a.replace(/-\d+(\.[^.]+)$/, '$1'); return a === b ? [a] : [a, b]; };

/** the free name in `dir` for `name`, reserved by creating its .part (two uploads of one name at once get two names) */
function reserve(dir: string, name: string): { file: string; part: string; fd: number } {
  for (let n = 1; ; n++) {
    const file = join(dir, n === 1 ? name : name.replace(/(\.[^.]+)?$/, (ext) => `-${n}${ext}`)), part = `${file}.part`;
    if (existsSync(file)) continue;
    try { return { file, part, fd: openSync(part, 'wx') }; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  }
}

type Want = { name: string; size: number; mtime: number };
function wants(raw: unknown): Want[] {
  const f = (raw as { files?: unknown } | undefined)?.files;
  if (!Array.isArray(f) || !f.every((x) => typeof x?.name === 'string' && Number.isFinite(x?.size) && Number.isFinite(x?.mtime)))
    throw new HttpError(400, 'Expected { files: { name, size, mtime }[] }');
  return f;
}

export function uploadRoutes(r: Router, store: ProjectStore, holds?: ProjectHolds) {
  r.post('/api/projects/:id/upload/check', async (req, res, { id }) => {
    const files = wants(await readJson(req)), dir = store.dir(id);
    // what the project has: its sources and music as written, and whatever media/import holds (a drop the editor has not saved yet)
    const p = (() => { try { return store.raw(id) as { sources?: Record<string, { path?: string }>; media?: Record<string, { path?: string }> }; } catch { return {}; } })();
    const paths = [...Object.values(p.sources ?? {}), ...Object.values(p.media ?? {})].flatMap((x) => (typeof x?.path === 'string' ? [resolve(dir, x.path)] : []));
    const imp = join(dir, 'media', 'import');
    if (existsSync(imp)) for (const f of readdirSync(imp)) if (!f.endsWith('.part')) paths.push(join(imp, f));
    const known = [...new Set(paths)].flatMap((f) => { try { const s = statSync(f); return s.isFile() ? [{ f, names: dropNames(f.split(/[\\/]/).pop()!), size: s.size, mtime: s.mtimeMs }] : []; } catch { return []; } });
    // a file of that very name first, then a copy named apart
    const found = files.map((w) => {
      const n = uploadName(w.name).toLowerCase(), same = known.filter((k) => k.size === w.size && Math.abs(k.mtime - w.mtime) <= SAME_TIME_MS);
      return (same.find((k) => k.names[0] === n) ?? same.find((k) => k.names.includes(n)))?.f ?? null;
    });
    sendJson(res, 200, { found });
  });

  r.put('/api/projects/:id/upload', async (req, res, { id }, url) => {
    const name = uploadName(url.searchParams.get('name') ?? ''), mtime = Number(url.searchParams.get('mtime'));
    if (!mediaKindOfName(name)) throw new HttpError(400, `${name || '(no name)'}: not a video, photo or sound`, { code: 'import.notMedia', params: { path: name } });
    const dir = store.dir(id);
    // a delete meanwhile would leave the upload writing into a folder that is gone (delete.ts waits)
    const release = holds?.hold(id, { text: `這個專案正在匯入檔案（${name}），等匯入完再刪`, code: 'delete.busyImport', params: { file: name } });
    try {
      const imp = join(dir, 'media', 'import');
      mkdirSync(imp, { recursive: true });
      const { file, part, fd } = reserve(imp, name);
      try {
        await pipeline(req, createWriteStream('', { fd }));
        renameSync(part, file);
      } catch (e) {
        try { closeSync(fd); } catch { /* the stream closed it */ }
        try { unlinkSync(part); } catch { /* already gone */ }
        if (req.destroyed && !req.complete) return;   // the page went away mid-file: nobody to answer
        throw e;
      }
      if (Number.isFinite(mtime) && mtime > 0) utimesSync(file, new Date(), new Date(mtime));
      sendJson(res, 200, { path: file });
    } finally { release?.(); }
  });
}
