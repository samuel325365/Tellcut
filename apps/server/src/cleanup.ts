// spec §8: a server that crashed mid-save or mid-export leaves temp files behind; clear them at the next start. Also a deleted
// project's folder a locked file kept (delete.ts). Also the home page's
// conversations nobody wrote in (one moved to its project keeps only a note; the browser started a new one).
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
// temp names that carry the writing process id (projects.ts write, export.ts snapshot and index, a gallery music preview being
// composed in _gallery/: score-child.ts)
const PID_FILES = [/^project\.json\.(\d+)\.tmp$/, /^\.export-\w+-(\d+)\.json$/, /^score-[^/\\]+\.wav\.(\d+)\.tmp$/];
const PID_CACHE = /^index-\w+-(\d+)\.json$/;
// half-written files with no pid, so only stale ones go: cache temps (media.ts cached, analysis.ts atomic, prepare.ts cuts)
// and an interrupted export's intermediates (render.ts .video.mp4 / .mix.wav, hidden from the export list)
const PARTIAL = /\.tmp\.\w+$/, INTERMEDIATE = /\.(video\.mp4|mix\.wav)$/;
const CACHE_DIRS = ['media', 'analysis', 'cuts', 'stills', 'audio'];
const LIBRARY_ASIDE = /^\.[a-z0-9][a-z0-9-]*\.(?:deleting|old|tmp|thumb)-(\d+)-\d+$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) { const f = join(dir, e.name); if (e.isDirectory()) walk(f, out); else out.push(f); }
  return out;
}

/** Removes leftovers of dead processes (and partial files older than maxAge); returns the removed paths. */
export function cleanupLeftovers(projectsDir: string, o: { alive?: (pid: number) => boolean; now?: number; maxAge?: number; remove?: (f: string) => void } = {}): string[] {
  const alive = o.alive ?? isAlive, now = o.now ?? Date.now(), maxAge = o.maxAge ?? 3600_000, removed: string[] = [];
  const remove = o.remove ?? ((f: string) => rmSync(f, { force: true }));
  // a locked file (antivirus, a player holding it) is left for next time: cleanup must never stop the server starting
  const drop = (f: string) => { try { remove(f); removed.push(relative(projectsDir, f)); } catch { /* still locked */ } };
  const stale = (f: string) => { try { return now - statSync(f).mtimeMs > maxAge; } catch { return false; } };
  // a pid alive again may belong to another program by now (pids get reused): a day-old leftover goes anyway
  const DAY = 24 * 3600_000;
  const leftover = (f: string, name: string, res: RegExp[]) => {
    for (const re of res) {
      const m = re.exec(name);
      if (m) return !alive(Number(m[1])) || (() => { try { return now - statSync(f).mtimeMs > DAY; } catch { return false; } })();
    }
    return false;
  };
  for (const d of existsSync(projectsDir) ? readdirSync(projectsDir, { withFileTypes: true }) : []) {
    if (!d.isDirectory()) continue;
    const p = join(projectsDir, d.name);
    for (const name of readdirSync(p)) if (leftover(join(p, name), name, PID_FILES)) drop(join(p, name));
    const cache = join(p, 'cache');
    for (const name of existsSync(cache) ? readdirSync(cache) : []) if (leftover(join(cache, name), name, [PID_CACHE])) drop(join(cache, name));
    for (const f of CACHE_DIRS.flatMap((dir) => walk(join(cache, dir)))) if (PARTIAL.test(f) && stale(f)) drop(f);
    for (const f of walk(join(p, 'exports'))) if (INTERMEDIATE.test(f) && stale(f)) drop(f);
  }
  // a delete whose folder could not be removed at once (a file in use then: delete.ts)
  for (const d of existsSync(projectsDir) ? readdirSync(projectsDir, { withFileTypes: true }) : []) {
    if (!d.isDirectory() || !d.name.startsWith('.deleting-')) continue;
    try { rmSync(join(projectsDir, d.name), { recursive: true, force: true }); removed.push(d.name); } catch { /* still in use */ }
  }
  // My blocks' folders set aside by a process that is gone (media-node library/: a delete or a replaced entry that could not be
  // removed then, a save's or a thumbnail's own folder)
  const blocks = join(projectsDir, '_library', 'blocks');
  for (const name of existsSync(blocks) ? readdirSync(blocks) : []) {
    const f = join(blocks, name);
    if (!leftover(f, name, [LIBRARY_ASIDE])) continue;
    try { rmSync(f, { recursive: true, force: true }); removed.push(relative(projectsDir, f)); } catch { /* still in use */ }
  }
  // home drafts (and the old single home thread) without a word from the user, a day old: the browser has a new one by now
  const home = join(projectsDir, '_home');
  for (const name of existsSync(home) ? readdirSync(home) : []) {
    if (name !== 'chat.json' && !/^home-[a-z0-9]{6,24}\.json$/.test(name)) continue;
    const f = join(home, name);
    try {
      if (now - statSync(f).mtimeMs <= DAY) continue;
      const t = JSON.parse(readFileSync(f, 'utf8')) as { messages?: Array<{ role?: string }> };
      if (!t.messages?.some((m) => m.role === 'user')) drop(f);
    } catch { /* unreadable: left alone */ }
  }
  return removed;
}
