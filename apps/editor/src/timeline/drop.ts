// Where something dragged onto the timeline goes (spec 2026-11-10-media-panel-visual §5): a library card or a file from this PC,
// let go over a track, over the "+ New track" strip, or off the timeline. One pure rule for the live preview, the release and
// the files that land once their copy is done:
// - only a track of the material's own kind takes it, and not a locked one;
// - the magnetic track takes it at the pointer time and its own packing puts it at the nearest cut (nothing is split or covered);
// - any other track takes it at the pointer time, overlapping items share the track in another lane (geometry assignLanes),
//   and like the library's add it ends at the end of the film at the latest.
import { addItem, addTrack, magneticTrack, resolveTimes, snapCandidates, snapDelta, type Project, type Registry, type Times, type TrackKind } from '@tellcut/engine';
import type { Material } from '../audition.ts';
import { materialItem } from '../editor/materials.ts';
import { t } from '../i18n/index.ts';
import type { EditorState, PeakInfo } from '../store.ts';

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

const NO_SNAP = { snap: false, threshold: 0, playhead: 0 };
/** apart by this much, clips put at one point of the magnetic track keep their order when it packs them (far less than a frame) */
const TIE = 1e-4;

/** Files dropped from this PC, once imported: each new source or music `ids` names (in the order dropped) as a clip of the whole
 *  video, a 3 s photo or the whole sound (`lengths`, else 10 s), from the drop point on, inside the recipe that adds them (one undo
 *  step). On the magnetic track they all go in at the drop point, packed one after another there; on any other track each follows
 *  the one before. One the target track does not take (another kind, locked, gone) goes on the first open track of its kind, or on
 *  a new one; "+ New track" makes one track per kind for all of them. No snapping: the pointer let go long before. */
export function placeImported(d: Project, ids: string[], at: DropTarget, c: { locked: ReadonlySet<string>; lengths: Record<string, number>; reg?: Registry; peaks: Record<string, PeakInfo>; beats: EditorState['beats'] }) {
  if (at.row === null) return;
  const made = new Map<DropKind, string>(), next = new Map<string, number>(), mag = magneticTrack(d)?.id;
  let tie = 0;
  for (const id of ids) {
    const src = d.sources[id];
    const m: Material | null = src ? { kind: 'clip', source: id, from: 0, len: src.duration } : d.media[id] ? { kind: 'music', media: id, len: c.lengths[id] ?? 10 } : null;
    if (!m) continue;
    const x = materialItem(d, m, 0, c), len = (x.item.end as number) - (x.item.start as number), times = resolveTimes(d);
    const row = (r: string) => (r === 'new' ? made.get(x.kind) ?? 'new' : r);
    const plan = (r: string) => { const w = row(r); return planDrop(d, times, { kind: x.kind, len, at: { t: next.get(w) ?? at.t, row: w }, locked: c.locked }, NO_SNAP); };
    let pl = plan(at.row);
    if (!pl?.ok) pl = plan(d.tracks.find((tr) => tr.kind === x.kind && !c.locked.has(tr.id))?.id ?? 'new');
    if (!pl?.ok) continue;
    const track = pl.track ?? addTrack(d, { kind: x.kind as TrackKind });
    if (pl.track === null) made.set(x.kind, track);
    const start = track === mag ? r6(at.t + tie++ * TIE) : pl.start, end = track === mag ? r6(start + len) : pl.end;
    const nid = addItem(d, { track, item: { ...x.item, start, end } });
    x.also?.(d, nid);
    if (track !== mag) next.set(track, end);
  }
}
