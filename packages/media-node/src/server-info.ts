// Where the Tellcut server listens (review3 R3-H6): the server writes .cache/server.json when it starts, and the CLI (propose,
// new, inspect) reads it. A developer's server on 5199 was missed by a CLI that assumed 5174: it wrote the files itself and
// the open editor never heard of the change.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TELLCUT_ROOT } from './paths.ts';

export interface ServerInfo { url: string; port: number; pid: number; started: string }
export const DEFAULT_PORT = 5174;

const file = (root: string) => join(root, '.cache', 'server.json');
const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };

export function writeServerInfo(port: number, root = TELLCUT_ROOT, pid = process.pid): ServerInfo {
  const info: ServerInfo = { url: `http://127.0.0.1:${port}`, port, pid, started: new Date().toISOString() };
  mkdirSync(join(root, '.cache'), { recursive: true });
  writeFileSync(file(root), JSON.stringify(info, null, 2));
  return info;
}

/** the running server's own record, or null (none, unreadable, or its process has stopped) */
export function readServerInfo(root = TELLCUT_ROOT, alive: (pid: number) => boolean = isAlive): ServerInfo | null {
  try {
    const s = JSON.parse(readFileSync(file(root), 'utf8')) as ServerInfo;
    return typeof s.url === 'string' && Number.isInteger(s.pid) && alive(s.pid) ? s : null;
  } catch { return null; }
}

/** removed by the server that wrote it (a newer server's record stays) */
export function clearServerInfo(root = TELLCUT_ROOT, pid = process.pid) {
  try { if (existsSync(file(root)) && JSON.parse(readFileSync(file(root), 'utf8')).pid === pid) rmSync(file(root), { force: true }); } catch { /* gone or broken */ }
}

/** the server the CLI talks to: TELLCUT_URL (the page chat is given its own), else the one running here, else the default port */
export function tellcutUrl(env: NodeJS.ProcessEnv = process.env, root = TELLCUT_ROOT, alive: (pid: number) => boolean = isAlive): string {
  return env.TELLCUT_URL || readServerInfo(root, alive)?.url || `http://127.0.0.1:${DEFAULT_PORT}`;
}
