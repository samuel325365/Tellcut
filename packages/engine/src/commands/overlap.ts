// The edits on same-track overlaps: crossfades on and off, and relink() keeping linked transitions and crossfades following
// the overlap after any edit. Finding the pairs (overlapPairs) is in ../pairs.ts, shared with the stage.
import type { Project } from '../schema.ts';
import { TIME_EPS } from '../time.ts';
import { overlapPairs, type OverlapPair } from '../pairs.ts';
import { CommandError, findItem, r6 } from './core.ts';

export { overlapPairs, type OverlapPair };
const EPS = TIME_EPS;

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
