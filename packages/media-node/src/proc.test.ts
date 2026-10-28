import { spawn } from 'node:child_process';
import { descendants, killTree } from './proc.ts';

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
