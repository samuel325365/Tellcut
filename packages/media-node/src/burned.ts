// Text burned into a video (toolkit phase 2d): where on the picture, and when, the footage carries its own captions.
// No text recognition — a caption line is found from its shape: strokes (strong bright/dark edges) packed into a few rows near the
// bottom, centred, over and over at the same height. A busy texture has as many strokes but spread over every row.
import { abortError, ffmpegProcess } from './ffmpeg.ts';

export const BURN_W = 480, BURN_H = 270;
/** the bottom band that is searched, as rows of the 270-row frame */
const BAND0 = 205, BAND1 = 266;

export interface CaptionProfile {
  /** strokes per 1000 pixels of the band */
  dens: number;
  /** share of the strokes that sit in the busiest 16 rows */
  peak: number;
  /** height of that busiest stretch, 0–1 down the frame */
  at: number;
  /** where the strokes sit across the width (centre 0.5) and how far they spread */
  cx: number; sd: number;
}

/** The stroke profile of the bottom band of a BURN_W×BURN_H gray frame. Black pillar-box bars are not picture and are skipped. */
export function captionProfile(g: ArrayLike<number>): CaptionProfile {
  const W = BURN_W, rowsN = BAND1 - BAND0;
  const near = new Uint8Array(W);
  for (let x = 0; x < W; x++) {
    let dark = 0;
    for (let y = BAND0; y < BAND1; y++) if (g[y * W + x] < 14) dark++;
    if (dark > rowsN * 0.9) for (let k = -5; k <= 5; k++) if (x + k >= 0 && x + k < W) near[x + k] = 1;
  }
  let valid = 0;
  for (let x = 3; x < W - 3; x++) if (!near[x]) valid++;
  const rows = new Float64Array(rowsN);
  let sx = 0, sx2 = 0, total = 0;
  for (let y = BAND0; y < BAND1; y++) for (let x = 3; x < W - 3; x++) {
    if (near[x]) continue;
    const i = y * W + x;
    if (Math.abs(g[i + 2] - g[i - 2]) <= 90) continue;
    let mx = 0, mn = 255;
    for (let k = -3; k <= 3; k++) { const v = g[i + k]; if (v > mx) mx = v; if (v < mn) mn = v; }
    if (mx > 200 && mn < 90) { rows[y - BAND0]++; sx += x; sx2 += x * x; total++; }
  }
  let best = 0, bi = 0;
  for (let y = 0; y + 16 <= rowsN; y++) { let s = 0; for (let k = 0; k < 16; k++) s += rows[y + k]; if (s > best) { best = s; bi = y; } }
  const mean = total ? sx / total : W / 2;
  return {
    dens: (total / (rowsN * Math.max(1, valid))) * 1000, peak: total ? best / total : 0, at: (BAND0 + bi + 8) / BURN_H,
    cx: mean / W, sd: total ? Math.sqrt(Math.max(0, sx2 / total - mean * mean)) / W : 0,
  };
}

/** A caption line: enough strokes, packed into a few rows, centred. (Thresholds found on a captioned 20-minute video and 51 clean frames.) */
export const isCaption = (p: CaptionProfile) => p.dens >= 10 && p.peak >= 0.55 && Math.abs(p.cx - 0.5) <= 0.2 && p.sd >= 0.05;

export interface BurnedCaption {
  /** share of the video's time that shows a caption line */
  share: number;
  /** the caption row as [x, y, w, h] in fractions of the picture */
  rect: [number, number, number, number];
  /** stretches of time (seconds) with a caption on screen */
  spans: Array<[number, number]>;
}
export interface Burned { version: 1; step: number; frames: number; caption: BurnedCaption | null }

const MIN_SHARE = 0.08, MIN_FRAMES = 3, GAP = 2;
/** The caption zone and its time spans from one profile per `step` seconds. A few lone hits are noise, not a caption. */
export function summarizeBurned(profiles: CaptionProfile[], step: number): Burned {
  const flags = profiles.map(isCaption), hits = flags.filter(Boolean).length;
  const base: Burned = { version: 1, step, frames: profiles.length, caption: null };
  if (hits < MIN_FRAMES || hits / Math.max(1, profiles.length) < MIN_SHARE) return base;
  const spans: Array<[number, number]> = [];
  let start = -1, last = -1;
  flags.forEach((f, i) => {
    if (!f) return;
    if (start >= 0 && i - last <= GAP) { last = i; return; }
    if (start >= 0) spans.push([start * step, (last + 1) * step]);
    start = last = i;
  });
  if (start >= 0) spans.push([start * step, (last + 1) * step]);
  const ats = profiles.filter((_, i) => flags[i]).map((p) => p.at).sort((a, b) => a - b), at = ats[Math.floor(ats.length / 2)];
  // `at` (the busiest rows) is the text line's middle: measured against Windows OCR's line boxes (toolkit phase 5) it was within
  // 0.002 and 0.009 of it on two videos, whose lines are ~0.05 high. The box is that line with ~0.02 to spare above and below
  // (it was at − 0.07 … + 0.05 before: a whole line too high on top, half a line short below).
  const y = Math.max(0, at - 0.045);
  return { ...base, caption: { share: +(hits / profiles.length).toFixed(3), rect: [0.08, +y.toFixed(3), 0.84, +Math.min(0.09, 1 - y).toFixed(3)], spans: spans.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]) } };
}

/** Decode `video` at one frame per `step` seconds and summarize. Streams the frames, so a long video never sits in memory. */
export function detectBurned(video: string, o: { step?: number; signal?: AbortSignal } = {}): Promise<Burned> {
  const step = o.step ?? 1, size = BURN_W * BURN_H;
  if (o.signal?.aborted) return Promise.reject(abortError());
  const profiles: CaptionProfile[] = [];
  let buf = Buffer.alloc(0);
  const { done } = ffmpegProcess(['-i', video, '-an', '-vf', `fps=${1 / step},scale=${BURN_W}:${BURN_H},format=gray`, '-f', 'rawvideo', '-'], {
    signal: o.signal, label: 'burned-in captions',
    onStdout: (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      while (buf.length >= size) { profiles.push(captionProfile(buf.subarray(0, size))); buf = buf.subarray(size); }
    },
  });
  return done.then(() => summarizeBurned(profiles, step));
}
