// How alike two golden pictures look, for the block templates' admission rule (packages/plugin-common/golden/templates.test.ts).
// Each picture is shrunk to a 64 × 64 greyscale square; what is compared is where its edges are (the grey square's gradient
// magnitude, scaled to unit spread), as the mean absolute difference of two such edge maps. Not the grey values themselves: a
// template that only changes a colour changes how bright the picture is, and on the 2026-11-15 looks plain grey values could not
// tell such a variant (up to 79 of 255 apart) from two different looks of one block (as close as 4); the edge maps can (see the
// test for the numbers). Coarse on purpose: a template must change what the picture shows, not a few pixels of it. The pictures
// are compared after shrinking, so a wide and a tall one can be compared too (both are squeezed into the square).
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

/** an RGBA picture as pngjs reads it */
export interface Rgba { width: number; height: number; data: Uint8Array | Buffer }
/** a sample's picture at one of its times */
export interface TimedPrint { t: number; print: Float32Array }

/** the side of the square the pictures are shrunk to */
export const LIKENESS_SIZE = 64;

/** the grey value (0–255) of a pixel: Rec. 601 luma, alpha taken as coverage over black */
const luma = (d: Uint8Array | Buffer, i: number) => ((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * d[i + 3]) / 255;

/** the picture shrunk to `size` × `size` greyscale (0–255), each cell the mean of the source pixels whose centres fall in it */
export function greySquare(p: Rgba, size = LIKENESS_SIZE): Float32Array {
  const sum = new Float64Array(size * size), n = new Uint32Array(size * size);
  for (let y = 0; y < p.height; y++) {
    const cy = Math.min(size - 1, Math.floor(((y + 0.5) * size) / p.height));
    for (let x = 0; x < p.width; x++) {
      const cx = Math.min(size - 1, Math.floor(((x + 0.5) * size) / p.width)), c = cy * size + cx;
      sum[c] += luma(p.data, (y * p.width + x) * 4);
      n[c]++;
    }
  }
  return Float32Array.from(sum, (s, i) => (n[i] ? s / n[i] : 0));
}

/** A grey square's edges: each cell's gradient magnitude (central differences, the border repeated), less their mean and divided by
 *  their spread (at least 1, so a flat picture stays flat instead of blowing its noise up): how bright or how contrasty the picture
 *  is drops out, where its edges are stays. */
export function edgePrint(g: Float32Array): Float32Array {
  const n = Math.round(Math.sqrt(g.length)), at = (x: number, y: number) => g[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  const e = new Float32Array(g.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) e[y * n + x] = Math.hypot(at(x + 1, y) - at(x - 1, y), at(x, y + 1) - at(x, y - 1));
  let mean = 0;
  for (const v of e) mean += v;
  mean /= e.length;
  let sd = 0;
  for (const v of e) sd += (v - mean) ** 2;
  sd = Math.max(1, Math.sqrt(sd / e.length));
  return Float32Array.from(e, (v) => (v - mean) / sd);
}

/** the picture's print: its grey square's edge map */
export const printOf = (p: Rgba) => edgePrint(greySquare(p));

/** the mean absolute difference of two prints (or grey squares) of one size */
export function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`兩張縮圖大小不同（${a.length}、${b.length}）`);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/** How far a sample (its prints, one per sample time) is from another: each of its times is compared with the other's picture at the
 *  nearest sample time (the same moment of the animation, as near as the two samples have one); the largest of those. So a sample
 *  with two times passes when either time does. */
export function sampleDistance(own: TimedPrint[], other: TimedPrint[]): number {
  if (!own.length || !other.length) throw new Error('要比的樣本沒有圖');
  return Math.max(...own.map((a) => {
    const near = Math.min(...other.map((b) => Math.abs(b.t - a.t)));
    return Math.min(...other.filter((b) => Math.abs(b.t - a.t) - near < 1e-6).map((b) => meanAbsDiff(a.print, b.print)));
  }));
}

/** a golden PNG file */
export const readPng = (file: string): Rgba => PNG.sync.read(readFileSync(file));

/** A copy of the picture with its colours turned `deg` degrees round the grey axis (YCbCr: each pixel's luma kept, its chroma
 *  rotated), clipped to the RGB range: a same-look colour-only variant, made in memory to calibrate the admission rule against. */
export function chromaRotate(p: Rgba, deg: number): Rgba {
  const out = new Uint8Array(p.data.length), c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  // Cb = 0.564 (B − Y), Cr = 0.713 (R − Y): rotated in that plane, which is round
  for (let i = 0; i < p.data.length; i += 4) {
    const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2], y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 0.564 * (b - y), cr = 0.713 * (r - y), cb2 = cb * c - cr * s, cr2 = cb * s + cr * c;
    const R = y + cr2 / 0.713, B = y + cb2 / 0.564, G = (y - 0.299 * R - 0.114 * B) / 0.587;
    out[i] = clamp(R); out[i + 1] = clamp(G); out[i + 2] = clamp(B); out[i + 3] = p.data[i + 3];
  }
  return { width: p.width, height: p.height, data: out };
}

/** a copy of the picture multiplied by a colour (`tint` 0–1 each channel) and raised so the strongest channel keeps its level: a
 *  colour-only variant that tints the picture rather than turning its hue */
export function tintBy(p: Rgba, tint: [number, number, number]): Rgba {
  const out = new Uint8Array(p.data.length), top = Math.max(...tint);
  for (let i = 0; i < p.data.length; i += 4) {
    for (let k = 0; k < 3; k++) out[i + k] = clamp((p.data[i + k] * tint[k]) / top);
    out[i + 3] = p.data[i + 3];
  }
  return { width: p.width, height: p.height, data: out };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
