// Moving and deleting items.
import { plainCopy } from '../util.ts';
import type { AnyItem, Project } from '../schema.ts';
import { resolveTimes, TIME_EPS, type Times } from '../time.ts';
import { CommandError, childrenOf, findItem, fitFades, mediaRate, minLen, r6, shiftRelative, topLevel } from './core.ts';

/** Shifts items by dt (clamped so none starts before 0); a single item may move to another track of the same kind. */
export function moveItems(p: Project, a: { ids: string[]; dt: number; toTrack?: string }) {
  const ids = topLevel(p, a.ids);
  const found = ids.map((id) => findItem(p, id));
  const times = resolveTimes(p);
  const dt = Math.max(a.dt, -Math.min(...ids.map((id) => times.get(id)!.start)));
  for (const f of found) { f.item.start = r6(f.item.start + dt); f.item.end = r6(f.item.end + dt); }
  if (a.toTrack === undefined) return;
  if (found.length !== 1) throw new CommandError('Only one item can change track at a time', 'cmd.oneTrackMove');
  const f = found[0], to = p.tracks.find((t) => t.id === a.toTrack);
  if (!to) throw new CommandError(`No track "${a.toTrack}"`, 'cmd.noTrack', { id: a.toTrack });
  if (to.kind !== f.track.kind) throw new CommandError(`Cannot move a ${f.track.kind} item onto track "${to.id}" (${to.kind})`, 'cmd.wrongTrackKind', { kind: f.track.kind, track: to.id, trackKind: to.kind });
  if (to === f.track) return;
  const [moved] = (f.track.items as AnyItem[]).splice(f.ii, 1);
  (to.items as AnyItem[]).push(plainCopy(moved));
}

/** Removes items and, recursively, their children (spec §3.1). */
export function deleteItems(p: Project, a: { ids: string[] }) {
  const doomed = new Set<string>();
  const add = (id: string) => { if (doomed.has(id)) return; doomed.add(id); for (const c of childrenOf(p, id)) add(c.id); };
  for (const id of a.ids) { findItem(p, id); add(id); }
  for (const t of p.tracks) {
    const list = t.items as AnyItem[];
    for (let i = list.length - 1; i >= 0; i--) if (doomed.has(list[i].id)) list.splice(i, 1);
  }
}

/** Deletes items and pulls the later top-level items of the same track back over the gap. What hangs on the items left loses
 *  the deleted time too: an item that ran from a kept clip over a deleted one (one left on the first half of a split) would
 *  otherwise run on over the shots pulled back. */
export function rippleDelete(p: Project, a: { ids: string[] }) {
  const times = resolveTimes(p);
  // only top-level items leave a gap: an item hanging on a clip is gone without moving anything (spec 2026-10-15-proposals-magnetic §4.3)
  const gaps = topLevel(p, a.ids).filter((id) => findItem(p, id).item.parent === undefined).map((id) => ({ track: findItem(p, id).track.id, ...times.get(id)! }));
  deleteItems(p, a);
  const cuts = new Map<string, Array<{ start: number; end: number }>>();
  for (const t of p.tracks) {
    // merge the deleted spans (clips may overlap in dissolves) so no time is counted twice
    const merged: Array<{ start: number; end: number }> = [];
    for (const g of gaps.filter((x) => x.track === t.id).sort((x, y) => x.start - y.start)) {
      const last = merged[merged.length - 1];
      if (last && g.start <= last.end) last.end = Math.max(last.end, g.end); else merged.push({ start: g.start, end: g.end });
    }
    if (!merged.length) continue;
    cuts.set(t.id, merged);
    for (const it of t.items as AnyItem[]) {
      if (it.parent !== undefined) continue;
      const at = times.get(it.id)!.start;
      // remove only the deleted time that lies before this item's start: order is kept and nothing goes below 0
      const shift = merged.reduce((s, g) => s + Math.max(0, Math.min(g.end, at) - g.start), 0);
      if (shift) { it.start = r6(it.start - shift); it.end = r6(it.end - shift); }
    }
  }
  if (cuts.size) hangersLoseCut(p, times, cuts);
}

/** Items hanging (at any depth) on a top-level item of a track that lost time: each moment of the film maps to where it lands
 *  after the cut (t minus the deleted time before it), the deleted moments to the cut. A sound effect keeps its length and goes
 *  when it started on deleted time; anything else keeps what is left of its span (a media item's in-point follows its head),
 *  and goes when nothing is. */
function hangersLoseCut(p: Project, times: Times, cuts: Map<string, Array<{ start: number; end: number }>>) {
  const where = new Map(p.tracks.flatMap((t) => (t.items as AnyItem[]).map((i) => [i.id, { t, i }] as const)));
  const rootOf = (it: AnyItem) => { let x = it; while (x.parent !== undefined) x = where.get(x.parent)!.i; return x; };
  const doomed: string[] = [];
  const moves: Array<() => void> = [];
  for (const { t, i: it } of where.values()) {
    if (it.parent === undefined) continue;
    const root = rootOf(it), all = cuts.get(where.get(root.id)!.t.id);
    if (!all) continue;
    // the clip it hangs on keeps its whole length (one dissolving in over a deleted clip only moves): its own time is not lost
    const r = times.get(root.id)!;
    const gaps = all.flatMap((g) => [{ start: g.start, end: Math.min(g.end, r.start) }, { start: Math.max(g.start, r.end), end: g.end }]).filter((g) => g.end > g.start);
    if (!gaps.length) continue;
    const lost = (x: number) => gaps.reduce((s, g) => s + Math.max(0, Math.min(g.end, x) - g.start), 0);
    const map = (x: number) => x - lost(x);
    const { start: s, end: e } = times.get(it.id)!, base = map(times.get(it.parent)!.start);
    const inside = gaps.find((g) => s >= g.start - TIME_EPS && s < g.end - TIME_EPS);
    const ns = map(s), ne = t.kind === 'sfx' ? ns + (e - s) : map(e);
    if (t.kind === 'sfx' ? inside : ne - ns < minLen(p) - 1e-9) { doomed.push(it.id); continue; }
    if (Math.abs(ns - base - it.start) <= TIME_EPS && Math.abs(ne - base - it.end) <= TIME_EPS) continue;
    const head = inside ? inside.end - s : 0, rate = mediaRate(t, it);
    moves.push(() => {
      const x = it as any;
      x.start = r6(ns - base); x.end = r6(ne - base);
      if (head > 0) { if (rate !== null) x.in = r6(x.in + head * rate); shiftRelative(t, x, -head); }
      fitFades(t, x);
    });
  }
  // every place is worked out from the times before the cut, then written
  for (const m of moves) m();
  if (doomed.length) deleteItems(p, { ids: doomed });
}
