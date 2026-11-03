// Where finished films go (review3 R3-H2): projects/<id>/exports/<name>-<YYYYMMDD-HHmm>.mp4 (+ .log), from the editor and the
// command line alike, so the page lists them all; output/ keeps frames and stills only.
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { lockHolder, tryLock } from './locks.ts';

const pad = (n: number) => String(n).padStart(2, '0');
export const exportStamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
/** A Windows-safe file name from the project name. */
export const safeName = (s: string, fallback: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[. ]+$/, '') || fallback;

/** A free exports/<name>-<stamp> path without its extension (-2, -3… for two exports in one minute), reserved by creating its
 *  empty .log at once: a render writes its .video.mp4 and .mix.wav for minutes and the .mp4 and .log only at the end, so a CLI
 *  render and an editor export started in the same minute used to get the same name and write over each other. */
export function nextExportBase(dir: string, name: string, id: string, now = new Date()): string {
  const stem = join(dir, 'exports', `${safeName(name, id)}-${exportStamp(now)}`);
  mkdirSync(dirname(stem), { recursive: true });
  for (let i = 1; ; i++) {
    const base = i === 1 ? stem : `${stem}-${i}`;
    if (existsSync(`${base}.mp4`) || existsSync(`${base}.video.mp4`)) continue;
    try { closeSync(openSync(`${base}.log`, 'wx')); return base; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  }
}

/** the films in exports/, newest first (not the .video.mp4 or .part.mp4 a render leaves while it works) */
export function listExports(dir: string): Array<{ name: string; path: string; size: number; mtime: number }> {
  const d = join(dir, 'exports');
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith('.mp4') && !f.endsWith('.video.mp4') && !f.endsWith('.part.mp4'))
    .map((name) => { const st = statSync(join(d, name)); return { name, path: join(d, name), size: st.size, mtime: st.mtimeMs }; })
    .sort((a, b) => b.mtime - a.mtime);
}

/** projects/<id>/cache/export.lock: held for a whole export (prepare, frames, mix) by whatever exports the project, the server's
 *  export job and `npm run render` / `batch:render` alike. A server's job queue keeps one export at a time in that process only:
 *  two servers on the same projects/, or a server and the command line, rendered one project at once (twice the Chrome and
 *  ffmpeg, each cutting the same clips into cache/). Across processes (locks.ts, the same as a chat turn's); the second one is
 *  refused, it does not wait. */
export const exportLock = (dir: string) => join(dir, 'cache', 'export.lock');

/** the project's export lock, taken now and kept fresh until the returned release is called; null when another live process is
 *  exporting the project */
export function tryExportLock(dir: string): (() => void) | null {
  mkdirSync(join(dir, 'cache'), { recursive: true });
  return tryLock(exportLock(dir));
}

/** what a command line says when another process is exporting the project; null when none is */
export function exportBusy(dir: string): string | null {
  const h = lockHolder(exportLock(dir));
  return h ? `這個專案正在別處輸出（Tellcut 伺服器或另一個 render${h.pid ? `，程序 ${h.pid}` : ''}）：等它結束再輸出` : null;
}
