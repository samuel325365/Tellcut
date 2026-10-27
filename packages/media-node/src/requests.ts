// "Ask Agent…" requests (spec 2026-10-16-right-click-claude §3): one JSON per request in .history/requests/, newest 50 kept.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AskRequest { id: string; created: string; text: string; selection: string[]; playhead: number; range: [number, number] | null; base: string }
export const REQUESTS_KEEP = 50;
export const requestsDir = (dir: string) => join(dir, '.history', 'requests');
const pad = (n: number) => String(n).padStart(2, '0');

export function newRequestId(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 5).padEnd(3, '0')}`;
}

const list = (dir: string) => existsSync(requestsDir(dir)) ? readdirSync(requestsDir(dir)).filter((f) => f.endsWith('.json')).sort() : [];

export function saveRequest(dir: string, r: AskRequest) {
  mkdirSync(requestsDir(dir), { recursive: true });
  writeFileSync(join(requestsDir(dir), `${r.id}.json`), JSON.stringify(r, null, 2) + '\n');
  const all = list(dir);
  for (const f of all.slice(0, Math.max(0, all.length - REQUESTS_KEEP))) rmSync(join(requestsDir(dir), f));
}

export function readRequest(dir: string, id: string): AskRequest | null {
  if (!/^[\w-]+$/.test(id)) return null;
  try { return JSON.parse(readFileSync(join(requestsDir(dir), `${id}.json`), 'utf8')); } catch { return null; }
}

export function latestRequest(dir: string): AskRequest | null {
  const last = list(dir).at(-1);
  return last ? readRequest(dir, last.replace(/\.json$/, '')) : null;
}
