// A record of the test workers, for the full run where one dies mid-file ("Worker exited unexpectedly", the rest of the file's
// tests left without a result, nothing on stderr; seen in live, delete, projects and chat/routes, never when the file ran alone).
// In .cache/test-workers.log each worker writes which file it starts (with its pid) and when that file's tests are done, and the
// run writes how each worker process ended: a file started and never done is the one whose worker died, and its exit code says
// how. Vitest ends a worker after its file (SIGTERM); a kill from outside, as taskkill /F, gives 1. The deaths seen so far were
// 3221226505 (0xC0000409, a fail-fast inside Node): Node 24.15 on Windows does that now and then, about once in several thousand
// cycles, in a plain loop of http.createServer → fetch → closeAllConnections → close with no Tellcut code at all, and those test
// files start and close a server for every test. TELLCUT_TEST_TRACE=1 also writes the start and end of each test.
// Loaded twice by vitest.config.ts: as a setup file (the top level, in every worker before its test file) and as a global setup
// (the default export, in the run's own process: the exit codes, and a new log when the last one has grown).
import childProcess from 'node:child_process';
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const WORKERS_LOG = join(ROOT, '.cache', 'test-workers.log');
const RUN = Symbol.for('tellcut.test-workers.run');
const g = globalThis as { [RUN]?: boolean; __vitest_worker__?: { filepath?: string } };

const line = (s: string) => { try { mkdirSync(dirname(WORKERS_LOG), { recursive: true }); appendFileSync(WORKERS_LOG, `${new Date().toISOString()} ${s}\n`); } catch { /* a record only */ } };
// the run's own temp folder (tools/test-cleanup.ts) tells the lines of two runs at once apart; read when needed, as the global
// setup runs before that folder is chosen
const run = () => (process.env.TEMP ?? '').split(/[\\/]/).pop();

if (g.__vitest_worker__) {
  const f = g.__vitest_worker__.filepath ? relative(ROOT, g.__vitest_worker__.filepath).replace(/\\/g, '/') : '?';
  const me = `${run()} worker ${process.pid}`;
  line(`${me} starts ${f}`);
  // the globals (globals: true): importing vitest here would fail in the global setup, outside any worker
  afterAll(() => line(`${me} done ${f}`));
  if (process.env.TELLCUT_TEST_TRACE) {
    beforeEach((c) => line(`${me} test ${c.task.name}`));
    afterEach((c) => line(`${me} test end ${c.task.name}`));
  }
}

/** global setup (run once per test project, hence the guard): the log of the earlier runs put aside once it passes 2 MB
 *  (one older one kept); every worker process vitest forks from here on has its exit code written down. Vitest's pool imports
 *  fork from node:child_process; syncBuiltinESMExports hands it the wrapper (which keeps fork's own properties). */
export default function setup() {
  if (g[RUN]) return;
  g[RUN] = true;
  try {
    if (statSync(WORKERS_LOG).size >= 2_000_000) {
      const old = WORKERS_LOG.replace(/\.log$/, '.old.log');
      rmSync(old, { force: true });
      renameSync(WORKERS_LOG, old);
    }
  } catch { /* none yet */ }
  const cp = childProcess as unknown as Record<string, (...a: unknown[]) => childProcess.ChildProcess>;
  const real = cp.fork;
  const forked = function (this: unknown, ...a: unknown[]) {
    const child = real.apply(this, a);
    const pid = child.pid, r = run();   // when it starts: the run puts TEMP back before its workers have ended
    child.once('exit', (code, signal) => line(`${r} worker ${pid} ended: exit code ${code}${signal ? ` (${signal})` : ''}`));
    return child;
  };
  Object.defineProperties(forked, Object.getOwnPropertyDescriptors(real));
  cp.fork = forked;
  syncBuiltinESMExports();
  return () => { cp.fork = real; syncBuiltinESMExports(); g[RUN] = false; };
}
