// Windows briefly locks files that a viewer, indexer or antivirus has open: renames over them fail with EPERM/EBUSY.
import { renameSync, rmSync, writeFileSync } from 'node:fs';

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** renameSync that waits 25, 50, 75… ms and tries again while the target is locked (at most `tries` attempts).
 *  The waits block the event loop (≈375 ms at worst): deliberate — callers are synchronous writes that must land before
 *  they return, and a lock lasts only that long. Do not use it on a hot path. */
export function renameRetry(from: string, to: string, rename: (a: string, b: string) => void = renameSync, tries = 6) {
  for (let i = 1; ; i++) {
    try { return rename(from, to); }
    catch (e) {
      if (i >= tries || !['EPERM', 'EBUSY', 'EACCES'].includes((e as NodeJS.ErrnoException)?.code ?? '')) throw e;
      sleepSync(25 * i);
    }
  }
}

/** writes `file` as a new file (this process's own temporary name, then a rename): a hard link to the old one — another
 *  project sharing it (share.ts) — keeps what it had, and two processes writing at once never mix their bytes */
export function replaceFile(file: string, data: string | NodeJS.ArrayBufferView) {
  const tmp = `${file}.${process.pid}.tmp`;
  try { writeFileSync(tmp, data); renameRetry(tmp, file); } catch (e) { rmSync(tmp, { force: true }); throw e; }
}
