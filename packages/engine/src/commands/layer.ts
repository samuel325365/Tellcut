// Layer order (spec 2026-10-14 §3.4, §4): tracks inside their group (pictures / sound) and items inside a track.
// Later in project.tracks or in a track's items = drawn on top.
import type { AnyItem, Project, Track, TrackKind } from '../schema.ts';
import { resolveTimes, TIME_EPS } from '../time.ts';
import { CommandError, findItem } from './core.ts';
import { deleteItems } from './arrange.ts';

const VISUAL = new Set<TrackKind>(['scene', 'video', 'overlay']);
const groupOf = (t: Track) => (VISUAL.has(t.kind) ? 'picture' : 'sound');
import { plainCopy as plain } from '../util.ts';

/** Moves a track to place `to` of its group (0 = first in project.tracks: the lowest picture layer). */
export function moveTrack(p: Project, a: { id: string; to: number }) {
  const t = p.tracks.find((x) => x.id === a.id);
  if (!t) throw new CommandError(`沒有軌道「${a.id}」`);
  const slots = p.tracks.map((x, i) => (groupOf(x) === groupOf(t) ? i : -1)).filter((i) => i >= 0);
  if (!Number.isInteger(a.to) || a.to < 0 || a.to >= slots.length) throw new CommandError(`軌道位置 ${a.to} 超出範圍（0–${slots.length - 1}）`);
  const order = slots.map((i) => p.tracks[i]);
  const from = order.indexOf(t);
  if (from === a.to) return;
  order.splice(from, 1);
  order.splice(a.to, 0, t);
  const copies = order.map(plain);
  slots.forEach((i, k) => { p.tracks[i] = copies[k]; });
}

/** Deletes a track with its items (and, as deleteItems does, their children on other tracks). */
export function removeTrack(p: Project, a: { id: string }) {
  const i = p.tracks.findIndex((x) => x.id === a.id);
  if (i < 0) throw new CommandError(`沒有軌道「${a.id}」`);
  const own = (p.tracks[i].items as AnyItem[]).map((x) => x.id);
  if (own.length) deleteItems(p, { ids: own });
  p.tracks.splice(p.tracks.findIndex((x) => x.id === a.id), 1);
}

const overlaps = (x: { start: number; end: number }, y: { start: number; end: number }) => x.start < y.end - TIME_EPS && y.start < x.end - TIME_EPS;

/** Index of the nearest item of the same track above ('up') or below ('down') that overlaps the item in time, or -1. */
export function restackTarget(p: Pick<Project, 'tracks'>, id: string, dir: 'up' | 'down'): number {
  const times = resolveTimes(p);
  for (const t of p.tracks) {
    const list = t.items as AnyItem[], i = list.findIndex((x) => x.id === id);
    if (i < 0) continue;
    const me = times.get(id)!, hit = (j: number) => overlaps(me, times.get(list[j].id)!);
    if (dir === 'up') { for (let j = i + 1; j < list.length; j++) if (hit(j)) return j; }
    else for (let j = i - 1; j >= 0; j--) if (hit(j)) return j;
    return -1;
  }
  return -1;
}

/** Moves an item just above (or below) the nearest item of its track that overlaps it: one visible step. */
export function restackItem(p: Project, a: { id: string; dir: 'up' | 'down' }) {
  const f = findItem(p, a.id), j = restackTarget(p, a.id, a.dir);
  if (j < 0) throw new CommandError(a.dir === 'up' ? '沒有重疊在上層的片段' : '沒有重疊在下層的片段');
  const list = f.track.items as AnyItem[];
  const [moved] = list.splice(f.ii, 1);
  // up: the removal shifted the target down by one, so j is right after it; down: j is right before it
  list.splice(j, 0, plain(moved));
}
