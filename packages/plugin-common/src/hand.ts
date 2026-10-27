// Handwriting on paper (from the baking-steps recipe card): text written character by character as DOM spans that wipe in from the
// left, wobbly pencil lines, circles, boxes, ticks and a heart on a canvas, the ruled index card's place in the frame, and the
// handwriting font (LXGW WenKai TC, declared by the common plugin). Pure functions of their inputs; the lines take `boil` (redraw
// with a new wobble that many times a second at `t`), off unless given.
import { clamp, cssCamel, eBack, eOut3, h, type ParamDef, rng, textEm, type Theme } from '@tellcut/engine';
import { boiled } from './inkline.ts';

export const HAND = 'LXGW WenKai TC';
export const handFamily = (f: string) => `'${f || HAND}', '${HAND}', 'Noto Serif TC', serif`;
export const LATIN = "'Cormorant Garamond', 'Noto Serif', serif";

/** a smooth fixed wobble in −1…1 along x (seed picks another curve) */
export const wave = (x: number, seed: number) => Math.sin(x * 1.7 + seed * 3.1) * 0.6 + Math.sin(x * 3.9 + seed * 7.3) * 0.4;
export const backOut = (t: number) => eBack(clamp(t), 1.6);

type G = CanvasRenderingContext2D;
type Pt = [number, number];

export interface BoilOpts { boil?: number; t?: number }
/** a wobbly hand-drawn polyline through pts (closed or not); stroke or fill it after */
export function handPath(g: G, pts: Pt[], closed: boolean, amp: number, seed: number, o: BoilOpts = {}) {
  seed = boiled(seed, o.t, o.boil);
  g.beginPath();
  const n = pts.length, segs = closed ? n : n - 1;
  let first = true;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, m = Math.max(2, Math.round(L / 18));
    for (let j = 0; j <= m; j++) {
      const t = j / m, off = wave(i * 5 + (t * L) / 40, seed) * amp;
      const x = a[0] + (b[0] - a[0]) * t - ((b[1] - a[1]) / L) * off, y = a[1] + (b[1] - a[1]) * t + ((b[0] - a[0]) / L) * off;
      if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
    }
  }
  if (closed) g.closePath();
}
export const handRect = (g: G, x: number, y: number, w: number, hh: number, amp: number, seed: number, o: BoilOpts = {}) => handPath(g, [[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]], true, amp, seed, o);

/** the points of a hand-drawn loop round (cx, cy), radii rx × ry, drawn for the fraction p of it: a little more than a turn when
 *  done (the hand overshoots its start, `turns` 1.08) and widening slightly as it goes; `a0` is where the pen starts */
export function handLoopPts(cx: number, cy: number, rx: number, ry: number, p: number, seed: number, a0 = -1.9, turns = 1.08): Pt[] {
  if (p <= 0) return [];
  const turn = Math.PI * 2 * turns * clamp(p), n = Math.max(3, Math.round(64 * clamp(p))), out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (turn * i) / n, k = 1 + 0.04 * wave(a * 2, seed) + 0.03 * (i / n);
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}

/** a pencil circle drawn for the fraction p of a turn (a little more than a turn when done: the hand overshoots); stroked.
 *  `o.tip` puts a round pen tip on the end while it is being drawn (the hakka short's red circles) */
export function handCircle(g: G, cx: number, cy: number, r: number, p: number, seed: number, a0 = -1.9, o: BoilOpts & { tip?: boolean } = {}) {
  const pts = handLoopPts(cx, cy, r, r * 0.96, p, boiled(seed, o.t, o.boil), a0);
  if (!pts.length) return;
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.stroke();
  if (o.tip && p < 1) { const [x, y] = pts[pts.length - 1]; g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(x, y, g.lineWidth * 0.9, 0, Math.PI * 2); g.fill(); }
}

/** the tick's three points inside an s×s box at (x, y): the short stroke down, then the long one up (tick() draws the same) */
export const tickPts = (x: number, y: number, s: number): Pt[] => [[x + (4 * s) / 36, y + (16 * s) / 36], [x + (16 * s) / 36, y + (30 * s) / 36], [x + (42 * s) / 36, y - (10 * s) / 36]];

/** a tick in two strokes inside an s×s box at (x, y): k1 and k2 (0–1) are how far each stroke is drawn */
export function tick(g: G, x: number, y: number, s: number, k1: number, k2: number) {
  if (k1 <= 0) return;
  const [a, b, c] = tickPts(x, y, s);
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[0] + (b[0] - a[0]) * k1, a[1] + (b[1] - a[1]) * k1);
  if (k2 > 0) g.lineTo(b[0] + (c[0] - b[0]) * k2, b[1] + (c[1] - b[1]) * k2);
  g.stroke();
}

/** the points of a heart in one stroke from its top dip round and back (n + 1 of them); `s` is its half width / 16 */
export function heartPts(cx: number, cy: number, s: number, n = 80): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, x = 16 * Math.pow(Math.sin(a), 3), y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
    out.push([cx + x * s, cy + y * s]);
  }
  return out;
}

/** a heart drawn in one stroke, the first fraction p of it; `s` is its half width / 16 */
export function heart(g: G, cx: number, cy: number, s: number, p: number) {
  if (p <= 0) return;
  const pts = heartPts(cx, cy, s).slice(0, Math.round(80 * clamp(p)) + 1);
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.stroke();
}

/** how long writing `text` takes at `cps` characters a second */
export const writeTime = (text: string, cps: number, charDur = 0.18) => [...String(text ?? '')].length / Math.max(0.1, cps) + charDur;

/** how far character i is written at `local` (0–1) */
export const charAt = (i: number, local: number, t0: number, cps: number, charDur = 0.18) => clamp((local - t0 - i / Math.max(0.1, cps)) / charDur);

/** break text into lines no wider than maxEm (CJK breaks anywhere; balanced, so no one-character orphan; ，。 never start a line) */
export function wrapEm(text: string, maxEm: number): string[] {
  const chars = [...String(text ?? '')], total = textEm(chars.join(''));
  if (!chars.length) return [];
  const n = Math.max(1, Math.ceil(total / Math.max(1, maxEm))), target = Math.min(maxEm, total / n + 0.5);
  const lines: string[] = [];
  let cur = '';
  for (const ch of chars) {
    if (textEm(cur + ch) > target && cur && lines.length < n - 1 && !'，。、！？）」,.!?)'.includes(ch)) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** One piece of text on a layer, in the layer's units (u px each): `y` is the baseline. With `t0` it is written on at `cps`. */
export interface Txt {
  text: string; x: number; y: number; px: number; color: string; family: string;
  weight?: number; align?: 'left' | 'center' | 'right'; italic?: boolean; t0?: number; cps?: number; alpha?: number; scale?: number; stroke?: string;
  /** character ranges [from, to) written in `markColor` instead (the red pen); given (even empty), every character's colour is set */
  marks?: Array<[number, number]>; markColor?: string;
}
export interface TextLayer { el: HTMLElement; slots: Array<{ box: HTMLElement; chars: HTMLElement[] }>; key: string }

export function textLayer(parent: HTMLElement): TextLayer {
  const el = h('div', null, null, parent);
  cssCamel(el, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
  return { el, slots: [], key: '' };
}

/** Show `txts` on the layer: one div per text, one span per character (rebuilt only when the texts change). */
export function drawTexts(L: TextLayer, txts: Txt[], local: number, u: number) {
  const key = JSON.stringify(txts.map((t) => t.text));
  if (key !== L.key) {
    L.key = key;
    L.el.innerHTML = '';
    L.slots = txts.map((t) => {
      const box = h('div', null, null, L.el);
      cssCamel(box, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1.3' });
      const chars = [...t.text].map((ch) => { const s = h('span', null, null, box); s.textContent = ch; cssCamel(s, { display: 'inline-block', whiteSpace: 'pre' }); return s; });
      return { box, chars };
    });
  }
  txts.forEach((t, i) => {
    const { box, chars } = L.slots[i], px = t.px * u, a = t.alpha ?? 1;
    const shift = t.align === 'center' ? '-50%' : t.align === 'right' ? '-100%' : '0';
    cssCamel(box, { display: t.text && a > 0 ? 'block' : 'none', left: `${t.x * u}px`, top: `${t.y * u - px * 1.07}px`, fontSize: `${px}px`, fontFamily: t.family,
      fontWeight: String(t.weight ?? 400), fontStyle: t.italic ? 'italic' : 'normal', color: t.color, opacity: String(clamp(a)),
      transformOrigin: t.align === 'center' ? '50% 70%' : t.align === 'right' ? '100% 70%' : '0 70%', transform: `translateX(${shift}) scale(${Math.max(0.01, t.scale ?? 1)})`,
      webkitTextStroke: t.stroke ? `${px * 0.12}px ${t.stroke}` : '0', paintOrder: 'stroke fill' });
    chars.forEach((s, k) => {
      if (t.marks) cssCamel(s, { color: t.marks.some(([a, b]) => k >= a && k < b) ? t.markColor ?? '#d62f2f' : '' });
      const p = t.t0 === undefined ? 1 : charAt(k, local, t.t0, t.cps ?? 14);
      cssCamel(s, { visibility: p > 0 ? 'visible' : 'hidden', opacity: String(Math.min(1, p * 1.6)), clipPath: p >= 1 ? 'none' : `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`,
        transform: p >= 1 ? 'none' : `translateY(${((1 - eOut3(p)) * 0.08).toFixed(4)}em)` });
    });
  });
}

// ---------- the ruled index card ----------
export const CARD_W = 940;           // the card's width in its own units (the original's px)
export const RULE0 = 120, RULE = 70;  // the red top rule, then a blue rule every 70

export interface CardP { x: number; y: number; w: number; h: number; tilt: number }
/** the card in the frame: a w×h share of the short side, shrunk to fit the safe area; y −1 puts its foot on the bottom safe line */
export function cardBox(p: CardP, W: number, H: number, safe: Theme['safe']) {
  const S = Math.min(W, H), w0 = p.w * S, h0 = p.h * S, aw = W * (1 - 2 * safe.side), ah = H * (1 - safe.top - safe.bottom);
  const f = Math.min(1, aw / w0, ah / h0), w = w0 * f, hh = h0 * f;
  return { x0: p.x * W - w / 2, y0: p.y >= 0 ? p.y * H : (1 - safe.bottom) * H - hh, w, h: hh, u: w / CARD_W };
}
export const cardParams: ParamDef[] = [
  { key: 'x', label: '卡片中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
  { key: 'y', label: '卡片上緣（畫面高比例；-1＝下緣貼齊下方安全區）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
  { key: 'w', label: '卡片寬（畫面短邊的比例）', type: 'number', min: 0.3, max: 1.6, step: 0.01, default: 0.87 },
  { key: 'h', label: '卡片高（畫面短邊的比例）', type: 'number', min: 0.2, max: 1.6, step: 0.01, default: 0.5 },
  { key: 'tilt', label: '卡片傾斜（度）', type: 'number', min: -10, max: 10, step: 0.1, default: -0.7 },
];

/** the card itself in card units (0,0 at its top-left): paper, a little tooth, blue rules and the red top rule */
export function paintCard(g: G, w: number, hh: number, paper: string, rule: string, red: string) {
  g.fillStyle = paper; g.fillRect(0, 0, w, hh);
  const r = rng(77);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(150,120,80,${0.04 + r() * 0.05})`; g.fillRect(r() * w, r() * hh, 1.5, 1.5); }
  g.lineWidth = 2; g.strokeStyle = rule; g.globalAlpha = 0.75;
  for (let y = RULE0 + RULE; y < hh - 20; y += RULE) { g.beginPath(); g.moveTo(18, y); g.lineTo(w - 18, y); g.stroke(); }
  g.globalAlpha = 0.85; g.strokeStyle = red; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(18, RULE0); g.lineTo(w - 18, RULE0); g.stroke();
  g.globalAlpha = 1;
}

/** a strip of washi tape centred at (cx, cy), w×h, rotated `rot` radians, torn short edges */
export function tape(g: G, cx: number, cy: number, w: number, hh: number, rot: number, color: string, seed: number) {
  g.save(); g.translate(cx, cy); g.rotate(rot);
  g.fillStyle = color;
  g.beginPath(); g.moveTo(-w / 2, -hh / 2); g.lineTo(w / 2, -hh / 2);
  for (let i = 0; i <= 6; i++) g.lineTo(w / 2 + (i % 2 ? 4 : -3) + wave(i, seed) * 2, -hh / 2 + (hh * i) / 6);
  g.lineTo(-w / 2, hh / 2);
  for (let i = 6; i >= 0; i--) g.lineTo(-w / 2 + (i % 2 ? -4 : 3) + wave(i, seed + 1) * 2, -hh / 2 + (hh * i) / 6);
  g.closePath(); g.fill();
  g.globalAlpha = 0.25; g.strokeStyle = '#ffffff'; g.lineWidth = 3;
  for (let x = -w / 2 + 12; x < w / 2; x += 22) { g.beginPath(); g.moveTo(x, -hh / 2 + 3); g.lineTo(x + 10, hh / 2 - 3); g.stroke(); }
  g.restore();
}
