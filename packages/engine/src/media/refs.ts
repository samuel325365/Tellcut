import type { AudioItem, VideoItem } from '../schema.ts';
import type { AudioRef, MediaRef, StillRef } from '../plugin.ts';
export type { AudioRef, MediaRef, StillRef } from '../plugin.ts';

const f4 = (n: number) => n.toFixed(4);
// a stabilised cut is a different file; clips without it keep their old keys (and caches)
export const videoKey = (r: MediaRef) => `v|${r.source}|${f4(r.in)}|${f4(r.out)}|${r.speed}|${r.interp}${r.stab ? `|stab${r.stab.smoothing}z${r.stab.zoom}` : ''}`;
export const stillKey = (r: StillRef) => `s|${r.source}|${f4(r.t)}|${r.w ?? 0}|${r.square ?? 0}${r.strip ? `|strip${r.strip.n}x${f4(r.strip.dur)}` : ''}`;
export const audioKey = (r: AudioRef) => `a|${r.source}|${f4(r.in)}|${f4(r.out)}`;

export function videoRefOf(item: VideoItem, start: number, end: number): MediaRef {
  const need = item.freezeAt != null ? Math.min(end - start, item.freezeAt + 0.1) : end - start;
  return { source: item.source, in: item.in, out: item.in + need * item.speed, speed: item.speed, interp: item.interp,
    ...(item.stabilize ? { stab: { smoothing: item.stabilize.smoothing, zoom: item.stabilize.zoom } } : {}) };
}
export function audioRefOf(item: AudioItem, start: number, end: number): AudioRef {
  return { source: item.source, in: item.in, out: item.in + (end - start) * item.rate };
}
