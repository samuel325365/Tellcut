// common.chart — data charts drawn on a card, one block with a `kind` per chart, promoted from the shorts that each drew their own:
// bars (chili-history's fx.art bars: two hatched bars, a "× 6.7" and the data source; parenting-brain's countryGap and sleepChart:
// a gap bracket and a baseline; fd-hakka's hkStat: a big number counting up over bars that grow, the first circled), pie (fd-quotes'
// fx.pie: slices coloured in one after another, a tag under it), people (fd-hakka's hkPeople and parenting-brain's brainAge: little
// people flipping over, the first k in colour and circled, "10 人中有 4 人"), rank (parenting-brain's dayRank: a ranking with one row
// lit and tagged "第 12 名"), balance (chili's and parenting-brain's scales: weights drop into the pans and the beam tips to the heavier
// side), table (fd-caibao's fx.table: the rules drawn, the cells rising in diagonal order) and line (parenting-brain's ledgerStrip:
// one or two curves drawn along with a playhead, marks on them, a baseline).
// `look` clean draws flat shapes in the theme colours; hand draws them with the pens of sketch.ts (marker, crayon, pencil, ballpoint;
// hatched or marker-filled, boiling); woodcut is chili's ink outline, flat colour and straight hatching on parchment.
// Every word (labels, numbers counting up, titles, sources) is DOM text; the shapes are on one canvas. The picture is a pure function
// of the time, the params and the theme: chartPlan() lays it out (tested), drawMark() paints it per look.
import { clamp, cssCamel, eBack, eIO3, eOut3, h, prog, textEm, type ItemType, type Theme } from '@tellcut/engine';
import { canvasAt, spline, freeCanvas } from './inkline.ts';
import { HAND, wave } from './hand.ts';
import {
  cutPath, ellipsePts, grainBegin, grainEnd, hash, hatchFill, inkStroke, inkStrokes, loopPts, markerStroke, quadPts, rectSides, rrectPts,
  type GrainLayer, type PenStyle, type Pt,
} from './sketch.ts';
import { emParts, nl } from './text.ts';
import { luma, withAlpha } from './color.ts';

export const CHART_KINDS = ['bars', 'pie', 'people', 'rank', 'balance', 'table', 'line'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
type Look = 'clean' | 'hand' | 'woodcut';
type Pen = 'marker' | 'crayon' | 'pencil' | 'ballpoint';

export interface ChartP {
  kind: ChartKind; look: Look; pen: Pen; boil: number; title: string; data: string; unit: string; hl: string; mark: 'none' | 'circle';
  compare: 'none' | 'ratio' | 'gap'; note: string; base: string; stat: string; source: string; n: number; k: number; axis: string; marks: string;
  dir: 'h' | 'v'; at: number; grow: number; card: boolean; x: number; y: number; w: number; h: number;
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
const valued = (rows: Row[]) => rows.filter((r) => !r.gap && Number.isFinite(r.value));

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
type Mk =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string; line?: string; reveal?: number; from?: 'l' | 'r' | 't' | 'b'; soft?: boolean; seed: number; dx?: number }
  | { t: 'path'; pts: Pt[]; line: string; lw: number; prog?: number; dash?: boolean; a?: number; seed: number; fill?: string }
  | { t: 'wedge'; cx: number; cy: number; r: number; a0: number; a1: number; fill: string; fp: number; seed: number }
  | { t: 'loop'; cx: number; cy: number; rx: number; ry: number; line: string; lw: number; prog: number; seed: number; /** a box loop (boxLoopPts) wobbling this many px */ box?: number }
  | { t: 'person'; x: number; y: number; s: number; fill: string; line: string; sx: number; seed: number }
  | { t: 'dot'; x: number; y: number; r: number; fill: string; line?: string; seed: number; a?: number };
export interface Plan { card: Box | null; inner: Box; texts: Txt[]; marks: Mk[]; u: number }
interface Colors { ink: string; paper: string; color: string; accent: string; tag: string; dim: string; mute: string }

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
interface Env { p: ChartP; F: F; C: Colors; local: number; W: number; H: number; texts: Txt[]; marks: Mk[] }
const T = (e: Env, t: Txt) => { e.texts.push(t); };
const M = (e: Env, m: Mk) => { e.marks.push(m); };
const pop = (local: number, t0: number, d = 0.35) => (local < t0 ? 0 : eBack(clamp((local - t0) / d), 1.7));
/** of ink and paper, the one that reads on `bg` */
const onColor = (bg: string, C: Colors) => { const [dark, light] = luminance(C.ink) < luminance(C.paper) ? [C.ink, C.paper] : [C.paper, C.ink]; return luminance(bg) > 0.55 ? dark : light; };
const luminance = (c: string) => luma(c) ?? 0.5;

/** The whole picture at `local`: the card, the shapes, the words. Pure: the same params, frame and time give the same plan. */
export function chartPlan(p: ChartP, W: number, H: number, theme: Theme, local: number): Plan {
  const C: Colors = { ink: p.ink, paper: p.paper, color: p.color, accent: p.accent, tag: p.tag, dim: withAlpha(p.ink, 0.62), mute: withAlpha(p.ink, 0.22) };
  const F0 = chartFrame(p, W, H, theme.safe), F = chartFrame(p, W, H, theme.safe, naturalBody({ p, F: F0, C, local, W, H, texts: [], marks: [] })), u = F.u;
  const e: Env = { p, F, C, local, W, H, texts: [], marks: [] };
  if (p.title) T(e, { id: 'title', text: p.title, x: F.inner.x + F.inner.w / 2, y: F.inner.y + Math.max(F.ts, 40 * u) * 0.62, size: F.ts, align: 'c', color: p.ink, weight: 900, a: clamp((local - 0.05) / 0.3) });
  ({ bars: planBars, pie: planPie, people: planPeople, rank: planRank, balance: planBalance, table: planTable, line: planLine } as Record<ChartKind, (e: Env) => void>)[CHART_KINDS.includes(p.kind) ? p.kind : 'bars'](e);
  if (p.source) T(e, { id: 'source', text: p.source, x: F.inner.x + F.inner.w, y: F.inner.y + F.inner.h - Math.max(F.ss, 22 * u) * 0.55, size: F.ss, align: 'r', color: C.dim, weight: 500, a: clamp((local - p.at - 0.2) / 0.4) });
  return { card: p.card ? F.card : null, inner: F.inner, texts: e.texts, marks: e.marks, u };
}

/** the body height a kind looks best at for the card's width (the card is cut down to it when the frame has more room) */
export function naturalBody(e: Env): number {
  const { p, F } = e, u = F.u, b = F.body, kind = CHART_KINDS.includes(p.kind) ? p.kind : 'bars', rows = chartRows(p.data);
  const statH = p.stat ? fitSize(p.stat, 100 * u, b.w, 1.7) * 1.7 * 1.25 : 0;
  switch (kind) {
    case 'bars': return p.dir === 'v' ? Math.max(b.w * 0.8, 420 * u + statH) : statH + valued(rows).length * (220 * u + circlePad(p, rows, u)) + 40 * u + (baseOf(p.base)?.label ? 50 * u : 0);
    case 'pie': return Math.min(b.w, 760 * u) * 1.02 + (p.note ? 120 * u : 0);
    case 'people': {
      const n = clamp(Math.round(p.n), 1, 200), stat = p.stat || `${n} 人中有 【${n}】 人`, room = fitSize(stat, 84 * u, b.w, 1.5) * 1.5 * 1.45;
      const G = peopleGrid(n, b.w, b.w * 2);
      return G.rows * Math.min(G.cell, 200 * u) * 1.15 + room;
    }
    case 'rank': return rows.length * 100 * u;
    case 'balance': { const S = b.w / 3.1; return (p.note ? 100 * u : 0) + S * 0.28 + Math.max(S * 1.3, S * 1.12 + 130 * u) + 20 * u; }
    case 'table': { const cells = tableCells(p.data), Cn = Math.max(1, ...cells.map((r) => r.length)), em = Array.from({ length: Cn }, (_, c) => Math.max(1.5, ...cells.map((r) => textEm(r[c] ?? ''))) + 1.2);
      return cells.length * Math.min(46 * u, (b.w / em.reduce((a, x) => a + x, 0)) * 0.95) * 2.5 + 40 * u; }
    default: return b.w * 0.8;
  }
}

/** a circled bar (mark circle on a lit bar) keeps its loop off the words: a horizontal bar's row gets this much more room between its
 *  label and the bar, a vertical bar chart this much more above its tallest bar and above its labels; the loop wobbles `wob` px */
const circled = (p: ChartP, rows: ReturnType<typeof chartRows>) => p.mark === 'circle' && hlIndex(p.hl, valued(rows).map((r) => r.value)) >= 0;
const circlePad = (p: ChartP, rows: ReturnType<typeof chartRows>, u: number) => (circled(p, rows) ? (p.dir === 'v' ? 34 : 24) * u : 0);
const loopWob = (p: ChartP, u: number) => (p.look === 'hand' ? 2.5 : p.look === 'woodcut' ? 1.5 : 1) * u;

/** the stat line (a number counting up, drawn big in the accent colour) at the top of the body; returns its height */
function statLine(e: Env, text: string, y: number, maxSize: number, t0: number, dur: number): number {
  const { F, C, local } = e, b = F.body, size = fitSize(text, maxSize, b.w, 1.7), f = eOut3(prog(local, t0, t0 + dur)), land = prog(local, t0 + dur, t0 + dur + 0.25);
  T(e, { id: 'stat', text: countText(text, f), x: b.x + b.w / 2, y: y + size * 1.7 * 0.5, size, align: 'c', color: C.ink, weight: 900, em: { color: C.accent, scale: 1.7 },
    a: clamp((local - t0) / 0.15), sc: 1 + 0.06 * Math.sin(Math.PI * land) });
  return size * 1.7 * 1.25;
}

/** "數值|標籤" → the baseline */
const baseOf = (s: string) => { const [v, l] = String(s ?? '').split('|'); const n = parseNum(v); return Number.isFinite(n.v) ? { v: n.v, label: (l ?? '').trim() } : null; };

function planBars(e: Env) {
  const { p, F, C, local } = e, u = F.u, rows = valued(chartRows(p.data)), n = rows.length, b = F.body;
  if (!n) return;
  const vals = rows.map((r) => r.value), base = baseOf(p.base), dec = Math.max(0, ...rows.map((r) => r.dec)), group = rows.some((r) => r.group);
  const hi = Math.max(0, ...vals, base?.v ?? 0), lo = Math.min(0, ...vals, base?.v ?? 0), span = hi - lo || 1;
  const step = Math.min(0.15, 0.6 / n), grow = Math.max(0.1, p.grow), ih = hlIndex(p.hl, vals);
  const final = (i: number) => rows[i].show || `${fmtNum(vals[i], dec, group)}${p.unit}`;
  const shown = (i: number, f: number) => (rows[i].show ? (f >= 1 ? rows[i].show : fmtNum(vals[i] * f, dec, group) + p.unit) : `${fmtNum(vals[i] * f, dec, group)}${p.unit}`);
  const fOf = (i: number) => eIO3(prog(local, p.at + i * step, p.at + i * step + grow));
  const tEnd = p.at + grow + (n - 1) * step + 0.05;
  const statH = p.stat ? statLine(e, p.stat, b.y, 100 * u, p.at, grow + 0.3) : 0;
  // which two bars a ratio or a gap compares: the lit one (else the biggest) and the first other one
  const ia = ih >= 0 ? ih : hlIndex('max', vals), ib = n > 1 ? (ia === 0 ? 1 : 0) : -1;
  const cmp = p.compare !== 'none' && ib >= 0 ? p.compare : 'none';
  const noteText = cmp === 'ratio' ? p.note || ratioText(vals[ia], vals[ib]) : cmp === 'gap' ? p.note || `差 ${fmtNum(Math.abs(vals[ia] - vals[ib]), dec, group)}${p.unit}` : p.note;
  const colorOf = (i: number) => (i === ih ? C.accent : C.color);
  if (p.dir === 'v') {
    const noteW = noteText ? b.w * 0.28 : base?.label ? Math.min(b.w * 0.26, textW(base.label, 40 * u) + 24 * u) : 0, plotX = b.x, plotW = b.w - noteW, colW = plotW / n, bw = Math.min(colW * 0.56, 180 * u);
    const ls = Math.min(46 * u, ...rows.map((r) => fitSize(r.label, 46 * u, colW * 0.94))), vs = Math.min(46 * u, ...rows.map((_, i) => fitSize(final(i), 46 * u, colW * 0.98)));
    const labelH = ls * 1.6, valueH = vs * 1.5, neg = lo < 0;
    const pad = circlePad(p, rows, u), top = b.y + statH + valueH + pad, bot = b.y + b.h - labelH - (neg ? valueH : 0) - pad, Y = (v: number) => bot - ((v - lo) / span) * (bot - top), y0 = Y(0);
    // circled: a box loop round the lit bar alone (clear of the label under it: the room `pad` made), its number moved out past the loop
    const loop = pad ? boxAround(bw / 2, Math.abs(Y(vals[ih]) - y0) / 2, 14 * u) : null;
    const valOff = (i: number) => (loop && i === ih ? loop.ry - Math.abs(Y(vals[ih]) - y0) / 2 + boxReach(loopWob(p, u), 6 * u) + 6 * u + vs * 0.6 : vs * 0.8);
    M(e, { t: 'path', pts: [[plotX, y0], [plotX + plotW, y0]], line: C.ink, lw: 3 * u, prog: eOut3(prog(local, p.at - 0.25, p.at + 0.2)), seed: 3 });
    if (base) {
      const yb = Y(base.v);
      M(e, { t: 'path', pts: [[plotX, yb], [plotX + plotW, yb]], line: C.ink, lw: 3 * u, dash: true, a: 0.8, prog: eOut3(prog(local, p.at - 0.1, p.at + 0.4)), seed: 5 });
      if (base.label) T(e, { id: 'base', text: base.label, x: plotX + plotW + 12 * u, y: noteText ? yb - ls * 0.75 : yb, size: fitSize(base.label, ls * 0.9, noteText ? plotW * 0.5 : noteW - 14 * u), align: noteText ? 'r' : 'l', color: C.dim, weight: 500, a: clamp((local - p.at - 0.2) / 0.3) });
    }
    rows.forEach((r, i) => {
      const cx = plotX + colW * (i + 0.5), y1 = Y(vals[i]), f = fOf(i);
      M(e, { t: 'rect', x: cx - bw / 2, y: Math.min(y0, y1), w: bw, h: Math.abs(y1 - y0), fill: colorOf(i), line: C.ink, reveal: f, from: vals[i] >= 0 ? 'b' : 't', seed: 11 + i * 7 });
      T(e, { id: `l${i}`, text: r.label, x: cx, y: b.y + b.h - labelH * 0.5, size: ls, align: 'c', color: i === ih ? C.accent : C.ink, weight: i === ih ? 900 : 700, a: clamp((local - p.at + 0.2 - i * step * 0.5) / 0.25) });
      const vy = y0 + (y1 - y0) * f + (vals[i] >= 0 ? -1 : 1) * valOff(i);
      T(e, { id: `v${i}`, text: shown(i, f), x: cx, y: vy, size: vs, align: 'c', color: i === ih ? C.accent : C.ink, weight: 900, a: clamp(f * 5) });
    });
    if (cmp !== 'none') {
      const xa = plotX + colW * (ia + 0.5), xb = plotX + colW * (ib + 0.5), ya = Y(vals[ia]), yb = Y(vals[ib]), bx = plotX + plotW + 14 * u;
      if (cmp === 'gap') {
        // the other bar's leg runs over the lit column when that bar is to its left; a circled bar's number, moved up past its loop,
        // can sit on that leg, so the leg breaks round it
        const pg = eOut3(prog(local, tEnd - 0.1, tEnd + 0.35)), tw = textW(final(ia), vs) / 2 + 8 * u, vy = ya + (vals[ia] >= 0 ? -1 : 1) * valOff(ia);
        const cut = loop && ia === ih && xb < xa && Math.abs(yb - vy) < vs * 0.6 + 6 * u;
        M(e, { t: 'path', pts: [[xa + bw / 2 + 6 * u, ya], [bx, ya], [bx, yb], [cut ? xa + tw : xb + bw / 2 + 6 * u, yb]], line: C.accent, lw: 4.5 * u, prog: pg, seed: 21 });
        if (cut && xa - tw > xb + bw / 2 + 6 * u) M(e, { t: 'path', pts: [[xa - tw, yb], [xb + bw / 2 + 6 * u, yb]], line: C.accent, lw: 4.5 * u, prog: pg, seed: 22 });
      }
      const size = fitSize(noteText, 76 * u, noteW - 32 * u);
      T(e, { id: 'note', text: noteText, x: bx + 18 * u, y: (ya + yb) / 2, size, align: 'l', color: C.accent, weight: 900, a: clamp((local - tEnd) / 0.1), sc: pop(local, tEnd) });
    } else if (noteText && ih >= 0) {
      T(e, { id: 'note', text: noteText, x: plotX + plotW + 18 * u, y: Y(vals[ih]), size: fitSize(noteText, 64 * u, noteW - 24 * u), align: 'l', color: C.accent, weight: 900, a: clamp((local - tEnd) / 0.1), sc: pop(local, tEnd) });
    }
    if (loop) M(e, { t: 'loop', cx: plotX + colW * (ih + 0.5), cy: (Y(vals[ih]) + y0) / 2, rx: loop.rx, ry: loop.ry, box: loopWob(p, u), line: C.accent, lw: 6 * u, prog: eOut3(prog(local, tEnd + 0.1, tEnd + 0.6)), seed: 31 });
    return;
  }
  // horizontal: a label line over each bar, the number at the bar's end
  // circled: every row `pad` taller (between its label and its bar), the bar thin enough to leave the loop room under it, and `ext`
  // kept at the right for the lit bar's number, which moves out past the loop
  const circ = circled(p, rows), pad = circlePad(p, rows, u), ext = circ ? 44 * u : 0;
  const baseRoom = base?.label ? 50 * u : 0, rowsH = b.h - statH - baseRoom, rowH = Math.min(rowsH / n, 230 * u + pad), y0 = b.y + statH + (rowsH - rowH * n) / 2, rh = rowH - pad;
  const ls = Math.min(46 * u, rh * 0.28), bt = Math.max(4 * u, Math.min(rh * 0.42, 100 * u, circ ? rh - 1.25 * ls - 34 * u : Infinity)), vs0 = Math.min(46 * u, bt * 0.72);
  const valW = Math.max(...rows.map((_, i) => textW(final(i), vs0))) + 20 * u, neg = lo < 0;
  const vs = valW > b.w * 0.45 ? vs0 * ((b.w * 0.45) / valW) : vs0, vW = Math.min(valW, b.w * 0.45 + 20 * u);
  const plotX = b.x + (neg ? vW + ext : 0), plotW = b.w - vW - ext - (neg ? vW + ext : 0), X = (v: number) => plotX + ((v - lo) / span) * plotW, x0 = X(0);
  const barY = (i: number) => y0 + i * rowH + ls * 1.35 + pad;
  // the loop round the lit bar (a box loop hugging it) and how far past the bar's end its number then sits
  const loop = circ ? boxAround(Math.abs(X(vals[ih]) - x0) / 2, bt / 2, 14 * u) : null;
  const valOff = (i: number) => (loop && i === ih ? loop.rx - Math.abs(X(vals[ih]) - x0) / 2 + boxReach(loopWob(p, u), 6 * u) + 12 * u : 14 * u);
  rows.forEach((r, i) => {
    const x1 = X(vals[i]), f = fOf(i), by = barY(i);
    M(e, { t: 'rect', x: Math.min(x0, x1), y: by, w: Math.abs(x1 - x0), h: bt, fill: colorOf(i), line: C.ink, reveal: f, from: vals[i] >= 0 ? 'l' : 'r', seed: 11 + i * 7 });
    T(e, { id: `l${i}`, text: r.label, x: b.x, y: y0 + i * rowH + ls * 0.6, size: fitSize(r.label, ls, b.w), align: 'l', color: i === ih ? C.accent : C.ink, weight: i === ih ? 900 : 700, a: clamp((local - p.at + 0.2 - i * step * 0.5) / 0.25) });
    const end = x0 + (x1 - x0) * f, pos = vals[i] >= 0;
    T(e, { id: `v${i}`, text: shown(i, f), x: end + (pos ? 1 : -1) * valOff(i), y: by + bt / 2, size: vs, align: pos ? 'l' : 'r', color: i === ih ? C.accent : C.ink, weight: 900, a: clamp(f * 5) });
  });
  if (neg || base) M(e, { t: 'path', pts: [[x0, y0 + ls * 1.1], [x0, y0 + (n - 1) * rowH + ls * 1.35 + bt + 10 * u]], line: C.ink, lw: 3 * u, prog: eOut3(prog(local, p.at - 0.25, p.at + 0.2)), seed: 3 });
  if (base) {
    const xb = X(base.v), yTop = y0 + ls * 1.1, yBot = y0 + (n - 1) * rowH + ls * 1.35 + bt + 12 * u;
    M(e, { t: 'path', pts: [[xb, yTop], [xb, yBot]], line: C.ink, lw: 3 * u, dash: true, a: 0.8, prog: eOut3(prog(local, p.at - 0.1, p.at + 0.4)), seed: 5 });
    if (base.label) { const s = fitSize(base.label, 40 * u, b.w * 0.6), w = textW(base.label, s); T(e, { id: 'base', text: base.label, x: clamp(xb, b.x + w / 2, b.x + b.w - w / 2), y: yBot + s * 0.9, size: s, align: 'c', color: C.dim, weight: 500, a: clamp((local - p.at - 0.2) / 0.3) }); }
  }
  // the note: right of the shorter bar's number if there is room, else over the longer bar at the right
  const anchor = cmp !== 'none' ? (Math.abs(vals[ia]) <= Math.abs(vals[ib]) ? ia : ib) : ih;
  if (noteText && anchor >= 0) {
    if (cmp === 'gap') {
      const other = anchor === ia ? ib : ia, xs = X(vals[anchor]), xl = X(vals[other]), yL = barY(other) - 12 * u, ys = barY(anchor);
      const pg = eOut3(prog(local, tEnd - 0.1, tEnd + 0.35));
      M(e, { t: 'path', pts: [[xs, Math.min(ys, yL)], [xs, Math.max(ys + bt, yL + 12 * u + bt)]], line: C.accent, lw: 3 * u, dash: true, prog: pg, seed: 23 });
      M(e, { t: 'path', pts: [[xs, yL + 10 * u], [xs, yL], [xl, yL], [xl, yL + 10 * u]], line: C.accent, lw: 4.5 * u, prog: pg, seed: 21 });
    }
    const nx = X(vals[anchor]) + valOff(anchor) + textW(final(anchor), vs) + 30 * u, room = b.x + b.w - nx, big = fitSize(noteText, 84 * u, room);
    const side = big >= 34 * u, size = side ? big : fitSize(noteText, 60 * u, b.w * 0.5);
    const other = cmp !== 'none' ? (anchor === ia ? ib : ia) : anchor;
    T(e, { id: 'note', text: noteText, x: side ? nx : b.x + b.w, y: side ? barY(anchor) + bt / 2 : y0 + other * rowH + ls * 0.6, size, align: side ? 'l' : 'r', color: C.accent, weight: 900,
      a: clamp((local - tEnd) / 0.1), sc: pop(local, tEnd), rot: side ? -3 : 0 });
  }
  if (loop) M(e, { t: 'loop', cx: (x0 + X(vals[ih])) / 2, cy: barY(ih) + bt / 2, rx: loop.rx, ry: loop.ry, box: loopWob(p, u), line: C.accent, lw: 6 * u, prog: eOut3(prog(local, tEnd + 0.1, tEnd + 0.6)), seed: 31 });
}

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
const sliceColors = (e: Env) => { const own = String(e.p.colors ?? '').split(/[,，\s]+/).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)); return own.length ? own : [e.C.accent, e.C.color, e.C.tag, withAlpha(e.C.ink, 0.45)]; };

function planPie(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, rows = valued(chartRows(p.data)), n = rows.length;
  const vals = rows.map((r) => Math.max(0, r.value)), sum = vals.reduce((a, v) => a + v, 0), fr = vals.map((v) => (sum > 0 ? v / sum : 0)), cols = sliceColors(e);
  const ls = 44 * u, ih = hlIndex(p.hl, vals), pct = (f: number) => `${fmtNum(f * 100, f > 0 && f < 0.1 ? 1 : 0)}%`;
  const noteRoom = p.note ? 120 * u : 0, small = fr.map((f) => f > 0 && f < 0.1 && n > 1);
  const outW = small.some(Boolean) ? Math.max(...rows.map((r, i) => (small[i] ? textW(`${r.label} ${pct(fr[i])}`, ls * 0.85) : 0))) + 30 * u : 0;
  const rIn = Math.min(b.w / 2, (b.h - noteRoom) / 2) * 0.94, r = Math.max(rIn * 0.62, Math.min(rIn, (b.w / 2 - outW) / 1.1, (b.h - noteRoom) / 2 - (outW ? ls : 0)));
  const cx = b.x + b.w / 2, cy = b.y + (b.h - noteRoom) / 2;
  const fs = Math.min(0.4, 1.3 / Math.max(1, n)), tEnd = p.at + 0.25 + (n - 1) * fs + 0.5;
  M(e, { t: 'path', pts: ellipsePts(cx, cy, r, r, { turns: 1.03, n: 72 }), line: e.p.look === 'clean' ? C.mute : C.ink, lw: (e.p.look === 'clean' ? 3 : 5) * u, prog: eOut3(prog(local, p.at - 0.25, p.at + 0.25)), seed: 41 });
  let a = -Math.PI / 2;
  rows.forEach((row, i) => {
    const a0 = a, a1 = a + fr[i] * Math.PI * 2, mid = (a0 + a1) / 2, t0 = p.at + 0.25 + i * fs, fp = eOut3(prog(local, t0, t0 + 0.5));
    a = a1;
    if (fr[i] <= 0) return;
    const off = i === ih ? 0.07 * r * eOut3(prog(local, tEnd, tEnd + 0.3)) : 0, ox = cx + Math.cos(mid) * off, oy = cy + Math.sin(mid) * off, fill = cols[i % cols.length];
    M(e, { t: 'wedge', cx: ox, cy: oy, r, a0, a1, fill, fp, seed: 51 + i * 5 });
    if (n > 1) {
      const arc = ellipsePts(ox, oy, r, r, { a0, turns: (a1 - a0) / (Math.PI * 2), n: Math.max(4, Math.ceil((a1 - a0) * 12)) });
      M(e, { t: 'path', pts: [[ox, oy], ...arc, [ox, oy]], line: e.p.look === 'clean' ? C.paper : C.ink, lw: (e.p.look === 'clean' ? 4 : 4.5) * u, prog: eOut3(prog(local, t0 - 0.1, t0 + 0.3)), seed: 61 + i * 3 });
    }
    const la = clamp((fp - 0.3) / 0.4), lit = i === ih;
    if (small[i]) {
      const right = Math.cos(mid) >= 0, rr = r * 1.12, tx = ox + Math.cos(mid) * rr, ty = oy + Math.sin(mid) * rr;
      const text = `${row.label} ${row.show || pct(fr[i])}`, x = tx + (right ? 8 : -8) * u, room = right ? b.x + b.w - x : x - b.x;
      T(e, { id: `l${i}`, text, x, y: ty, size: fitSize(text, ls * 0.85, room), align: right ? 'l' : 'r', color: lit ? C.accent : C.ink, weight: 700, a: la });
      return;
    }
    const lr = n === 1 ? 0 : r * 0.6, tx = ox + Math.cos(mid) * lr, ty = oy + Math.sin(mid) * lr, chord = n === 1 ? r * 1.6 : Math.min(r * 0.9, 2 * lr * Math.sin(Math.min(Math.PI / 2, (a1 - a0) / 2)) + r * 0.2);
    // on a hatched slice the words get a halo of the paper; on a flat one, whichever of ink and paper reads
    const hand = e.p.look === 'hand', ink = hand ? C.ink : onColor(fill, C), halo = hand ? C.paper : undefined;
    T(e, { id: `l${i}`, text: row.label, x: tx, y: ty - ls * 0.42, size: fitSize(row.label, ls * (lit ? 1.15 : 1), chord), align: 'c', color: ink, weight: 900, a: la, halo });
    T(e, { id: `p${i}`, text: row.show || pct(fr[i]), x: tx, y: ty + ls * 0.62, size: fitSize(row.show || pct(fr[i]), ls * 0.82, chord), align: 'c', color: ink, weight: 700, a: la, halo });
  });
  if (p.note) {
    const size = fitSize(p.note, 56 * u, b.w - 40 * u);
    T(e, { id: 'note', text: p.note, x: cx, y: b.y + b.h - noteRoom * 0.42, size, align: 'c', color: onColor(C.tag, C), weight: 900, bg: C.tag, a: clamp((local - tEnd) / 0.1), sc: 1.4 - 0.4 * pop(local, tEnd, 0.3), rot: -2 });
  }
}

/** the best grid for n cells in a w × h box (the cell as large as it can be; a cell is 1.15 times as tall as wide) */
export function peopleGrid(n: number, w: number, hh: number): { cols: number; rows: number; cell: number } {
  const all = Array.from({ length: n }, (_, i) => { const cols = i + 1, rows = Math.ceil(n / cols); return { cols, rows, cell: Math.min(w / cols, hh / rows / 1.15) }; });
  const top = Math.max(...all.map((g) => g.cell));
  // full rows (10 as 5 × 2, not 4 + 4 + 2) when that costs at most 15 % of the size
  return all.find((g) => n % g.cols === 0 && g.cell >= top * 0.85 - 1e-9 && g.cols > 1 === n > 1) ?? all.find((g) => g.cell >= top - 1e-9)!;
}

function planPeople(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, n = clamp(Math.round(p.n), 1, 200), k = clamp(Math.round(p.k), 0, n);
  const stat = p.stat || `${n} 人中有 【${k}】 人`, statSize = fitSize(stat, 84 * u, b.w, 1.5), statRoom = statSize * 1.5 * 1.45;
  const G = peopleGrid(n, b.w, b.h - statRoom), gw = G.cols * G.cell, gh = G.rows * G.cell * 1.15, gx = b.x + (b.w - gw) / 2, gy = b.y + (b.h - statRoom - gh) / 2;
  const fs = Math.min(0.2, 1.3 / n), tEnd = p.at + (n - 1) * fs + 0.3;
  const at = (i: number) => [gx + G.cell * ((i % G.cols) + 0.5), gy + G.cell * 1.15 * (Math.floor(i / G.cols) + 0.5)] as const;
  for (let i = 0; i < n; i++) {
    const t0 = p.at + i * fs, fp = prog(local, t0, t0 + 0.22), [x, y] = at(i), after = fp > 0.5;
    M(e, { t: 'person', x, y, s: G.cell * 0.92, fill: after ? (i < k ? C.accent : C.mute) : C.paper, line: C.ink, sx: Math.max(0.05, Math.abs(Math.cos(fp * Math.PI))), seed: 71 + i * 3 });
  }
  if (p.mark === 'circle' && k > 0 && k < n) {
    const last = Math.min(k, n) - 1, rowsK = Math.floor(last / G.cols) + 1, colsK = rowsK > 1 ? G.cols : last + 1;
    const x0 = gx, x1 = gx + colsK * G.cell, y0 = gy, y1 = gy + rowsK * G.cell * 1.15;
    M(e, { t: 'loop', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2 + G.cell * 0.18, ry: (y1 - y0) / 2 + G.cell * 0.14, line: C.accent, lw: 6 * u, prog: eOut3(prog(local, tEnd, tEnd + 0.5)), seed: 33 });
  }
  const t1 = tEnd + 0.1, f = eOut3(prog(local, t1, t1 + 0.4));
  T(e, { id: 'stat', text: countText(stat, f), x: b.x + b.w / 2, y: b.y + b.h - statRoom * 0.5, size: statSize, align: 'c', color: C.ink, weight: 900, em: { color: C.accent, scale: 1.5 },
    a: clamp((local - t1) / 0.12), sc: 1.25 - 0.25 * pop(local, t1, 0.3) });
}

/** each ranking row's rank: counted on from 1, a third field resets the count ("照顧孩子|3.86|12"), a gap row has none */
export function ranks(rows: Row[]): number[] {
  let k = 1;
  return rows.map((r) => { if (r.gap) return 0; const own = parseNum(r.show).v; if (Number.isInteger(own)) k = own; return k++; });
}

function planRank(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, rows = chartRows(p.data).filter((r) => r.gap || r.label), m = rows.length;
  if (!m) return;
  const rk = ranks(rows), hasV = rows.some((r) => !r.gap && Number.isFinite(r.value)), dec = Math.max(0, ...rows.map((r) => r.dec)), group = rows.some((r) => r.group);
  const rowH = Math.min(b.h / m, 118 * u), y0 = b.y + (b.h - rowH * m) / 2, ls = Math.min(44 * u, rowH * 0.46), br = Math.min(rowH * 0.36, 30 * u);
  const hlRow = (() => { const s = String(p.hl ?? '').trim(); if (s === 'max' || s === 'min') { const vi = hlIndex(s, rows.map((r) => (r.gap || !Number.isFinite(r.value) ? (s === 'max' ? -Infinity : Infinity) : r.value))); return vi; } return hlIndex(s, rows.map(() => 0)); })();
  const vals = rows.map((r) => r.value), fin = vals.filter(Number.isFinite), hi = Math.max(...fin, 0), mn = Math.min(...fin, hi);
  const lo = mn >= 0 && hi > 0 && mn / hi < 0.5 ? 0 : hi === mn ? mn - 1 : mn - (hi - mn) * 0.35;
  const labelX = b.x + 2 * br + 18 * u, valStr = (i: number, f: number) => `${fmtNum(vals[i] * f, dec, group)}${p.unit}`;
  const valW = hasV ? Math.max(...rows.map((r, i) => (Number.isFinite(vals[i]) ? textW(valStr(i, 1), ls) : 0))) + 18 * u : 0;
  const labelW = Math.min(Math.max(...rows.map((r) => (r.gap ? 0 : textW(r.label, ls)))), (b.w - 2 * br - 18 * u) * (hasV ? 0.42 : 1));
  const barX = labelX + labelW + 20 * u, barW = Math.max(0, b.x + b.w - valW - barX), bt = rowH * 0.5;
  const step = Math.min(0.12, 1 / m), tEnd = p.at + (m - 1) * step + 0.7;
  rows.forEach((r, i) => {
    const t0 = p.at + i * step, a = eOut3(prog(local, t0, t0 + 0.35)), dx = -(1 - a) * 60 * u, cy = y0 + rowH * (i + 0.5), lit = i === hlRow;
    if (r.gap) { T(e, { id: `l${i}`, text: '⋯', x: labelX + labelW / 2 + dx, y: cy, size: ls, align: 'c', color: C.dim, weight: 700, a }); return; }
    M(e, { t: 'dot', x: b.x + br + dx, y: cy, r: br, fill: lit ? C.accent : C.color, seed: 81 + i, a });
    T(e, { id: `n${i}`, text: String(rk[i]), x: b.x + br + dx, y: cy, size: fitSize(String(rk[i]), br * 1.15, br * 1.7), align: 'c', color: onColor(lit ? C.accent : C.color, C), weight: 900, a });
    T(e, { id: `l${i}`, text: r.label, x: labelX + dx, y: cy, size: fitSize(r.label, ls, labelW), align: 'l', color: lit ? C.accent : C.ink, weight: lit ? 900 : 700, a });
    if (!Number.isFinite(vals[i])) return;
    const f = eOut3(prog(local, t0 + 0.1, t0 + 0.7)), len = Math.max(2 * u, ((vals[i] - lo) / (hi - lo || 1)) * barW);
    M(e, { t: 'rect', x: barX, y: cy - bt / 2, w: len, h: bt, fill: lit ? C.accent : withAlpha(C.color, 0.55), reveal: f * a, from: 'l', seed: 91 + i * 7, dx });
    T(e, { id: `v${i}`, text: valStr(i, f), x: barX + len * f + 12 * u + dx, y: cy, size: ls * 0.9, align: 'l', color: lit ? C.accent : C.dim, weight: 900, a: clamp(f * 5) });
  });
  if (hlRow >= 0 && !rows[hlRow].gap) {
    const note = p.note || `第 ${rk[hlRow]} 名`, cy = y0 + rowH * (hlRow + 0.5), size = fitSize(note, Math.min(54 * u, rowH * 0.62), b.w * 0.42);
    const tw = textW(note, size) + size * 0.9, endX = Number.isFinite(vals[hlRow]) ? barX + ((vals[hlRow] - lo) / (hi - lo || 1)) * barW + valW + 24 * u : labelX + textW(rows[hlRow].label, ls) + 30 * u;
    T(e, { id: 'note', text: note, x: Math.min(endX + tw / 2, b.x + b.w - tw / 2), y: cy, size, align: 'c', color: onColor(C.tag, C), weight: 900, bg: C.tag, a: clamp((local - tEnd) / 0.1), sc: pop(local, tEnd), rot: -3 });
    if (p.mark === 'circle') M(e, { t: 'loop', cx: labelX + labelW / 2 - 10 * u, cy, rx: labelW / 2 + br + 30 * u, ry: rowH * 0.62, line: C.accent, lw: 5 * u, prog: eOut3(prog(local, tEnd + 0.1, tEnd + 0.5)), seed: 35 });
  }
}

/** how many blocks each pan gets: the numbers themselves when they are small whole numbers, else up to 5 by share */
export function blockCounts(a: number, b: number): [number, number] {
  const va = Math.max(0, a), vb = Math.max(0, b), mx = Math.max(va, vb);
  if (mx <= 0) return [0, 0];
  if (Number.isInteger(va) && Number.isInteger(vb) && mx <= 8) return [va, vb];
  const k = (v: number) => (v > 0 ? Math.max(1, Math.round((v / mx) * 5)) : 0);
  return [k(va), k(vb)];
}
/** the beam's angle (radians, + = the right side down) for weights a and b, t s after the weights are in: it swings and settles */
export function tipAngle(a: number, b: number, t: number): number {
  const va = Math.max(0, a), vb = Math.max(0, b), target = clamp(((vb - va) / (va + vb || 1)) * 0.6, -0.26, 0.26);
  return t <= 0 ? 0 : target * (1 - Math.exp(-3 * t) * Math.cos(7 * t));
}

function planBalance(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, rows = valued(chartRows(p.data)).slice(0, 2);
  while (rows.length < 2) rows.push({ label: '', value: 0, dec: 0, group: false, show: '', gap: false, cells: [] });
  const [A, B] = rows, [na, nb] = blockCounts(A.value, B.value), noteRoom = p.note ? 100 * u : 0;
  const S = Math.min(b.w / 3.1, (b.h - noteRoom) / 2.05), cx = b.x + b.w / 2, py = b.y + noteRoom + S * 0.28, L = S, pw = S * 0.5, hang = S * 0.66, sag = S * 0.16;
  const draw = eOut3(prog(local, p.at - 0.3, p.at + 0.2)), tS = p.at + Math.max(na, nb) * 0.08 + 0.4, ang = tipAngle(A.value, B.value, local - tS);
  const footY = py + S * 1.3;
  M(e, { t: 'path', pts: [[cx, py], [cx, footY]], line: C.ink, lw: 8 * u, prog: draw, seed: 101 });
  M(e, { t: 'path', pts: [[cx - S * 0.42, footY], [cx + S * 0.42, footY]], line: C.ink, lw: 10 * u, prog: draw, seed: 103 });
  const E = (sd: number): Pt => [cx + sd * L * Math.cos(ang), py + sd * L * Math.sin(ang)];
  M(e, { t: 'path', pts: [E(-1), E(1)], line: C.ink, lw: 7 * u, prog: draw, seed: 105 });
  const ls = Math.min(52 * u, S * 0.26);
  ([[-1, A, na, C.color], [1, B, nb, C.accent]] as const).forEach(([sd, row, cnt, col], j) => {
    const [ex, ey] = E(sd), rim = ey + hang;
    M(e, { t: 'path', pts: [[ex, ey], [ex - pw * 0.86, rim]], line: C.ink, lw: 2.5 * u, a: 0.75, prog: draw, seed: 107 + j * 5 });
    M(e, { t: 'path', pts: [[ex, ey], [ex + pw * 0.86, rim]], line: C.ink, lw: 2.5 * u, a: 0.75, prog: draw, seed: 109 + j * 5 });
    const bs = pw * 0.42;
    for (let q = 0; q < cnt; q++) {
      const row3 = Math.floor(q / 3), inRow = Math.min(3, cnt - row3 * 3), col3 = q % 3, t0 = p.at + q * 0.08, f = eOut3(prog(local, t0, t0 + 0.35));
      if (f <= 0) continue;
      const bx = ex + (col3 - (inRow - 1) / 2) * bs * 1.06 - bs / 2, by = rim + sag * 0.6 - (row3 + 1) * bs * 0.98 - (1 - f) * 260 * u;
      M(e, { t: 'rect', x: bx, y: by, w: bs, h: bs * 0.9, fill: col, line: C.ink, seed: 121 + j * 31 + q * 3 });
    }
    M(e, { t: 'path', pts: quadPts([ex - pw, rim], [ex, rim + sag * 2], [ex + pw, rim]).concat([[ex - pw, rim]]), fill: C.tag, line: C.ink, lw: 5 * u, prog: draw, seed: 111 + j * 5 });
    const la = clamp((local - p.at - 0.1) / 0.3);
    T(e, { id: `l${j}`, text: row.label, x: ex, y: rim + sag + ls * 0.95, size: fitSize(row.label, ls, pw * 2.2), align: 'c', color: sd > 0 ? C.accent : C.ink, weight: 900, a: la });
    if (row.show) T(e, { id: `s${j}`, text: row.show, x: ex, y: rim + sag + ls * 2.05, size: fitSize(row.show, ls * 0.72, pw * 2.2), align: 'c', color: C.dim, weight: 700, a: la });
  });
  M(e, { t: 'dot', x: cx, y: py, r: 13 * u, fill: C.tag, line: C.ink, seed: 131 });
  if (p.note) T(e, { id: 'note', text: p.note, x: cx, y: b.y + noteRoom * 0.45, size: fitSize(p.note, 64 * u, b.w), align: 'c', color: C.accent, weight: 900, a: clamp((local - tS - 0.5) / 0.1), sc: pop(local, tS + 0.5) });
}

/** table cells: one row a line, cells split by |; the first row is the header */
export const tableCells = (text: string) => chartRows(text).map((r) => r.cells);
/** the lit cell: "row,col" (body rows and columns counted from 1) or "row" for a whole row; [-1, -1] for none */
export function tableHl(spec: string, rows: number, cols: number): [number, number] {
  const m = /^\s*(\d+)\s*(?:[,，]\s*(\d+))?\s*$/.exec(String(spec ?? ''));
  if (!m) return [-1, -1];
  const r = Number(m[1]), c = m[2] ? Number(m[2]) - 1 : -1;
  return r >= 1 && r < rows && c < cols ? [r, c] : [-1, -1];
}

function planTable(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, cells = tableCells(p.data), R = cells.length, Cn = Math.max(0, ...cells.map((r) => r.length));
  if (!R || !Cn) return;
  const em = Array.from({ length: Cn }, (_, c) => Math.max(1.5, ...cells.map((r) => textEm(r[c] ?? '')))), wts = em.map((x) => x + 1.2), sum = wts.reduce((a, x) => a + x, 0);
  const fs = Math.min(46 * u, (b.h / R) * 0.42, (b.w / sum) * 0.95), colW = wts.map((x) => (x / sum) * b.w), colX = colW.map((_, c) => b.x + colW.slice(0, c).reduce((a, x) => a + x, 0));
  const rowH = Math.min(b.h / R, fs * 2.5), th = rowH * R, ty = b.y + (b.h - th) / 2, [hr, hc] = tableHl(p.hl, R, Cn);
  const step = Math.min(0.13, 1.4 / Math.max(1, R - 1 + Cn));
  for (let c = 1; c < Cn; c++) M(e, { t: 'path', pts: [[colX[c], ty + rowH * 0.15], [colX[c], ty + th - rowH * 0.15]], line: C.ink, lw: 2 * u, a: 0.45, prog: eOut3(prog(local, p.at + c * 0.05, p.at + c * 0.05 + 0.5)), seed: 141 + c });
  M(e, { t: 'path', pts: [[b.x, ty + rowH], [b.x + b.w, ty + rowH]], line: C.ink, lw: 3.5 * u, prog: eOut3(prog(local, p.at + 0.1, p.at + 0.55)), seed: 151 });
  for (let r = 2; r < R; r++) M(e, { t: 'path', pts: [[b.x, ty + rowH * r], [b.x + b.w, ty + rowH * r]], line: C.ink, lw: 1.5 * u, a: 0.35, prog: eOut3(prog(local, p.at + 0.2 + r * 0.06, p.at + 0.65 + r * 0.06)), seed: 161 + r });
  let tLast = p.at;
  cells.forEach((row, r) => {
    for (let c = 0; c < Cn; c++) {
      const text = row[c] ?? '';
      const t0 = r === 0 ? p.at + 0.1 + c * 0.06 : p.at + 0.35 + (r - 1 + c) * step, a = prog(local, t0, t0 + 0.3), lit = r === hr && (hc < 0 || hc === c);
      tLast = Math.max(tLast, t0 + 0.3);
      const x = colX[c] + colW[c] / 2, y = ty + rowH * (r + 0.5) + (1 - eOut3(a)) * 18 * u;
      if (lit) M(e, { t: 'rect', x: colX[c] + 6 * u, y: ty + rowH * r + 6 * u, w: colW[c] - 12 * u, h: rowH - 12 * u, fill: C.tag, soft: true, reveal: eOut3(a), from: 'l', seed: 171 + c });
      if (!text) continue;
      T(e, { id: `c${r}_${c}`, text, x, y, size: fitSize(text, fs * (r === 0 ? 1.02 : 1), colW[c] * 0.92), align: 'c', color: lit ? C.accent : r === 0 ? C.ink : c === 0 && Cn > 2 ? C.dim : C.ink,
        weight: r === 0 || lit ? 900 : c === 0 && Cn > 2 ? 500 : 700, a: clamp(a * 2), sc: lit ? 1 + 0.12 * Math.sin(Math.PI * prog(local, t0 + 0.2, t0 + 0.5)) : 1 });
    }
  });
  if (p.mark === 'circle' && hr >= 1) {
    const c0 = hc < 0 ? 0 : hc, c1 = hc < 0 ? Cn - 1 : hc, x0 = colX[c0], x1 = colX[c1] + colW[c1];
    M(e, { t: 'loop', cx: (x0 + x1) / 2, cy: ty + rowH * (hr + 0.5), rx: (x1 - x0) / 2 + 12 * u, ry: rowH * 0.62, line: C.accent, lw: 5 * u, prog: eOut3(prog(local, tLast + 0.05, tLast + 0.55)), seed: 37 });
  }
}

/** a line's points cut at x = xh (the playhead) */
export function cutAtX(pts: Pt[], xh: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (pts[i][0] <= xh) { out.push(pts[i]); continue; }
    if (i > 0) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], f = (xh - x0) / (x1 - x0 || 1); out.push([xh, y0 + (y1 - y0) * f]); }
    break;
  }
  return out;
}
/** the y of a cut line at its end (the head dot) */
const yAtX = (pts: Pt[], xh: number) => { const c = cutAtX(pts, xh); return c.length ? c[c.length - 1][1] : pts[0]?.[1] ?? 0; };

function planLine(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, ser = chartSeries(p.data).slice(0, 4);
  if (!ser.length) return;
  const cols = sliceColors(e), ih = hlIndex(p.hl, ser.map((s) => s.values[s.values.length - 1])), base = baseOf(p.base), ls = 42 * u, [ax0, ax1] = String(p.axis ?? '').split('|').map((s) => s.trim());
  const side = b.w / b.h > 1.6, legW = side ? Math.min(b.w * 0.24, Math.max(...ser.map((s) => textW(s.label, ls))) + 30 * u) : 0;
  const legH = side ? 0 : ls * 1.7, axH = ax0 || ax1 ? ls * 1.5 : 0;
  const x0 = b.x + legW + 10 * u, x1 = b.x + b.w - 10 * u, y0 = b.y + legH + 20 * u, y1 = b.y + b.h - axH - 6 * u;
  const all = ser.flatMap((s) => s.values).concat(base ? [base.v] : []), mn = Math.min(...all), mx = Math.max(...all), pad = (mx - mn || 1) * 0.12;
  const lo = mn - pad, hi = mx + pad, Y = (v: number) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
  const u1 = clamp((local - p.at) / Math.max(0.1, p.grow)), xh = x0 + u1 * (x1 - x0);
  M(e, { t: 'path', pts: [[x0, y1], [x1, y1]], line: C.ink, lw: 2.5 * u, a: 0.5, prog: eOut3(prog(local, p.at - 0.3, p.at + 0.1)), seed: 181 });
  if (base) {
    const yb = Y(base.v);
    M(e, { t: 'path', pts: [[x0, yb], [x1, yb]], line: C.ink, lw: 3 * u, dash: true, a: 0.75, prog: eOut3(prog(local, p.at - 0.2, p.at + 0.3)), seed: 183 });
    if (base.label) T(e, { id: 'base', text: base.label, x: x1, y: yb - ls * 0.72, size: fitSize(base.label, ls * 0.9, (x1 - x0) * 0.5), align: 'r', color: C.dim, weight: 500, a: clamp((local - p.at) / 0.3) });
  }
  if (ax0) T(e, { id: 'ax0', text: ax0, x: x0, y: y1 + axH * 0.55, size: fitSize(ax0, ls * 0.9, (x1 - x0) * 0.45), align: 'l', color: C.dim, weight: 500, a: clamp((local - p.at + 0.2) / 0.3) });
  if (ax1) T(e, { id: 'ax1', text: ax1, x: x1, y: y1 + axH * 0.55, size: fitSize(ax1, ls * 0.9, (x1 - x0) * 0.45), align: 'r', color: C.dim, weight: 500, a: clamp((local - p.at + 0.2) / 0.3) });
  const lines = ser.map((s) => (s.values.length === 1 ? [[x0, Y(s.values[0])], [x1, Y(s.values[0])]] as Pt[] : spline(s.values.map((v, i) => [x0 + (i / (s.values.length - 1)) * (x1 - x0), Y(v)] as Pt), 16))
    .map(([x, y]) => [x, clamp(y, y0, y1)] as Pt));
  let lx = b.x;
  ser.forEach((s, i) => {
    const col = cols[i % cols.length], dim = ih >= 0 && ih !== i, cut = cutAtX(lines[i], xh);
    if (cut.length >= 2) M(e, { t: 'path', pts: cut, line: col, lw: (ih === i ? 9 : dim ? 5 : 7) * u, a: dim ? 0.45 : 1, seed: 191 + i * 11 });
    const la = clamp((local - p.at + 0.3) / 0.3), size = side ? fitSize(s.label, ls, legW - 20 * u) : fitSize(s.label, ls, b.w / ser.length - 50 * u);
    if (side) T(e, { id: `l${i}`, text: s.label, x: b.x, y: (y0 + y1) / 2 + (i - (ser.length - 1) / 2) * ls * 1.6, size, align: 'l', color: col, weight: 900, a: la });
    else {
      M(e, { t: 'dot', x: lx + 12 * u, y: b.y + legH * 0.45, r: 10 * u, fill: col, seed: 197 + i });
      T(e, { id: `l${i}`, text: s.label, x: lx + 32 * u, y: b.y + legH * 0.45, size, align: 'l', color: col, weight: 900, a: la });
      lx += 32 * u + textW(s.label, size) + 40 * u;
    }
    if (u1 > 0) M(e, { t: 'dot', x: xh, y: yAtX(lines[i], xh), r: 9 * u, fill: col, seed: 199 + i });
  });
  if (u1 > 0) M(e, { t: 'path', pts: [[xh, y0 - 6 * u], [xh, y1 + 6 * u]], line: C.ink, lw: 2 * u, a: 0.35, seed: 201 });
  // marks on the curves: "where (0–1 across)|which line (from 1)|symbol"
  chartRows(p.marks).forEach((r, j) => {
    const at = clamp(parseNum(r.label).v), si = clamp(Math.round(parseNum(r.cells[1]).v || 1), 1, ser.length) - 1;
    if (!Number.isFinite(at) || u1 < at) return;
    const x = x0 + at * (x1 - x0), y = yAtX(lines[si], x), q = eOut3(prog(local, p.at + at * p.grow, p.at + at * p.grow + 0.3)), col = cols[si % cols.length];
    M(e, { t: 'dot', x, y, r: 24 * u * q, fill: C.paper, line: col, seed: 211 + j });
    if (r.show) T(e, { id: `m${j}`, text: r.show, x, y, size: 28 * u, align: 'c', color: col, weight: 900, a: q, sc: Math.max(0.01, q) });
  });
  if (p.note) {
    const si = ih >= 0 ? ih : 0, ey = yAtX(lines[si], x1), size = fitSize(p.note, 50 * u, (x1 - x0) * 0.7), up = ey - size * 1.3 > y0;
    T(e, { id: 'note', text: p.note, x: x1, y: up ? ey - size * 1.1 : ey + size * 1.1, size, align: 'r', color: cols[si % cols.length], weight: 900, a: clamp((local - p.at - p.grow) / 0.1), sc: pop(local, p.at + p.grow) });
  }
}

// ---------- drawing ----------
interface R { look: Look; pen: PenStyle; u: number; boil: number; t: number; ink: string }
const bounds = (pts: Pt[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};
const trace = (g: CanvasRenderingContext2D, pts: Pt[]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const rectPts = (x: number, y: number, w: number, hh: number): Pt[] => [[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]];

/** marker colouring-in (fd-quotes' pie): fat marker strokes across the shape, laid one after another with prog */
export function markerFill(g: CanvasRenderingContext2D, pts: Pt[], color: string, o: { u: number; seed: number; prog?: number; boil?: number; t?: number }) {
  const prog = clamp(o.prog ?? 1);
  if (prog <= 0 || pts.length < 3) return;
  const b = bounds(pts), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, Rr = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 10 * o.u, gap = 13 * o.u, n = Math.ceil((2 * Rr) / gap);
  const ang = -0.95, dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  g.save(); trace(g, pts); g.clip();
  for (let i = 0; i < n; i++) {
    const part = clamp(prog * n - i);
    if (part <= 0) break;
    const off = -Rr + (i + 0.5) * gap, bx = cx + nx * off, by = cy + ny * off;
    markerStroke(g, [[bx - dx * Rr, by - dy * Rr], [bx + dx * Rr, by + dy * Rr]], { w: 17 * o.u, color, seed: o.seed * 7 + i, prog: part, u: o.u, boil: o.boil, t: o.t, amp: 2 * o.u });
  }
  g.restore();
}

/** the shape coloured in with the pen's own colouring-in */
function handFill(g: CanvasRenderingContext2D, pts: Pt[], color: string, r: R, seed: number, prog = 1) {
  if (r.pen === 'marker') { markerFill(g, pts, color, { u: r.u, seed, prog, boil: r.boil, t: r.t }); return; }
  const pencil = r.pen === 'pencil', ball = r.pen === 'ballpoint';
  hatchFill(g, pts, color, { u: r.u, seed, prog, boil: r.boil, t: r.t, alpha: pencil ? 0.55 : ball ? 0.85 : 0.78, w: ball ? 2.6 : pencil ? 3.8 : 6.5, gap: ball ? 6 : 5.5 });
}
/** straight woodcut hatching over the shape (chili-history's art cards) */
function woodHatch(g: CanvasRenderingContext2D, pts: Pt[], ink: string, u: number) {
  const b = bounds(pts), c = Math.cos(0.8), s = Math.sin(0.8), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, Rr = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 4;
  g.save(); trace(g, pts); g.clip(); g.strokeStyle = ink; g.globalAlpha *= 0.25; g.lineWidth = 1.6 * u;
  for (let d = -Rr; d < Rr; d += 12 * u) { g.beginPath(); g.moveTo(cx + d * -s - Rr * c, cy + d * c - Rr * s); g.lineTo(cx + d * -s + Rr * c, cy + d * c + Rr * s); g.stroke(); }
  g.restore();
}
/** a line in the look's pen */
function stroke(g: CanvasRenderingContext2D, pts: Pt[], color: string, lw: number, r: R, seed: number, prog = 1, alpha = 1, dash = false) {
  if (pts.length < 2 || prog <= 0) return;
  if (r.look === 'hand') {
    const list = dash ? dashes(cutPath(pts, prog), 16 * r.u, 12 * r.u) : [pts];
    inkStrokes(g, list, r.pen, { w: lw * (r.pen === 'pencil' ? 0.7 : 1), color, seed, prog: dash ? 1 : prog, u: r.u, boil: r.boil, t: r.t, alpha, tip: !dash });
    return;
  }
  const q = cutPath(pts, prog);
  if (q.length < 2) return;
  g.save(); g.globalAlpha *= alpha; g.strokeStyle = color; g.lineWidth = lw * (r.look === 'woodcut' ? 1.15 : 1); g.lineCap = dash ? 'butt' : 'round'; g.lineJoin = 'round';
  if (dash) g.setLineDash([16 * r.u, 12 * r.u]);
  g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.restore();
}
/** the path cut into dashes `on` long with `off` between */
export function dashes(pts: Pt[], on: number, off: number): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [], d = 0, drawing = true;
  for (let i = 1; i < pts.length; i++) {
    let [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    let L = Math.hypot(bx - ax, by - ay);
    if (drawing && !cur.length) cur.push([ax, ay]);
    while (L > 0) {
      const left = (drawing ? on : off) - d, take = Math.min(left, L), f = take / L, nx = ax + (bx - ax) * f, ny = ay + (by - ay) * f;
      if (drawing) cur.push([nx, ny]);
      d += take; L -= take; ax = nx; ay = ny;
      if (d >= (drawing ? on : off) - 1e-9) { if (drawing && cur.length > 1) out.push(cur); cur = []; drawing = !drawing; d = 0; if (drawing) cur.push([ax, ay]); }
    }
  }
  if (drawing && cur.length > 1) out.push(cur);
  return out;
}

/** the little person (fd-hakka's iconPerson): a round head and a domed body, s tall, centred on (x, y); sx squeezes it (a card flipping) */
export function personPts(x: number, y: number, s: number, sx = 1): Pt[][] {
  const head = ellipsePts(x, y - s * 0.3, s * 0.17 * sx, s * 0.17, { n: 28 }), top = y - s * 0.1, bot = y + s * 0.4, w = s * 0.3 * sx;
  const body = [...quadPts([x - w, bot], [x - w, top], [x, top], 10), ...quadPts([x, top], [x + w, top], [x + w, bot], 10).slice(1), [x - w, bot] as Pt];
  return [head, body];
}

/** one shape in the look */
export function drawMark(g: CanvasRenderingContext2D, m: Mk, r: R) {
  const u = r.u, hand = r.look === 'hand', wood = r.look === 'woodcut';
  switch (m.t) {
    case 'rect': {
      const f = clamp(m.reveal ?? 1);
      if (f <= 0 || m.w <= 0 || m.h <= 0) return;
      const from = m.from ?? 'l', x = m.x + (m.dx ?? 0), horiz = from === 'l' || from === 'r';
      const rw = horiz ? m.w * f : m.w, rh = horiz ? m.h : m.h * f, rx = from === 'r' ? x + m.w - rw : x, ry = from === 'b' ? m.y + m.h - rh : m.y;
      if (m.soft) {
        if (hand) { g.save(); trace(g, rectPts(rx, ry, rw, rh)); g.clip(); handFill(g, rectPts(x, m.y, m.w, m.h), m.fill, r, m.seed); g.restore(); }
        else { g.save(); g.globalAlpha *= wood ? 0.6 : 0.35; g.fillStyle = m.fill; g.beginPath(); g.roundRect(rx, ry, rw, rh, 10 * u); g.fill(); g.restore(); if (wood) woodHatch(g, rectPts(rx, ry, rw, rh), r.ink, u); }
        return;
      }
      if (hand) {
        g.save(); trace(g, rectPts(rx - 2 * u, ry - 2 * u, rw + 4 * u, rh + 4 * u)); g.clip(); handFill(g, rectPts(x, m.y, m.w, m.h), m.fill, r, m.seed); g.restore();
        if (m.line) inkStrokes(g, rectSides(rx, ry, rw, rh, Math.min(4 * u, rw / 4, rh / 4)), r.pen, { w: (r.pen === 'marker' ? 5 : 3.6) * u, color: m.line, seed: m.seed + 3, u, boil: r.boil, t: r.t });
        return;
      }
      g.save(); g.fillStyle = m.fill; g.beginPath();
      if (wood) g.rect(rx, ry, rw, rh); else g.roundRect(rx, ry, rw, rh, Math.min(10 * u, rw / 2, rh / 2));
      g.fill();
      if (wood) { woodHatch(g, rectPts(rx, ry, rw, rh), r.ink, u); g.strokeStyle = m.line ?? r.ink; g.lineWidth = 4 * u; g.lineJoin = 'round'; g.strokeRect(rx, ry, rw, rh); }
      g.restore();
      return;
    }
    case 'path':
      if (m.fill && (m.prog ?? 1) > 0) {
        g.save(); g.globalAlpha *= clamp(((m.prog ?? 1) - 0.5) * 2);
        if (hand) handFill(g, m.pts, m.fill, r, m.seed); else { flatFillPts(g, m.pts, m.fill); if (wood) woodHatch(g, m.pts, r.ink, u); }
        g.restore();
      }
      stroke(g, m.pts, m.line, m.lw, r, m.seed, m.prog ?? 1, m.a ?? 1, m.dash);
      return;
    case 'wedge': {
      if (m.r <= 0 || m.fp <= 0) return;
      const full = (a1: number): Pt[] => [[m.cx, m.cy], ...ellipsePts(m.cx, m.cy, m.r, m.r, { a0: m.a0, turns: (a1 - m.a0) / (Math.PI * 2), n: Math.max(4, Math.ceil((a1 - m.a0) * 16)) })];
      if (hand) { handFill(g, full(m.a1), m.fill, r, m.seed, m.fp); return; }
      const pts = full(m.a0 + (m.a1 - m.a0) * m.fp);
      g.save(); g.fillStyle = m.fill; trace(g, pts); g.fill(); g.restore();
      if (wood) woodHatch(g, pts, r.ink, u);
      return;
    }
    case 'loop': {
      if (m.prog <= 0) return;
      if (m.box !== undefined) { stroke(g, boxLoopPts(m.cx, m.cy, m.rx, m.ry, m.seed, m.box), m.line, m.lw, r, m.seed, m.prog); return; }
      if (hand) { inkStroke(g, loopPts(m.cx, m.cy, m.rx, m.ry, 1, m.seed), r.pen, { w: m.lw, color: m.line, seed: m.seed, prog: m.prog, u, boil: r.boil, t: r.t, tip: true }); return; }
      stroke(g, ellipsePts(m.cx, m.cy, m.rx, m.ry, { turns: 1.08, a0: -2.2, n: 80 }), m.line, m.lw, r, m.seed, m.prog);
      return;
    }
    case 'person': {
      const [head, body] = personPts(m.x, m.y, m.s, m.sx), lw = Math.max(1.5 * u, m.s * 0.05);
      for (const pts of [body, head]) {
        if (hand) { handFill(g, pts, m.fill, r, m.seed); inkStroke(g, [...pts, pts[1]], r.pen, { w: lw * 0.9, color: m.line, seed: m.seed + pts.length, u, boil: r.boil, t: r.t }); continue; }
        g.save(); g.fillStyle = m.fill; trace(g, pts); g.fill();
        if (wood) woodHatch(g, pts, r.ink, u);
        g.strokeStyle = m.line; g.lineWidth = lw; g.lineJoin = 'round'; trace(g, pts); g.stroke(); g.restore();
      }
      return;
    }
    case 'dot': {
      if (m.r <= 0 || (m.a ?? 1) <= 0) return;
      g.save(); g.globalAlpha *= m.a ?? 1; drawDot(g, m, r); g.restore();
      return;
    }
  }
}
/** a round dot (a rank badge, a head on a line, a mark's disc): filled, ringed in the pen when hand-drawn */
function drawDot(g: CanvasRenderingContext2D, m: Extract<Mk, { t: 'dot' }>, r: R) {
  const u = r.u;
  if (r.look === 'hand') {
    flatFillPts(g, ellipsePts(m.x, m.y, m.r, m.r, { n: 32 }), m.fill);
    if (m.line) inkStroke(g, loopPts(m.x, m.y, m.r, m.r, 1, m.seed), r.pen, { w: 3.5 * u, color: m.line, seed: m.seed, u, boil: r.boil, t: r.t });
    return;
  }
  g.save(); g.fillStyle = m.fill; g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.fill();
  if (m.line) { g.strokeStyle = m.line; g.lineWidth = 3.5 * u; g.stroke(); }
  g.restore();
}
const flatFillPts = (g: CanvasRenderingContext2D, pts: Pt[], color: string) => { g.save(); g.fillStyle = color; trace(g, pts); g.fill(); g.restore(); };

/** the card in the look: a soft-shadowed rounded card, a paper card drawn round by hand, or parchment with a double rule */
function drawCard(g: CanvasRenderingContext2D, c: Box, p: ChartP, r: R, radius: number, local: number) {
  const u = r.u;
  if (r.look === 'woodcut') {
    const edge: Pt[] = [];
    for (let i = 0; i <= 40; i++) edge.push([c.x + (i / 40) * c.w, c.y + (hash(i, 1) - 0.5) * 6 * u]);
    for (let i = 0; i <= 30; i++) edge.push([c.x + c.w + (hash(i, 2) - 0.5) * 6 * u, c.y + (i / 30) * c.h]);
    for (let i = 40; i >= 0; i--) edge.push([c.x + (i / 40) * c.w, c.y + c.h + (hash(i, 3) - 0.5) * 6 * u]);
    for (let i = 30; i >= 0; i--) edge.push([c.x + (hash(i, 4) - 0.5) * 6 * u, c.y + (i / 30) * c.h]);
    g.save(); g.shadowColor = 'rgba(40,20,5,0.35)'; g.shadowBlur = 30 * u; g.shadowOffsetY = 12 * u; g.fillStyle = p.paper; trace(g, edge); g.fill(); g.restore();
    g.save(); g.strokeStyle = p.ink; g.lineWidth = 3 * u; g.strokeRect(c.x + 14 * u, c.y + 14 * u, c.w - 28 * u, c.h - 28 * u);
    g.lineWidth = 1.2 * u; g.strokeRect(c.x + 22 * u, c.y + 22 * u, c.w - 44 * u, c.h - 44 * u); g.restore();
    return;
  }
  g.save();
  if (r.look === 'clean') { g.shadowColor = 'rgba(0,0,0,0.22)'; g.shadowBlur = 34 * u; g.shadowOffsetY = 12 * u; }
  g.fillStyle = p.paper; g.beginPath(); g.roundRect(c.x, c.y, c.w, c.h, r.look === 'hand' ? 14 * u : radius); g.fill(); g.restore();
  if (r.look === 'hand') inkStroke(g, rrectPts(c.x + 8 * u, c.y + 8 * u, c.w - 16 * u, c.h - 16 * u, 18 * u, 0.04), r.pen, { w: 4.5 * u, color: p.ink, seed: 7, prog: eOut3(clamp(local / 0.5)), u, boil: r.boil, t: r.t, tip: true });
}

// ---------- the block ----------
interface S { cv: HTMLCanvasElement; tx: HTMLElement; layer: GrainLayer; key: string; els: Map<string, HTMLElement> }

const fontOf = (p: ChartP, theme: Theme) => (p.look === 'hand' ? `'${HAND}', 'Noto Sans TC', sans-serif` : p.look === 'woodcut' ? `'Noto Serif TC', 'Noto Sans TC', serif`
  : `'${p.font || theme.fonts.display}', 'Noto Sans TC', sans-serif`);
const weightOf = (look: Look, w: number) => (look === 'hand' ? (w >= 700 ? 700 : 400) : w);

export const chart: ItemType<ChartP, S> = {
  type: 'common.chart', label: '資料圖表', category: 'number', kind: 'overlay',
  doc: '資料圖表卡，kind 換圖：bars 長條長出來、數字往上跳（dir h 橫條／v 直條；compare ratio 標「× 6.7」倍數、gap 標差距括號；base 一條基準虛線；stat 一行大數字往上跳）、pie 圓餅一片一片塗上（note 掛在下面的標籤）、people 一排小人一個個翻牌、前 k 個上色被圈起來（10 人中有 4 人）、rank 排名清單、亮起一列並掛「第 12 名」、balance 天秤（兩邊砝碼掉進盤子、往重的那邊傾斜）、table 對照表（線畫出來、格子沿對角線浮上來）、line 一兩條曲線隨時間畫出（播放頭、曲線上的標記、基準線）；data 一行一筆「名稱|數值|顯示的字」，hl 亮哪一筆（max、min 或第幾筆）、mark circle 把它圈起來，title 標題、source 資料來源、時間 at 相對項目開始；look clean 簡潔（theme 色）、hand 手繪（pen 選 marker 麥克筆／crayon 蠟筆／pencil 鉛筆／ballpoint 原子筆，boil 抖動）、woodcut 木刻排線羊皮紙；數據、統計、比較、排名、比例、趨勢',
  params: [
    { key: 'kind', label: '圖（bars 長條、pie 圓餅、people 人形圖、rank 排名、balance 天秤、table 對照表、line 曲線）', type: 'enum', options: [...CHART_KINDS], default: 'bars' },
    { key: 'look', label: '樣子（clean 簡潔、hand 手繪、woodcut 木刻排線）', type: 'enum', options: ['clean', 'hand', 'woodcut'], default: 'clean' },
    { key: 'pen', label: '手繪的筆（hand；marker 麥克筆、crayon 蠟筆、pencil 鉛筆、ballpoint 原子筆）', type: 'enum', options: ['marker', 'crayon', 'pencil', 'ballpoint'], default: 'crayon' },
    { key: 'boil', label: '手繪線每秒抖幾次（0＝不抖）', type: 'number', min: 0, max: 24, step: 1, default: 8 },
    { key: 'title', label: '標題（空＝沒有）', type: 'string', default: '全球產量：乾辣椒 vs 黑胡椒' },
    { key: 'data', label: '資料：一行一筆「名稱|數值|顯示的字」（rank 第三欄是名次、table 一行一列「格|格|格」第一行是表頭、line「名稱|1,3,2,5」）', type: 'text', default: '黑胡椒|69\n乾辣椒|463' },
    { key: 'unit', label: '數字後面的單位', type: 'string', default: ' 萬噸' },
    { key: 'hl', label: '亮哪一筆（max 最大、min 最小、第幾筆從 1 數；table「列,欄」；空＝不亮）', type: 'string', default: 'max' },
    { key: 'mark', label: '把亮的那筆圈起來', type: 'enum', options: ['none', 'circle'], default: 'none' },
    { key: 'compare', label: '比較（bars；ratio 倍數、gap 差距括號，比亮的那根和另一根）', type: 'enum', options: ['none', 'ratio', 'gap'], default: 'ratio' },
    { key: 'note', label: '註解（bars 比較的字、pie 下面的標籤、rank 亮的那列的標籤、balance 上方的字、line 線尾的字；空＝自動）', type: 'string', default: '' },
    { key: 'base', label: '基準線「數值|標籤」（bars、line；空＝沒有）', type: 'string', default: '' },
    { key: 'stat', label: '大數字一行（bars、people；【數字】或第一個數字會往上跳；people 空＝「N 人中有 K 人」）', type: 'string', default: '' },
    { key: 'source', label: '資料來源（右下小字；空＝沒有）', type: 'string', default: 'FAO 2017' },
    { key: 'n', label: '總人數（people）', type: 'number', min: 1, max: 200, step: 1, default: 10 },
    { key: 'k', label: '上色的人數（people）', type: 'number', min: 0, max: 200, step: 1, default: 4 },
    { key: 'axis', label: '橫軸兩端「起|迄」（line）', type: 'string', default: '' },
    { key: 'marks', label: '曲線上的標記，一行一個「位置 0–1|第幾條線|符號」（line）', type: 'text', default: '' },
    { key: 'dir', label: '長條方向（bars；h 橫、v 直）', type: 'enum', options: ['h', 'v'], default: 'h' },
    { key: 'at', label: '開始動的時間（秒，相對項目開始）', type: 'number', min: 0, max: 30, step: 0.05, default: 0.3 },
    { key: 'grow', label: '長出來／畫出來的時間（秒；line 是播放頭走完全程的時間）', type: 'number', min: 0.1, max: 600, step: 0.1, default: 1.2 },
    { key: 'card', label: '底卡', type: 'bool', default: true },
    { key: 'x', label: '中心 x（畫面寬比例；-1＝安全區中間）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'y', label: '中心 y（畫面高比例；-1＝安全區中間）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'w', label: '寬（畫面寬比例；-1＝自動）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'h', label: '高（畫面高比例；-1＝自動）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'ink', label: '字與線的顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'paper', label: '底卡顏色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'color', label: '一般資料的顏色', type: 'color', default: '#2ec4b6', theme: 'palette.accent2' },
    { key: 'accent', label: '亮起來那筆的顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'tag', label: '標籤與天秤盤的顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'colors', label: '圓餅和曲線的顏色（逗號分隔；空＝用上面的顏色）', type: 'string', default: '' },
    { key: 'font', label: '字型（clean；空＝theme 字型）', type: 'string', default: '', theme: 'fonts.display' },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root), tx = h('div', null, null, ctx.root);
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(tx, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    return { cv, tx, layer: {}, key: '', els: new Map() };
  },
  hide(s) { freeCanvas(s.cv); s.layer.cv = undefined; },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, plan = chartPlan(p, W, H, theme, local), u = plan.u;
    const alpha = clamp(local / 0.2) * (1 - prog(local, dur - 0.3, dur)), dy = (1 - eOut3(clamp(local / 0.35))) * 40 * u;
    const look: Look = p.look === 'hand' || p.look === 'woodcut' ? p.look : 'clean';
    const r: R = { look, pen: (['marker', 'crayon', 'pencil', 'ballpoint'].includes(p.pen) ? p.pen : 'crayon') as PenStyle, u, boil: look === 'hand' ? p.boil : 0, t: local, ink: p.ink };
    for (const el of [s.cv, s.tx]) cssCamel(el, { opacity: alpha.toFixed(3), transform: `translateY(${dy.toFixed(2)}px)` });
    const main = canvasAt(s.cv, W, H), crayon = look === 'hand' && r.pen === 'crayon';
    if (plan.card) drawCard(main, plan.card, p, r, theme.radius * u, local);
    const g = crayon ? grainBegin(s.layer, W, H) : main;
    for (const m of plan.marks) drawMark(g, m, r);
    if (crayon) grainEnd(s.layer, main, 0.4, u);
    syncTexts(s, plan.texts, fontOf(p, theme), look, u);
  },
};

/** the plan's words as absolutely placed divs (rebuilt only when which words there are changes) */
function syncTexts(s: S, texts: Txt[], family: string, look: Look, u: number) {
  const key = texts.map((t) => `${t.id}${t.em ? '*' : ''}${t.bg ? '#' : ''}`).join('|');
  if (key !== s.key) {
    s.key = key; s.tx.textContent = ''; s.els = new Map();
    for (const t of texts) {
      const el = h('div', null, null, s.tx);
      cssCamel(el, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1.2', fontFamily: family });
      s.els.set(t.id, el);
    }
  }
  texts.forEach((t, i) => {
    const el = s.els.get(t.id)!, a = clamp(t.a ?? 1), sh = t.align === 'l' ? '0' : t.align === 'r' ? '-100%' : '-50%';
    const sig = `${t.text}\u0001${t.em?.color ?? ''}`;
    if (el.dataset.v !== sig) {
      el.dataset.v = sig; el.textContent = '';
      if (t.em) for (const [piece, em] of emParts(t.text)) { const sp = h('span', null, null, el); sp.textContent = piece; if (em) cssCamel(sp, { color: t.em.color, fontSize: `${t.em.scale}em` }); }
      else el.textContent = t.text;
    }
    const rot = (t.rot ?? 0) + (look === 'hand' ? (hash(i, 5) - 0.5) * 3 : 0);
    cssCamel(el, { display: t.text && a > 0 ? 'block' : 'none', left: `${t.x.toFixed(2)}px`, top: `${t.y.toFixed(2)}px`, fontSize: `${t.size.toFixed(2)}px`, color: t.color,
      fontWeight: String(weightOf(look, t.weight ?? 700)), opacity: a.toFixed(3), transformOrigin: t.align === 'l' ? '0 50%' : t.align === 'r' ? '100% 50%' : '50% 50%',
      transform: `translate(${sh}, -50%) scale(${Math.max(0.01, t.sc ?? 1).toFixed(4)}) rotate(${rot.toFixed(2)}deg)`,
      background: t.bg ?? 'none', padding: t.bg ? '0.1em 0.45em' : '0', borderRadius: t.bg ? `${10 * u}px` : '0',
      border: t.bg && look !== 'clean' ? `${3 * u}px solid currentColor` : 'none', boxShadow: t.bg && look === 'clean' ? `0 ${6 * u}px ${16 * u}px rgba(0,0,0,0.18)` : 'none',
      webkitTextStroke: t.halo ? `${(t.size * 0.16).toFixed(2)}px ${t.halo}` : '0', paintOrder: 'stroke fill' });
  });
}
