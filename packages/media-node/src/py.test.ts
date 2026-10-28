import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runUv } from './py.ts';
import { PY_PROJECT } from './py.ts';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('aborting a Python helper stops the Python process too, not only uv', async () => {
  const f = join(mkdtempSync(join(tmpdir(), 'py-')), 'pid.txt').split('\\').join('/');
  const ac = new AbortController();
  const run = runUv(['run', '--project', PY_PROJECT, '--quiet', 'python', '-c', `import os, time; open('${f}', 'w').write(str(os.getpid())); time.sleep(120)`], { signal: ac.signal });
  run.catch(() => {});
  await expect.poll(() => existsSync(f) && readFileSync(f, 'utf8').length > 0, { timeout: 60000 }).toBe(true);
  const pid = Number(readFileSync(f, 'utf8'));
  expect(alive(pid)).toBe(true);
  ac.abort();
  await expect(run).rejects.toThrow();
  await expect.poll(() => alive(pid), { timeout: 10000 }).toBe(false);
}, 90000);

test('a helper whose result is in place but which never exits is ended after the grace period, and the run counts as done', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'py-'));
  const f = join(dir, 'pid.txt').split('\\').join('/');
  // writes its result, then hangs on its way out (as onnxruntime's teardown can on macOS)
  const run = runUv(['run', '--project', PY_PROJECT, '--quiet', 'python', '-c', `import os, time; open('${f}', 'w').write(str(os.getpid())); time.sleep(120)`],
    { done: () => existsSync(f) && readFileSync(f, 'utf8').length > 0, grace: 500 });
  await expect(run).resolves.toBe('');
  await expect.poll(() => alive(Number(readFileSync(f, 'utf8'))), { timeout: 10000 }).toBe(false);
}, 90000);

test('a helper that fails before its result is in place still fails', async () => {
  const run = runUv(['run', '--project', PY_PROJECT, '--quiet', 'python', '-c', 'import sys; sys.exit(3)'], { done: () => false, grace: 500 });
  await expect(run).rejects.toThrow(/failed \(3\)/);
}, 90000);
