// Python helpers in tellcut/tools/py run through uv in tellcut's own environment (never the system Python; see deps.ts pythonEnv).
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { TELLCUT_ROOT } from './paths.ts';
import { pythonEnv, uvPath } from './deps.ts';
import { killTree } from './proc.ts';

export const PY_DIR = join(TELLCUT_ROOT, 'tools', 'py');
/** the uv project the Python tools run in: tellcut/pyproject.toml */
export const PY_PROJECT = TELLCUT_ROOT;

type RunOptions = {
  input?: string;
  signal?: AbortSignal;
  /** true once the helper's result is in place (its output file complete): from then on it gets `grace` ms to exit,
   *  after which its tree is ended and the run counts as done, so a helper that hangs on its way out holds nothing up */
  done?: () => boolean;
  grace?: number;
};

/** `uv <args>` in tellcut/; resolves stdout, rejects with the last lines of stderr. */
export function runUv(args: string[], o: RunOptions = {}): Promise<string> {
  return new Promise((res, rej) => {
    if (o.signal?.aborted) { rej(new DOMException('Aborted', 'AbortError')); return; }
    const p = spawn(uvPath(), args, { cwd: PY_PROJECT, windowsHide: true, env: pythonEnv() });
    let out = '', err = '', aborted = false, finished = false;
    // uv runs Python as a child: an abort must end the whole tree, or a cancelled transcription keeps the CPU busy
    const end = () => {
      if (p.exitCode !== null || p.signalCode !== null) return;   // gone: its pid may be another process's by now
      if (p.pid) killTree(p.pid, 'SIGKILL', spawn, () => p.kill());
      else p.kill('SIGKILL');
    };
    const stop = () => { aborted = true; end(); };
    o.signal?.addEventListener('abort', stop, { once: true });
    let since: number | undefined;
    const watch = o.done && setInterval(() => {
      if (since === undefined) { if (o.done!()) since = Date.now(); }
      else if (Date.now() - since >= (o.grace ?? 30000)) { clearInterval(watch); finished = true; end(); }
    }, 1000);
    p.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
    p.stderr.setEncoding('utf8').on('data', (d: string) => { err += d; });
    p.stdin.on('error', () => {});   // uv may exit without reading its input
    p.on('error', (e) => rej(new Error(`無法執行 uv（${e.message}）：在 tellcut/ 跑 npm run setup`)));
    p.on('close', (code) => {
      o.signal?.removeEventListener('abort', stop);
      if (watch) clearInterval(watch);
      if (aborted) rej(new DOMException('Aborted', 'AbortError'));
      else if (code === 0 || finished) res(out);
      else rej(new Error(`uv ${args.slice(0, 6).join(' ')} failed (${code}): ${err.trim().split(/\r?\n/).slice(-5).join(' | ')}`));
    });
    p.stdin.end(o.input ?? '');
  });
}

export const runPy = (script: string, args: string[] = [], o: RunOptions = {}) =>
  runUv(['run', '--project', PY_PROJECT, '--quiet', 'python', join(PY_DIR, script), ...args], o);

export const pyJson = async <T>(script: string, args: string[] = [], o: { input?: string; signal?: AbortSignal } = {}) =>
  JSON.parse(await runPy(script, args, o)) as T;
