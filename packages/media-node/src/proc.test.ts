import { spawn, spawnSync, type execFileSync } from 'node:child_process';
import { descendants, isAlive, killTree, nap, pause, processStarted, shellQuote, shellQuoter, type ProcEnv } from './proc.ts';

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
}, 30000);

// each platform's branch, on any machine: what the command asked for and how its answer is read
test('processStarted asks ps on macOS (local time, English month) and PowerShell on Windows (epoch ms)', () => {
  const calls: Array<{ cmd: string; args: string[]; lc?: string }> = [];
  const fake = (out: string) => (((cmd: string, args: string[], o: { env?: NodeJS.ProcessEnv }) => { calls.push({ cmd, args, lc: o.env?.LC_ALL }); return out; }) as unknown) as typeof execFileSync;
  expect(processStarted(5, fake('Tue Nov  3 10:00:00 2026\n'), 'darwin')).toBe(new Date(2026, 10, 3, 10, 0, 0).getTime());
  expect(calls[0]).toEqual({ cmd: 'ps', args: ['-o', 'lstart=', '-p', '5'], lc: 'C' });
  expect(processStarted(5, fake('1793671200000\r\n'), 'win32')).toBe(1793671200000);
  expect(calls[1].cmd).toBe('powershell.exe');
  expect(calls[1].args.at(-1)).toContain('Get-Process -Id 5 ');
  // nothing (gone) or something unreadable: not known
  expect(processStarted(5, fake(''), 'darwin')).toBeNull();
  expect(processStarted(5, fake('soon'), 'darwin')).toBeNull();
  expect(processStarted(5, (() => { throw new Error('exit 1'); }) as unknown as typeof execFileSync, 'darwin')).toBeNull();
});

/** macOS as killTree sees it: a fixed process tree, and the signals sent in order */
const mac = (ps: string, gone: number[] = []) => {
  const sent: string[] = [];
  const sys: ProcEnv = {
    platform: 'darwin', ps: () => ps,
    kill: (pid, signal) => { if (gone.includes(pid)) throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' }); sent.push(`${signal} ${pid}`); },
  };
  return { sys, sent };
};
const noSpawn = (() => { throw new Error('taskkill is Windows only'); }) as unknown as typeof spawn;

test('killTree on macOS: every process in the tree from ps gets the signal, the deepest first and the process itself last', () => {
  // 100 the shell, 101 claude under it with two children of its own, 200 another program's tree
  const ps = ['    1     0', '  100     1', '  101   100', '  102   101', '  103   101', '  200     1', '  201   200'].join('\n');
  const m = mac(ps);
  killTree(100, 'SIGINT', noSpawn, undefined, m.sys);
  expect(m.sent).toEqual(['SIGINT 102', 'SIGINT 103', 'SIGINT 101', 'SIGINT 100']);
  // a child gone meanwhile does not stop the rest
  const g = mac(ps, [102]);
  killTree(100, 'SIGKILL', noSpawn, undefined, g.sys);
  expect(g.sent).toEqual(['SIGKILL 103', 'SIGKILL 101', 'SIGKILL 100']);
  // no ps (or nothing read): the process alone, with the default signal
  const n = mac('');
  killTree(100, undefined, noSpawn, undefined, n.sys);
  expect(n.sent).toEqual(['SIGKILL 100']);
});

test('killTree on Windows: taskkill /T /F, no signals; fallback when taskkill cannot start', () => {
  const calls: string[][] = [];
  let onError: (() => void) | undefined;
  const run = ((cmd: string, args: string[]) => { calls.push([cmd, ...args]); return { on: (_: string, f: () => void) => { onError = f; } }; }) as unknown as typeof spawn;
  const sent: string[] = [];
  let fellBack = false;
  killTree(100, 'SIGINT', run, () => { fellBack = true; }, { platform: 'win32', ps: () => { throw new Error('no ps on Windows'); }, kill: (p) => { sent.push(String(p)); } });
  expect(calls).toEqual([['taskkill', '/pid', '100', '/T', '/F']]);
  expect(sent).toEqual([]);
  onError!();
  expect(fellBack).toBe(true);
});

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
