// The tests make their scratch folders with mkdtemp in the system temp folder and never remove them (2.7 GB had piled up by
// 2026-10-18). Vitest runs this as a global setup: it points TEMP/TMP/TMPDIR at a folder of this run's own (the workers and
// every program the tests start inherit it, and os.tmpdir() reads it), and removes that folder after the run. Removing "test
// folders changed since the run started" (until 2026-10-26) also took those of another vitest running at the same time.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RUN_DIR = /^tellcut-test-[A-Za-z0-9]{6}$/;
const VARS = ['TEMP', 'TMP', 'TMPDIR'] as const;

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };

/** Removes the run folders in `root` whose run is gone (its `pid` no longer lives; one without a pid after a day); returns how many. */
export function sweepStale(root = tmpdir()): number {
  let n = 0;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || !RUN_DIR.test(e.name)) continue;
    const d = join(root, e.name);
    try {
      let pid = NaN;
      try { pid = Number(readFileSync(join(d, 'pid'), 'utf8')); } catch { /* none yet */ }
      if (Number.isInteger(pid) && pid > 0 ? alive(pid) : statSync(d).mtimeMs > Date.now() - 86400_000) continue;
      rmSync(d, { recursive: true, force: true }); n++;
    } catch { /* in use or gone: left */ }
  }
  return n;
}

type Run = { dir: string; users: number; env: Record<string, string | undefined> };
const KEY = Symbol.for('tellcut.test-cleanup');
const shared = globalThis as { [KEY]?: Run };

/** Points the temp folder at a new run folder in `root` (once per process: a workspace runs the setup once per project);
 *  the returned function puts it back and removes the folder after the last one. */
export function startRun(root = tmpdir()): () => void {
  let run = shared[KEY];
  if (!run) {
    sweepStale(root);
    const dir = mkdtempSync(join(root, 'tellcut-test-'));
    writeFileSync(join(dir, 'pid'), String(process.pid));
    run = shared[KEY] = { dir, users: 0, env: Object.fromEntries(VARS.map((k) => [k, process.env[k]])) };
    for (const k of VARS) process.env[k] = dir;
  }
  run.users++;
  const r = run;
  let done = false;
  return () => {
    if (done || --r.users > 0) { done = true; return; }
    done = true; delete shared[KEY];
    for (const k of VARS) { if (r.env[k] === undefined) delete process.env[k]; else process.env[k] = r.env[k]; }
    // a file still held (a Chrome on its way out) leaves the folder to the next run's sweep
    try { rmSync(r.dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* swept later */ }
  };
}

/** vitest globalSetup (it passes a context, so the root is not taken from the arguments); the returned function runs after the run */
export default function setup() { return startRun(); }
