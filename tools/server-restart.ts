// Restarts the Tellcut server safely.   npm run server:restart -- [--port <the running one's, else 5174>] [--wait] [--force]
// 1. Refuses while a chat turn or an analysis runs (the user may be testing in the browser; a killed turn loses its reply and an
//    analysis dies with the server); --wait waits for them, --force does not ask. Not knowing counts as busy: a chat that cannot be
//    asked, or a port something listens on that does not answer as a Tellcut server, is refused too unless --force.
// 2. Stops whatever listens on the port (with its child processes: stopping only the npm wrapper leaves node holding the port).
//    Windows: netstat and taskkill; macOS / Linux: lsof and signals.
// 3. Starts the server (what `npm run server` runs) on its own (Windows: in a hidden console), in a clean environment: a server started from a Claude Code session would
//    otherwise hand that session's variables to every page chat (claudeEnv). Output goes to .cache/server-<port>.log (and .err.log).
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { claudeEnv, DEFAULT_PORT, killTree, pause, readServerInfo, TELLCUT_ROOT } from '@tellcut/media-node';
import { parseArgsOrExit } from './args.ts';

const TERMINAL = new Set(['done', 'failed', 'cancelled']);

/** pids listening on the port, from `netstat -ano`: a listening socket is the one with no foreign address (0.0.0.0:0, [::]:0). The
 *  state word is not read: Windows in another language translates LISTENING, and the old server was neither found nor stopped. */
export function listeners(netstat: string, port: number): number[] {
  const pids = new Set<number>();
  for (const line of netstat.split(/\r?\n/)) {
    const m = /^\s*TCP\s+(\S+):(\d+)\s+(?:0\.0\.0\.0|\[::\]):0\s.*?(\d+)\s*$/i.exec(line);
    if (m && Number(m[2]) === port && Number(m[3]) > 0) pids.add(Number(m[3]));
  }
  return [...pids];
}

/** pids listening on the port, from `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` (one pid a line, once per socket) */
export const lsofListeners = (lsof: string): number[] => [...new Set(lsof.split(/\r?\n/).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

/** the chat threads to ask about: every project, the home chat and its drafts */
export function threads(projectsDir: string): string[] {
  const ids = ['home'];
  try { for (const d of readdirSync(projectsDir, { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith('_') && existsSync(join(projectsDir, d.name, 'project.json'))) ids.push(d.name); } catch { /* none */ }
  try { for (const f of readdirSync(join(projectsDir, '_home'))) if (/^home-[a-z0-9]{6,24}\.json$/.test(f)) ids.push(f.slice(0, -5)); } catch { /* none */ }
  return ids;
}

/** a GET that throws on a status other than 2xx, the status on the error */
export type Getter = (url: string) => Promise<any>;
const get: Getter = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw Object.assign(new Error(`${res.status}`), { status: res.status });
  return res.json();
};

/** what still runs on the server: ["分析：food-deep（analyze）", "聊天：demo1"]; null when no Tellcut server answers. A chat that
 *  cannot be asked (no answer in time, an error other than "no such thread") is listed too: a turn running on a server too
 *  stuck to answer is not one that has ended */
export async function busy(base: string, o: { get?: Getter; projectsDir?: string } = {}): Promise<string[] | null> {
  const ask = o.get ?? get;
  let jobs: Array<{ kind: string; project?: string; status: string }>;
  try { jobs = await ask(`${base}/api/jobs`); } catch { return null; }
  const out = jobs.filter((j) => !TERMINAL.has(j.status)).map((j) => `工作：${j.project ?? ''}（${j.kind}，${j.status}）`);
  for (const t of threads(o.projectsDir ?? join(TELLCUT_ROOT, 'projects'))) {
    try { if ((await ask(`${base}/api/chat/${t}`)).running) out.push(`聊天：${t}`); } catch (e) {
      if ((e as { status?: number }).status !== 404) out.push(`聊天：${t}（問不到有沒有在跑：${(e as Error).message}）`);   // 404: not a thread this server knows
    }
  }
  return out;
}

/** Why not to restart when no Tellcut server answered on the port: something still listens there (a server too stuck to answer,
 *  or another program), and stopping it blind could end a running chat turn or another program's work. null: nothing listens. */
export const silentListener = (port: number, pids: number[]): string | null => (pids.length
  ? `埠 ${port} 上有程序在聽（${pids.join('、')}），但它沒有像 Tellcut 伺服器那樣回應，看不出有沒有聊天或分析在跑：沒有重開。\n確定要停掉它就加 --force。`
  : null);

const WIN = process.platform === 'win32';
const netstat = () => { try { return execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true }); } catch { return ''; } };
// lsof exits 1 with no output when nothing listens; one that cannot run at all must not read as a free port (the new server
// would fail on it, and the old one, still answering, would pass for the restarted one)
const LSOF = existsSync('/usr/sbin/lsof') ? '/usr/sbin/lsof' : 'lsof';
const lsof = (port: number) => {
  try { return execFileSync(LSOF, ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }); }
  catch (e) {
    const x = e as NodeJS.ErrnoException & { status?: number; stdout?: string };
    if (x.status === 1 && !x.stdout) return '';
    throw new Error(`lsof 跑不起來，看不出埠 ${port} 上有誰：${x.message}`);
  }
};
const onPort = (port: number) => (WIN ? listeners(netstat(), port) : lsofListeners(lsof(port)));

/** What stopping the old server asks of the machine; a test hands in another platform's (macOS' signals on Windows) */
export interface Stopper {
  platform: NodeJS.Platform;
  /** the pids listening on the port now */
  onPort: (port: number) => number[];
  /** Windows: ends the process and its children; throws when it cannot */
  taskkill: (pid: number) => void;
  /** macOS / Linux: signals the process and its children */
  killTree: (pid: number, signal: NodeJS.Signals) => void;
  pause: (ms: number) => Promise<unknown>;
  log: (line: string) => void;
}
const STOPPER: Stopper = {
  platform: process.platform, onPort,
  taskkill: (pid) => { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); },
  killTree: (pid, signal) => killTree(pid, signal), pause, log: (line) => console.log(line),
};

/** Stops `pids` (the ones on `port`) and waits for the port to be free: Windows' taskkill /F at once; elsewhere SIGTERM, then
 *  SIGKILL for one still listening 10 seconds later. The message to fail with, or null when the port is free. */
export async function stopServer(port: number, pids: number[], s: Stopper = STOPPER): Promise<string | null> {
  const win = s.platform === 'win32';
  for (const pid of pids) {
    if (win) { try { s.taskkill(pid); } catch { return `停不掉程序 ${pid}（權限不夠？）`; } }
    else s.killTree(pid, 'SIGTERM');
    s.log(`停掉了埠 ${port} 上的程序 ${pid}`);
  }
  for (let i = 0; i < 50 && s.onPort(port).length; i++) await s.pause(200);
  if (!win) {
    // one that ignored SIGTERM for 10 seconds
    for (const pid of s.onPort(port)) s.killTree(pid, 'SIGKILL');
    for (let i = 0; i < 10 && s.onPort(port).length; i++) await s.pause(200);
  }
  return s.onPort(port).length ? `埠 ${port} 還被佔著，沒有重開` : null;
}

async function main() {
  const usage = '用法：npm run server:restart -- [--port 5174] [--wait] [--force]';
  const a = parseArgsOrExit(process.argv.slice(2), { '--port': 'value', '--wait': 'switch', '--force': 'switch' }, usage), flag = (k: string) => a.has(k);
  const port = a.has('--port') ? Number(a.get('--port')) : readServerInfo()?.port ?? DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0) { console.error(usage); process.exit(2); }
  const base = `http://127.0.0.1:${port}`;

  for (let waited = 0; !flag('--force'); waited += 10) {
    const b = await busy(base);
    if (b === null) {
      const why = silentListener(port, onPort(port));
      if (why) { console.error(why); process.exit(1); }
      break;
    }
    if (!b.length) break;
    if (!flag('--wait')) { console.error(`伺服器還在忙，沒有重開：\n  ${b.join('\n  ')}\n等它們做完再試，或加 --wait 自動等；--force 不管它們。`); process.exit(1); }
    if (waited % 60 === 0) console.log(`等待中（${waited} 秒）：${b.join('、')}`);
    await pause(10000);
  }

  const pids = onPort(port), before = readServerInfo();
  // the pids of the server being replaced: the ones on the port, and the one its .cache/server.json names (should the port's be
  // missed, the old server still answering is not taken for the new one)
  const old = new Set([...pids, ...(before?.port === port ? [before.pid] : [])]);
  const failed = await stopServer(port, pids);
  if (failed) { console.error(failed); process.exit(1); }

  const logDir = join(TELLCUT_ROOT, '.cache'), log = join(logDir, `server-${port}.log`), err = join(logDir, `server-${port}.err.log`);
  mkdirSync(logDir, { recursive: true });
  const args = ['--import', 'tsx', 'apps/server/src/main.ts', '--port', String(port)];
  if (!WIN) {
    // what `npm run server` runs, as node itself, in a session of its own so it outlives this terminal; output to the log files,
    // started afresh each time as Start-Process does on Windows
    const out = openSync(log, 'w'), errOut = openSync(err, 'w');
    spawn(process.execPath, args, { cwd: TELLCUT_ROOT, env: claudeEnv(), detached: true, stdio: ['ignore', out, errOut] }).unref();
    closeSync(out); closeSync(errOut);
  } else {
    // What `npm run server` runs, as node itself, in a console of its own that stays hidden: a detached process has no console,
    // so every ffmpeg or ffprobe it runs would flash a window of its own; with a hidden console they all share that one.
    // Start-Process leaves it running after we exit, with the environment it is given (claudeEnv).
    const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `Start-Process -FilePath ${ps(process.execPath)} -ArgumentList ${args.map(ps).join(',')} ` +
      `-WorkingDirectory ${ps(TELLCUT_ROOT)} -WindowStyle Hidden -RedirectStandardOutput ${ps(log)} -RedirectStandardError ${ps(err)}`],
    // no pipes: the server would inherit them from PowerShell and we would wait on them for as long as it runs
    { env: claudeEnv(), windowsHide: true, stdio: 'ignore' });
    if (r.status !== 0) { console.error(`啟動不了伺服器（PowerShell 結束碼 ${r.status ?? r.error?.message}）`); process.exit(1); }
  }
  for (let i = 0; i < 120; i++) {
    await pause(500);
    // the new server, not one that was still answering: it writes its own pid to .cache/server.json when it listens
    const info = readServerInfo();
    if (info?.port === port && !old.has(info.pid) && (await busy(base)) !== null) { console.log(`Tellcut 伺服器已重開：${base}/editor/（紀錄：${log}）`); return; }
  }
  console.error(`伺服器 60 秒內沒有回應，看紀錄：${log}`);
  process.exit(1);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e); process.exit(1); });
