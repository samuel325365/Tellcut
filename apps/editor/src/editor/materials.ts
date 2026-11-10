// What a piece of the library becomes on the timeline (spec 2026-11-10-media-panel-visual §5): the one place that builds the
// item, for "+ Add at playhead", the gallery's add, a card dragged onto the timeline and a file dropped there.
// - a photo: 3 s with a gentle push-in (spec 2026-10-14 §5); a clip: its stretch of the source, still framing
// - music: its whole length (from the waveform; 10 s until that is known), with a beat grid when beats were found
// - a sound effect: the length the sound says for its parameters; a block: 2 s, its Chinese words in the UI's language
import { withDefaults, type Project, type Registry } from '@tellcut/engine';
import type { Material } from '../audition.ts';
import type { EditorState, PeakInfo } from '../store.ts';
import { localValues } from '../i18n/values.ts';
import type { DropKind } from '../timeline/drop.ts';

/** Length of a music file from its waveform (peaks per second), if known. */
export const musicLength = (pk?: PeakInfo) => (pk && pk.rate > 0 && pk.peaks.length ? pk.peaks.length / pk.rate : undefined);

/** the values of `params` whose keys the block or sound has */
export const ownParams = (defs: Array<{ key: string }> | undefined, params: Record<string, unknown> | undefined): Record<string, unknown> =>
  (params && defs ? Object.fromEntries(Object.entries(params).filter(([k]) => defs.some((d) => d.key === k))) : {});

export interface MaterialItem { kind: DropKind; item: Record<string, unknown>; also?: (d: Project, id: string) => void }

/** the item `m` makes when it starts at `t` (its end before any clamping to the end of the film) */
export function materialItem(p: Project, m: Material, t: number, c: { reg?: Registry; peaks: Record<string, PeakInfo>; beats: EditorState['beats'] }): MaterialItem {
  switch (m.kind) {
    case 'clip': {
      if (p.sources[m.source]?.kind === 'image')
        return { kind: 'video', item: { source: m.source, in: 0, speed: 1, start: t, end: t + 3, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.1 } } } };
      const dur = Math.min(m.len, p.sources[m.source].duration - m.from), still = { x: 0.5, y: 0.5, zoom: 1 };
      return { kind: 'video', item: { source: m.source, in: m.from, speed: 1, start: t, end: t + dur, crop: { from: still, to: still } } };
    }
    case 'music': {
      const len = m.len ?? musicLength(c.peaks[`media:${m.media}`]) ?? 10, b = c.beats[m.media];
      // with detected beats, a beat grid comes along (snapping finds the beats)
      return { kind: 'music', item: { media: m.media, in: 0, start: t, end: t + len, gain: 0, fadeIn: 0, fadeOut: 0 },
        also: b && b.beats.length ? (d, id) => {
          // where the item really starts: a drop may have snapped it
          const at = d.tracks.flatMap((x) => x.items as any[]).find((x) => x.id === id)?.start ?? t;
          d.grids.push({ id: `beats-${id}`, at: Math.round((at + b.offset) * 1e6) / 1e6, bpm: b.bpm, until: at + len });
        } : undefined };
    }
    case 'sfx': {
      const def = c.reg?.sfx(m.type), own = ownParams(def?.params, m.params);
      const dur = def ? def.duration(withDefaults(def.params, own)) : 0.5;
      return { kind: 'sfx', item: { type: m.type, start: t, end: t + Math.max(dur, 1 / p.meta.fps), params: own, gain: 0 } };
    }
    case 'overlay': {
      const defs = c.reg?.item(m.type)?.params ?? [];
      return { kind: 'overlay', item: { type: m.type, start: t, end: t + 2, params: { ...localValues(m.type, defs), ...ownParams(defs, m.params) } } };
    }
  }
}
