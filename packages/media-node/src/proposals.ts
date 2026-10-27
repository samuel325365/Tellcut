// Claude's proposals (spec 2026-10-15-proposals-magnetic §3): one pending proposal per project in .history/proposals/current.json,
// closed ones in .history/proposals/done/. The folder sits under .history/ (already ignored by git, kept like the versions).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyOps, type Op, type Project } from '@tellcut/engine';
import { handleOf, type Proposal, type ProposalStatus } from '@tellcut/protocol';
import { projectHash } from './projectfile.ts';
import { renameRetry } from './fsutil.ts';

export type { Proposal, ProposalStatus };

export const proposalsDir = (dir: string) => join(dir, '.history', 'proposals');
const current = (dir: string) => join(proposalsDir(dir), 'current.json');
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function readProposal(dir: string): Proposal | null {
  try { const p = JSON.parse(readFileSync(current(dir), 'utf8')) as Proposal; return p.status === 'pending' ? p : null; }
  catch { return null; }
}

/** a block or sound as the summary names it: its gallery handle and short name (MRK-03 stamp), so it matches the gallery */
const typeName = (type: unknown) => { if (typeof type !== 'string') return ''; const h = handleOf(type); return `${h ? `${h} ` : ''}${type.replace(/^common\./, '')}`; };

/** the engine's summary with the blocks named: what an added item is, and a type change as old → new */
function namedSummary(lines: string[], before: Project, after: Project): string[] {
  const typeIn = (p: Project) => new Map(p.tracks.flatMap((t) => (t.items as any[]).map((i) => [i.id as string, i.type] as const)));
  const A = typeIn(before), B = typeIn(after);
  return lines.map((l) => {
    let m = /^(\S+) 修改 type$/.exec(l);
    if (m && B.get(m[1])) return `${m[1]} 換積木 ${typeName(A.get(m[1]))} → ${typeName(B.get(m[1]))}`;
    m = /^新增 (\S+)（(.+)）$/.exec(l);
    if (m && B.get(m[1])) return `新增 ${m[1]} ${typeName(B.get(m[1]))}（${m[2]}）`;
    return l;
  });
}

export function makeProposal(dir: string, label: string, ops: Op[], project: Project): Proposal {
  const r = applyOps(project, ops);
  const d = new Date(), id = `p-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 5)}`;
  return { id, label, created: d.toISOString(), base: projectHash(readFileSync(join(dir, 'project.json'), 'utf8')), ops, status: 'pending', summary: namedSummary(r.summary, project, r.project), warnings: r.warnings };
}

function archive(dir: string, p: Proposal) {
  const done = join(proposalsDir(dir), 'done');
  mkdirSync(done, { recursive: true });
  writeFileSync(join(done, `${p.id}.json`), JSON.stringify(p, null, 2) + '\n');
}

export function saveProposal(dir: string, p: Proposal) {
  const old = readProposal(dir);
  if (old && old.id !== p.id) archive(dir, { ...old, status: 'rejected', reason: '被新提議取代' });
  mkdirSync(proposalsDir(dir), { recursive: true });
  const tmp = `${current(dir)}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(p, null, 2) + '\n');
  renameRetry(tmp, current(dir));
}

export function closeProposal(dir: string, id: string, status: Exclude<ProposalStatus, 'pending'>, reason?: string): Proposal | null {
  const p = readProposal(dir);
  if (!p || p.id !== id) return null;
  const closed = { ...p, status, ...(reason ? { reason } : {}) };
  archive(dir, closed);
  rmSync(current(dir), { force: true });
  return closed;
}
