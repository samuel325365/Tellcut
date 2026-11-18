// Same-track overlaps (spec 2026-10-14 §3): which item precedes which and by how much, and whether a video transition or an
// audio crossfade is linked to the overlap. Here rather than in commands/ because the stage needs it too (a linked
// transition moves the outgoing clip as well), and drawing must not depend on the edit commands.
import type { AnyItem, Project, Track, TrackKind, VideoItem } from './schema.ts';
import { r6, resolveTimes, TIME_EPS, type Times } from './time.ts';
import type { VideoLink } from './geometry.ts';

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

/** What each video clip in a linked transition needs to draw it (videoState's `link`), by clip id: the incoming clip B gets the
 *  frame of the clip A it comes from, A gets B's transition, timed in A's own seconds. Clips in no linked pair are absent.
 *  A clip with two linked clips starting inside it gets the later one's. */
export function videoLinks(p: Pick<Project, 'tracks'>, times: Times = resolveTimes(p)): Map<string, VideoLink> {
  const out = new Map<string, VideoLink>();
  let byId: Map<string, VideoItem> | null = null;
  for (const w of overlapPairs(p, times).values()) {
    if (w.kind !== 'video' || !w.linked) continue;
    byId ??= new Map(p.tracks.filter((t) => t.kind === 'video').flatMap((t) => (t.items as VideoItem[]).map((it) => [it.id, it] as const)));
    const A = byId.get(w.a)!, B = byId.get(w.b)!, tr = B.transitionIn!;
    const at = times.get(w.b)!.start - times.get(w.a)!.start;
    const prev = out.get(w.a)?.out;
    if (prev && prev.at > at) continue;
    out.set(w.a, { ...out.get(w.a), out: { type: tr.type, ...(tr.dir ? { dir: tr.dir } : {}), ...(tr.x != null ? { x: tr.x } : {}), ...(tr.y != null ? { y: tr.y } : {}),
      at, dur: tr.dur, frame: B.frame, shaped: !!B.shape && B.shape.length >= 3 } });
    out.set(w.b, { ...out.get(w.b), from: A.frame });
  }
  return out;
}
