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
  /** ms the whole run may take; past it the tree is ended and the run fails. None by default: a transcription of a long
   *  film or a first `uv sync` may rightly take a long while, so only a caller whose helper is short sets one */
  timeout?: number;
};

/** pyJson's default limit: its helpers (photo metadata, HEIC conversion, s2t) take seconds, so a run still going after
 *  this has hung (a corrupt file, a stuck interpreter) and would otherwise hold up an import for ever. Generous enough
 *  for a first run that has to sync the environment. */
export const PY_JSON_TIMEOUT = 10 * 60_000;

/** `uv <args>` in tellcut/; resolves stdout, rejects with the last lines of stderr. */
export function runUv(args: string[], o: RunOptions = {}): Promise<string> {
  return new Promise((res, rej) => {
    if (o.signal?.aborted) { rej(new DOMException('Aborted', 'AbortError')); return; }
    const p = spawn(uvPath(), args, { cwd: PY_PROJECT, windowsHide: true, env: pythonEnv() });
    let out = '', err = '', aborted = false, finished = false, timedOut = false;
    // uv runs Python as a child: an abort must end the whole tree, or a cancelled transcription keeps the CPU busy
    const end = () => {
      if (p.exitCode !== null || p.signalCode !== null) return;   // gone: its pid may be another process's by now
      if (p.pid) killTree(p.pid, 'SIGKILL', spawn, () => p.kill());
      else p.kill('SIGKILL');
    };
    const stop = () => { aborted = true; end(); };
    o.signal?.addEventListener('abort', stop, { once: true });
    const limit = o.timeout !== undefined && o.timeout > 0 ? setTimeout(() => { timedOut = true; end(); }, o.timeout) : undefined;
    let since: number | undefined;
    const watch = o.done && setInterval(() => {
      if (since === undefined) { if (o.done!()) since = Date.now(); }
      else if (Date.now() - since >= (o.grace ?? 30000)) { clearInterval(watch); finished = true; end(); }
    }, 1000);
    p.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
    p.stderr.setEncoding('utf8').on('data', (d: string) => { err += d; });
    p.stdin.on('error', () => {});   // uv may exit without reading its input
    p.on('error', (e) => { if (limit) clearTimeout(limit); rej(new Error(`無法執行 uv（${e.message}）：在 tellcut/ 跑 npm run setup`)); });
    p.on('close', (code) => {
      o.signal?.removeEventListener('abort', stop);
      if (watch) clearInterval(watch);
      if (limit) clearTimeout(limit);
      if (aborted) rej(new DOMException('Aborted', 'AbortError'));
      else if (timedOut) rej(new Error(`uv ${args.slice(0, 6).join(' ')} 超過 ${Math.round(o.timeout! / 1000)} 秒沒有結束，已停止`));
      else if (code === 0 || finished) res(out);
      else rej(new Error(`uv ${args.slice(0, 6).join(' ')} failed (${code}): ${err.trim().split(/\r?\n/).slice(-5).join(' | ')}`));
    });
    p.stdin.end(o.input ?? '');
  });
}

export const runPy = (script: string, args: string[] = [], o: RunOptions = {}) =>
  runUv(['run', '--project', PY_PROJECT, '--quiet', 'python', join(PY_DIR, script), ...args], o);

export const pyJson = async <T>(script: string, args: string[] = [], o: { input?: string; signal?: AbortSignal; timeout?: number } = {}) =>
  JSON.parse(await runPy(script, args, { timeout: PY_JSON_TIMEOUT, ...o })) as T;
