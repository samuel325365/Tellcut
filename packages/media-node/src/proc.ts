// Small process helpers shared by the server, the tools and this package: whether a pid lives, waiting, one argument of a
// command line run through a shell, and ending a process together with its children (uv's Python, the chat shell's claude).
// Windows: taskkill /T. macOS and Linux have no such switch, and a child started in a group of its own (detached) would outlive
// a Ctrl+C of the server, so the tree is read from `ps` and every process in it is signalled, the children first.
// Only node: modules: tools/batch/queue.ts and tools/test-cleanup.ts load this file on its own (a worker run by Node's own type
// stripping, a vitest global setup), without the rest of the package.
import { execFileSync, spawn } from 'node:child_process';

/** EPERM: the process exists but belongs to someone with more rights (e.g. an elevated shell on Windows) — still alive */
export const isAlive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
};

/** waits `ms` blocking the event loop: for synchronous code that must retry before it returns (a lock, a rename), never a hot path */
export const nap = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
/** waits `ms` without blocking */
export const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One argument of a command line for spawn(…, { shell: true }) (an args array with shell: true is DEP0190 on Node 24), by the
 *  rules of `platform`'s shell. sh: in single quotes, where nothing is expanded ($, ` and \ stay as they are), a ' as '\''.
 *  Windows: in double quotes, a " as \" and the backslashes before it or before the closing quote doubled, so the program reads
 *  the argument back as it was (C runtime rules: "dir\" would end in a quote). cmd.exe still expands %VAR% inside quotes and
 *  ends its own quoting at a ", so a caller whose arguments may hold those refuses them (tools/batch/render.ts). */
export const shellQuoter = (platform: NodeJS.Platform = process.platform): ((a: string) => string) =>
  platform === 'win32' ? (a) => `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
    : (a) => `'${a.replace(/'/g, `'\\''`)}'`;
/** shellQuoter for this machine; one argument, so `args.map(shellQuote)` is safe */
export const shellQuote = shellQuoter();

/** `pid` and everything below it, deepest first, from `ps -A -o pid= -o ppid=` output */
export function descendants(ps: string, pid: number): number[] {
  const kids = new Map<number, number[]>();
  for (const line of ps.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!m) continue;
    const [c, p] = [Number(m[1]), Number(m[2])];
    kids.set(p, [...(kids.get(p) ?? []), c]);
  }
  const out: number[] = [];
  const walk = (p: number, seen: Set<number>) => {
    for (const c of kids.get(p) ?? []) if (!seen.has(c)) { seen.add(c); walk(c, seen); out.push(c); }
  };
  walk(pid, new Set([pid]));
  return [...out, pid];
}

/** Ends `pid` and its children. The caller makes sure it still runs: an exited pid may be another process's by now.
 *  `fallback`: what to do on Windows when taskkill itself cannot start. */
export function killTree(pid: number, signal: NodeJS.Signals = 'SIGKILL', run: typeof spawn = spawn, fallback: () => void = () => {}) {
  if (process.platform === 'win32') { run('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }).on('error', fallback); return; }
  let ps = '';
  try { ps = execFileSync('ps', ['-A', '-o', 'pid=', '-o', 'ppid='], { encoding: 'utf8' }); } catch { /* no ps: the process alone */ }
  for (const p of descendants(ps, pid)) { try { process.kill(p, signal); } catch { /* gone already */ } }
}

/** When `pid` started (ms since the epoch), or null when that cannot be told (gone, no PowerShell or ps). With a pid alone a
 *  process cannot be told from one started later under the same pid (Windows soon reuses them). Windows asks PowerShell (≈0.3 s):
 *  callers ask once per process and keep the answer. */
export function processStarted(pid: number, run: typeof execFileSync = execFileSync): number | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const out = process.platform === 'win32'
      ? run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `([DateTimeOffset](Get-Process -Id ${pid} -ErrorAction Stop).StartTime).ToUnixTimeMilliseconds()`],
        { encoding: 'utf8', windowsHide: true, timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] })
      // the local time in English, to the second (LC_ALL: a month name Date.parse reads)
      : run('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] });
    const s = String(out).trim(), t = /^\d+$/.test(s) ? Number(s) : Date.parse(s);
    return Number.isFinite(t) && t > 0 ? t : null;
  } catch { return null; }
}
