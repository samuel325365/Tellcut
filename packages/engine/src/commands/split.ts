// Cutting media items in two at a timeline moment.
import { plainCopy } from '../util.ts';
import type { AnyItem, Project } from '../schema.ts';
import { resolveTimes, TIME_EPS } from '../time.ts';
import { cropAt } from '../geometry.ts';
import { CommandError, fitFades, mediaRate, ownSounds, minLen, r6, uniqueId } from './core.ts';

const MEDIA = new Set(['video', 'audio', 'music']);

/** Envelope value at relative time t (linear between points, flat outside). Unlike audio/mix.ts envelopeAt, at a step
 *  (two points at one time) this is the value BEFORE it: the first half of a split ends on the level it had. */
function envAt(env: Array<[number, number]>, t: number): number {
  if (t <= env[0][0]) return env[0][1];
  for (let i = 1; i < env.length; i++) if (t <= env[i][0]) {
    const [t0, v0] = env[i - 1], [t1, v1] = env[i];
    return r6(v0 + ((v1 - v0) * (t - t0)) / (t1 - t0));
  }
  return env[env.length - 1][1];
}
/** ... and this one the value AFTER a step at t (audio/mix.ts envelopeAt): the second half starts on the level the step goes to. */
function envAfter(env: Array<[number, number]>, t: number): number {
  const at = env.filter(([u]) => u === t);
  return at.length ? at[at.length - 1][1] : envAt(env, t);
}

/** Splits media items crossing t (absolute); returns the ids of the new second halves. */
export function split(p: Project, a: { t: number; ids?: string[] }): string[] {
  const times = resolveTimes(p), m = minLen(p), made: string[] = [], halves: Array<{ a: string; b: string; rel: number }> = [];
  // a listed clip takes its own sound along (spec 2026-10-15-proposals-magnetic §4.3)
  const ids = a.ids && [...a.ids, ...a.ids.flatMap((id) => ownSounds(p, id).map((c) => c.id))];
  for (const track of p.tracks) {
    if (!MEDIA.has(track.kind)) continue;
    const list = track.items as AnyItem[];
    for (let i = 0; i < list.length; i++) {
      const it = list[i] as any, tm = times.get(it.id)!;
      if (ids && !ids.includes(it.id)) continue;
      const rel = a.t - tm.start, len = tm.end - tm.start;
      if (rel < m - 1e-9 || len - rel < m - 1e-9) continue;
      if (it.defocus && it.defocus.from < rel && rel < it.defocus.to) throw new CommandError('Cannot split inside a defocus ramp');
      const b = plainCopy(it);
      const rate = mediaRate(track, it)!;
      b.id = uniqueId(p, it.id);
      b.start = r6(it.start + rel);
      it.end = b.start;
      b.in = r6(it.in + rel * rate);
      if (track.kind === 'video') {
        // the picture at the cut ends the first half and starts the second; keys go to their half, easing to both
        // (the segment the cut falls in is re-eased over each half: its ends are exact, its curve shorter)
        const mid = cropAt(it.crop, rel, len), keys: Array<{ t: number }> = it.crop.keys ?? [], ease = it.crop.ease;
        const ka = keys.filter((k) => k.t < rel), kb = keys.filter((k) => k.t > rel).map((k) => ({ ...k, t: r6(k.t - rel) }));
        it.crop = { from: it.crop.from, to: mid, ...(ka.length ? { keys: ka } : {}), ...(ease ? { ease } : {}) };
        b.crop = { from: mid, to: b.crop.to, ...(kb.length ? { keys: kb } : {}), ...(ease ? { ease } : {}) };
        // a shake belongs to the half it starts in
        if (it.shake) {
          const sa = it.shake.filter((s: any) => s.at < rel), sb = it.shake.filter((s: any) => s.at >= rel).map((s: any) => ({ ...s, at: r6(s.at - rel) }));
          if (sa.length) it.shake = sa; else delete it.shake;
          if (sb.length) b.shake = sb; else delete b.shake;
        }
        delete b.transitionIn;
        if (it.freezeAt != null) {
          if (it.freezeAt >= rel) { b.freezeAt = r6(it.freezeAt - rel); it.freezeAt = null; }
          else { b.in = r6(it.in + it.freezeAt * rate); b.freezeAt = 0; }
        }
        // a ramp finished before the cut: the second half is blurred all through (the ramp cannot cross the cut: refused above)
        if (it.defocus) { if (it.defocus.from >= rel) { b.defocus = { ...it.defocus, from: r6(it.defocus.from - rel), to: r6(it.defocus.to - rel) }; delete it.defocus; } else b.defocus = { from: 0, to: 0, px: it.defocus.px, px0: it.defocus.px }; }
      } else {
        // music that follows the film: only the second half does, the first ends at the cut
        delete it.toEnd;
        it.fadeOut = 0;
        b.fadeIn = 0;
        fitFades(track, it); fitFades(track, b);
        if (it.envelope?.length) {
          const v = envAt(it.envelope, rel);
          b.envelope = [[0, envAfter(it.envelope, rel)], ...it.envelope.filter(([t]: [number, number]) => t > rel).map(([t, db]: [number, number]) => [r6(t - rel), db])];
          it.envelope = [...it.envelope.filter(([t]: [number, number]) => t < rel), [r6(rel), v]];
        }
      }
      list.splice(i + 1, 0, b);
      made.push(b.id);
      halves.push({ a: it.id, b: b.id, rel });
      i++;
    }
  }
  // what hangs on a cut clip after the cut now hangs on its second half, at the same moment (at the stored precision: a playhead
  // at 37/30 makes the sound half start at 1.233333, under the cut)
  for (const h of halves) for (const t of p.tracks) for (const c of t.items as AnyItem[]) {
    if (c.parent !== h.a || c.start < h.rel - TIME_EPS) continue;
    c.parent = h.b; c.start = Math.max(0, r6(c.start - h.rel)); c.end = r6(c.end - h.rel);
  }
  return made;
}
