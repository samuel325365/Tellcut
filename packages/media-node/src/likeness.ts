// How alike two golden pictures look, for the block templates' admission rule (packages/plugin-common/golden/templates.test.ts).
// Each picture is shrunk to a 64 × 64 greyscale square; what is compared is where its edges are (the grey square's gradient
// magnitude, scaled to unit spread), as the mean absolute difference of two such edge maps. Not the grey values themselves: a
// template that only changes a colour changes how bright the picture is, and on the 2026-11-15 looks plain grey values could not
// tell such a variant (up to 79 of 255 apart) from two different looks of one block (as close as 4); the edge maps can (see the
// test for the numbers). Coarse on purpose: a template must change what the picture shows, not a few pixels of it. The pictures
// are compared after shrinking, so a wide and a tall one can be compared too (both are squeezed into the square).
//
// That measure is blind, on purpose, to what the colour-only blocks do (common.grade, common.tone, core.flash's fades: the blocks marked
// `likeness: 'colour'`), so their templates are also measured by a second one: the colour print, the picture shrunk to 16 × 16 cells,
// each the cell's mean colour in CIELAB, compared as the mean ΔE2000 of the cells — what colour the picture turns, and how light,
// where. Only those blocks are measured by it (a template of theirs passes when either measure does); every other block's templates
// are measured by the edge print alone, so a colour-only variant of a look stays refused.
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

/** how far apart two golden pictures must be: a block template's from its block's default and from the block's other templates, a
 *  combo's peak from every other combo's (calibrated in plugin-common/golden/templates.test.ts) */
export const TEMPLATE_LIKENESS = 0.21;

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
export function sampleDistance(own: TimedPrint[], other: TimedPrint[], dist: (a: Float32Array, b: Float32Array) => number = meanAbsDiff): number {
  if (!own.length || !other.length) throw new Error('要比的樣本沒有圖');
  return Math.max(...own.map((a) => {
    const near = Math.min(...other.map((b) => Math.abs(b.t - a.t)));
    return Math.min(...other.filter((b) => Math.abs(b.t - a.t) - near < 1e-6).map((b) => dist(a.print, b.print)));
  }));
}

/** the side of the colour print's square */
export const COLOUR_SIZE = 16;
/** how far apart (mean ΔE) the colour prints of two templates of a colour block must be, beside the edge measure (calibrated in
 *  plugin-common/golden/templates.test.ts) */
export const COLOUR_LIKENESS = 9;

/** an sRGB level (0–255) in linear light (0–1) */
const linear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const LINEAR = Float64Array.from({ length: 256 }, (_, v) => linear(v));
/** CIELAB's f, of a value relative to the white point */
const labF = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);

/** The picture shrunk to `size` × `size` cells of [L*, a*, b*] (D65): each cell the mean of the source pixels whose centres fall in it,
 *  averaged in linear light, alpha taken as coverage over black (as the grey square does). */
export function colourSquare(p: Rgba, size = COLOUR_SIZE): Float32Array {
  const sum = new Float64Array(size * size * 3), n = new Uint32Array(size * size), d = p.data;
  for (let y = 0; y < p.height; y++) {
    const cy = Math.min(size - 1, Math.floor(((y + 0.5) * size) / p.height));
    for (let x = 0; x < p.width; x++) {
      const cx = Math.min(size - 1, Math.floor(((x + 0.5) * size) / p.width)), c = cy * size + cx, i = (y * p.width + x) * 4, a = d[i + 3] / 255;
      sum[c * 3] += LINEAR[d[i]] * a; sum[c * 3 + 1] += LINEAR[d[i + 1]] * a; sum[c * 3 + 2] += LINEAR[d[i + 2]] * a;
      n[c]++;
    }
  }
  const out = new Float32Array(size * size * 3);
  for (let c = 0; c < size * size; c++) {
    const k = n[c] || 1, r = sum[c * 3] / k, g = sum[c * 3 + 1] / k, b = sum[c * 3 + 2] / k;
    // linear sRGB → XYZ (D65), relative to the white point
    const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b, Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
    const fx = labF(X), fy = labF(Y), fz = labF(Z);
    out[c * 3] = 116 * fy - 16; out[c * 3 + 1] = 500 * (fx - fy); out[c * 3 + 2] = 200 * (fy - fz);
  }
  return out;
}

/** the picture's colour print: its colour square */
export const colourPrintOf = (p: Rgba) => colourSquare(p);

/** The mean ΔE2000 of two colour prints' cells. Not CIE76 (the plain distance in Lab): that counts a small turn of a strong colour as
 *  a big change (a grade's mono orange turned 8° yellower came 20 apart, farther than two different grades), where CIEDE2000 weighs
 *  chroma and hue by how strong the colour is, as the eye does. */
export function colourDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length % 3) throw new Error(`兩張色彩縮圖大小不同（${a.length}、${b.length}）`);
  let s = 0;
  for (let i = 0; i < a.length; i += 3) s += deltaE2000(a[i], a[i + 1], a[i + 2], b[i], b[i + 1], b[i + 2]);
  return s / (a.length / 3);
}

const RAD = Math.PI / 180;
/** a hue angle in degrees, 0–360 (0 for a grey) */
const hueOf = (b: number, a: number) => { if (!a && !b) return 0; const h = Math.atan2(b, a) / RAD; return h < 0 ? h + 360 : h; };

/** CIEDE2000 between two Lab colours (Sharma, Wu and Dalal's formulation; kL = kC = kH = 1) */
export function deltaE2000(L1: number, a1: number, b1: number, L2: number, a2: number, b2: number): number {
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2, G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2), h1 = hueOf(b1, a1p), h2 = hueOf(b2, a2p);
  const grey = C1 * C2 === 0;
  let dh = grey ? 0 : h2 - h1;
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * RAD);
  const Lm = (L1 + L2) / 2, Cpm = (C1 + C2) / 2;
  const hm = grey ? h1 + h2 : Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * RAD) + 0.24 * Math.cos(2 * hm * RAD) + 0.32 * Math.cos((3 * hm + 6) * RAD) - 0.2 * Math.cos((4 * hm - 63) * RAD);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const RT = -2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * RAD);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
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
