// Pure audio planning: turns the project's audio tracks into absolute-time segments and effects.
import type { AudioItem, MusicItem, Project, SfxItem } from '../schema.ts';
import type { Times } from '../time.ts';
import type { MediaResolver } from '../media/resolvers.ts';
import { audioRefOf } from '../media/refs.ts';

export const dbToLin = (db: number) => (db <= -120 ? 0 : Math.pow(10, db / 20));
export const linToDb = (v: number) => (v <= 0 ? -120 : 20 * Math.log10(v));

export interface PlanTrack { id: string; gain: number; envelope?: Array<[number, number]> }
export interface PlanSeg { buffer: string; track: string; item: string; a: number; b: number; off: number; gain: number; fadeIn: number; fadeOut: number; rate: number; envelope?: Array<[number, number]> }
export interface PlanSfx { type: string; t: number; params: Record<string, any>; gain: number; track: string }
export interface AudioPlan { tracks: PlanTrack[]; segs: PlanSeg[]; sfx: PlanSfx[]; buffers: Record<string, string> }

const AUDIO_KINDS = new Set(['music', 'audio', 'sfx']);

/** An sfx-track item of this type plays a sound file of the project (`params.path`, relative to project.json, e.g. media/sfx/ding.wav)
 *  instead of a synthesised effect (Cut.sfxFile). It is a sound effect like the others: on the sound-effect track, never ducked. */
export const SOUND_FILE = 'core.file';
/** the file a sound-file item plays, or null for any other item */
export const soundFilePath = (it: { type?: string; params?: Record<string, unknown> }): string | null =>
  it.type === SOUND_FILE && typeof it.params?.path === 'string' && it.params.path ? it.params.path : null;
/** every sound file the project's sound-effect tracks play (once each) */
export const soundFiles = (p: Pick<Project, 'tracks'>): string[] =>
  [...new Set(p.tracks.flatMap((t) => (t.kind === 'sfx' ? t.items.map(soundFilePath).filter((x): x is string => !!x) : [])))];
type AudioTrack = Extract<Project['tracks'][number], { kind: 'music' | 'audio' | 'sfx' }>;

export function planAudio(p: Project, times: Times, resolver: Pick<MediaResolver, 'audio' | 'music' | 'file'>, projectUrl: string): AudioPlan {
  const audible = p.tracks.filter((t) => AUDIO_KINDS.has(t.kind) && !t.muted) as AudioTrack[];
  const anySolo = audible.some((t) => t.solo);
  const tracks = anySolo ? audible.filter((t) => t.solo) : audible;
  const plan: AudioPlan = { tracks: [], segs: [], sfx: [], buffers: {} };
  for (const tr of tracks) {
    plan.tracks.push({ id: tr.id, gain: dbToLin(tr.gain ?? 0), envelope: tr.envelope?.map(([t, db]) => [t, dbToLin(db)] as [number, number]) });
    for (const raw of tr.items) {
      const tm = times.get(raw.id)!;
      if (tr.kind === 'sfx') {
        const it = raw as SfxItem, path = soundFilePath(it);
        if (path) {
          // a file plays as a segment on the sound-effect bus, from its start; a tiny fade-out in case the item cuts it short
          const buffer = `file:${path}`;
          plan.buffers[buffer] = resolver.file?.(path) ?? new URL(path, projectUrl).href;
          plan.segs.push({ buffer, track: tr.id, item: it.id, a: tm.start, b: tm.end, off: 0, rate: 1, gain: dbToLin(it.gain), fadeIn: 0, fadeOut: Math.min(0.005, (tm.end - tm.start) / 4) });
          continue;
        }
        if (it.type === SOUND_FILE) continue;   // no file named: nothing to play
        plan.sfx.push({ type: it.type, t: tm.start, params: it.params, gain: dbToLin(it.gain), track: tr.id });
        continue;
      }
      const it = raw as MusicItem | AudioItem;
      if (it.muted) continue;
      let buffer: string, off: number, rate = 1;
      if (tr.kind === 'music') {
        const m = it as MusicItem;
        buffer = `media:${m.media}`;
        const path = p.media[m.media].path;
        plan.buffers[buffer] = resolver.music?.(m.media, path) ?? new URL(path, projectUrl).href;
        off = m.in;
      } else {
        const a = it as AudioItem;
        const r = resolver.audio(audioRefOf(a, tm.start, tm.end));
        buffer = r.url; plan.buffers[buffer] = r.url; off = r.offset; rate = a.rate;
      }
      plan.segs.push({
        buffer, track: tr.id, item: it.id, a: tm.start, b: tm.end, off, rate,
        gain: dbToLin(it.gain), fadeIn: it.fadeIn, fadeOut: it.fadeOut,
        envelope: it.envelope?.map(([t, db]) => [tm.start + t, dbToLin(db)] as [number, number]),
      });
    }
  }
  return plan;
}
