// Moving and deleting items.
import { plainCopy } from '../util.ts';
import type { AnyItem, Project } from '../schema.ts';
import { resolveTimes } from '../time.ts';
import { CommandError, childrenOf, findItem, r6, topLevel } from './core.ts';

/** Shifts items by dt (clamped so none starts before 0); a single item may move to another track of the same kind. */
export function moveItems(p: Project, a: { ids: string[]; dt: number; toTrack?: string }) {
  const ids = topLevel(p, a.ids);
  const found = ids.map((id) => findItem(p, id));
  const times = resolveTimes(p);
  const dt = Math.max(a.dt, -Math.min(...ids.map((id) => times.get(id)!.start)));
  for (const f of found) { f.item.start = r6(f.item.start + dt); f.item.end = r6(f.item.end + dt); }
  if (a.toTrack === undefined) return;
  if (found.length !== 1) throw new CommandError('Only one item can change track at a time');
  const f = found[0], to = p.tracks.find((t) => t.id === a.toTrack);
  if (!to) throw new CommandError(`No track "${a.toTrack}"`);
  if (to.kind !== f.track.kind) throw new CommandError(`Cannot move a ${f.track.kind} item onto track "${to.id}" (${to.kind})`);
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

/** Deletes items and pulls the later top-level items of the same track back over the gap. */
export function rippleDelete(p: Project, a: { ids: string[] }) {
  const times = resolveTimes(p);
  // only top-level items leave a gap: an item hanging on a clip is gone without moving anything (spec 2026-10-15-proposals-magnetic §4.3)
  const gaps = topLevel(p, a.ids).filter((id) => findItem(p, id).item.parent === undefined).map((id) => ({ track: findItem(p, id).track.id, ...times.get(id)! }));
  deleteItems(p, a);
  for (const t of p.tracks) {
    // merge the deleted spans (clips may overlap in dissolves) so no time is counted twice
    const merged: Array<{ start: number; end: number }> = [];
    for (const g of gaps.filter((x) => x.track === t.id).sort((x, y) => x.start - y.start)) {
      const last = merged[merged.length - 1];
      if (last && g.start <= last.end) last.end = Math.max(last.end, g.end); else merged.push({ start: g.start, end: g.end });
    }
    if (!merged.length) continue;
    for (const it of t.items as AnyItem[]) {
      if (it.parent !== undefined) continue;
      const at = times.get(it.id)!.start;
      // remove only the deleted time that lies before this item's start: order is kept and nothing goes below 0
      const shift = merged.reduce((s, g) => s + Math.max(0, Math.min(g.end, at) - g.start), 0);
      if (shift) { it.start = r6(it.start - shift); it.end = r6(it.end - shift); }
    }
  }
}
