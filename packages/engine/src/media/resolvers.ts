import type { Project } from '../schema.ts';
import type { AudioRef, MediaRef, StillRef } from '../plugin.ts';
import { audioKey, stillKey, videoKey } from './refs.ts';

export interface MediaResolver {
  video(ref: MediaRef, local: number): { url: string; time: number };
  rate(ref: MediaRef): number;
  still(ref: StillRef): string;
  audio(ref: AudioRef): { url: string; offset: number };
  /** music files by media id (api preview); without it they resolve against the project URL */
  music?(mediaId: string, path: string): string;
  /** a photo source (spec 2026-10-14 §5) */
  image?(source: string): string;
  /** a file inside the project folder (plugin assets such as sprite sheets), by its path relative to project.json */
  file?(path: string): string;
}
export type CacheIndex = { videos: Record<string, string>; stills: Record<string, string>; audio: Record<string, string>; images?: Record<string, string> };

const need = <T>(v: T | undefined, key: string): T => { if (v === undefined) throw new Error(`No media for ${key}`); return v; };
const abs = (rel: string, base: string) => new URL(rel, base).href;

/** Render mode: clips cut by tools/prepare.ts, already retimed to 1×, starting at ref.in. */
export function cacheResolver(index: CacheIndex, projectUrl: string): MediaResolver {
  return {
    video: (ref, local) => ({ url: abs(need(index.videos[videoKey(ref)], videoKey(ref)), projectUrl), time: local }),
    rate: () => 1,
    still: (ref) => abs(need(index.stills[stillKey(ref)], stillKey(ref)), projectUrl),
    audio: (ref) => ({ url: abs(need(index.audio[audioKey(ref)], audioKey(ref)), projectUrl), offset: 0 }),
    image: (s) => abs(need(index.images?.[s], `image ${s}`), projectUrl),
    file: (path) => abs(path, projectUrl),
  };
}


/** Preview straight from the original source files; stills/audio come from the prepared cache. */
export function sourceResolver(project: Pick<Project, 'sources'>, projectUrl: string, cache?: MediaResolver): MediaResolver {
  return {
    video: (ref, local) => ({ url: abs(project.sources[ref.source].path, projectUrl), time: ref.in + local * ref.speed }),
    rate: (ref) => ref.speed,
    still: (ref) => need(cache, 'stills (run tools/prepare.ts)').still(ref),
    audio: (ref) => need(cache, 'audio (run tools/prepare.ts)').audio(ref),
    image: (s) => abs(project.sources[s].path, projectUrl),
    file: (path) => abs(path, projectUrl),
  };
}

/** Seconds of audio the server keeps before/after each requested source segment (spec §5). */
export const AUDIO_PAD = 2;
/** Audio segments are asked for in whole steps of this many seconds: trimming a clip moves its in/out a little on every
 *  drag frame, and each distinct range was a new ffmpeg cut and a new WAV in the cache. */
export const AUDIO_STEP = 5;
/** The segment requested for a clip's [in, out]: widened to whole AUDIO_STEP seconds (always covers the clip). */
export const audioSpan = (inS: number, outS: number): [number, number] => {
  const a = Math.floor(inS / AUDIO_STEP) * AUDIO_STEP;
  return [a, Math.max(a + AUDIO_STEP, Math.ceil(outS / AUDIO_STEP) * AUDIO_STEP)];
};

/** Editor preview through the Tellcut server: 540p proxies, on-demand stills and padded audio segments. */
export function apiResolver(projectId: string, origin: string): MediaResolver {
  const base = `${origin}/api/projects/${encodeURIComponent(projectId)}/media`;
  const q = (o: Record<string, string | number | undefined>) =>
    Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return {
    video: (ref, local) => ({ url: `${base}/proxy/${encodeURIComponent(ref.source)}`, time: ref.in + local * ref.speed }),
    rate: (ref) => ref.speed,
    still: (r) => `${base}/still?${q({ source: r.source, t: r.t, w: r.w, square: r.square, n: r.strip?.n, dur: r.strip?.dur })}`,
    audio: (r) => { const [a, b] = audioSpan(r.in, r.out); return { url: `${base}/audio?${q({ source: r.source, in: a, out: b })}`, offset: r.in - Math.max(0, a - AUDIO_PAD) }; },
    music: (id) => `${base}/music/${encodeURIComponent(id)}`,
    image: (s) => `${base}/image/${encodeURIComponent(s)}`,
    file: (path) => `${origin}/api/projects/${encodeURIComponent(projectId)}/files/${path.split('/').map(encodeURIComponent).join('/')}`,
  };
}
