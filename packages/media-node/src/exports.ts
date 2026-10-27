// Where finished films go (review3 R3-H2): projects/<id>/exports/<name>-<YYYYMMDD-HHmm>.mp4 (+ .log), from the editor and the
// command line alike, so the page lists them all; output/ keeps frames and stills only.
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

/** the films in exports/, newest first (not the .video.mp4 a render leaves while it works) */
export function listExports(dir: string): Array<{ name: string; path: string; size: number; mtime: number }> {
  const d = join(dir, 'exports');
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith('.mp4') && !f.endsWith('.video.mp4'))
    .map((name) => { const st = statSync(join(d, name)); return { name, path: join(d, name), size: st.size, mtime: st.mtimeMs }; })
    .sort((a, b) => b.mtime - a.mtime);
}
