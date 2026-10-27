// Audition (double-click a material in the library or an item on the timeline): the raw material plays alone in the
// preview, where it is (a timeline item at its own start, a library material at the playhead). It goes on temporary
// tracks of a project sent to the player only (never shown on the timeline, never saved, never in the undo history)
// with every other track hidden and silent; the caller plays [from, until) and then puts the real project back.
import { addItem, addTrack, allItems, r6, soundFilePath, withDefaults, type Project, type Registry, type Transform } from '@tellcut/engine';
import { formatTime } from './timeline/geometry.ts';

type Recipe = (draft: Project) => void;

export type Material =
  | { kind: 'clip'; source: string; from: number; len: number }
  | { kind: 'music'; media: string; from?: number; len?: number }
  | { kind: 'sfx'; type: string; params?: Record<string, unknown>; len?: number }
  | { kind: 'overlay'; type: string; params?: Record<string, unknown>; transform?: Transform; len?: number; track?: 'overlay' | 'scene' };

export interface AuditionPlan { recipe: Recipe; from: number; until: number; label: string }

const STILL = { x: 0.5, y: 0.5, zoom: 1 };
const alone = (d: Project) => { for (const t of d.tracks) { t.muted = true; if ('solo' in t) t.solo = false; } };
/** [start, end) of `len` s from `at`: a timeline item (inPlace) keeps its own start, a library material moves earlier to
 *  fit when it can. What still runs past the end makes the preview's project longer (`dur`). Never in the last 0.1 s
 *  of that project: the player starts over from 0 when asked to play in its last 50 ms. */
const fit = (at: number, len: number, dur: number, inPlace = false) => {
  let s = Math.max(0, inPlace ? at : Math.min(at, dur - len));
  s = Math.max(0, Math.min(s, Math.max(dur, s + len) - 0.1));
  const end = r6(s + len);
  return { start: r6(s), end, dur: Math.max(dur, end) };
};
/** the preview's project may run longer than the real one (an audition is never saved) */
const grow = (d: Project, dur: number) => { if (dur > d.meta.duration) d.meta.duration = dur; };

/** The material alone, from `at` (a library material earlier if that keeps it inside the project). */
export function planAudition(p: Project, m: Material, at: number, o: { registry?: Pick<Registry, 'sfx' | 'item'>; musicLen?: number; inPlace?: boolean }): AuditionPlan {
  const dur = p.meta.duration, frame = 1 / p.meta.fps, inPlace = o.inPlace;
  switch (m.kind) {
    case 'clip': {
      // the source as it is: no crop, normal speed, with its own sound
      const f = fit(at, Math.min(m.len, p.sources[m.source].duration - m.from), dur, inPlace), { start, end } = f;
      return { from: start, until: end, label: `Clip ${m.source} ${formatTime(m.from)}`, recipe: (d) => {
        grow(d, f.dur); alone(d);
        addItem(d, { track: addTrack(d, { kind: 'video' }), item: { source: m.source, in: m.from, speed: 1, start, end, crop: { from: STILL, to: STILL } } });
        if (p.sources[m.source]?.kind !== 'image') addItem(d, { track: addTrack(d, { kind: 'audio' }), item: { source: m.source, in: m.from, rate: 1, start, end, gain: 0, fadeIn: 0, fadeOut: 0 } });
      } };
    }
    case 'music': {
      const f = fit(at, m.len ?? o.musicLen ?? 10, dur, inPlace), { start, end } = f, from = m.from ?? 0;
      return { from: start, until: end, label: `Music ${m.media}${from ? ` ${formatTime(from)}` : ''}`, recipe: (d) => {
        grow(d, f.dur); alone(d);
        addItem(d, { track: addTrack(d, { kind: 'music' }), item: { media: m.media, in: from, start, end, gain: 0, fadeIn: 0, fadeOut: 0 } });
      } };
    }
    case 'sfx': {
      const def = o.registry?.sfx(m.type), params = m.params ?? {};
      const f = fit(at, Math.max(def ? def.duration(withDefaults(def.params, params)) : (m.len ?? 0.5), frame), dur, inPlace), { start, end } = f;
      const name = def?.label ?? (soundFilePath(m) ?? m.type);
      return { from: start, until: Math.min(f.dur, end + 0.5), label: `SFX ${name}`, recipe: (d) => {
        grow(d, f.dur); alone(d);
        addItem(d, { track: addTrack(d, { kind: 'sfx' }), item: { type: m.type, start, end, params, gain: 0 } });
      } };
    }
    case 'overlay': {
      // on an empty (black) frame; a type that may exist only once is fine: the one in the project is hidden meanwhile
      const f = fit(at, Math.max(m.len ?? 2, frame), dur, inPlace), { start, end } = f;
      return { from: start, until: end, label: `Effect ${o.registry?.item(m.type)?.label ?? m.type}`, recipe: (d) => {
        grow(d, f.dur); alone(d);
        addItem(d, { track: addTrack(d, { kind: m.track ?? 'overlay' }), item: { type: m.type, start, end, params: m.params ?? {}, ...(m.transform ? { transform: m.transform } : {}) } });
      } };
    }
  }
}

/** The raw material of a timeline item: the part of the source or music it uses, an effect with its own settings. */
export function materialOf(p: Project, id: string): Material | null {
  const found = allItems(p).find((x) => x.item.id === id);
  if (!found) return null;
  const it: any = found.item, len = it.end - it.start;
  switch (found.track.kind) {
    // after freezeAt a clip holds one frame: only the part before it is shown
    case 'video': return { kind: 'clip', source: it.source, from: it.in, len: Math.min(Math.min(len, it.freezeAt ?? len) * it.speed, p.sources[it.source].duration - it.in) };
    case 'audio': return { kind: 'clip', source: it.source, from: it.in, len: Math.min(len * it.rate, p.sources[it.source].duration - it.in) };
    case 'music': return { kind: 'music', media: it.media, from: it.in, len };
    case 'sfx': return { kind: 'sfx', type: it.type, params: it.params, len };
    case 'scene': case 'overlay':
      return { kind: 'overlay', type: it.type, params: it.params, ...(it.transform ? { transform: it.transform } : {}), len, track: found.track.kind };
  }
}
