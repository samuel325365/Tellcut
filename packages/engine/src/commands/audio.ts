// Volume envelope points and fades on music/audio clips (spec §4.4). Point times are relative to the clip start.
import type { Project } from '../schema.ts';
import { CommandError, findItem, r6 } from './core.ts';

export const ENV_DB_MIN = -60, ENV_DB_MAX = 12;
const clampDb = (db: number) => Math.round(Math.min(ENV_DB_MAX, Math.max(ENV_DB_MIN, db)) * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function clip(p: Project, id: string, what: string) {
  const f = findItem(p, id);
  if (f.track.kind !== 'music' && f.track.kind !== 'audio') throw new CommandError(`Only music and audio clips have ${what}`);
  const it = f.item as any;
  return { it, len: it.end - it.start };
}

/** Inserts a point in time order; returns its index. */
export function addEnvelopePoint(p: Project, a: { id: string; t: number; db: number }): number {
  const { it, len } = clip(p, a.id, 'a volume envelope');
  const pt: [number, number] = [r6(clamp(a.t, 0, len)), clampDb(a.db)];
  const env: Array<[number, number]> = it.envelope ? [...it.envelope] : [];
  let i = env.findIndex(([t]) => t > pt[0]);
  if (i < 0) i = env.length;
  env.splice(i, 0, pt);
  it.envelope = env;
  return i;
}

/** Moves a point, never past its neighbours (the order stays valid). */
export function moveEnvelopePoint(p: Project, a: { id: string; index: number; t: number; db: number }) {
  const { it, len } = clip(p, a.id, 'a volume envelope');
  const env: Array<[number, number]> = it.envelope ?? [];
  if (!env[a.index]) throw new CommandError(`No envelope point ${a.index} on "${a.id}"`);
  // never past a neighbour (order stays valid); inside the clip unless a neighbour already lies past its end (after a trim)
  const lo = a.index > 0 ? env[a.index - 1][0] : 0;
  const hi = Math.max(lo, Math.min(len, a.index < env.length - 1 ? env[a.index + 1][0] : len));
  it.envelope = env.map((pt, i) => (i === a.index ? [r6(clamp(a.t, lo, hi)), clampDb(a.db)] : pt));
}

export function removeEnvelopePoint(p: Project, a: { id: string; index: number }) {
  const { it } = clip(p, a.id, 'a volume envelope');
  const env: Array<[number, number]> = it.envelope ?? [];
  if (!env[a.index]) throw new CommandError(`No envelope point ${a.index} on "${a.id}"`);
  const next = env.filter((_, i) => i !== a.index);
  if (next.length) it.envelope = next; else delete it.envelope;
}

/** Sets a fade length, clamped so fade-in plus fade-out fit the clip. */
export function setFade(p: Project, a: { id: string; edge: 'in' | 'out'; dur: number }) {
  const { it, len } = clip(p, a.id, 'fades');
  const other = a.edge === 'in' ? it.fadeOut : it.fadeIn;
  it[a.edge === 'in' ? 'fadeIn' : 'fadeOut'] = r6(clamp(a.dur, 0, Math.max(0, len - other)));
}
