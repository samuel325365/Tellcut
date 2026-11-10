// Where something dragged onto the timeline goes (spec 2026-11-10-media-panel-visual §5): a library card or a file from this PC,
// let go over a track, over the "+ New track" strip, or off the timeline. One pure rule for the live preview, the release and
// the files that land once their copy is done:
// - only a track of the material's own kind takes it, and not a locked one;
// - the magnetic track takes it at the pointer time and its own packing puts it at the nearest cut (nothing is split or covered);
// - any other track takes it at the pointer time, overlapping items share the track in another lane (geometry assignLanes),
//   and like the library's add it ends at the end of the film at the latest.
import { addItem, addTrack, magneticTrack, snapCandidates, snapDelta, type Project, type Times, type TrackKind } from '@tellcut/engine';
import { t } from '../i18n/index.ts';

/** the track kinds the library and dropped files add to */
export type DropKind = 'video' | 'music' | 'sfx' | 'overlay';
/** where the pointer is: over a track (its id), over the "+ New track" strip, or off the timeline (null) */
export interface DropTarget { t: number; row: string | 'new' | null }
/** track null: a new track of that kind */
export type DropPlan =
  | { ok: true; track: string | null; start: number; end: number }
  | { ok: false; why: string; track: string | null; start: number; end: number };

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** null when the pointer is off the timeline. `refuse`: why the material cannot go anywhere (a scene block, a one-per-film block) */
export function planDrop(p: Project, times: Times, d: { kind: DropKind; len: number; at: DropTarget; locked: ReadonlySet<string>; refuse?: string },
  o: { snap: boolean; threshold: number; playhead: number }): DropPlan | null {
  if (d.at.row === null) return null;
  const track = d.at.row === 'new' ? null : d.at.row, tr = track === null ? undefined : p.tracks.find((x) => x.id === track);
  let start = Math.max(0, d.at.t);
  if (o.snap) start = Math.max(0, start + snapDelta([start, start + d.len], 0, snapCandidates(p, times, { playhead: o.playhead }), o.threshold));
  const magnetic = !!tr && tr.id === magneticTrack(p)?.id;
  const end = magnetic ? start + d.len : Math.min(start + d.len, p.meta.duration);
  const at = { track, start: r6(start), end: r6(end) };
  const no = (why: string): DropPlan => ({ ok: false, why, ...at });
  if (d.refuse) return no(d.refuse);
  if (track !== null && !tr) return no(t('ed.dropWrongKind'));
  if (tr && tr.kind !== d.kind) return no(t('ed.dropWrongKind'));
  if (tr && d.locked.has(tr.id)) return no(t('ed.dropLocked'));
  if (end - start < 1 / p.meta.fps - 1e-9) return no(t('ed.dropAtEnd'));
  return { ok: true, ...at };
}

/** the edit a plan makes: the item (its start and end already the plan's) on the plan's track, or on a new one; returns its id */
export function dropRecipe(plan: Extract<DropPlan, { ok: true }>, kind: DropKind, item: Record<string, unknown>, also?: (d: Project, id: string) => void) {
  return (d: Project): string => {
    const track = plan.track ?? addTrack(d, { kind: kind as TrackKind });
    const id = addItem(d, { track, item: { ...item, start: plan.start, end: plan.end } });
    also?.(d, id);
    return id;
  };
}
