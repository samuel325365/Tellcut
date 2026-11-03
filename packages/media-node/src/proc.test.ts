import { spawn } from 'node:child_process';
import { descendants, killTree, processStarted } from './proc.ts';

test('the tree below a process is read from ps, the deepest first and the process itself last', () => {
  const ps = ['  1     0', ' 10     1', ' 11    10', ' 12    11', ' 13    10', ' 20     1', 'garbage'].join('\n');
  expect(descendants(ps, 10)).toEqual([12, 11, 13, 10]);
  expect(descendants(ps, 99)).toEqual([99]);
});

// Windows: taskkill /T, covered by apps/server/src/chat/kill.test.ts
test.skipIf(process.platform === 'win32')('killTree ends a shell and the program it started', async () => {
  const sh = spawn('/bin/sh', ['-c', `"${process.execPath}" -e "console.log(process.pid); setTimeout(()=>{},20000)"; :`]);
  const pid = await new Promise<number>((r) => sh.stdout.once('data', (d) => r(Number(String(d).trim()))));
  const gone = new Promise((r) => sh.on('exit', r));
  killTree(sh.pid!);
  await gone;
  await expect.poll(() => { try { process.kill(pid, 0); return true; } catch { return false; } }, { timeout: 5000 }).toBe(false);
}, 15000);

test('processStarted: when a live process started (to tell it from a later one under the same pid); null once it is gone', async () => {
  const before = Date.now();
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { windowsHide: true });
  try {
    const t = processStarted(child.pid!);
    expect(t).not.toBeNull();
    // ps tells whole seconds
    expect(t!).toBeGreaterThanOrEqual(before - 1500);
    expect(t!).toBeLessThanOrEqual(Date.now() + 1000);
  } finally { child.kill(); }
  await new Promise((r) => child.on('exit', r));
  expect(processStarted(child.pid!)).toBeNull();
  expect(processStarted(0)).toBeNull();
  // what ps says (local time, English month) and what PowerShell says (epoch ms) are both read
  const ps = ((() => 'Tue Nov  3 10:00:00 2026\n') as unknown) as typeof import('node:child_process').execFileSync;
  if (process.platform !== 'win32') expect(processStarted(5, ps)).toBe(new Date(2026, 10, 3, 10, 0, 0).getTime());
  else expect(processStarted(5, ((() => '1793671200000\r\n') as unknown) as typeof import('node:child_process').execFileSync)).toBe(1793671200000);
}, 30000);
