// Where the timeline's cutting keys act (spec 2026-10-28-timeline-refresh A2): the cut points ↑ / ↓ jump between, and the
// clips Q / W cut at the playhead.
import { magneticTrack, type AnyItem, type Project, type Times } from '@tellcut/engine';

const MEDIA = new Set(['video', 'audio', 'music']);
const EPS = 1e-6;
const under = (tm: { start: number; end: number } | undefined, t: number) => !!tm && tm.start < t - EPS && t < tm.end - EPS;

/** every clip's start and end on any track, with 0 and the film's end; sorted, no repeats */
export function cutPoints(p: Project, times: Times): number[] {
  const all = [0, p.meta.duration, ...[...times.values()].flatMap((x) => [x.start, x.end])].map((t) => Math.round(t * 1e6) / 1e6);
  return [...new Set(all)].sort((a, b) => a - b);
}

/** the nearest point strictly before (dir -1) or after (dir 1) t, more than half a frame away; none: 0 or the last point */
export function nextCut(points: number[], t: number, dir: -1 | 1, fps: number): number {
  const half = 0.5 / fps;
  if (dir > 0) return points.find((x) => x > t + half) ?? points[points.length - 1];
  return [...points].reverse().find((x) => x < t - half) ?? 0;
}

/** A selection with no video, audio or music clip on an unlocked track: Q / W and split say so, not that the playhead has none. */
export function selectionHasNoClip(p: Project, selection: string[], skip: ReadonlySet<string>): boolean {
  return selection.length > 0 && !p.tracks.some((tr) => MEDIA.has(tr.kind) && !skip.has(tr.id) && (tr.items as AnyItem[]).some((it) => selection.includes(it.id)));
}

/** What Q / W cut. With a selection: its video, audio and music clips the playhead is inside (a clip's own sound goes with
 *  the clip, so it is not listed again). With none: the magnetic clip under the playhead, else the clip of the topmost video
 *  track under it — music and blocks never count, they sit under most of an agent-made film. Null: nothing to cut.
 *  skip: tracks passed over (locked). */
export function edgeTargets(p: Project, times: Times, t: number, selection: string[], skip: ReadonlySet<string>): string[] | null {
  const tracks = p.tracks.filter((tr) => !skip.has(tr.id));
  if (selection.length) {
    const picked = tracks.filter((tr) => MEDIA.has(tr.kind)).flatMap((tr) => (tr.items as AnyItem[]).filter((it) => selection.includes(it.id) && under(times.get(it.id), t)));
    const ids = new Set(picked.map((it) => it.id));
    const out = picked.filter((it) => it.parent === undefined || !ids.has(it.parent)).map((it) => it.id);
    return out.length ? out : null;
  }
  const mag = magneticTrack(p);
  // the magnetic track first, then the video tracks from the top layer down (later in the list is drawn on top)
  const order = [...(mag && !skip.has(mag.id) ? [mag] : []), ...tracks.filter((tr) => tr.kind === 'video' && tr !== mag).reverse()];
  for (const tr of order) {
    const hit = (tr.items as AnyItem[]).find((it) => under(times.get(it.id), t));
    if (hit) return [hit.id];
  }
  return null;
}
