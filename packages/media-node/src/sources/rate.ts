// Rate limits shared by every process (spec 2026-10-22-external-sources §4.3.2): batch agents run side by side and a source's quota
// is theirs together, so the count lives in a file under .cache/sources/rate/, read and written under a lock file.
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { renameRetry } from '../fsutil.ts';
import { takeOver as takeOverIf } from '../locks.ts';

/** at most `n` requests in any `per` seconds */
export interface RateLimit { n: number; per: number }

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A stale lock (older than `staleMs`) out of the way, the way locks.ts takes one over: two waiters that both found it stale
 *  cannot delete the fresh lock the first one then made (review M-7). True when the name is free now. */
export const takeOver = (file: string, staleMs: number): boolean =>
  takeOverIf(file, (f) => { try { return Date.now() - statSync(f).mtimeMs > staleMs; } catch { return true; } });

/** `fn` while this process holds `file` (created exclusively); a lock older than `staleMs` was left by a crash and is taken over */
export async function withFileLock<T>(file: string, fn: () => T | Promise<T>, o: { staleMs?: number } = {}): Promise<T> {
  const stale = o.staleMs ?? 10_000;
  mkdirSync(dirname(file), { recursive: true });
  for (;;) {
    try { closeSync(openSync(file, 'wx')); break; } catch (e) {
      // EPERM/EBUSY/EACCES: on Windows a lock another process just removed is still "delete pending" — taken, for now
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') { await pause(20); continue; }
      if (code !== 'EEXIST') throw e;
      try { if (Date.now() - statSync(file).mtimeMs > stale && takeOver(file, stale)) continue; } catch { continue; }
      await pause(20);
    }
  }
  try { return await fn(); } finally { rmSync(file, { force: true }); }
}

/** the quota is spent for longer than the caller wants to wait */
export class RateWait extends Error {
  override name = 'RateWait';
  constructor(readonly seconds: number) { super(`rate limit: ${seconds} s to wait`); }
}

/** a limit up to a day counts the requests of the last `per` seconds (a fixed window let 2n through at its edge, review M-8);
 *  a longer one (a monthly quota, which the service counts by calendar) a fixed window, so the state stays small */
const SLIDING_MAX = 86_400;
/** s:<n>/<per>: the request times inside the window; f:<n>/<per>: a fixed window. Keys of another shape (the old state) are ignored. */
type State = Record<string, number[] | { start: number; count: number }>;

/** One request's slot under every limit. A wait up to `maxWait` seconds is slept out; a longer one is a RateWait. */
export async function takeSlot(stateFile: string, limits: RateLimit[], o: { now?: () => number; maxWait?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<void> {
  const now = o.now ?? Date.now, sleep = o.sleep ?? pause, maxWait = o.maxWait ?? 30;
  for (;;) {
    const wait = await withFileLock(`${stateFile}.lock`, () => {
      let old: State = {};
      try { old = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { /* none yet, or torn: start counting again */ }
      const t = now(), w: State = {};
      let ms = 0;
      for (const l of limits) {
        const span = l.per * 1000;
        if (l.per <= SLIDING_MAX) {
          const k = `s:${l.n}/${l.per}`, prev = old[k];
          const times = (Array.isArray(prev) ? prev : []).filter((x) => x > t - span);
          w[k] = times;
          if (times.length >= l.n) ms = Math.max(ms, times[times.length - l.n] + span - t);
        } else {
          const k = `f:${l.n}/${l.per}`, prev = old[k], cur = prev && !Array.isArray(prev) && t - prev.start < span ? prev : { start: t, count: 0 };
          w[k] = cur;
          if (cur.count >= l.n) ms = Math.max(ms, cur.start + span - t);
        }
      }
      if (ms > 0) return ms;
      for (const v of Object.values(w)) { if (Array.isArray(v)) v.push(t); else v.count++; }
      const tmp = `${stateFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(w));
      renameRetry(tmp, stateFile);
      return 0;
    });
    if (!wait) return;
    if (wait > maxWait * 1000) throw new RateWait(Math.ceil(wait / 1000));
    await sleep(wait);
  }
}
