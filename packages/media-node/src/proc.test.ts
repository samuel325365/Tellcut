import { spawn, spawnSync } from 'node:child_process';
import { descendants, isAlive, killTree, nap, pause, processStarted, shellQuote, shellQuoter } from './proc.ts';

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

test('isAlive: EPERM (a live process with more rights) is alive, ESRCH is gone', () => {
  const err = (code: string) => () => { throw Object.assign(new Error(code), { code }); };
  const kill = vi.spyOn(process, 'kill');
  try {
    kill.mockImplementation(err('EPERM')); expect(isAlive(4)).toBe(true);
    kill.mockImplementation(err('ESRCH')); expect(isAlive(4)).toBe(false);
  } finally { kill.mockRestore(); }
  expect(isAlive(process.pid)).toBe(true);
});

test('nap blocks for the time asked, pause waits without blocking', async () => {
  let t = Date.now();
  nap(30);
  expect(Date.now() - t).toBeGreaterThanOrEqual(25);
  t = Date.now();
  let ticked = false;
  setTimeout(() => { ticked = true; }, 0);
  await pause(30);
  expect(ticked).toBe(true);
  expect(Date.now() - t).toBeGreaterThanOrEqual(25);
});

test('shellQuoter: sh single quotes (nothing expanded), Windows double quotes read back by the C runtime', () => {
  const sh = shellQuoter('darwin'), win = shellQuoter('win32');
  expect(sh('my x')).toBe(`'my x'`);
  expect(sh(`it's $HOME and \`id\` and dir\\`)).toBe(`'it'\\''s $HOME and \`id\` and dir\\'`);
  expect(sh('')).toBe(`''`);
  expect(win('C:\\Program Files\\x')).toBe('"C:\\Program Files\\x"');
  // a backslash before the closing quote or before an escaped quote is doubled: "dir\" would read as dir"
  expect(win('C:\\dir\\')).toBe('"C:\\dir\\\\"');
  expect(win('say "hi"')).toBe('"say \\"hi\\""');
  expect(win('a\\"b')).toBe('"a\\\\\\"b"');
  expect(win('')).toBe('""');
  // one argument at a time: map hands in an index too
  expect(['a', 'b'].map(shellQuote)).toEqual(process.platform === 'win32' ? ['"a"', '"b"'] : [`'a'`, `'b'`]);
});

test('shellQuote: what this machine\'s shell hands the program is the arguments as they were', () => {
  // no " or % on Windows: cmd.exe acts on those inside quotes (callers that may get them refuse them)
  const args = ['my x', 'C:\\dir\\', "it's", '$HOME', '`id`', 'a&b|c<d>e^f', '', 'end\\\\'];
  const r = spawnSync(`${shellQuote(process.execPath)} -e "console.log(JSON.stringify(process.argv.slice(1)))" ${args.map(shellQuote).join(' ')}`,
    { shell: true, encoding: 'utf8', windowsHide: true });
  expect(r.status, r.stderr).toBe(0);
  expect(JSON.parse(r.stdout)).toEqual(args);
}, 15000);
