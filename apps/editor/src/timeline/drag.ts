// Pointer drags → edit commands (spec §4.2), with snapping.
import { findItem, mediaRate, moveItems, rateStretch, roll, slip, snapCandidates, snapDelta, trimEnd, trimStart, type AnyItem, type Project, type Times } from '@tellcut/engine';
import { timeToX, type Row, type View } from './geometry.ts';

export interface Mods { alt: boolean; ctrl: boolean; shift: boolean }
export type DragKind = 'move' | 'trimStart' | 'trimEnd' | 'slip' | 'roll' | 'stretchStart' | 'stretchEnd';
export interface DragPlan { kind: DragKind; ids: string[]; left?: string; right?: string }
export interface DragStart { grip: 'body' | 'start' | 'end'; id: string; mods: Mods; selection: string[] }

function neighbour(p: Project, times: Times, id: string, grip: 'start' | 'end'): string | undefined {
  const { track } = findItem(p, id), me = times.get(id)!;
  return (track.items as AnyItem[]).find((o) => o.id !== id && Math.abs(grip === 'end' ? times.get(o.id)!.start - me.end : times.get(o.id)!.end - me.start) < 1e-6)?.id;
}

export function planDrag(p: Project, times: Times, s: DragStart): DragPlan {
  const { track, item } = findItem(p, s.id);
  if (s.grip === 'body') {
    if (s.mods.alt && mediaRate(track, item) !== null) return { kind: 'slip', ids: [s.id] };
    return { kind: 'move', ids: s.selection.includes(s.id) ? s.selection : [s.id] };
  }
  if (s.mods.alt) {
    const nb = neighbour(p, times, s.id, s.grip);
    if (nb) return s.grip === 'end' ? { kind: 'roll', ids: [s.id], left: s.id, right: nb } : { kind: 'roll', ids: [s.id], left: nb, right: s.id };
  }
  if (s.mods.ctrl && (track.kind === 'video' || track.kind === 'audio')) return { kind: s.grip === 'end' ? 'stretchEnd' : 'stretchStart', ids: [s.id] };
  return { kind: s.grip === 'end' ? 'trimEnd' : 'trimStart', ids: [s.id] };
}

function edges(plan: DragPlan, times: Times): number[] {
  const t = (id: string) => times.get(id)!;
  switch (plan.kind) {
    case 'move': return plan.ids.flatMap((id) => [t(id).start, t(id).end]);
    case 'trimStart': case 'stretchStart': return [t(plan.ids[0]).start];
    case 'trimEnd': case 'stretchEnd': return [t(plan.ids[0]).end];
    case 'roll': return [t(plan.left!).end];
    default: return [];
  }
}

export function dragRecipe(p: Project, times: Times, plan: DragPlan, dt: number, o: { snap: boolean; threshold: number; playhead: number; toTrack?: string }) {
  let d = dt, guide: number | null = null;
  const e = edges(plan, times);
  if (o.snap && e.length) {
    const exclude = new Set([...plan.ids, ...(plan.left ? [plan.left] : []), ...(plan.right ? [plan.right] : [])]);
    const cands = snapCandidates(p, times, { playhead: o.playhead, exclude });
    d = snapDelta(e, dt, cands, o.threshold);
    if (d !== dt) guide = e.map((x) => x + d).find((x) => cands.some((c) => Math.abs(c - x) < 1e-6)) ?? null;
  }
  const id = plan.ids[0];
  const recipe = (draft: Project) => {
    switch (plan.kind) {
      case 'move': return moveItems(draft, { ids: plan.ids, dt: d, toTrack: o.toTrack });
      case 'trimStart': return trimStart(draft, { id, dt: d });
      case 'trimEnd': return trimEnd(draft, { id, dt: d });
      case 'stretchStart': return rateStretch(draft, { id, edge: 'start', dt: d });
      case 'stretchEnd': return rateStretch(draft, { id, edge: 'end', dt: d });
      case 'roll': return roll(draft, { left: plan.left!, right: plan.right!, dt: d });
      case 'slip': { const f = findItem(draft, id); return slip(draft, { id, dt: -dt * (mediaRate(f.track, f.item) ?? 1) }); }
    }
  };
  return { recipe, guide };
}

export function itemsInRect(p: Project, times: Times, rows: Row[], view: View, r: { x0: number; y0: number; x1: number; y1: number }): string[] {
  const [x0, x1, y0, y1] = [Math.min(r.x0, r.x1), Math.max(r.x0, r.x1), Math.min(r.y0, r.y1), Math.max(r.y0, r.y1)];
  return rows.flatMap((row) => (row.track.items as AnyItem[]).filter((it) => {
    const tm = times.get(it.id)!, top = row.y + (row.lanes.get(it.id) ?? 0) * row.laneH;
    return top < y1 && top + row.laneH > y0 && timeToX(tm.start, view) < x1 && timeToX(tm.end, view) > x0;
  }).map((it) => it.id));
}
