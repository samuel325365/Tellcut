// Restarts the Tellcut server safely.   npm run server:restart -- [--port <the running one's, else 5174>] [--wait] [--force]
// 1. Refuses while a chat turn or an analysis runs (the user may be testing in the browser; a killed turn loses its reply and an
//    analysis dies with the server); --wait waits for them, --force does not ask.
// 2. Stops whatever listens on the port (with its child processes: stopping only the npm wrapper leaves node holding the port).
// 3. Starts the server (what `npm run server` runs) on its own, in a hidden console and a clean environment: a server started from a Claude Code session would
//    otherwise hand that session's variables to every page chat (claudeEnv). Output goes to .cache/server-<port>.log (and .err.log).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { claudeEnv, DEFAULT_PORT, readServerInfo, TELLCUT_ROOT } from '@tellcut/media-node';

const TERMINAL = new Set(['done', 'failed', 'cancelled']);

/** pids listening on the port, from `netstat -ano` */
export function listeners(netstat: string, port: number): number[] {
  const pids = new Set<number>();
  for (const line of netstat.split(/\r?\n/)) {
    const m = /^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/i.exec(line);
    if (m && Number(m[2]) === port && Number(m[3]) > 0) pids.add(Number(m[3]));
  }
  return [...pids];
}

/** the chat threads to ask about: every project, the home chat and its drafts */
export function threads(projectsDir: string): string[] {
  const ids = ['home'];
  try { for (const d of readdirSync(projectsDir, { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith('_') && existsSync(join(projectsDir, d.name, 'project.json'))) ids.push(d.name); } catch { /* none */ }
  try { for (const f of readdirSync(join(projectsDir, '_home'))) if (/^home-[a-z0-9]{6,24}\.json$/.test(f)) ids.push(f.slice(0, -5)); } catch { /* none */ }
  return ids;
}

const get = async (url: string): Promise<any> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

/** what still runs on the server: ["分析：food-deep（analyze）", "聊天：demo1"]; null when no Tellcut server answers */
async function busy(base: string): Promise<string[] | null> {
  let jobs: Array<{ kind: string; project?: string; status: string }>;
  try { jobs = await get(`${base}/api/jobs`); } catch { return null; }
  const out = jobs.filter((j) => !TERMINAL.has(j.status)).map((j) => `工作：${j.project ?? ''}（${j.kind}，${j.status}）`);
  for (const t of threads(join(TELLCUT_ROOT, 'projects'))) {
    try { if ((await get(`${base}/api/chat/${t}`)).running) out.push(`聊天：${t}`); } catch { /* not a thread this server knows */ }
  }
  return out;
}

const netstat = () => { try { return execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true }); } catch { return ''; } };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const argv = process.argv.slice(2), flag = (k: string) => argv.includes(k);
  const pi = argv.indexOf('--port'), port = pi >= 0 ? Number(argv[pi + 1]) : readServerInfo()?.port ?? DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0) { console.error('用法：npm run server:restart -- [--port 5174] [--wait] [--force]'); process.exit(2); }
  const base = `http://127.0.0.1:${port}`;

  for (let waited = 0; !flag('--force'); waited += 10) {
    const b = await busy(base);
    if (!b?.length) break;
    if (!flag('--wait')) { console.error(`伺服器還在忙，沒有重開：\n  ${b.join('\n  ')}\n等它們做完再試，或加 --wait 自動等；--force 不管它們。`); process.exit(1); }
    if (waited % 60 === 0) console.log(`等待中（${waited} 秒）：${b.join('、')}`);
    await pause(10000);
  }

  const pids = listeners(netstat(), port);
  for (const pid of pids) {
    try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); console.log(`停掉了埠 ${port} 上的程序 ${pid}`); }
    catch { console.error(`停不掉程序 ${pid}（權限不夠？）`); process.exit(1); }
  }
  for (let i = 0; i < 50 && listeners(netstat(), port).length; i++) await pause(200);
  if (listeners(netstat(), port).length) { console.error(`埠 ${port} 還被佔著，沒有重開`); process.exit(1); }

  const logDir = join(TELLCUT_ROOT, '.cache'), log = join(logDir, `server-${port}.log`), err = join(logDir, `server-${port}.err.log`);
  mkdirSync(logDir, { recursive: true });
  // What `npm run server` runs, as node itself, in a console of its own that stays hidden: a detached process has no console,
  // so every ffmpeg or ffprobe it runs would flash a window of its own; with a hidden console they all share that one.
  // Start-Process leaves it running after we exit, with the environment it is given (claudeEnv).
  const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Start-Process -FilePath ${ps(process.execPath)} -ArgumentList ${['--import', 'tsx', 'apps/server/src/main.ts', '--port', String(port)].map(ps).join(',')} ` +
    `-WorkingDirectory ${ps(TELLCUT_ROOT)} -WindowStyle Hidden -RedirectStandardOutput ${ps(log)} -RedirectStandardError ${ps(err)}`],
  // no pipes: the server would inherit them from PowerShell and we would wait on them for as long as it runs
  { env: claudeEnv(), windowsHide: true, stdio: 'ignore' });
  if (r.status !== 0) { console.error(`啟動不了伺服器（PowerShell 結束碼 ${r.status ?? r.error?.message}）`); process.exit(1); }
  for (let i = 0; i < 120; i++) {
    await pause(500);
    // the new server, not one that was still answering: it writes its own pid to .cache/server.json when it listens
    const info = readServerInfo();
    if (info?.port === port && !pids.includes(info.pid) && (await busy(base)) !== null) { console.log(`Tellcut 伺服器已重開：${base}/editor/（紀錄：${log}）`); return; }
  }
  console.error(`伺服器 60 秒內沒有回應，看紀錄：${log}`);
  process.exit(1);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e); process.exit(1); });
