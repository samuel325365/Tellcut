// One frame of a video file as a picture, untouched (full size, no filter): what a preset's poster is made from when no time on
// the timeline is given. Server routes call ffmpeg only through media-node.
import { inFile, oneImage, run } from './ffmpeg.ts';

/** Writes the frame at `t` seconds of `src` to `out` (its extension picks the format). */
export function grabFrame(src: string, t: number, out: string, o: { signal?: AbortSignal } = {}): Promise<void> {
  return run(['-y', '-ss', String(t), ...inFile(src), ...oneImage(out)], { signal: o.signal });
}
