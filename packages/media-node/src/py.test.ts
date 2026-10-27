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
