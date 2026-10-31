// common.chart's shared pieces (chart/index.ts is the block): the params, reading the data, the plan's shapes and words, the card's
// frame, and the helpers more than one kind of chart uses.
import { clamp, eBack, textEm, type Theme } from '@tellcut/engine';
import { wave } from '../hand.ts';
import { type Pt } from '../sketch.ts';
import { emParts, nl } from '../text.ts';
import { luma, withAlpha } from '../color.ts';
import { type WordsLang } from '../words.ts';

export const CHART_KINDS = ['bars', 'pie', 'people', 'rank', 'balance', 'table', 'line'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
export type Look = 'clean' | 'hand' | 'woodcut';
export type Pen = 'marker' | 'crayon' | 'pencil' | 'ballpoint';

export interface ChartP {
  kind: ChartKind; look: Look; pen: Pen; boil: number; title: string; data: string; unit: string; hl: string; mark: 'none' | 'circle';
  compare: 'none' | 'ratio' | 'gap'; note: string; base: string; stat: string; source: string; n: number; k: number; axis: string; marks: string;
  dir: 'h' | 'v'; at: number; grow: number; card: boolean; x: number; y: number; w: number; h: number; reveal: 'down' | 'up'; tie: string;
  ink: string; paper: string; color: string; accent: string; tag: string; colors: string; font: string;
}

// ---------- data ----------
export interface Num { v: number; dec: number; group: boolean }
/** "1,200.5" → 1200.5 with its decimals and whether it was grouped; NaN when it is not a number */
export function parseNum(s: string | undefined): Num {
  const t = String(s ?? '').trim().replace(/[\s＋+]/g, '').replace(/^[−–]/, '-');
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$|^-?\.\d+$/.test(t)) return { v: NaN, dec: 0, group: false };
  return { v: Number(t.replace(/,/g, '')), dec: (t.split('.')[1] ?? '').length, group: t.includes(',') };
}
/** a number with `dec` decimals, the thousands grouped when asked; never "-0" */
export function fmtNum(v: number, dec: number, group = false): string {
  const s = Math.abs(v).toFixed(Math.max(0, Math.min(6, dec))), [i, d] = s.split('.');
  return (v < 0 && Number(s) !== 0 ? '-' : '') + (group ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : i) + (d ? `.${d}` : '');
}

export interface Row { label: string; value: number; dec: number; group: boolean; show: string; gap: boolean; cells: string[] }
const GAP = /^(⋯|…|\.\.\.|···)$/;
/** one item a line (or ;): "名稱|數值|顯示的字"; a line that is only ⋯ (or ...) is a gap in a ranking */
export function chartRows(text: string): Row[] {
  return nl(text).split(/\n|;|；/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const cells = l.split('|').map((x) => x.trim()), n = parseNum(cells[1]);
    return { label: cells[0] ?? '', value: n.v, dec: n.dec, group: n.group, show: cells[2] ?? '', gap: GAP.test(l), cells };
  });
}
/** the rows that carry a number */
export const valued = (rows: Row[]) => rows.filter((r) => !r.gap && Number.isFinite(r.value));

/** "label|1, 3, 2.5" a line → series */
export function chartSeries(text: string): Array<{ label: string; values: number[] }> {
  return chartRows(text).map((r) => ({ label: r.label, values: (r.cells[1] ?? '').split(/[,，\s]+/).map((x) => parseNum(x).v).filter(Number.isFinite) }))
    .filter((s) => s.values.length > 0);
}

/** which item is lit: '' none, 'max' / 'min', or its number counted from 1 */
export function hlIndex(spec: string, values: number[]): number {
  const s = String(spec ?? '').trim().toLowerCase();
  if (!s || !values.length) return -1;
  if (s === 'max' || s === 'min') { let b = 0; values.forEach((v, i) => { if (s === 'max' ? v > values[b] : v < values[b]) b = i; }); return b; }
  const n = Math.round(Number(s.split(/[,，]/)[0]));
  return Number.isFinite(n) && n >= 1 && n <= values.length ? n - 1 : -1;
}

/** the text with its 【marked】 number (else its first number) at `f` of its value, kept inside 【】 so it is drawn big */
export function countText(text: string, f: number): string {
  const s = String(text ?? '');
  if (!s) return '';
  const m = /【([^】]*)】/.exec(s), inner = m ? m[1] : s, at = m ? m.index : 0;
  const nm = /-?\d[\d,]*(\.\d+)?/.exec(inner);
  if (!nm) return s;
  const n = parseNum(nm[0]), shown = Number.isFinite(n.v) ? fmtNum(n.v * clamp(f), n.dec, n.group) : nm[0];
  const before = inner.slice(0, nm.index), after = inner.slice(nm.index + nm[0].length);
  if (m) return `${s.slice(0, at)}【${before}${shown}${after}】${s.slice(at + m[0].length)}`;
  return `${before}【${shown}】${after}`;
}

/** "× 6.7": how many times a is b (two figures under 10, none above); '' when b is 0 */
export function ratioText(a: number, b: number): string {
  if (!b || !Number.isFinite(a / b)) return '';
  const r = Math.abs(a / b);
  return `× ${fmtNum(r, r >= 10 ? 0 : r >= 1 ? 1 : 2)}`;
}

// ---------- layout ----------
export interface Box { x: number; y: number; w: number; h: number }
/** a piece of text: (x, y) is its left / centre / right end on the line's middle */
export interface Txt {
  id: string; text: string; x: number; y: number; size: number; align?: 'l' | 'c' | 'r'; color: string; weight?: number; a?: number; sc?: number; rot?: number;
  /** 【marked】 parts drawn `scale` × bigger in `color` */ em?: { color: string; scale: number };
  /** a tag: the text on a block of this colour */ bg?: string;
  /** an outline of this colour round the letters (words on a hatched fill) */ halo?: string;
}
export type Mk =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string; line?: string; reveal?: number; from?: 'l' | 'r' | 't' | 'b'; soft?: boolean; seed: number; dx?: number }
  | { t: 'path'; pts: Pt[]; line: string; lw: number; prog?: number; dash?: boolean; a?: number; seed: number; fill?: string }
  | { t: 'wedge'; cx: number; cy: number; r: number; a0: number; a1: number; fill: string; fp: number; seed: number }
  | { t: 'loop'; cx: number; cy: number; rx: number; ry: number; line: string; lw: number; prog: number; seed: number; /** a box loop (boxLoopPts) wobbling this many px */ box?: number }
  | { t: 'person'; x: number; y: number; s: number; fill: string; line: string; sx: number; seed: number }
  | { t: 'dot'; x: number; y: number; r: number; fill: string; line?: string; seed: number; a?: number };
export interface Plan { card: Box | null; inner: Box; texts: Txt[]; marks: Mk[]; u: number }
export interface Colors { ink: string; paper: string; color: string; accent: string; tag: string; dim: string; mute: string }

/** the estimated width of a line of text at `size` px (bold faces run a little wide); 【marked】 parts at `emScale` */
export function textW(text: string, size: number, emScale = 1): number {
  return emParts(String(text ?? '')).reduce((w, [t, em]) => w + textEm(t) * (em ? emScale : 1), 0) * size * 1.06;
}
/** the size (at most `size`) at which the text is no wider than `maxW` */
export const fitSize = (text: string, size: number, maxW: number, emScale = 1) => {
  const w = textW(text, size, emScale);
  return w > maxW && w > 0 ? Math.max(1, (size * maxW) / w) : size;
};

/** the card (and inside it: the title line, the body, the source line) on any frame shape: by default centred in the safe area */
export function chartFrame(p: Pick<ChartP, 'x' | 'y' | 'w' | 'h' | 'card' | 'title' | 'source'>, W: number, H: number, safe: Theme['safe'], bodyH = Infinity) {
  const u = Math.min(W, H) / 1080, side = safe.side * W, top = safe.top * H, bottom = (1 - safe.bottom) * H, aw = W - 2 * side, ah = bottom - top;
  const w = p.w > 0 ? p.w * W : Math.min(aw, 1100 * u), h0 = p.h > 0 ? p.h * H : Math.min(ah, w * (H > W ? 1.15 : 0.74));
  const pad = p.card ? Math.min(44 * u, Math.min(w, h0) * 0.1) : 6 * u, iw = w - 2 * pad;
  const ts = p.title ? fitSize(p.title, 60 * u, iw) : 0, ss = p.source ? fitSize(p.source, 30 * u, iw) : 0;
  const tRoom = ts ? Math.max(ts, 40 * u) * 1.7 : 0, sRoom = ss ? Math.max(ss, 22 * u) * 1.9 : 0;
  // a chart that needs less height than the card offers gets a shorter card (an explicit h stays)
  const hh = p.h > 0 ? h0 : Math.min(h0, bodyH + tRoom + sRoom + 2 * pad);
  const cx = p.x >= 0 ? p.x * W : W / 2, cy = p.y >= 0 ? p.y * H : (top + bottom) / 2;
  const card: Box = { x: cx - w / 2, y: cy - hh / 2, w, h: hh };
  const inner: Box = { x: card.x + pad, y: card.y + pad, w: iw, h: hh - 2 * pad };
  return { u, card, inner, ts, ss, body: { x: inner.x, y: inner.y + tRoom, w: inner.w, h: inner.h - tRoom - sRoom } as Box };
}

type F = ReturnType<typeof chartFrame>;
/** lang: the language of the words the chart writes by itself (people's line, the gap, the rank tag) */
export interface Env { p: ChartP; F: F; C: Colors; local: number; W: number; H: number; texts: Txt[]; marks: Mk[]; lang: WordsLang }
export const T = (e: Env, t: Txt) => { e.texts.push(t); };
export const M = (e: Env, m: Mk) => { e.marks.push(m); };
export const pop = (local: number, t0: number, d = 0.35) => (local < t0 ? 0 : eBack(clamp((local - t0) / d), 1.7));
/** of ink and paper, the one that reads on `bg` */
export const onColor = (bg: string, C: Colors) => { const [dark, light] = luminance(C.ink) < luminance(C.paper) ? [C.ink, C.paper] : [C.paper, C.ink]; return luminance(bg) > 0.55 ? dark : light; };
const luminance = (c: string) => luma(c) ?? 0.5;

/** a circled bar (mark circle on a lit bar) keeps its loop off the words: a horizontal bar's row gets this much more room between its
 *  label and the bar, a vertical bar chart this much more above its tallest bar and above its labels; the loop wobbles `wob` px */
export const circled = (p: ChartP, rows: ReturnType<typeof chartRows>) => p.mark === 'circle' && hlIndex(p.hl, valued(rows).map((r) => r.value)) >= 0;
export const circlePad = (p: ChartP, rows: ReturnType<typeof chartRows>, u: number) => (circled(p, rows) ? (p.dir === 'v' ? 34 : 24) * u : 0);
export const loopWob = (p: ChartP, u: number) => (p.look === 'hand' ? 2.5 : p.look === 'woodcut' ? 1.5 : 1) * u;

/** "數值|標籤" → the baseline */
export const baseOf = (s: string) => { const [v, l] = String(s ?? '').split('|'); const n = parseNum(v); return Number.isFinite(n.v) ? { v: n.v, label: (l ?? '').trim() } : null; };

/** a loop round a box: a superellipse (|x/rx|^8 + |y/ry|^8 = 1, a rounded rectangle) gone round `turns` times from a0, its wobble
 *  and its overrun `wob` px (not a share of its size, as handLoopPts has), so a long bar's loop hugs it as closely as a short one's */
export function boxLoopPts(cx: number, cy: number, rx: number, ry: number, seed: number, wob: number, a0 = -2.2, turns = 1.1, n = 160): Pt[] {
  const out: Pt[] = [], e = (v: number) => Math.sign(v) * Math.abs(v) ** 0.25;
  for (let i = 0; i <= n; i++) {
    const q = i / n, a = a0 + q * Math.PI * 2 * turns, d = wob * (0.6 * wave(a * 2, seed) + 1.2 * q);
    out.push([cx + e(Math.cos(a)) * (rx + d), cy + e(Math.sin(a)) * (ry + d)]);
  }
  return out;
}
/** the radii of a box loop round a box of half sizes a × b: `m` clear of each side, and wide enough that its corners stay clear too */
export function boxAround(a: number, b: number, m: number) {
  const rx = a + m, ry = b + m, s = ((a + m / 2) / rx) ** 8 + ((b + m / 2) / ry) ** 8, f = s > 1 ? s ** (1 / 8) : 1;
  return { rx: rx * f, ry: ry * f };
}
/** how far a box loop's line reaches past its radii: the wobble and overrun (1.8 × wob) and half the line */
export const boxReach = (wob: number, lw: number) => wob * 1.8 + lw / 2;

/** slice colours: the `colors` list, else the theme's accent, the series colour, the tag colour, the ink faded */
export const sliceColors = (e: Env) => { const own = String(e.p.colors ?? '').split(/[,，\s]+/).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)); return own.length ? own : [e.C.accent, e.C.color, e.C.tag, withAlpha(e.C.ink, 0.45)]; };
