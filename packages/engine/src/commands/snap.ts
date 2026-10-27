// Snapping targets for timeline edits (spec §4.2): beats, item edges, playhead, markers.
import type { AnyItem, Project } from '../schema.ts';
import type { Times } from '../time.ts';
import { r6 } from './core.ts';

export function beatTimes(p: Project): number[] {
  const out: number[] = [];
  for (const g of p.grids) {
    const step = 60 / g.bpm, end = g.until ?? p.meta.duration;
    for (let k = 0; g.at + k * step <= end + 1e-9; k++) out.push(r6(g.at + k * step));
  }
  return out;
}

export function snapCandidates(p: Project, times: Times, o: { playhead?: number; exclude?: Set<string>; beats?: boolean } = {}): number[] {
  const c = [0, p.meta.duration, ...(p.markers ?? []).map((m) => m.t)];
  if (o.playhead !== undefined) c.push(o.playhead);
  if (o.beats ?? true) c.push(...beatTimes(p));
  for (const t of p.tracks) for (const it of t.items as AnyItem[]) {
    if (o.exclude?.has(it.id)) continue;
    const tm = times.get(it.id)!;
    c.push(tm.start, tm.end);
  }
  return [...new Set(c.map(r6))].sort((a, b) => a - b);
}

export function snapTime(t: number, cands: number[], threshold: number): { t: number; to: number | null } {
  let best: number | null = null;
  for (const c of cands) if (Math.abs(c - t) <= threshold && (best === null || Math.abs(c - t) < Math.abs(best - t))) best = c;
  return best === null ? { t, to: null } : { t: best, to: best };
}

export function snapDelta(edges: number[], dt: number, cands: number[], threshold: number): number {
  let best: number | null = null, dist = Infinity;
  for (const e of edges) {
    const s = snapTime(e + dt, cands, threshold);
    if (s.to !== null && Math.abs(s.to - (e + dt)) < dist) { dist = Math.abs(s.to - (e + dt)); best = s.to - e; }
  }
  return best ?? dt;
}
