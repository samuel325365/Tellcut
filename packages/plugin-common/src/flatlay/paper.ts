// What is printed and written on the desk's objects (spec 2026-11-07-desk3d), painted on 2D canvases that become their textures:
// paper with fibres, a postcard's italic place name and year, a polaroid's or card's handwritten line, the old TV's body and brand,
// a photo frame's wood and mat, a postcard's back (handwriting written one character at a time, the stamp, the postmark landing at
// its time), and the stand-in picture (a sunset over the sea) for a face with no footage. Each painter also returns where its words
// are, as fractions of the object, so the block can report them to check. 1000 px a desk unit.
import { clamp, rng } from '@tellcut/engine';
import { handFamily } from '../hand.ts';
import { sentenceCps } from '../handwrite.ts';
import { sizeOf, type Obj } from './objects.ts';

type Line = Obj['back'][number];
/** `from`: written when that character of that line is (an ellipsis standing for the rows that do not fit) */
interface Glyph { ch: string; i: number; x: number; w: number; from?: { line: number; i: number } }
interface Row { line: number; glyphs: Glyph[] }

/** the back's lines broken into rows no wider than maxW: at the last space when the row has one (words stay whole), else at the
 *  character (CJK); the space a row breaks at is not written. Every line keeps at least one row */
function backRows(g: CanvasRenderingContext2D, lines: Line[], maxW: number): Row[] {
  const rows: Row[] = [];
  lines.forEach((line, li) => {
    let row: Glyph[] = [], x = 0;
    const relay = (gs: Glyph[]) => { let nx = 0; const out = gs.map((q) => { const r = { ...q, x: nx }; nx += q.w; return r; }); return { out, nx }; };
    [...line.text].forEach((ch, i) => {
      const w = g.measureText(ch).width;
      if (row.length && x + w > maxW) {
        if (ch === ' ') { rows.push({ line: li, glyphs: row }); row = []; x = 0; return; }
        const sp = row.map((q) => q.ch).lastIndexOf(' ');
        if (sp > 0) { rows.push({ line: li, glyphs: row.slice(0, sp) }); const r = relay(row.slice(sp + 1)); row = r.out; x = r.nx; }
        else { rows.push({ line: li, glyphs: row }); row = []; x = 0; }
      }
      row.push({ ch, i, x, w }); x += w;
    });
    rows.push({ line: li, glyphs: row });
  });
  return rows;
}

/** at most `max` rows: the rest left out, the last row kept cut short to end in an ellipsis that is written when the first character
 *  left out would have been */
function fitRows(g: CanvasRenderingContext2D, rows: Row[], max: number, maxW: number): Row[] {
  if (rows.length <= max) return rows;
  const kept = rows.slice(0, max), last = kept[max - 1], glyphs = [...last.glyphs], dot = g.measureText('…').width;
  let next = rows[max].glyphs[0] ? { line: rows[max].line, i: rows[max].glyphs[0].i } : { line: last.line, i: glyphs.length };
  while (glyphs.length && (glyphs[glyphs.length - 1].x + glyphs[glyphs.length - 1].w + dot > maxW || glyphs[glyphs.length - 1].ch === ' ')) {
    const q = glyphs.pop()!;
    next = { line: last.line, i: q.i };
  }
  const x = glyphs.length ? glyphs[glyphs.length - 1].x + glyphs[glyphs.length - 1].w : 0;
  kept[max - 1] = { line: last.line, glyphs: [...glyphs, { ch: '…', i: next.i, x, w: dot, from: next }] };
  return kept;
}

export const PX = 1000;
/** the back's pen: characters a second (before a line's own pace), each fading in over BACK_FADE s; the postmark lands over MARK_LAND s */
export const BACK_CPS = 12, BACK_FADE = 0.18, MARK_LAND = 0.15;
export interface Word { text: string; rect: [number, number, number, number] }
export interface Painted { canvas: HTMLCanvasElement; words: Word[] }
export type Make = (w: number, h: number) => HTMLCanvasElement;
const blank: Make = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

const HAND = handFamily('');
/** the printed words (a postcard's place and year, the TV's brand, the postmark): a Latin serif, then a serif with Chinese and
 *  Japanese, both declared by the player (fonts.css), so a place name in Chinese looks the same on every machine */
export const PRINT = "'Cormorant Garamond', 'Noto Serif TC', serif";

/** every character the objects may paint, for loading their fonts before painting (the block's ready()) */
export function paintedText(objs: Obj[]): string {
  return objs.map((o) => [o.place, o.year, o.caption, o.caption.toUpperCase(), ...o.back.map((l) => l.text), o.mark ? `${o.mark.top.toUpperCase()}${o.mark.bottom}${o.mark.date}` : '', '…'].join('')).join('');
}
const INK = '#34344c', SEPIA = '#6b5a48';

/** paper: a base colour, soft blots, short fibres and fine dots from the object's seed */
function paper(g: CanvasRenderingContext2D, w: number, h: number, base: string, seed: number) {
  const r = rng(seed * 31 + 5);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) {
    const x = r() * w, y = r() * h, rad = 40 + r() * 120, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(200,185,160,${0.06 * r()})`); gr.addColorStop(1, 'rgba(200,185,160,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
  }
  g.lineWidth = 0.6;
  for (let i = 0; i < (w * h) / 1600; i++) {
    const x = r() * w, y = r() * h, a = r() * 6.3, l = 3 + r() * 9;
    g.strokeStyle = `rgba(150,130,100,${r() * 0.1})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < (w * h) / 300; i++) { g.fillStyle = `rgba(40,30,20,${0.07 * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
}

/** `text` no wider than maxW: its font (`font(px)`) made smaller, down to `min` of `size`, then the text cut short with an
 *  ellipsis; sets g.font to what it chose */
export function fitText(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, size: number, maxW: number, min = 0.6): { text: string; size: number } {
  g.font = font(size);
  const tw = g.measureText(text).width;
  if (tw <= maxW) return { text, size };
  const px = Math.max(Math.round(size * min), Math.floor((size * maxW) / tw));
  g.font = font(px);
  if (g.measureText(text).width <= maxW) return { text, size: px };
  const chars = [...text];
  while (chars.length > 1 && g.measureText(`${chars.join('').trimEnd()}…`).width > maxW) chars.pop();
  return { text: `${chars.join('').trimEnd()}…`, size: px };
}

/** a word drawn and measured: its box as fractions of the canvas */
function word(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, w: number, h: number, align: CanvasTextAlign = 'left'): Word {
  g.textAlign = align; g.fillText(text, x, y);
  const tw = g.measureText(text).width, left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
  return { text, rect: [left / w, (y - size * 0.85) / h, tw / w, size / h] };
}

/** the object's front, without its picture (a mesh of its own lies over the picture's place) */
export function paintFront(o: Obj, make: Make = blank): Painted {
  const s = sizeOf(o), w = Math.round(s.w * PX), h = Math.round(s.h * PX), c = make(w, h), g = c.getContext('2d');
  const words: Word[] = [];
  if (!g) return { canvas: c, words };
  const [px, py, pw, ph] = s.pic, bottom = (py + ph) * h;
  if (o.kind === 'tv') {
    // a wood-veneer set: dark grain, a bevel round the screen, two knobs and a speaker grille on the right
    const r = rng(o.seed * 17 + 3);
    g.fillStyle = '#4a3627'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? '30,18,10' : '110,80,55'},${0.08 + r() * 0.12})`; g.lineWidth = 1 + r() * 2; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 20, w * 0.7, y + (r() - 0.5) * 20, w, y + (r() - 0.5) * 10); g.stroke(); }
    g.fillStyle = '#17120e'; g.beginPath(); g.roundRect(px * w - 26, py * h - 26, pw * w + 52, ph * h + 52, 46); g.fill();
    const kx = (px + pw) * w + (w - (px + pw) * w) / 2;
    for (const ky of [0.3, 0.52]) { const gr = g.createRadialGradient(kx - 8, ky * h - 8, 4, kx, ky * h, 52); gr.addColorStop(0, '#d9cbb4'); gr.addColorStop(1, '#5c4a38'); g.fillStyle = gr; g.beginPath(); g.arc(kx, ky * h, 50, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(15,10,6,.7)';
    for (let i = 0; i < 9; i++) g.fillRect(kx - 70, h * 0.66 + i * 22, 140, 9);
    if (o.caption) { g.fillStyle = '#e8d9bd'; const f = fitText(g, o.caption.toUpperCase(), (n) => `600 ${n}px ${PRINT}`, 44, pw * w); words.push(word(g, f.text, px * w + (pw * w) / 2, bottom + 98, f.size, w, h, 'center')); }
    return { canvas: c, words };
  }
  if (o.kind === 'photo') {
    // the moulding (warm wood with a lighter inner bevel), then the mat
    const r = rng(o.seed * 13 + 1), m = 0.08 * PX;
    g.fillStyle = '#6e4a2e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 200; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? '40,24,12' : '150,110,75'},${0.1 + r() * 0.15})`; g.lineWidth = 1 + r() * 2; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 8); g.stroke(); }
    g.fillStyle = '#c69c6d'; g.fillRect(m - 6, m - 6, w - 2 * m + 12, h - 2 * m + 12);
    g.save(); g.beginPath(); g.rect(m, m, w - 2 * m, h - 2 * m); g.clip(); paper(g, w, h, '#f7f4ec', o.seed); g.restore();
    // the mat's bevelled window
    g.strokeStyle = 'rgba(120,100,80,.35)'; g.lineWidth = 6; g.strokeRect(px * w - 3, py * h - 3, pw * w + 6, ph * h + 6);
    if (o.caption) { g.fillStyle = INK; const f = fitText(g, o.caption, (n) => `${n}px ${HAND}`, 40, pw * w); words.push(word(g, f.text, w / 2, bottom + (h - m - bottom) * 0.62, f.size, w, h, 'center')); }
    return { canvas: c, words };
  }
  paper(g, w, h, o.kind === 'polaroid' ? '#fbf9f3' : '#f6f1e6', o.seed);
  if (o.kind === 'postcard') {
    // the year on the right (at most a third of the strip), the place in what is left of it
    const strip = h - bottom, size = Math.round(strip * 0.42), left = px * w + 6, right = (px + pw) * w - 6;
    let yearW = 0;
    if (o.year) {
      g.fillStyle = 'rgba(107,90,72,.7)';
      const f = fitText(g, o.year, (n) => `500 ${n}px ${PRINT}`, Math.round(size * 0.58), (right - left) / 3);
      const yw = word(g, f.text, right, bottom + strip * 0.66, f.size, w, h, 'right');
      words.push(yw); yearW = yw.rect[2] * w + size * 0.6;
    }
    g.fillStyle = SEPIA;
    if (o.place) { const f = fitText(g, o.place, (n) => `italic 500 ${n}px ${PRINT}`, size, right - left - yearW); words.unshift(word(g, f.text, left, bottom + strip * 0.68, f.size, w, h)); }
  } else if (o.caption) {
    const strip = h - bottom, f = fitText(g, o.caption, (n) => `${n}px ${HAND}`, Math.round(Math.min(64, strip * 0.4)), pw * w);
    g.fillStyle = INK;
    words.push(word(g, f.text, w / 2, bottom + strip * 0.62, f.size, w, h, 'center'));
  }
  return { canvas: c, words };
}

/** a postmark: two rings, the place on the top arc, the other line on the bottom arc, the date across; ink */
function postmark(g: CanvasRenderingContext2D, cx: number, cy: number, rad: number, m: { top: string; bottom: string; date: string }, alpha: number, scale: number) {
  g.save(); g.translate(cx, cy); g.rotate(-0.2); g.scale(scale, scale); g.globalAlpha = alpha;
  g.strokeStyle = '#3c4a7a'; g.fillStyle = '#3c4a7a'; g.lineWidth = 5;
  g.beginPath(); g.arc(0, 0, rad, 0, 7); g.stroke(); g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, rad * 0.62, 0, 7); g.stroke();
  const arc = (text: string, r: number, top: boolean) => {
    const chars = [...text], step = Math.min(0.32, 2.4 / Math.max(1, chars.length));
    chars.forEach((ch, i) => {
      const a = (i - (chars.length - 1) / 2) * step;
      g.save(); g.rotate(top ? a : -a); g.translate(0, top ? -r : r); g.textAlign = 'center'; g.fillText(ch, 0, top ? 0 : rad * 0.12); g.restore();
    });
  };
  g.font = `600 ${Math.round(rad * 0.24)}px ${PRINT}`;
  arc(m.top.toUpperCase(), rad * 0.72, true); arc(m.bottom, rad * 0.72, false);
  g.font = `600 ${Math.round(rad * 0.2)}px ${PRINT}`; g.textAlign = 'center'; g.fillText(m.date, 0, rad * 0.07);
  g.restore();
}

/** the back at `local`: handwriting (each character fading in as the pen reaches it), and on a postcard a dividing line, two address
 *  rules, the stamp (its picture, or the stand-in) and the postmark landing at its time */
/** the back without its words and postmark: the paper, a postcard's dividing line, address lines and stamp; the same at any time,
 *  so a block painting the back while it is written paints this once and hands it to paintBack */
export function paintBackBase(o: Obj, stamp: CanvasImageSource | null = null, make: Make = blank): HTMLCanvasElement {
  const s = sizeOf(o), w = Math.round(s.w * PX), h = Math.round(s.h * PX), c = make(w, h), g = c.getContext('2d');
  if (!g) return c;
  if (o.kind === 'tv') { g.fillStyle = '#2b2119'; g.fillRect(0, 0, w, h); return c; }
  paper(g, w, h, o.kind === 'polaroid' ? '#f3efe6' : '#f4eee2', o.seed + 100);
  if (o.kind === 'postcard') {
    g.strokeStyle = 'rgba(107,90,72,.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(w * 0.6, h * 0.12); g.lineTo(w * 0.6, h * 0.88); g.stroke();
    for (const y of [0.62, 0.74, 0.86]) { g.beginPath(); g.moveTo(w * 0.65, h * y); g.lineTo(w * 0.94, h * y); g.stroke(); }
    // the stamp: a white perforated edge round the picture
    const { sw, sh, sx, sy } = stampBox(w, h);
    g.fillStyle = '#fffdf8'; g.fillRect(sx - 10, sy - 10, sw + 20, sh + 20);
    g.fillStyle = '#f4eee2';
    for (let i = 0; i <= 10; i++) { for (const [ex, ey] of [[sx - 10 + (i * (sw + 20)) / 10, sy - 10], [sx - 10 + (i * (sw + 20)) / 10, sy + sh + 10], [sx - 10, sy - 10 + (i * (sh + 20)) / 10], [sx + sw + 10, sy - 10 + (i * (sh + 20)) / 10]]) { g.beginPath(); g.arc(ex, ey, 5, 0, 7); g.fill(); } }
    if (stamp) g.drawImage(stamp, sx, sy, sw, sh); else g.drawImage(paintPlaceholder(Math.round(sw), Math.round(sh), make), sx, sy, sw, sh);
  }
  return c;
}
const stampBox = (w: number, h: number) => { const sw = w * 0.17; return { sw, sh: sw * 1.2, sx: w * 0.94 - sw, sy: h * 0.08 }; };

/** the back at `local`: on `base` (paintBackBase's, painted now when not given) the postmark as far as it has landed and the words
 *  as far as they are written */
export function paintBack(o: Obj, local: number, stamp: CanvasImageSource | null = null, make: Make = blank, base?: HTMLCanvasElement): Painted {
  const s = sizeOf(o), w = Math.round(s.w * PX), h = Math.round(s.h * PX), c = make(w, h), g = c.getContext('2d');
  const words: Word[] = [];
  if (!g) return { canvas: c, words };
  g.drawImage(base ?? paintBackBase(o, stamp, make), 0, 0, w, h);
  if (o.kind === 'tv') return { canvas: c, words };
  const post = o.kind === 'postcard', textW = post ? w * 0.52 : w * 0.84, x0 = post ? w * 0.06 : w * 0.08;
  let size = Math.round(Math.min(72, h / 11));
  if (post) {
    const { sw, sh, sx, sy } = stampBox(w, h);
    if (o.mark && local >= o.mark.at) {
      const q = clamp((local - o.mark.at) / MARK_LAND);
      const cx = sx - sw * 0.15, cy = sy + sh * 0.85, r = sw * 0.62 * (1.35 - 0.35 * q);
      postmark(g, cx, cy, sw * 0.62, o.mark, 0.8 * q, 1.35 - 0.35 * q);
      // its words for check: the top arc, the bottom arc, the date across the middle (as boxes round them)
      const box = (text: string, x0: number, y0: number, bw: number, bh: number) => { if (text) words.push({ text, rect: [(cx + x0 * r) / w, (cy + y0 * r) / h, (bw * r) / w, (bh * r) / h] }); };
      box(o.mark.top.toUpperCase(), -0.7, -0.98, 1.4, 0.4); box(o.mark.bottom, -0.7, 0.58, 1.4, 0.4); box(o.mark.date, -0.6, -0.14, 1.2, 0.26);
    }
  }
  g.fillStyle = INK; g.textAlign = 'left';
  // laid out for the whole text, whatever is written yet, so the rows never move: smaller until every row fits above the bottom
  let rows: Row[] = [];
  for (let k = 0; k < 10; k++) {
    g.font = `${size}px ${HAND}`;
    rows = backRows(g, o.back, textW);
    if (size + (rows.length - 1) * size * 1.55 <= h * 0.72 || size <= 24) break;
    size = Math.max(24, Math.round(size * 0.88));
  }
  const lineH = size * 1.55;
  rows = fitRows(g, rows, Math.max(1, Math.floor((h * 0.95 - size * 0.25 - (h * 0.2 + size)) / lineH) + 1), textW);
  rows.forEach((row, r) => {
    const y = h * 0.2 + size + r * lineH;
    let end = -1;
    row.glyphs.forEach((q, n) => {
      const line = o.back[q.from?.line ?? row.line], a = clamp((local - line.start - (q.from?.i ?? q.i) / sentenceCps(line, BACK_CPS)) / BACK_FADE);
      if (a <= 0) return;
      g.globalAlpha = a; g.fillText(q.ch, x0 + q.x, y); end = n;
    });
    g.globalAlpha = 1;
    // its words for check: only what is written
    const shown = row.glyphs.slice(0, end + 1), text = shown.map((q) => q.ch).join('');
    if (text.trim()) { const last = shown[shown.length - 1]; words.push({ text, rect: [x0 / w, (y - size * 0.85) / h, (last.x + last.w) / w, size / h] }); }
  });
  return { canvas: c, words };
}

/** the stand-in picture for a face with no footage: a low sun over the sea */
export function paintPlaceholder(w: number, h: number, make: Make = blank): HTMLCanvasElement {
  const c = make(w, h), g = c.getContext('2d');
  if (!g) return c;
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#f6b38a'); sky.addColorStop(1, '#f9d9a8');
  g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.62);
  g.fillStyle = '#fff1cf'; g.beginPath(); g.arc(w * 0.5, h * 0.6, Math.min(w, h) * 0.13, Math.PI, 0); g.fill();
  const sea = g.createLinearGradient(0, h * 0.62, 0, h);
  sea.addColorStop(0, '#5f8fa8'); sea.addColorStop(1, '#2f5670');
  g.fillStyle = sea; g.fillRect(0, h * 0.62, w, h * 0.38);
  g.fillStyle = 'rgba(255,240,205,.5)';
  for (let i = 0; i < 6; i++) { const y = h * (0.66 + i * 0.05), half = w * (0.12 - i * 0.012); g.fillRect(w * 0.5 - half, y, half * 2, Math.max(1, h * 0.008)); }
  return c;
}
