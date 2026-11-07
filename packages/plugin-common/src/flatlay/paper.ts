// What is printed and written on the desk's objects (spec 2026-11-07-desk3d), painted on 2D canvases that become their textures:
// paper with fibres, a postcard's italic place name and year, a polaroid's or card's handwritten line, the old TV's body and brand,
// a photo frame's wood and mat, a postcard's back (handwriting written one character at a time, the stamp, the postmark landing at
// its time), and the stand-in picture (a sunset over the sea) for a face with no footage. Each painter also returns where its words
// are, as fractions of the object, so the block can report them to check. 1000 px a desk unit.
import { clamp, rng } from '@tellcut/engine';
import { handFamily, LATIN } from '../hand.ts';
import { sentenceCps } from '../handwrite.ts';
import { sizeOf, type Obj } from './objects.ts';

export const PX = 1000;
export interface Word { text: string; rect: [number, number, number, number] }
export interface Painted { canvas: HTMLCanvasElement; words: Word[] }
export type Make = (w: number, h: number) => HTMLCanvasElement;
const blank: Make = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

const HAND = handFamily('');
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
    if (o.caption) { g.fillStyle = '#e8d9bd'; g.font = `600 ${44}px ${LATIN}`; words.push(word(g, o.caption.toUpperCase(), px * w + (pw * w) / 2, bottom + 98, 44, w, h, 'center')); }
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
    if (o.caption) { g.fillStyle = INK; g.font = `${40}px ${HAND}`; words.push(word(g, o.caption, w / 2, bottom + (h - m - bottom) * 0.62, 40, w, h, 'center')); }
    return { canvas: c, words };
  }
  paper(g, w, h, o.kind === 'polaroid' ? '#fbf9f3' : '#f6f1e6', o.seed);
  if (o.kind === 'postcard') {
    const strip = h - bottom, size = Math.round(strip * 0.42);
    g.fillStyle = SEPIA; g.font = `italic 500 ${size}px ${LATIN}`;
    if (o.place) words.push(word(g, o.place, px * w + 6, bottom + strip * 0.68, size, w, h));
    g.fillStyle = 'rgba(107,90,72,.7)'; g.font = `500 ${Math.round(size * 0.58)}px ${LATIN}`;
    if (o.year) words.push(word(g, o.year, (px + pw) * w - 6, bottom + strip * 0.66, Math.round(size * 0.58), w, h, 'right'));
  } else if (o.caption) {
    const strip = h - bottom, size = Math.round(Math.min(64, strip * 0.4));
    g.fillStyle = INK; g.font = `${size}px ${HAND}`;
    words.push(word(g, o.caption, w / 2, bottom + strip * 0.62, size, w, h, 'center'));
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
  g.font = `600 ${Math.round(rad * 0.24)}px ${LATIN}, ${HAND}`;
  arc(m.top.toUpperCase(), rad * 0.72, true); arc(m.bottom, rad * 0.72, false);
  g.font = `600 ${Math.round(rad * 0.2)}px ${LATIN}`; g.textAlign = 'center'; g.fillText(m.date, 0, rad * 0.07);
  g.restore();
}

/** the back at `local`: handwriting (each character fading in as the pen reaches it), and on a postcard a dividing line, two address
 *  rules, the stamp (its picture, or the stand-in) and the postmark landing at its time */
export function paintBack(o: Obj, local: number, stamp: CanvasImageSource | null = null, make: Make = blank): Painted {
  const s = sizeOf(o), w = Math.round(s.w * PX), h = Math.round(s.h * PX), c = make(w, h), g = c.getContext('2d');
  const words: Word[] = [];
  if (!g) return { canvas: c, words };
  if (o.kind === 'tv') { g.fillStyle = '#2b2119'; g.fillRect(0, 0, w, h); return { canvas: c, words }; }
  paper(g, w, h, o.kind === 'polaroid' ? '#f3efe6' : '#f4eee2', o.seed + 100);
  const post = o.kind === 'postcard', textW = post ? w * 0.52 : w * 0.84, x0 = post ? w * 0.06 : w * 0.08;
  const size = Math.round(Math.min(72, h / 11)), lineH = size * 1.55;
  if (post) {
    g.strokeStyle = 'rgba(107,90,72,.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(w * 0.6, h * 0.12); g.lineTo(w * 0.6, h * 0.88); g.stroke();
    for (const y of [0.62, 0.74, 0.86]) { g.beginPath(); g.moveTo(w * 0.65, h * y); g.lineTo(w * 0.94, h * y); g.stroke(); }
    // the stamp: a white perforated edge round the picture
    const sw = w * 0.17, sh = sw * 1.2, sx = w * 0.94 - sw, sy = h * 0.08;
    g.fillStyle = '#fffdf8'; g.fillRect(sx - 10, sy - 10, sw + 20, sh + 20);
    g.fillStyle = '#f4eee2';
    for (let i = 0; i <= 10; i++) { for (const [ex, ey] of [[sx - 10 + (i * (sw + 20)) / 10, sy - 10], [sx - 10 + (i * (sw + 20)) / 10, sy + sh + 10], [sx - 10, sy - 10 + (i * (sh + 20)) / 10], [sx + sw + 10, sy - 10 + (i * (sh + 20)) / 10]]) { g.beginPath(); g.arc(ex, ey, 5, 0, 7); g.fill(); } }
    if (stamp) g.drawImage(stamp, sx, sy, sw, sh); else g.drawImage(paintPlaceholder(Math.round(sw), Math.round(sh), make), sx, sy, sw, sh);
    if (o.mark && local >= o.mark.at) {
      const q = clamp((local - o.mark.at) / 0.15);
      const cx = sx - sw * 0.15, cy = sy + sh * 0.85, r = sw * 0.62 * (1.35 - 0.35 * q);
      postmark(g, cx, cy, sw * 0.62, o.mark, 0.8 * q, 1.35 - 0.35 * q);
      // its words for check: the top arc, the bottom arc, the date across the middle (as boxes round them)
      const box = (text: string, x0: number, y0: number, bw: number, bh: number) => { if (text) words.push({ text, rect: [(cx + x0 * r) / w, (cy + y0 * r) / h, (bw * r) / w, (bh * r) / h] }); };
      box(o.mark.top.toUpperCase(), -0.7, -0.98, 1.4, 0.4); box(o.mark.bottom, -0.7, 0.58, 1.4, 0.4); box(o.mark.date, -0.6, -0.14, 1.2, 0.26);
    }
  }
  g.fillStyle = INK; g.font = `${size}px ${HAND}`; g.textAlign = 'left';
  o.back.forEach((line, li) => {
    const y = h * 0.2 + size + li * lineH, cps = sentenceCps(line, 12), chars = [...line.text];
    let x = x0;
    chars.forEach((ch, i) => {
      const a = clamp((local - line.start - i / cps) / 0.18);
      const cw = g.measureText(ch).width;
      if (x + cw > x0 + textW) return;
      if (a > 0) { g.globalAlpha = a; g.fillText(ch, x, y); }
      x += cw;
    });
    g.globalAlpha = 1;
    if (local > line.start && line.text) words.push({ text: line.text, rect: [x0 / w, (y - size * 0.85) / h, (x - x0) / w, size / h] });
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
