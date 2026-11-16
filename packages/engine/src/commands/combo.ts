// Placing a combo (combos.ts, spec 2026-11-16-combos) on the timeline as one edit: the editor's "Add to timeline" (the gallery and
// the library). The layers come from expandCombo, so the cut script (c.combo) and the editor place the same things; this command
// only decides the tracks, as Cut does: a plain picture on the first overlay track (the captions' and stickers'), `layer: 'top'` on
// an overlay track above it, `'under'` on a scene track under the video, a sound on the sfx track, the shake on the main-track
// clips it falls on. Everything placed hangs on the main-track clip playing at the moment, as c.combo's items do, so moving or
// trimming that clip takes the moment along.
import type { Project, Track, TrackKind, VideoItem } from '../schema.ts';
import { resolveTimes, TIME_EPS } from '../time.ts';
import { comboSpan, type ComboPlacement } from '../combos.ts';
import { CommandError, finite, minLen, r6 } from './core.ts';
import { addItem, addTrack, updateItem } from './edit.ts';
import { attach, magneticTrack } from './magnetic.ts';
import { moveTrack } from './layer.ts';

/** what placeCombo did: the item made for each layer by name, the clips given the shake (none: no clip played there), and the
 *  clip the items hang on */
export interface ComboPlaced { items: Record<string, string>; shaken: string[]; clip?: string }

/** the shake's strength when the combo gives none: c.shake's */
const SHAKE = { px: 24, hz: 18 };

/** The film's main track: the magnetic one, else the first video track (Cut's v1). */
export const mainTrack = (p: Pick<Project, 'tracks'>): Track | undefined => magneticTrack(p) ?? p.tracks.find((t) => t.kind === 'video');

/** The main-track clip playing at film time `t` (the later of two that overlap there), or undefined. */
export function clipAt(p: Project, t: number): VideoItem | undefined {
  const main = mainTrack(p), times = resolveTimes(p);
  return ((main?.items ?? []) as VideoItem[]).filter((c) => { const r = times.get(c.id)!; return r.start <= t + TIME_EPS && r.end > t + TIME_EPS; }).pop();
}

/**
 * Adds the layers of a combo for a moment at film time `at`. `skip`: tracks not to place on (locked): another track of the kind is
 * used, or a new one made. A layer is cut at the end of the film and left out when less than a frame of it is left (or it would be
 * over before 0); the shake is left out when no main-track clip plays at `at` or the main track is skipped. Refused when nothing
 * at all is left to place.
 */
export function placeCombo(p: Project, a: { layers: ComboPlacement[]; at: number; skip?: ReadonlySet<string> }): ComboPlaced {
  finite('at', a.at);
  const skip = a.skip ?? new Set<string>(), open = (kind: TrackKind) => p.tracks.filter((t) => t.kind === kind && !skip.has(t.id));
  const main = mainTrack(p), clip = main && !skip.has(main.id) ? clipAt(p, a.at) : undefined;
  const out: ComboPlaced = { items: {}, shaken: [], ...(clip ? { clip: clip.id } : {}) };
  // the layers that fit: their film times, cut at the end of the film (a picture or sound may not run past it, as the library's add)
  const fit = a.layers.flatMap((l) => {
    const s = comboSpan(l, a.at);
    if (!s) return [];
    const end = l.kind === 'shake' ? s.end : Math.min(s.end, p.meta.duration);
    return end - s.start >= minLen(p) - 1e-9 ? [{ l, start: s.start, end: r6(end) }] : [];
  });
  if (!fit.some((x) => x.l.kind !== 'shake' || clip)) throw new CommandError('Nothing of the combo fits before the end of the film', 'cmd.comboAtEnd');
  // the tracks, made only when a layer needs one: the plain one first, so a top track made after it sits above it
  const track: Partial<Record<'plain' | 'top' | 'under' | 'sfx', string>> = {};
  const plain = () => (track.plain ??= open('overlay')[0]?.id ?? addTrack(p, { kind: 'overlay' }));
  const top = () => track.top ??= (() => {
    // the topmost free overlay track above the plain one (Cut's Top over its text track), else a new one: added tracks go on top
    const base = fit.some((x) => x.l.kind === 'effect' && !x.l.layer) ? plain() : open('overlay')[0]?.id;
    const i = base === undefined ? -1 : p.tracks.findIndex((t) => t.id === base);
    return open('overlay').filter((t) => p.tracks.indexOf(t) > i).pop()?.id ?? addTrack(p, { kind: 'overlay', name: 'Top' });
  })();
  const under = () => track.under ??= open('scene')[0]?.id ?? (() => { const id = addTrack(p, { kind: 'scene' }); moveTrack(p, { id, to: 0 }); return id; })();
  const sfx = () => (track.sfx ??= open('sfx')[0]?.id ?? addTrack(p, { kind: 'sfx' }));
  if (fit.some((x) => x.l.kind === 'effect' && !x.l.layer)) plain();
  for (const { l, start, end } of fit) {
    if (l.kind === 'shake') {
      if (!clip) continue;
      // c.shake: every main-track clip the shake falls on, in its own seconds
      const times = resolveTimes(p);
      for (const c of (main!.items as VideoItem[])) {
        const r = times.get(c.id)!;
        if (!(r.start < end - TIME_EPS && r.end > start + TIME_EPS)) continue;
        updateItem(p, { id: c.id, patch: { shake: [...(c.shake ?? []), { at: r6(start - r.start), dur: r6(end - start), px: l.px ?? SHAKE.px, hz: l.hz ?? SHAKE.hz }] } });
        out.shaken.push(c.id);
      }
      continue;
    }
    const id = l.kind === 'sfx'
      ? addItem(p, { track: sfx(), item: { type: l.type, start, end, params: l.params, gain: l.gain ?? 0 } })
      : addItem(p, { track: l.layer === 'top' ? top() : l.layer === 'under' ? under() : plain(), item: { type: l.type, start, end, params: l.params } });
    if (clip) attach(p, { id, to: clip.id });
    out.items[l.name] = id;
  }
  return out;
}
