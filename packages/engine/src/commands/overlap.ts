// Same-track overlaps (spec 2026-10-14 §3): which item precedes which and by how much, and whether a video transition or
// an audio crossfade is linked to the overlap. relink() keeps linked ones following the overlap after any edit.
import type { AnyItem, Project, Track, TrackKind } from '../schema.ts';
import { resolveTimes, TIME_EPS, type Times } from '../time.ts';
import { CommandError, findItem, r6 } from './core.ts';

export interface OverlapPair { track: string; kind: TrackKind; a: string; b: string; ov: number; linked: boolean; top: 'a' | 'b' }
const EPS = TIME_EPS;

function isLinked(t: Track, a: any, b: any, ov: number): boolean {
  if (t.kind === 'video') return !!b.transitionIn && b.transitionIn.type !== 'cut' && Math.abs(b.transitionIn.dur - ov) <= EPS;
  if (t.kind === 'music' || t.kind === 'audio') return Math.abs(a.fadeOut - ov) <= EPS && Math.abs(b.fadeIn - ov) <= EPS;
  return false;
}

/** Every item B that starts inside an earlier item A of its own track (A: the earlier one reaching furthest), by B's id. */
export function overlapPairs(p: Pick<Project, 'tracks'>, times: Times = resolveTimes(p)): Map<string, OverlapPair> {
  const out = new Map<string, OverlapPair>();
  for (const t of p.tracks) {
    const order = (t.items as AnyItem[]).map((it, i) => ({ it, i, ...times.get(it.id)! })).sort((x, y) => x.start - y.start || x.i - y.i);
    let reach: (typeof order)[number] | null = null;
    for (const x of order) {
      if (reach && reach.end > x.start + EPS) {
        const ov = r6(Math.min(reach.end, x.end) - x.start);
        out.set(x.it.id, { track: t.id, kind: t.kind, a: reach.it.id, b: x.it.id, ov, linked: isLinked(t, reach.it, x.it, ov), top: x.i > reach.i ? 'b' : 'a' });
      }
      if (!reach || x.end > reach.end) reach = x;
    }
  }
  return out;
}

/** A fades out and B fades in over ov seconds; each clip's other fade gives way when the clip is too short for both. */
function crossfade(a: any, b: any, ov: number) {
  a.fadeOut = ov; a.fadeIn = r6(Math.min(a.fadeIn, Math.max(0, a.end - a.start - ov)));
  b.fadeIn = ov; b.fadeOut = r6(Math.min(b.fadeOut, Math.max(0, b.end - b.start - ov)));
}

/** Crossfade on (fades = the overlap) or off (both 0); `id` is the later clip B. */
export function setCrossfade(p: Project, a: { id: string; on: boolean }) {
  const f = findItem(p, a.id);
  if (f.track.kind !== 'music' && f.track.kind !== 'audio') throw new CommandError('Only music and audio clips can crossfade', 'cmd.crossfadeAudioOnly');
  const pair = overlapPairs(p).get(a.id);
  if (!pair) throw new CommandError(`"${a.id}" does not overlap the clip before it`, 'cmd.noOverlapPrev', { id: a.id });
  const A: any = findItem(p, pair.a).item, B: any = f.item;
  if (a.on) crossfade(A, B, pair.ov); else { A.fadeOut = 0; B.fadeIn = 0; }
}

/** After an edit: a pair linked before whose overlap changed gets its transition or crossfade set to the new overlap. */
export function relink(before: Pick<Project, 'tracks'>, after: Project) {
  let now: Map<string, OverlapPair> | null = null;
  for (const w of overlapPairs(before).values()) {
    if (!w.linked) continue;
    now ??= overlapPairs(after);
    const n = now.get(w.b);
    if (!n || n.a !== w.a || n.track !== w.track) continue;
    const B: any = findItem(after, w.b).item;
    if (Math.abs(n.ov - w.ov) <= EPS) {
      // same overlap: only a crossfade whose clip length changed (a trim's fitFades shrank both fades in proportion) is put back;
      // a fade the user set directly leaves the lengths alone and so stays unlinked
      if (n.kind === 'video' || n.linked) continue;
      const len = (q: Pick<Project, 'tracks'>, id: string) => { const it = findItem(q as Project, id).item; return it.end - it.start; };
      if (Math.abs(len(before, w.a) - len(after, w.a)) <= EPS && Math.abs(len(before, w.b) - len(after, w.b)) <= EPS) continue;
    }
    if (n.kind === 'video') { if (B.transitionIn && B.transitionIn.type !== 'cut') B.transitionIn.dur = Math.max(r6(1 / after.meta.fps), n.ov); }
    else crossfade(findItem(after, w.a).item, B, n.ov);
  }
}
