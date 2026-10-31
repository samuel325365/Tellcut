// A file saying which process is doing a long job on a source (its analysis, its transcript), so another process — the server
// and the page chat's inspect run side by side — waits for it or leaves it alone instead of doing the same work over the same
// temporary files. A lock whose process is gone (a crash) does not count, and neither does one its holder stopped refreshing:
// Windows soon gives a dead process's pid to another one, and that lock then looked held for good.
// The races (review R4-T1, the same ones sources/rate.ts had, review M-7): a lock is made with its content already in it (a temp
// file hard-linked to the lock's name), so it is never seen empty and judged stale; one that is unreadable all the same (made the
// old way, or on a file system without links) counts as held while it is young; a stale lock is moved aside before it is removed
// (takeOver), so a late waiter cannot delete the fresh lock another waiter has just made in its place.
import { closeSync, linkSync, openSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync, writeSync } from 'node:fs';

/** a holder touches its file this often (ms); one untouched for STALE is gone; an unreadable one younger than YOUNG is being made */
const EVERY = 30_000, STALE = 3 * 60_000, YOUNG = 5_000;
/** a takeover guard is held for a moment; one this old is gone even if its pid now names a live process (Windows reuses them) */
const GUARD_STALE = 60_000;
/** on Windows a lock another process just removed is still "delete pending", and an indexer or antivirus may have it open */
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);
const code = (e: unknown) => (e as NodeJS.ErrnoException)?.code ?? '';
const nap = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** EPERM: the process exists but belongs to someone with more rights (e.g. an elevated shell on Windows) — still alive */
export const isAlive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch (e) { return code(e) === 'EPERM'; }
};

/** the other live process holding `file`, and since when (ms); null when free, stale or held by this process. A lock that cannot
 *  be read yet (just made, not written) is held by someone unknown (pid 0) while it is young. */
export function lockHolder(file: string): { pid: number; started: number } | null {
  let mtime: number;
  try { mtime = statSync(file).mtimeMs; } catch { return null; }
  if (Date.now() - mtime > STALE) return null;
  let l: { pid: number; started: number } | null = null;
  try { l = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { if (code(e) === 'ENOENT') return null; }
  if (typeof l?.pid !== 'number') return Date.now() - mtime < YOUNG ? { pid: 0, started: mtime } : null;
  return l.pid !== process.pid && isAlive(l.pid) ? l : null;
}

/** `file` moved aside (a rename, which only one of several callers wins) and removed when `gone(path)` still says so of it; one
 *  that is not is linked back (link fails if the name has been taken meanwhile, never overwrites) */
function moveAside(file: string, gone: (path: string) => boolean) {
  const aside = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.stale`;
  try { renameSync(file, aside); } catch { return; }
  try { if (!gone(aside)) linkSync(aside, file); } catch { /* the name is someone's again */ }
  try { rmSync(aside, { force: true }); } catch { /* left over: harmless */ }
}

/** A lock out of the way when `free(file)` says so. Two waiters can both find it stale; the first removes it and makes a fresh one,
 *  and the second's remove would then delete that (review M-7). Moving it aside first still let a third process make a lock while a
 *  fresh one was aside, to be put back. So the look and the remove happen under a guard file (`<file>.takeover`, made exclusively
 *  and held for a moment): no other waiter removes the lock meanwhile, and nobody can make a new one while the stale one is still
 *  there, so what is removed is what was judged. True when the name is free now. */
export function takeOver(file: string, free: (path: string) => boolean): boolean {
  const guard = `${file}.takeover`;
  const r = createLock(guard, String(process.pid));
  if (r !== 'taken') {
    // another waiter is taking it over now; a guard was left by a crash when its process is gone. Age alone is not enough: on a
    // busy machine a live holder can be paused past YOUNG, and two waiters inside the guard let one remove the other's fresh lock.
    if (r === 'held') moveAside(guard, (p) => {
      try {
        const age = Date.now() - statSync(p).mtimeMs, pid = Number(readFileSync(p, 'utf8'));
        return age > GUARD_STALE || (age > YOUNG && !(pid > 0 && isAlive(pid)));
      } catch { return true; }
    });
    return false;
  }
  try {
    if (!free(file)) return false;   // someone's (again)
    rmSync(file, { force: true });
    return true;
  } catch { return false; } finally { try { rmSync(guard, { force: true }); } catch { /* removed after YOUNG */ } }
}

/** `file` made holding `content`, only if no file has that name: 'taken', 'held' (it exists), or 'busy' (try again shortly) */
export function createLock(file: string, content: string): 'taken' | 'held' | 'busy' {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, content);
  try { linkSync(tmp, file); return 'taken'; } catch (e) {
    if (code(e) === 'EEXIST') return 'held';
    // EPERM may also be a file system without hard links: the old way (an empty moment, which YOUNG covers) tells them apart
    try {
      const fd = openSync(file, 'wx');
      try { writeSync(fd, content); } finally { closeSync(fd); }
      return 'taken';
    } catch (e2) {
      if (code(e2) === 'EEXIST') return 'held';
      if (BUSY.has(code(e2))) return 'busy';
      throw e2;
    }
  } finally { try { rmSync(tmp, { force: true }); } catch { /* left over: harmless */ } }
}

const mine = () => JSON.stringify({ pid: process.pid, started: Date.now() });
const free = (f: string) => !lockHolder(f);   // stale, or this process's own (its callers keep their own jobs apart)

function keepFresh(file: string, every: number) {
  const beat = setInterval(() => { try { const now = new Date(); utimesSync(file, now, now); } catch { /* gone */ } }, every);
  beat.unref();
  return () => {
    clearInterval(beat);
    try { if (JSON.parse(readFileSync(file, 'utf8')).pid === process.pid) rmSync(file, { force: true }); } catch { /* gone */ }
  };
}

/** `work` with `file` held by this process: taken by creating the file (two processes that both found it free cannot both
 *  have it), after waiting for another live holder; kept fresh every `every` ms while the work runs */
export async function withLock<T>(file: string, work: () => Promise<T>, o: { every?: number } = {}): Promise<T> {
  for (;;) {
    const r = createLock(file, mine());
    if (r === 'taken') break;
    if (r === 'held' && free(file) && takeOver(file, free)) continue;
    await pause(r === 'held' && lockHolder(file) ? Math.min(o.every ?? 1000, 1000) : 20);
  }
  const release = keepFresh(file, o.every ?? EVERY);
  try { return await work(); } finally { release(); }
}

/** `file` taken now, kept fresh until the returned release is called; null when another live process holds it (the page
 *  chat's turns: one server must not resume a conversation another server on the same projects/ is replying in) */
export function tryLock(file: string, o: { every?: number } = {}): (() => void) | null {
  for (let tries = 0; ; tries++) {
    const r = createLock(file, mine());
    if (r === 'taken') break;
    if (r === 'held' && !free(file)) return null;
    if (tries > 25) throw Object.assign(new Error(`lock still busy: ${file}`), { code: 'EBUSY' });
    if (r === 'held' && takeOver(file, free)) continue;
    nap(20);  // still being deleted, or open in an indexer: blocks ≈0.5 s at worst (tryLock answers at once by design)
  }
  return keepFresh(file, o.every ?? EVERY);
}

/** until no other live process holds `file` (checked every `every` ms) */
export async function waitForLock(file: string, o: { signal?: AbortSignal; every?: number } = {}): Promise<void> {
  while (lockHolder(file)) {
    if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await new Promise((r) => setTimeout(r, o.every ?? 1000));
  }
}
