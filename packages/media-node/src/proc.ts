// Ending a process together with its children (uv's Python, the chat shell's claude). Windows: taskkill /T. macOS and Linux
// have no such switch, and a child started in a group of its own (detached) would outlive a Ctrl+C of the server, so the
// tree is read from `ps` and every process in it is signalled, the children first.
import { execFileSync, spawn } from 'node:child_process';

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

/** Ends `pid` and its children. The caller makes sure it still runs: an exited pid may be another process's by now. */
export function killTree(pid: number, signal: NodeJS.Signals = 'SIGKILL', run: typeof spawn = spawn) {
  if (process.platform === 'win32') { run('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => {}); return; }
  let ps = '';
  try { ps = execFileSync('ps', ['-A', '-o', 'pid=', '-o', 'ppid='], { encoding: 'utf8' }); } catch { /* no ps: the process alone */ }
  for (const p of descendants(ps, pid)) { try { process.kill(p, signal); } catch { /* gone already */ } }
}
