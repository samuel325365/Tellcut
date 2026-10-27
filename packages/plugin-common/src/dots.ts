// Dot-matrix and segment lettering on a canvas, from the food-receipt and food-deep shorts: any text (Chinese too) rasterised small
// and redrawn as dots (a thermal printer, an LED sign, a VFD), a 5×7 VFD font for the digits, and seven-segment LED digits.
// The glyph bitmaps are pure caches (keyed by the font being loaded), so a frame draws the same however it is reached.

/** a software canvas (willReadFrequently): a GPU canvas drawn once can come back empty after Chrome hibernates it */
export function softCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

export interface Dots { pts: Array<[number, number]>; w: number; h: number }
const cache = new Map<string, Dots>();

/** load the font a dot raster needs for `text` (the glyphs come in unicode-range slices): ItemType.ready */
export async function loadDots(family: string, text: string, weights = [700]) {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(weights.map((w) => document.fonts.load(dotFont(20, w, family), text || 'A').catch(() => [])));
}

/** the CSS font of a dot raster */
export const dotFont = (px: number, weight: number, family: string) => `${weight} ${px}px '${family}', 'Noto Sans TC', sans-serif`;

/** The dots of `text` rasterised at `px` (one font pixel = one dot cell): the lit cells and the grid size in cells. */
export function dots(text: string, px: number, weight = 700, family = 'Noto Sans TC'): Dots {
  const font = dotFont(px, weight, family), ok = typeof document !== 'undefined' && document.fonts ? document.fonts.check(font, text || 'A') : true;
  const key = `${font}|${ok}|${text}`, hit = cache.get(key);
  if (hit) return hit;
  const m = softCanvas(4, 4).getContext('2d')!;
  m.font = font;
  const w = Math.ceil(m.measureText(text).width) + 2, h = Math.ceil(px * 1.3);
  const c = softCanvas(w, h), g = c.getContext('2d')!;
  g.font = font; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  g.fillText(text, 1, Math.round(px * 1.02));
  const d = g.getImageData(0, 0, c.width, c.height).data, pts: Array<[number, number]> = [];
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) if (d[(j * c.width + i) * 4 + 3] > 100) pts.push([i, j]);
  const out = { pts, w, h };
  if (cache.size > 400) cache.clear();
  cache.set(key, out);
  return out;
}

/** draw dot text: (x, y) is the top-left of the cell grid, `pitch` px per cell, dots `size` px (round ones when `round`) */
export function drawDots(g: CanvasRenderingContext2D, D: Dots, x: number, y: number, pitch: number, size: number, color: string, round = false) {
  g.fillStyle = color;
  if (round) {
    g.beginPath();
    for (const [i, j] of D.pts) { const cx = x + i * pitch + pitch / 2, cy = y + j * pitch + pitch / 2; g.moveTo(cx + size / 2, cy); g.arc(cx, cy, size / 2, 0, Math.PI * 2); }
    g.fill();
  } else for (const [i, j] of D.pts) g.fillRect(x + i * pitch, y + j * pitch, size, size);
}

/** every cell of a grid, unlit (an LED sign's dark dots) */
export function drawGrid(g: CanvasRenderingContext2D, x: number, y: number, cols: number, rows: number, pitch: number, size: number, color: string, round = false) {
  g.fillStyle = color;
  g.beginPath();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cx = x + i * pitch + pitch / 2, cy = y + j * pitch + pitch / 2;
    if (round) { g.moveTo(cx + size / 2, cy); g.arc(cx, cy, size / 2, 0, Math.PI * 2); } else g.rect(cx - size / 2, cy - size / 2, size, size);
  }
  g.fill();
}

// ---------- the 5×7 VFD font (what a till display needs) ----------
export const F57: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'], 'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'], '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'], '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'], ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'], '%': ['11000', '11001', '00010', '00100', '01000', '10011', '00011'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], 'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/** VFD characters right-aligned at `right`: each a 5×7 cell block, `pitch` px a cell; unlit cells faintly in `off` */
export function vfdText(g: CanvasRenderingContext2D, text: string, right: number, y: number, pitch: number, dot: number, on: string, off: string) {
  const cell = 6 * pitch;
  let x = right - text.length * cell + pitch;
  for (const ch of text) {
    const rows = F57[ch.toUpperCase()] ?? F57[' '];
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) {
      g.fillStyle = rows[j][i] === '1' ? on : off;
      g.fillRect(x + i * pitch, y + j * pitch, dot, dot);
    }
    x += cell;
  }
}

// ---------- seven segments ----------
export const SEG: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '',
  'A': 'abcefg', 'b': 'cdefg', 'C': 'adef', 'd': 'bcdeg', 'E': 'adefg', 'F': 'aefg', 'H': 'bcefg', 'L': 'def', 'P': 'abefg', 'o': 'cdeg', 'n': 'ceg', 'r': 'eg', 'u': 'cde', '_': 'd',
};
/** segment polygons in a 60×100 box */
const POLY: Record<string, number[]> = {
  a: [10, 4, 50, 4, 44, 12, 16, 12], d: [16, 88, 44, 88, 50, 96, 10, 96], g: [14, 46, 46, 46, 50, 50, 46, 54, 14, 54, 10, 50],
  f: [6, 8, 14, 16, 14, 42, 6, 48], b: [54, 8, 54, 48, 46, 42, 46, 16], e: [6, 52, 14, 58, 14, 84, 6, 92], c: [54, 52, 54, 92, 46, 84, 46, 58],
};
/** the segments a character lights ('' for an unknown one; a digit or - otherwise) */
export const segsOf = (ch: string) => SEG[ch] ?? SEG[ch.toUpperCase()] ?? SEG[ch.toLowerCase()] ?? '';

/** one seven-segment digit in a box `h` px tall (0.6 h wide) at (x, y), leaning by `skew`; lit segments glow */
export function drawSeg(g: CanvasRenderingContext2D, ch: string, x: number, y: number, h: number, on: string | null, off: string, skew = -0.1) {
  const lit = on ? segsOf(ch) : '', s = h / 100;
  g.save();
  g.translate(x, y); g.transform(1, 0, skew, 1, -skew * h, 0); g.scale(s, s);
  for (const k of Object.keys(POLY)) {
    const p = POLY[k], isOn = lit.includes(k);
    g.beginPath(); g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    g.closePath();
    g.fillStyle = isOn ? on! : off;
    if (isOn) { g.shadowColor = on!; g.shadowBlur = 8 * s; } else g.shadowBlur = 0;
    g.fill();
  }
  g.restore();
}
