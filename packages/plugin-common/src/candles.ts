// common.candles — a price chart film kit, from ndx100's fx.ndxchart / ndxheader / ndxtally / ndxcard / ndxbig (the Nasdaq-100
// forty-year film). One block, five modes, all driven by the same `keys` timeline ("film second|date|window days"), so the header,
// the tally and the chart always agree on the day they show:
//   chart   a glowing candlestick chart on near-black: the camera follows the newest bar, the price range zooms (log) with it; a
//           whole-frame shake with red/cyan ghosts on each `shocks` second, sparks, markers, reference lines, measuring brackets,
//           crashes lit up, lightning bolts, fireworks, grey and red moods, an alert frame, light pillars and walls of tiles (one
//           per stock of a second, wide CSV: each stock's change over a span, on a tilted 3D plane)
//   header  the small label, the close as a big number (red or green by the last 20 bars), the date, and a chip: the fall from the
//           running high, or the "new high" word
//   tally   a row of squares, one per crash: green once the chart passes the day it fell through the threshold, red with a check
//           once it is back above the old high; "n/total" at the right
//   card    an event card: a tag chip, a date, a bold title and a line under it, a coloured bar at the left; slides in
//   big     a big number (a percentage counts up from zero) or a line of words, and a smaller line under it
// The data is the project's own CSV (`data`, a path like media/data/ndx.csv, or the CSV text itself): date,open,high,low,close per
// line (a header row and further columns such as Yahoo's Adj Close and Volume are fine; date,close alone draws flat candles). Without
// one it draws a made-up series (the gallery's). `keys` and every listed second are film seconds, whatever second the item starts at.
// Every mode shakes on the same `shocks` seconds with the same offsets, so the whole frame jumps together. Drawn for 9:16.
import type { ItemCtx, ItemType } from '@tellcut/engine';

export const CANDLES_MODES = ['chart', 'header', 'tally', 'card', 'big'] as const;
type Mode = (typeof CANDLES_MODES)[number];

const RED = { hex: '#ff3b4f', rgb: '255,59,79', glow: 'rgba(255,59,79,0.55)', trail: '255,70,90' };
const GREEN = { hex: '#14e38a', rgb: '20,227,138', glow: 'rgba(20,227,138,0.5)', trail: '40,255,160' };
const GOLD = '#ffb547';
const MINUS = '−';
/** up and down: red up (the Taiwanese and Chinese convention) or green up */
const colours = (updown: string) => (updown === 'green' ? { up: GREEN, down: RED } : { up: RED, down: GREEN });

// ---------------------------------------------------------------- the data
export interface Series { D: Int32Array; O: Float64Array; H: Float64Array; L: Float64Array; C: Float64Array; N: number }
/** "2024-03-08", "2024/3/8", "2024.03.08" or "20240308" → 20240308; NaN when it is no date */
export function ymd(s: string): number {
  const v = String(s ?? '').trim().replace(/^"|"$/g, '');
  const m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return +m[1] * 10000 + +m[2] * 100 + +m[3];
  return /^\d{8}$/.test(v) ? +v : NaN;
}
/** a CSV line's cells (comma, tab or semicolon); a quoted cell keeps its commas ("1,050.50", as some exports write prices) */
function cells(line: string): string[] {
  const out: string[] = []; let cur = '', quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === ',' || ch === '\t' || ch === ';')) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
const num = (s: string | undefined) => { const v = parseFloat(String(s ?? '').replace(/[,\s$]/g, '')); return Number.isFinite(v) ? v : NaN; };

/** the daily bars of a CSV, oldest first: date,open,high,low,close (by the header's names when there is one, else in that order) */
export function parseBars(text: string): Series {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let col = { d: 0, o: 1, h: 2, l: 3, c: 4 }, only = false;
  if (lines.length && Number.isNaN(ymd(cells(lines[0])[0]))) {
    const head = cells(lines.shift()!).map((x) => x.toLowerCase());
    const at = (...names: string[]) => head.findIndex((x) => names.includes(x));
    const d = Math.max(0, at('date', 'time', 'datetime', '日期')), c = at('close', 'price', 'value', 'adj close', '收盤', '收盘', '終値');
    col = { d, o: at('open', '開盤', '开盘', '始値'), h: at('high', '最高', '高値'), l: at('low', '最低', '安値'), c: c < 0 ? head.length > 4 ? 4 : 1 : c };
    only = col.o < 0 || col.h < 0 || col.l < 0;
  } else if (lines.length && cells(lines[0]).length < 5) { col = { d: 0, o: -1, h: -1, l: -1, c: 1 }; only = true; }
  const rows: number[][] = [];
  for (const l of lines) {
    const r = cells(l), d = ymd(r[col.d]), c = num(r[col.c]);
    if (Number.isNaN(d) || !(c > 0)) continue;
    rows.push(only ? [d, NaN, NaN, NaN, c] : [d, num(r[col.o]), num(r[col.h]), num(r[col.l]), c]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  const N = rows.length, s: Series = { D: new Int32Array(N), O: new Float64Array(N), H: new Float64Array(N), L: new Float64Array(N), C: new Float64Array(N), N };
  rows.forEach(([d, o, h, l, c], i) => {
    const prev = i ? rows[i - 1][4] : c, oo = o > 0 ? o : prev;
    s.D[i] = d; s.O[i] = oo; s.C[i] = c;
    s.H[i] = Math.max(h > 0 ? h : 0, oo, c); s.L[i] = Math.min(l > 0 ? l : Infinity, oo, c);
  });
  return s;
}

/** the walls' stocks: a wide CSV, date,<name>,<name>… with each stock's close on that day (empty or 0 = not listed yet); a column's
 *  header "AAPL:蘋果" shows the words after the colon on its tile */
export interface Wide { D: Int32Array; cols: Array<{ name: string; v: Float64Array }> }
export function parseWide(text: string): Wide {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = lines.length ? cells(lines.shift()!) : [];
  const names = head.slice(1).map((h) => { const i = h.indexOf(':'); return i >= 0 ? h.slice(i + 1).trim() : h; });
  const rows = lines.map(cells).map((r) => [ymd(r[0]), ...names.map((_, k) => num(r[k + 1]))]).filter((r) => !Number.isNaN(r[0])).sort((a, b) => a[0] - b[0]);
  return { D: Int32Array.from(rows.map((r) => r[0])), cols: names.map((name, k) => ({ name, v: Float64Array.from(rows.map((r) => (r[k + 1] > 0 ? r[k + 1] : 0))) })) };
}
/** a stock's close on the last row on or before that day (0: not listed) */
function wideClose(w: Wide, k: number, day: number): number {
  let a = 0, b = w.D.length - 1, at = -1;
  while (a <= b) { const m = (a + b) >> 1; if (w.D[m] <= day) { at = m; a = m + 1; } else b = m - 1; }
  return at < 0 ? 0 : w.cols[k].v[at];
}

function rng(seed: number) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** the gallery's made-up series: ten years of weekdays from 2000-01-03 with a long climb, a crash and a recovery (not real prices) */
let DEMO: Series | null = null;
export function demoSeries(): Series {
  if (DEMO) return DEMO;
  const R = rng(1985), out: string[] = [];
  let day = Date.UTC(2000, 0, 3), c = 1000;
  for (let i = 0; i < 2600; i++) {
    const d = new Date(day), wd = d.getUTCDay();
    if (wd === 0 || wd === 6) { day += 86400000; i--; continue; }
    const drift = i > 900 && i < 1050 ? -0.0042 : i > 1050 && i < 1300 ? 0.0026 : 0.0006;
    const o = c, move = drift + (R() - 0.5) * 0.034;
    c = Math.max(50, o * (1 + move));
    const h = Math.max(o, c) * (1 + R() * 0.012), l = Math.min(o, c) * (1 - R() * 0.012);
    out.push(`${d.toISOString().slice(0, 10)},${o.toFixed(2)},${h.toFixed(2)},${l.toFixed(2)},${c.toFixed(2)}`);
    day += 86400000;
  }
  return (DEMO = parseBars(out.join('\n')));
}

// what was fetched, shared by every item that names the same file (the chart, the header and the tally); a build more than a
// couple of seconds later fetches again, so a CSV changed since shows after the next edit
const FETCHED = new Map<string, { at: number; job: Promise<string | null> }>();
function fetchText(ctx: ItemCtx, path: string): Promise<string | null> {
  const url = ctx.media.fileUrl(path), had = FETCHED.get(url);
  if (had && Date.now() - had.at < 2000) return had.job;
  const job = fetch(url).then((r) => (r.ok ? r.text() : null)).catch(() => null)
    .then((x) => { if (x === null) console.warn(`common.candles: cannot read ${path}`); return x; });
  FETCHED.set(url, { at: Date.now(), job });
  return job;
}
const BARS = new Map<string, Series>(), WIDES = new Map<string, Wide>();
const inline = (s: string) => /\n/.test(s);
function loadBars(ctx: ItemCtx, data: string): Promise<Series | null> {
  const d = String(data ?? '').trim();
  if (!d) return Promise.resolve(demoSeries());
  if (inline(d)) { if (!BARS.has(d)) BARS.set(d, parseBars(d)); return Promise.resolve(BARS.get(d)!); }
  return fetchText(ctx, d).then((x) => { if (x === null) return null; if (!BARS.has(x)) BARS.set(x, parseBars(x)); const s = BARS.get(x)!; return s.N ? s : null; });
}
function loadWide(ctx: ItemCtx, data: string): Promise<Wide | null> {
  const d = String(data ?? '').trim();
  if (!d) return Promise.resolve(null);
  if (inline(d)) { if (!WIDES.has(d)) WIDES.set(d, parseWide(d)); return Promise.resolve(WIDES.get(d)!); }
  return fetchText(ctx, d).then((x) => { if (x === null) return null; if (!WIDES.has(x)) WIDES.set(x, parseWide(x)); return WIDES.get(x)!; });
}

// ---------------------------------------------------------------- what a series knows (built once per series)
interface Facts {
  s: Series;
  /** the first bar on or after a date */
  idxOf(date: string | number): number;
  rmax(a: number, b: number): number; rmin(a: number, b: number): number;
  /** the running high close up to each bar, and the bar of that high */
  ath: Float64Array; athI: Int32Array;
  years: [number, number];
  tl: Map<string, Timeline>;
}
const FACTS = new WeakMap<Series, Facts>();
function facts(s: Series): Facts {
  const had = FACTS.get(s); if (had) return had;
  const N = s.N;
  const idxOf = (date: string | number) => {
    const v = typeof date === 'number' ? date : ymd(date); let a = 0, b = N - 1;
    while (a < b) { const m = (a + b) >> 1; if (s.D[m] < v) a = m + 1; else b = m; }
    return a;
  };
  // sparse tables for the range max of highs and min of lows
  const mx = [Float64Array.from(s.H)], mn = [Float64Array.from(s.L)];
  for (let k = 1; (1 << k) <= N; k++) {
    const pm = mx[k - 1], pn = mn[k - 1], h = 1 << (k - 1), len = N - (1 << k) + 1;
    const a = new Float64Array(len), b = new Float64Array(len);
    for (let i = 0; i < len; i++) { a[i] = Math.max(pm[i], pm[i + h]); b[i] = Math.min(pn[i], pn[i + h]); }
    mx.push(a); mn.push(b);
  }
  const rmax = (a: number, b: number) => { const k = 31 - Math.clz32(b - a + 1); return Math.max(mx[k][a], mx[k][b - (1 << k) + 1]); };
  const rmin = (a: number, b: number) => { const k = 31 - Math.clz32(b - a + 1); return Math.min(mn[k][a], mn[k][b - (1 << k) + 1]); };
  const ath = new Float64Array(N), athI = new Int32Array(N);
  for (let i = 0, m = 0, k = 0; i < N; i++) { if (s.C[i] >= m) { m = s.C[i]; k = i; } ath[i] = m; athI[i] = k; }
  const f: Facts = { s, idxOf, rmax, rmin, ath, athI, years: [Math.floor(s.D[0] / 10000), Math.floor(s.D[N - 1] / 10000)], tl: new Map() };
  FACTS.set(s, f); return f;
}

// ---------------------------------------------------------------- the shared timeline
/** monotone cubic (Fritsch–Carlson): repeated values hold still, no overshoot between keys */
export function pchip(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length; if (n === 1) return () => ys[0];
  const h: number[] = [], d: number[] = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]);
  for (let i = 0; i < n - 1; i++) if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; }
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
interface Timeline { tip(t: number): number; win(t: number): number; when(i: number, from?: number): number }
const lines = (s: unknown) => String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
function timeline(f: Facts, keys: string): Timeline {
  const had = f.tl.get(keys); if (had) return had;
  const N = f.s.N;
  let rows = lines(keys).map((l) => l.split('|')).filter((r) => r.length >= 2 && Number.isFinite(+r[0])).sort((a, b) => +a[0] - +b[0]);
  if (!rows.length) rows = [['0', String(f.s.D[0]), '300'], ['10', String(f.s.D[N - 1]), 'all']];
  const ts = rows.map((r) => +r[0]);
  const tip = pchip(ts, rows.map((r) => f.idxOf(r[1])));
  const win = pchip(ts, rows.map((r) => Math.log(String(r[2] ?? '').trim() === 'all' || !(+r[2] > 0) ? N * 1.07 : +r[2])));
  const cross = new Map<string, number>();
  const tl: Timeline = {
    tip: (t) => Math.max(0, Math.min(N - 1, tip(t))),
    win: (t) => Math.exp(win(t)),
    // the film second at which the tip first reaches bar i after `from` (cached): when a tally square pops
    when: (i, from = 0) => {
      const k = `${i}@${from}`, w0 = cross.get(k); if (w0 !== undefined) return w0;
      let w = Infinity; for (let t = from; t <= ts[ts.length - 1] + 0.001; t += 1 / 60) if (tl.tip(t) >= i) { w = t; break; }
      cross.set(k, w); return w;
    },
  };
  f.tl.set(keys, tl); return tl;
}

// ---------------------------------------------------------------- shared helpers
const span = (s: string) => { const [a, b] = String(s).split('-').map(Number); return [a, b] as const; };
const fadeIn = (t: number, a: number, len = 0.35) => Math.max(0, Math.min(1, (t - a) / len));
const window01 = (t: number, a: number, b: number, f = 0.35) => Math.min(fadeIn(t, a, f), 1 - fadeIn(t, b - f, f));
const times = (s: unknown) => String(s ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean).map(Number).filter((v) => !Number.isNaN(v));
/** 26989.99 → "26,989.99" */
export const priceText = (v: number) => { const [a, b] = v.toFixed(2).split('.'); return a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + b; };
export const pctText = (r: number) => (r >= 0 ? '+' : MINUS) + Math.abs(r * 100).toFixed(2) + '%';
const dateText = (d: number) => { const s = String(d); return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`; };
/** the shake every mode shares (the same seconds give the same offsets, so the header, the cards and the chart jump together) */
export function jolt(shocks: unknown, t: number, u: number) {
  let shock = 0, seed = 0;
  for (const v of times(shocks)) { const d = t - v; if (d >= 0 && d < 0.9) { const e = Math.exp(-d / 0.28); if (e > shock) { shock = e; seed = Math.round(v * 100); } } }
  const R = rng(seed + Math.floor(t * 30));
  const sx = shock ? (R() - 0.5) * 26 * u * shock : 0, sy = shock ? (R() - 0.5) * 16 * u * shock : 0;
  return { shock, sx, sy, R };
}
/** a glitch entrance for DOM words: red and cyan copies pulled apart, flickering, settling in `len` seconds */
function glitchShadow(t: number, u: number, len = 0.32) {
  if (t >= len) return '';
  const k = 1 - t / len, R = rng(Math.floor(t * 30) + 7), dx = (6 + R() * 18) * u * k;
  return `${-dx}px 0 rgba(255,32,64,${0.9 * k}), ${dx}px 0 rgba(32,224,255,${0.9 * k}), `;
}
const glitchX = (t: number, u: number, len = 0.32) => (t >= len ? 0 : (rng(Math.floor(t * 30) + 3)() - 0.5) * 40 * u * (1 - t / len));
const el = (tag: string, css: string, parent: HTMLElement) => { const e = document.createElement(tag); e.style.cssText = css; parent.appendChild(e); return e; };
/** a mode's own top edge (fraction of the frame height) when `top` is -1 */
const TOPS: Record<Mode, number> = { chart: 0, header: 0.125, tally: 0.3, card: 0.35, big: 0.62 };
const topOf = (p: P) => (p.top >= 0 ? p.top : TOPS[p.mode as Mode] ?? 0.3);

// ---------------------------------------------------------------- the chart
type G = CanvasRenderingContext2D;
interface Cam { tip: number; win: number; ppd: number; top: number; bot: number; xr: number; x(i: number): number; y(v: number): number }
function camera(f: Facts, p: P, tl: Timeline, t: number, W: number, Hh: number): Cam {
  const tip = tl.tip(t), win = tl.win(t);
  const [b0, b1] = String(p.band).split(',').map(Number);
  const top = Hh * (Number.isFinite(b0) ? b0 : 0.55), bot = Hh * (Number.isFinite(b1) ? b1 : 0.86);
  const xr = W * p.tipX, xl = W * 0.02;
  const ppd = (xr - xl) / win;
  // the visible price range, averaged over a few earlier moments so the vertical zoom glides instead of jumping
  let lo = 0, hi = 0, n = 0;
  for (let k = 0; k < 7; k++) {
    const tt = Math.max(0, t - k * 0.12), tp = tl.tip(tt), w = tl.win(tt);
    const i1 = Math.floor(tp), i0 = Math.max(0, Math.floor(tp - w));
    lo += Math.log(f.rmin(i0, i1)); hi += Math.log(f.rmax(i0, i1)); n++;
  }
  lo /= n; hi /= n;
  const minSpan = Math.log(1.25); if (hi - lo < minSpan) { const c = (hi + lo) / 2; lo = c - minSpan / 2; hi = c + minSpan / 2; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  return { tip, win, ppd, top, bot, xr, x: (i) => xr - (tip - i) * ppd, y: (v) => bot - (Math.log(v) - lo) / (hi - lo) * (bot - top) };
}

function drawCandles(g: G, f: Facts, cam: Cam, i1: number, bin: number, alpha: number, lit: ((a: number, b: number) => boolean) | null, dim: number, ud: ReturnType<typeof colours>) {
  const { O, C } = f.s;
  const kFirst = Math.max(0, Math.floor((cam.tip - cam.win - bin) / bin));
  const w = Math.max(1, bin * cam.ppd * 0.62);
  for (let k = kFirst; k * bin <= i1; k++) {
    const a = k * bin, b = Math.min(i1, a + bin - 1);
    const o = O[a], c = C[b], h = f.rmax(a, b), l = f.rmin(a, b);
    const xm = cam.x((a + b) / 2);
    if (xm < -w) continue;
    const hl = lit ? lit(a, b) : false;
    g.fillStyle = g.strokeStyle = hl || c < o ? ud.down.hex : ud.up.hex;   // a lit crash is all in the colour of a fall
    g.globalAlpha = alpha * (hl ? 1 : 1 - dim);
    const yh = cam.y(h), yl = cam.y(l), yo = cam.y(o), yc = cam.y(c);
    g.lineWidth = Math.max(1, w * 0.18);
    g.beginPath(); g.moveTo(xm, yh); g.lineTo(xm, yl); g.stroke();
    const bh = Math.max(1.5, Math.abs(yc - yo));
    g.fillRect(xm - w / 2, Math.min(yo, yc), w, bh);
    if (w > 7 && bh > 14) { // a hot white core in fat candles: the light-sabre look of a zoomed-in crash
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(xm - w * 0.17, Math.min(yo, yc) + 2, w * 0.34, bh - 4);
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = Math.max(1, w * 0.06); g.beginPath(); g.moveTo(xm, yh); g.lineTo(xm, yl); g.stroke();
    }
  }
  g.globalAlpha = 1;
}

/** a lightning bolt from (x0,y0) to (x1,y1) by midpoint displacement: the main path and a few branches */
function bolt(seed: number, x0: number, y0: number, x1: number, y1: number, u: number) {
  const R = rng(seed);
  let pts: number[][] = [[x0, y0], [x1, y1]];
  let amp = Math.hypot(x1 - x0, y1 - y0) * 0.22;
  for (let k = 0; k < 7; k++) {
    const nx: number[][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      nx.push(pts[i], [(ax + bx) / 2 + (R() - 0.5) * amp, (ay + by) / 2 + (R() - 0.5) * amp * 0.25]);
    }
    nx.push(pts[pts.length - 1]); pts = nx; amp *= 0.55;
  }
  const branches: number[][][] = [];
  for (let b = 0; b < 3; b++) {
    const i = Math.floor((0.2 + R() * 0.5) * pts.length), [sx, sy] = pts[i];
    const len = (120 + R() * 220) * u, ang = Math.PI / 2 + (R() - 0.5) * 1.6;
    let bp = [[sx, sy], [sx + Math.cos(ang) * len, sy + Math.sin(ang) * len]], ba = len * 0.3;
    for (let k = 0; k < 4; k++) { const nx: number[][] = []; for (let j = 0; j < bp.length - 1; j++) nx.push(bp[j], [(bp[j][0] + bp[j + 1][0]) / 2 + (R() - 0.5) * ba, (bp[j][1] + bp[j + 1][1]) / 2 + (R() - 0.5) * ba * 0.3]); nx.push(bp[bp.length - 1]); bp = nx; ba *= 0.55; }
    branches.push(bp);
  }
  return { pts, branches };
}
const strokePath = (g: G, pts: number[][]) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts) g.lineTo(x, y); g.stroke(); };

/** a wall: the first twelve stocks of the wide CSV listed on both days, as tiles on a tilted 3D plane, the worst fall top left; each
 *  tile's change runs from `from` to the day the chart has reached (up to the day it reaches at the wall's end) */
function drawWall(ctx: ItemCtx<P>, g: G, f: Facts, w: Wide, line: string, t: number, tipI: number, endI: number, W: number, Hh: number, u: number, sx: number, sy: number, ud: ReturnType<typeof colours>) {
  const [sp, from, title = ''] = line.split('|'); const [a, b] = span(sp);
  const al = window01(t, a, b, 0.3); if (al <= 0) return 0;
  const i0 = f.idxOf(from), D = f.s.D;
  const close = (k: number, i: number) => wideClose(w, k, D[i]);
  const list = w.cols.map((c, k) => ({ k, name: c.name })).filter(({ k }) => close(k, i0) > 0 && close(k, endI) > 0)
    .map((x) => ({ ...x, end: close(x.k, endI) / close(x.k, i0) - 1 })).slice(0, 12).sort((p, q) => p.end - q.end);
  if (!list.length) return 0;
  const cols = 3, rows = Math.ceil(list.length / cols);
  const age = t - a;
  const tilt = (1 - ctx.motion.spring({ duration: 0.8, bounce: 0.15 })(age)) * 1.0 + 0.48; // radians: lying flat → leaning back
  const yaw = Math.sin((t - a) * 0.6 - 0.8) * 0.2;
  const fl = 2400 * u, cx = W / 2 + sx, cy = Hh * 0.6 + sy;
  const pw = W * 0.8, ph = Hh * 0.39, gap = 14 * u, tw = (pw - gap * (cols - 1)) / cols, th = (ph - gap * (rows - 1)) / rows;
  const ct = Math.cos(tilt), st2 = Math.sin(tilt), cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const P3 = (x: number, y: number) => { // plane point (x right, y down, centred) → screen
    const y1 = y * ct, z1 = -y * st2; // lean the top away
    const x2 = x * cyw + z1 * syw, z2 = -x * syw + z1 * cyw;
    const k = fl / (fl + z2); return [cx + x2 * k, cy + y1 * k];
  };
  g.save(); g.globalAlpha = al;
  const [tx0, ty0] = P3(0, -ph / 2);
  g.font = `700 ${Math.round(52 * u)}px "Noto Sans TC"`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = '#e8ecee';
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 16 * u;
  const tty = Math.max(Hh * 0.405, ty0 - 14 * u); if (title) { g.fillText(title, tx0, tty); ctx.reportText(g, title, tx0, tty); } g.shadowBlur = 0;
  list.forEach(({ k: col, name }, k) => {
    const c = k % cols, r = Math.floor(k / cols);
    const flip = ctx.motion.spring({ duration: 0.5, bounce: 0.35 })(Math.max(0, age - 0.25 - k * 0.06)); if (flip <= 0.01) return;
    const x0 = -pw / 2 + c * (tw + gap), y0 = -ph / 2 + r * (th + gap);
    const ym = y0 + th / 2, hh = th / 2 * flip; // the tile flips open around its middle
    const A = P3(x0, ym - hh), B = P3(x0 + tw, ym - hh), Cc = P3(x0 + tw, ym + hh), Dd = P3(x0, ym + hh);
    const now = Math.max(i0, Math.min(tipI, endI));
    const ch = close(col, now) / close(col, i0) - 1;
    const m = Math.min(1, Math.abs(ch) / 0.85), base = ch >= 0 ? ud.up.rgb : ud.down.rgb;
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(Cc[0], Cc[1]); g.lineTo(Dd[0], Dd[1]); g.closePath();
    g.fillStyle = 'rgba(4,8,10,0.86)'; g.fill(); g.fillStyle = `rgba(${base},${0.16 + 0.62 * m})`; g.fill();
    g.strokeStyle = `rgba(${base},${0.5 + 0.5 * m})`; g.lineWidth = 2 * u; g.stroke();
    if (flip < 0.5) return;
    // the words on the tile through an affine map of its corners (tile px → screen)
    g.save();
    g.setTransform((B[0] - A[0]) / tw, (B[1] - A[1]) / tw, (Dd[0] - A[0]) / (2 * hh), (Dd[1] - A[1]) / (2 * hh), A[0], A[1]);
    g.globalAlpha = al * Math.min(1, (flip - 0.5) * 3);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.font = `700 ${Math.round(50 * u)}px "Noto Sans TC"`;
    const nx = 18 * u, ny = 14 * u; g.fillText(name, nx, ny); ctx.reportText(g, name, nx, ny);
    const shown = ch * ctx.motion.ease.out(Math.min(1, Math.max(0, age - 0.25 - k * 0.06) / 0.7));
    const label = (shown >= 0 ? '+' : MINUS) + Math.abs(shown * 100).toFixed(0) + '%';
    { // a sheen sweeping across the wall, left to right, a second after it stands
      const sw = (age - 1.0 - (c * 0.12 + r * 0.06)) / 0.5;
      if (sw > 0 && sw < 1) {
        const x = -tw * 0.3 + sw * tw * 1.6, gr = g.createLinearGradient(x - tw * 0.25, 0, x + tw * 0.25, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, tw, 2 * hh);
      }
      if (k === 0) { g.strokeStyle = `rgba(170,255,210,${0.35 + 0.35 * Math.sin(age * 9)})`; g.lineWidth = 5 * u; g.strokeRect(0, 0, tw, 2 * hh); }
      g.fillStyle = '#ffffff';
    }
    g.font = `400 ${Math.round(78 * u)}px Anton`; g.textAlign = 'right'; g.textBaseline = 'bottom';
    const px = tw - 16 * u, py = 2 * hh - 10 * u; g.fillText(label, px, py); ctx.reportText(g, label, px, py);
    g.restore();
  });
  g.restore();
  return al;
}

function drawChart(ctx: ItemCtx<P>, s: S, f: Facts) {
  const { W, H: Hh, params: p } = ctx, t = ctx.t; // keys and every listed second are film seconds
  const { C, H: HI, L: LO } = f.s, ud = colours(p.updown);
  const u = Math.min(W, Hh) / 1080;
  const tl = timeline(f, p.keys);
  const cam = camera(f, p, tl, t, W, Hh);
  const i1 = Math.floor(cam.tip);
  const g = s.cv!.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  // background: near-black with a cool centre
  g.fillStyle = '#030405'; g.fillRect(0, 0, W, Hh);
  const rg = g.createRadialGradient(W * 0.55, Hh * 0.6, 0, W * 0.55, Hh * 0.6, Hh * 0.7);
  rg.addColorStop(0, 'rgba(40,60,70,0.22)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, Hh);

  // shock: chromatic split + shake, decaying after each listed second, and a zoom punch about the tip
  const { shock, sx, sy, R } = jolt(p.shocks, t, u);
  const punch = 1 + 0.07 * shock * shock;
  const px0 = cam.x(i1), py0 = cam.y(C[i1]);
  const enter = (gg: G) => { gg.translate(sx, sy); if (punch > 1.0005) { gg.translate(px0, py0); gg.scale(punch, punch); gg.translate(-px0, -py0); } };

  // a faint price grid (1, 2, 5 × powers of ten) and year lines
  g.save(); enter(g);
  g.strokeStyle = 'rgba(160,190,200,0.07)'; g.lineWidth = 1.5 * u;
  for (let e = -2; e <= 7; e++) for (const m of [1, 2, 5]) {
    const v = m * 10 ** e, y = cam.y(v); if (y < cam.top - 200 * u || y > cam.bot + 200 * u) continue;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  const yearStep = cam.win > 4000 ? 5 : 1;
  for (let yr = f.years[0] + 1; yr <= f.years[1]; yr += yearStep) {
    const x = cam.x(f.idxOf(yr * 10000 + 101)); if (x < 0 || x > W) continue;
    g.beginPath(); g.moveTo(x, cam.top - 120 * u); g.lineTo(x, cam.bot + 140 * u); g.stroke();
  }
  { // a perspective floor under the chart, sliding with the time axis
    const hy = cam.bot - 40 * u, vx = W * 0.5;
    const fl = g.createLinearGradient(0, hy, 0, Hh); fl.addColorStop(0, 'rgba(60,220,200,0)'); fl.addColorStop(1, 'rgba(60,220,200,0.22)');
    g.strokeStyle = fl; g.lineWidth = 1.5 * u;
    for (let k = 1; k <= 9; k++) { const y = hy + (Hh - hy) * (k / 9) ** 2; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const step = 150 * u, off = ((cam.tip * cam.ppd * 2.2) % step + step) % step;
    for (let x = -W * 2 - off; x < W * 3; x += step) { g.beginPath(); g.moveTo(vx + (x - vx) * 0.08, hy); g.lineTo(x, Hh); g.stroke(); }
  }
  g.restore();

  // moods: red alert (vignette + drifting virus specks) and grey (the day the market stopped)
  let red = 0; for (const l of lines(p.reds)) { const [a, b] = span(l); red = Math.max(red, window01(t, a, b, 0.6)); }
  let gray = 0; for (const l of lines(p.grays)) { const [a, b] = span(l); gray = Math.max(gray, window01(t, a, b, 0.5)); }
  if (red > 0) {
    const vg = g.createRadialGradient(W / 2, Hh * 0.55, Hh * 0.25, W / 2, Hh * 0.55, Hh * 0.75);
    vg.addColorStop(0, 'rgba(120,0,10,0)'); vg.addColorStop(1, `rgba(170,0,20,${0.55 * red})`); g.fillStyle = vg; g.fillRect(0, 0, W, Hh);
    const VR = rng(77);
    for (let k = 0; k < 46; k++) {
      const bx = VR() * W, by = VR() * Hh, sp = (8 + VR() * 30) * u, ph = VR() * 6.28, r = (10 + VR() * 18) * u;
      const x = (bx + Math.sin(t * 0.7 + ph) * 40 * u) % W, y = ((by - t * sp) % Hh + Hh) % Hh;
      g.save(); g.translate(x, y); g.rotate(t * 0.4 + ph); g.globalAlpha = red * (0.25 + 0.35 * ((k % 3) / 2));
      g.strokeStyle = '#ff2a3c'; g.lineWidth = 2.2 * u;
      g.beginPath(); for (let a = 0; a < 6; a++) { const an = a * Math.PI / 3; g.moveTo(Math.cos(an) * r * 0.45, Math.sin(an) * r * 0.45); g.lineTo(Math.cos(an) * r, Math.sin(an) * r); } g.stroke();
      g.beginPath(); g.arc(0, 0, r * 0.4, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;
  }

  // the walls (behind the candles); the chart steps back while one stands
  let wallA = 0;
  if (s.wide) for (const l of lines(p.walls)) {
    const [a, b] = span(l.split('|')[0]); if (t < a - 0.01 || t > b + 0.01) continue;
    wallA = Math.max(wallA, drawWall(ctx, g, f, s.wide, l, t, i1, Math.floor(tl.tip(b)), W, Hh, u, sx, sy, ud));
  }
  const dimC = 1 - 0.78 * wallA;
  // the candles into the offscreen canvas, at two bin sizes cross-faded so the zoom never pops
  const off = s.off!, o = off.getContext('2d')!; o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, W, Hh);
  const target = (cam.xr - W * 0.02) / (7 * u);
  const lvl = Math.max(0, Math.log2(cam.win / target));
  const b0 = 2 ** Math.floor(lvl), fr = lvl - Math.floor(lvl);
  const crashes = lines(p.crashes).map((l) => l.split('|').map((d) => f.idxOf(d)));
  let glow = 0; for (const l of lines(p.glow)) { const [a, b] = span(l); glow = Math.max(glow, window01(t, a, b, 0.5)); }
  const lit = glow > 0 ? (a: number, b: number) => crashes.some(([x, y]) => b >= x && a <= y) : null;
  drawCandles(o, f, cam, i1, b0, 1 - fr * 0.999, lit, glow * 0.85, ud);
  if (fr > 0.001) drawCandles(o, f, cam, i1, b0 * 2, fr, lit, glow * 0.85, ud);
  if (gray > 0) { // grey: the candles drained of colour and brightened, like a photograph of that day
    o.globalCompositeOperation = 'source-atop'; o.globalAlpha = gray * 0.85; o.fillStyle = '#e9eef0'; o.fillRect(0, 0, W, Hh);
    o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
  }
  g.save(); enter(g);
  // glow, then the crisp candles
  g.globalCompositeOperation = 'lighter';
  g.filter = `blur(${Math.round(8 * u)}px)`; g.globalAlpha = dimC; g.drawImage(off, 0, 0);
  g.filter = `blur(${Math.round(24 * u)}px)`; g.globalAlpha = 0.8 * dimC; g.drawImage(off, 0, 0);
  g.filter = `blur(${Math.round(60 * u)}px)`; g.globalAlpha = 0.5 * dimC; g.drawImage(off, 0, 0);
  g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (shock > 0.02) { // red and cyan ghosts pulled apart
    const tg = s.tint!.getContext('2d')!; const dx = 16 * u * shock;
    for (const [col, ox] of [['#ff2040', -dx], ['#20e0ff', dx]] as const) {
      tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, W, Hh); tg.drawImage(off, 0, 0);
      tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, W, Hh);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.75 * shock * dimC; g.drawImage(s.tint!, ox, 0);
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  g.globalAlpha = dimC; g.drawImage(off, 0, 0); g.globalAlpha = 1;

  // reference lines (an old high), markers (a dot and a label) and the measuring brackets
  for (const l of lines(p.refs)) {
    const [sp, date, label = ''] = l.split('|'); const [a, b] = span(sp); const al = window01(t, a, b, 0.4); if (al <= 0) continue;
    const i = f.idxOf(date), y = cam.y(C[i]), x0 = Math.max(0, cam.x(i));
    if (y < cam.top - 30 || y > cam.bot) continue; // only inside the chart's own band
    g.globalAlpha = al; g.strokeStyle = GOLD; g.lineWidth = 2.5 * u; g.setLineDash([12 * u, 10 * u]);
    g.beginPath(); g.moveTo(x0, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]);
    g.font = `700 ${Math.round(48 * u)}px "Noto Sans TC"`; g.fillStyle = GOLD; g.textAlign = 'right'; g.textBaseline = 'bottom';
    const tx = W - W * 0.12, ty = y - 12 * u; g.fillText(label, tx, ty); ctx.reportText(g, label, tx, ty);
    g.globalAlpha = 1;
  }
  for (const l of lines(p.markers)) {
    const [sp, date, label = ''] = l.split('|'); const [a, b] = span(sp);
    const i = f.idxOf(date); if (i > i1) continue;
    const al = window01(t, a, b, 0.35); if (al <= 0) continue;
    const x = cam.x(i), y = cam.y(HI[i]);
    const pop = ctx.motion.spring({ duration: 0.5, bounce: 0.4 })(Math.max(0, t - a));
    g.globalAlpha = al; g.fillStyle = GOLD; g.shadowColor = GOLD; g.shadowBlur = 24 * u;
    g.beginPath(); g.arc(x, y, 10 * u * pop, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,181,71,0.6)'; g.lineWidth = 2 * u; g.beginPath(); g.moveTo(x, y - 18 * u); g.lineTo(x, y - 70 * u * pop); g.stroke();
    g.font = `400 ${Math.round(64 * u)}px "Bebas Neue"`; g.fillStyle = '#fff'; g.textBaseline = 'bottom';
    const tw = g.measureText(label).width;
    g.textAlign = 'left'; const tx = Math.max(W * 0.06, Math.min(W * 0.94 - tw, x - tw / 2));
    const ty = y - 78 * u * pop; g.fillText(label, tx, ty); ctx.reportText(g, label, tx, ty);
    g.globalAlpha = 1;
  }
  for (const l of lines(p.brackets)) {
    const [sp, date] = l.split('|'); const [a, b] = span(sp); const al = window01(t, a, b, 0.35); if (al <= 0) continue;
    const i = f.idxOf(date); if (i > i1) continue;
    const x0 = cam.x(i), y0 = cam.y(C[i]), xt = cam.x(i1) + 34 * u, yt = cam.y(C[i1]);
    const r = C[i1] / C[i] - 1, col = r >= 0 ? ud.up.hex : ud.down.hex;
    g.globalAlpha = al; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2 * u; g.setLineDash([8 * u, 8 * u]);
    g.beginPath(); g.moveTo(Math.max(0, x0), y0); g.lineTo(xt, y0); g.stroke(); g.setLineDash([]);
    g.strokeStyle = col; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(xt, y0); g.lineTo(xt, yt); g.moveTo(xt - 12 * u, y0); g.lineTo(xt + 12 * u, y0); g.moveTo(xt - 12 * u, yt); g.lineTo(xt + 12 * u, yt); g.stroke();
    g.font = `400 ${Math.round(58 * u)}px "Bebas Neue"`; g.fillStyle = col; g.textAlign = 'right'; g.textBaseline = 'middle';
    const label = pctText(r), tx = xt - 18 * u, ty = (y0 + yt) / 2; g.fillText(label, tx, ty); ctx.reportText(g, label, tx, ty);
    g.globalAlpha = 1;
  }

  { // a comet trail: the closes the tip ran over in the last half second, brightest at the head
    const iFrom = Math.floor(tl.tip(Math.max(0, t - 0.5)));
    if (i1 - iFrom >= 2 && dimC > 0.5) {
      const step = Math.max(1, Math.floor((i1 - iFrom) / 90));
      const pts: number[][] = []; for (let i = iFrom; i <= i1; i += step) pts.push([cam.x(i), cam.y(C[i])]); pts.push([cam.x(i1), cam.y(C[i1])]);
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      const col = C[i1] >= C[iFrom] ? ud.up.trail : ud.down.trail;
      for (let q = 1; q < pts.length; q++) {
        const k = q / (pts.length - 1);
        g.strokeStyle = `rgba(${col},${0.85 * k * k})`; g.lineWidth = (2 + 12 * k * k) * u;
        g.beginPath(); g.moveTo(pts[q - 1][0], pts[q - 1][1]); g.lineTo(pts[q][0], pts[q][1]); g.stroke();
      }
      g.filter = `blur(${Math.round(14 * u)}px)`; g.strokeStyle = `rgba(${col},0.6)`; g.lineWidth = 18 * u;
      g.beginPath(); const h0 = pts[Math.floor(pts.length * 0.6)]; g.moveTo(h0[0], h0[1]); for (let q = Math.floor(pts.length * 0.6); q < pts.length; q++) g.lineTo(pts[q][0], pts[q][1]); g.stroke();
      g.filter = 'none'; g.globalCompositeOperation = 'source-over';
    }
  }
  // the tip: a vertical hairline and a glowing dot
  const xt = cam.x(i1), yt = cam.y(C[i1]);
  const tipCol = C[i1] >= C[Math.max(0, i1 - 20)] ? ud.up.hex : ud.down.hex;
  const vg = g.createLinearGradient(0, yt, 0, cam.bot + 160 * u); vg.addColorStop(0, 'rgba(255,255,255,0.35)'); vg.addColorStop(1, 'rgba(255,255,255,0)');
  g.strokeStyle = vg; g.lineWidth = 1.5 * u; g.beginPath(); g.moveTo(xt, yt); g.lineTo(xt, cam.bot + 160 * u); g.stroke();
  const halo = g.createRadialGradient(xt, yt, 0, xt, yt, 46 * u); halo.addColorStop(0, tipCol); halo.addColorStop(0.25, tipCol + 'aa'); halo.addColorStop(1, tipCol + '00');
  g.fillStyle = halo; g.beginPath(); g.arc(xt, yt, 46 * u, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(xt, yt, 6.5 * u, 0, Math.PI * 2); g.fill();

  // sparks: puffs emitted from where the tip was, falling and fading
  g.globalCompositeOperation = 'lighter';
  for (const l of lines(p.sparks)) {
    const [a, b] = span(l); const dt = 1 / 24;
    for (let k = Math.ceil(Math.max(a, t - 1.1) / dt); k * dt <= Math.min(b, t); k++) {
      const te = k * dt, age = t - te; if (age < 0) continue;
      const ce = camera(f, p, tl, te, W, Hh), ie = Math.floor(ce.tip);
      const ex = ce.x(ie) - (cam.tip - ce.tip) * cam.ppd, ey = ce.y(C[ie]);
      const rr = rng(k * 7 + 3);
      for (let q = 0; q < 4; q++) {
        const ang = -Math.PI * (0.15 + rr() * 0.7), sp = (140 + rr() * 420) * u, life = 0.6 + rr() * 0.5;
        if (age > life) { rr(); continue; }
        const px = ex + Math.cos(ang) * sp * age - 120 * u * age, py = ey + Math.sin(ang) * sp * age + 520 * u * age * age;
        const al = 1 - age / life;
        g.fillStyle = q % 2 ? `rgba(255,200,120,${al})` : `rgba(255,90,90,${al})`;
        g.beginPath(); g.arc(px, py, (2.2 + rr() * 2.4) * u, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // white light pillars standing on a day (the market closed)
  for (const l of lines(p.pillars)) {
    const [sp, date] = l.split('|'); const [a, b] = span(sp); const al = window01(t, a, b, 0.4); if (al <= 0) continue;
    const x = cam.x(f.idxOf(date)), flick = 0.85 + 0.15 * Math.sin(t * 37);
    for (const [wd, aa] of [[90, 0.12], [34, 0.3], [8, 0.9]]) {
      const pg = g.createLinearGradient(x - wd * u / 2, 0, x + wd * u / 2, 0);
      pg.addColorStop(0, 'rgba(255,255,255,0)'); pg.addColorStop(0.5, `rgba(235,245,255,${aa * al * flick})`); pg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = pg; g.fillRect(x - wd * u / 2, 0, wd * u, Hh);
    }
  }
  // lightning: strikes the bar the tip was on at that second (or "seconds@date" that day), flickering, with a splash of sparks
  let flash = 0;
  for (const entry of String(p.bolts ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean)) {
    const [tbs, onDate] = entry.split('@'), tb = +tbs;
    const age = t - tb; if (Number.isNaN(tb) || age < 0 || age > 0.9) continue;
    const ib = onDate ? f.idxOf(onDate) : Math.floor(tl.tip(tb)), x1 = cam.x(ib), y1 = cam.y(LO[ib]);
    const on = age < 0.5 ? (Math.floor(age / 0.05) % 3 !== 2 ? 1 : 0.25) : Math.max(0, 1 - (age - 0.5) / 0.4) * 0.6;
    const R2 = rng(Math.round(tb * 100));
    const x0 = x1 + (R2() - 0.5) * 360 * u, y0 = Hh * 0.04;
    const bl = bolt(Math.round(tb * 100) * 13 + Math.floor(age / 0.09), x0, y0, x1, y1, u);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [wd, col, bl2] of [[16, 'rgba(140,180,255,0.35)', 18], [7, 'rgba(200,225,255,0.8)', 6], [2.6, '#ffffff', 0]] as const) {
      g.globalAlpha = on; g.strokeStyle = col; g.lineWidth = wd * u; g.filter = bl2 ? `blur(${Math.round(bl2 * u)}px)` : 'none';
      strokePath(g, bl.pts); g.lineWidth = wd * u * 0.55; for (const br of bl.branches) strokePath(g, br);
    }
    g.filter = 'none';
    const hit = g.createRadialGradient(x1, y1, 0, x1, y1, 140 * u); hit.addColorStop(0, `rgba(230,255,240,${0.9 * on})`); hit.addColorStop(1, 'rgba(120,255,180,0)');
    g.globalAlpha = 1; g.fillStyle = hit; g.beginPath(); g.arc(x1, y1, 140 * u, 0, Math.PI * 2); g.fill();
    const SR = rng(Math.round(tb * 100) + 5);
    for (let q = 0; q < 60; q++) {
      const ang = -Math.PI * (0.05 + SR() * 0.9), spd = (200 + SR() * 700) * u, life = 0.4 + SR() * 0.5;
      if (age > life) continue;
      const px = x1 + Math.cos(ang) * spd * age, py = y1 + Math.sin(ang) * spd * age + 900 * u * age * age;
      g.globalAlpha = 1 - age / life; g.fillStyle = q % 3 ? '#b9ffd9' : '#ffffff';
      g.fillRect(px, py, 3 * u, 3 * u);
    }
    flash = Math.max(flash, age < 0.5 ? on * Math.exp(-age / 0.15) : 0);
  }
  // fireworks: a burst over the tip of that second, trails falling and fading
  for (const tb of times(p.bursts)) {
    const age = t - tb; if (age < 0 || age > 1.8) continue;
    const ib = Math.floor(tl.tip(tb)), cx = cam.x(ib), cy = cam.y(HI[ib]) - 140 * u;
    const BR = rng(Math.round(tb * 100) + 11);
    for (let q = 0; q < 110; q++) {
      const ang = BR() * Math.PI * 2, spd = (220 + BR() * 520) * u, life = 1.0 + BR() * 0.8, col = q % 4 === 0 ? '#ffffff' : q % 2 ? '#ff4a5e' : '#ffc35a';
      if (age > life) continue;
      const pos = (a: number) => { const d = (1 - Math.exp(-a * 2.6)) / 2.6; return [cx + Math.cos(ang) * spd * d, cy + Math.sin(ang) * spd * d + 260 * u * a * a]; };
      const [px, py] = pos(age), [qx, qy] = pos(Math.max(0, age - 0.08));
      g.globalAlpha = (1 - age / life) * (Math.floor(age * 30 + q) % 5 ? 1 : 0.4); g.strokeStyle = col; g.lineWidth = 3 * u;
      g.beginPath(); g.moveTo(qx, qy); g.lineTo(px, py); g.stroke();
    }
    if (age < 0.25) { const fg = g.createRadialGradient(cx, cy, 0, cx, cy, 220 * u); fg.addColorStop(0, `rgba(255,220,200,${0.8 * (1 - age / 0.25)})`); fg.addColorStop(1, 'rgba(255,120,100,0)'); g.globalAlpha = 1; g.fillStyle = fg; g.beginPath(); g.arc(cx, cy, 220 * u, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.restore();

  // a white flash over the whole frame when lightning strikes
  if (flash > 0.01) { g.globalAlpha = flash * 0.35; g.fillStyle = '#eaf2ff'; g.fillRect(0, 0, W, Hh); g.globalAlpha = 1; }

  // the alert frame: corner brackets round the screen and a label on its top edge
  for (const l of lines(p.hud)) {
    const [sp, label] = l.split('|'); const [a, b] = span(sp); let al = window01(t, a, b, 0.25); if (al <= 0) continue;
    if (t - a < 0.5) al *= Math.floor((t - a) / 0.08) % 2 ? 0.3 : 1; // blinks on
    const x0 = W * 0.07, x1 = W * 0.93, y0 = Hh * 0.096, y1 = Hh * 0.8, c = 70 * u;
    g.globalAlpha = al; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2 * u; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6 * u;
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { g.beginPath(); g.moveTo(x, y + dy * c); g.lineTo(x, y); g.lineTo(x + dx * c, y); g.stroke(); }
    if (label) {
      g.font = `700 ${Math.round(48 * u)}px "Noto Sans TC"`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(label).width + 50 * u;
      const lx = W * 0.88 - tw / 2, ly = y0 + 10 * u;
      g.fillStyle = '#d1001f'; g.fillRect(lx - tw / 2, ly - 34 * u, tw, 68 * u);
      g.fillStyle = '#fff'; g.fillText(label, lx, ly); ctx.reportText(g, label, lx, ly);
    }
    g.globalAlpha = 1;
  }

  // a horizontal glitch line across the frame on a shock
  if (shock > 0.05) {
    const y = Hh * (0.2 + R() * 0.6), hgt = (3 + R() * 6) * u;
    g.globalAlpha = shock; g.fillStyle = '#ff2a4a'; g.fillRect(0, y - hgt, W, hgt);
    g.fillStyle = '#26e6ff'; g.fillRect(0, y + 2 * u, W, hgt * 0.7); g.fillStyle = '#ffffff'; g.fillRect(0, y, W, 1.5 * u);
    g.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- the DOM modes
function drawHeader(ctx: ItemCtx<P>, s: S, f: Facts) {
  const { params: p, local: t, dur, H } = ctx, u = s.u, { C, D } = f.s, ud = colours(p.updown);
  const tl = timeline(f, p.keys); // keys are film seconds; the item may start later than 0
  const i = Math.floor(tl.tip(ctx.t));
  s.box.style.top = `${H * topOf(p)}px`; s.box.style.opacity = String(window01(t, 0, dur, 0.4));
  const j = jolt(p.shocks, ctx.t, u);
  s.box.style.transform = `translate(${j.sx}px,${j.sy + (1 - ctx.motion.ease.out(Math.min(1, t / 0.5))) * -30}px)`;
  const e = s.els;
  e.lab.textContent = p.label;
  const up = C[i] >= C[Math.max(0, i - 20)], c = up ? ud.up : ud.down;
  e.num.textContent = priceText(C[i]); e.num.style.color = c.hex;
  e.num.style.textShadow = `0 0 ${28 * u}px ${c.glow}`;
  e.date.textContent = dateText(D[i]);
  const r = C[i] / f.ath[i] - 1;
  if (r > -0.0005) { e.chip.textContent = p.high; e.chip.style.background = ud.up.hex; e.chip.style.color = '#fff'; }
  else { e.chip.textContent = `${p.vs} ${pctText(r)}`; e.chip.style.background = `rgba(${ud.down.rgb},0.16)`; e.chip.style.color = ud.down.hex; }
  // the day of the record it is measured against, once the fall is real (more than 5%)
  e.prev.textContent = r < -0.05 ? `${p.prev} ${dateText(D[f.athI[i]])}` : '';
  // the number flickers red/cyan for a moment on a shock
  if (j.shock > 0.15) e.num.style.textShadow = `${-12 * j.shock * u}px 0 rgba(255,32,64,0.8), ${12 * j.shock * u}px 0 rgba(32,224,255,0.8), ` + e.num.style.textShadow;
}

function drawTally(ctx: ItemCtx<P>, s: S, f: Facts) {
  const { params: p, local: t, dur, H } = ctx, u = s.u, ud = colours(p.updown);
  const tl = timeline(f, p.keys), i = Math.floor(tl.tip(ctx.t));
  const list = lines(p.falls).map((l) => l.split('|').map((d) => f.idxOf(d)));
  const e = s.els;
  while (s.cells.length < list.length) {
    const c = el('div', `width:${58 * u}px;height:${58 * u}px;border-radius:${8 * u}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center`, e.row);
    // a drawn check, not the ✓ character: which font's ✓ the browser falls back to changes where it sits in the square
    c.innerHTML = `<svg viewBox="0 0 24 24" style="width:${42 * u}px;height:${42 * u}px;display:none"><path d="M5.5 13.2l4.3 5L18.8 4.8" fill="none" stroke="#fff" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    s.cells.push(c);
  }
  s.cells.forEach((c, k) => { c.style.display = k < list.length ? '' : 'none'; });
  s.box.style.top = `${H * topOf(p)}px`; s.box.style.opacity = String(window01(t, 0, dur, 0.4));
  { const j = jolt(p.shocks, ctx.t, u); s.box.style.transform = `translate(${j.sx}px,${j.sy}px)`; }
  e.lab.textContent = p.tallyLabel;
  let n = 0;
  list.forEach(([, hit, rec], k) => {
    const c = s.cells[k], mark = c.firstElementChild as SVGElement; let pop = 1, done = false;
    if (rec !== undefined && i >= rec) {
      c.style.background = ud.up.hex; c.style.border = 'none'; done = true; n++;
      pop = ctx.motion.spring({ duration: 0.45, bounce: 0.5 })(Math.max(0, ctx.t - tl.when(rec, p.from)));
    } else if (hit !== undefined && i >= hit) {
      c.style.background = ud.down.hex; c.style.border = 'none'; n++;
      pop = ctx.motion.spring({ duration: 0.45, bounce: 0.5 })(Math.max(0, ctx.t - tl.when(hit, p.from)));
    } else { c.style.background = 'transparent'; c.style.border = `${3 * u}px solid rgba(255,255,255,0.28)`; }
    mark.style.display = done ? '' : 'none';
    c.style.transform = `scale(${0.6 + 0.4 * pop})`;
  });
  e.cnt.textContent = `${n}/${list.length}`;
}

function drawCard(ctx: ItemCtx<P>, s: S) {
  const { params: p, local: t, dur, H } = ctx, u = s.u, e = s.els;
  e.tag.textContent = p.tag; e.date.textContent = p.date; e.title.textContent = p.title; e.sub.textContent = p.sub;
  e.tag.style.display = p.tag ? '' : 'none'; e.sub.style.display = p.sub ? '' : 'none';
  e.tag.style.background = p.color; e.bar.style.background = p.color;
  const k = ctx.motion.ease.out(Math.min(1, t / 0.45)), out = Math.max(0, Math.min(1, (t - (dur - 0.35)) / 0.35));
  s.box.style.top = `${H * topOf(p)}px`;
  s.box.style.opacity = String(Math.min(k, 1 - out));
  const j = jolt(p.shocks, ctx.t, u);
  s.box.style.transform = `translate(${(1 - k) * -60 * u + j.sx}px,${j.sy}px)`;
  e.title.style.textShadow = glitchShadow(t - 0.08, u) + `0 0 ${12 * u}px rgba(0,0,0,0.8)`;
  e.title.style.transform = `translateX(${glitchX(t - 0.08, u)}px)`;
  e.bar.style.transform = `scaleY(${ctx.motion.ease.out(Math.min(1, t / 0.3))})`;
}

function drawBig(ctx: ItemCtx<P>, s: S) {
  const { params: p, local: t, dur, H } = ctx, u = s.u, e = s.els, ud = colours(p.updown);
  const tone = { up: { hex: ud.up.hex, glow: ud.up.glow }, down: { hex: ud.down.hex, glow: ud.down.glow }, white: { hex: '#ffffff', glow: 'rgba(255,255,255,0.3)' },
    gold: { hex: GOLD, glow: 'rgba(255,181,71,0.5)' } }[p.tone as 'up'] ?? { hex: '#ffffff', glow: 'rgba(255,255,255,0.3)' };
  e.main.style.font = p.font === 'text' ? `900 ${p.size * u}px/1.1 "Noto Sans TC"` : `400 ${p.size * 0.86 * u}px/1.05 Anton`;
  e.main.style.letterSpacing = p.font === 'text' ? `${2 * u}px` : `${3 * u}px`;
  e.main.style.color = tone.hex; e.main.style.textShadow = glitchShadow(t, u) + `0 0 ${10 * u}px rgba(0,0,0,0.95), 0 0 ${34 * u}px rgba(0,0,0,0.9), 0 0 ${30 * u}px ${tone.glow}`;
  e.sub.style.textShadow = `0 0 ${10 * u}px rgba(0,0,0,0.95), 0 0 ${24 * u}px rgba(0,0,0,0.9)`;
  s.box.style.textAlign = p.align;
  // a number (a percentage, a price) counts up from zero over 0.6 s
  const m = String(p.text).match(/^([+−-]?)([\d,]*\.?\d+)(%?)$/);
  if (m) {
    const v = +m[2].replace(/,/g, ''), dec = (m[2].split('.')[1] || '').length;
    const k = ctx.motion.ease.out(Math.min(1, t / 0.6));
    let s2 = (v * k).toFixed(dec); if (m[2].includes(',')) { const [a, b] = s2.split('.'); s2 = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : ''); }
    e.main.textContent = m[1] + s2 + m[3];
  } else e.main.textContent = p.text;
  e.sub.textContent = p.sub; e.sub.style.display = p.sub ? '' : 'none';
  const pop = ctx.motion.spring({ duration: 0.45, bounce: 0.3 })(t);
  const out = Math.max(0, Math.min(1, (t - (dur - 0.3)) / 0.3));
  s.box.style.top = `${H * topOf(p)}px`; s.box.style.opacity = String(Math.min(1, t / 0.15) * (1 - out));
  s.box.style.transformOrigin = p.align === 'center' ? '50% 50%' : '0% 50%';
  const j = jolt(p.shocks, ctx.t, u);
  s.box.style.transform = `translate(${j.sx + glitchX(t, u)}px,${j.sy}px) scale(${1.18 - 0.18 * pop})`;
}

// ---------------------------------------------------------------- the block
interface P {
  mode: string; data: string; keys: string; updown: string; shocks: string;
  band: string; tipX: number; sparks: string; markers: string; refs: string; brackets: string; crashes: string; glow: string;
  bolts: string; bursts: string; grays: string; reds: string; hud: string; pillars: string; walls: string; wall: string;
  label: string; vs: string; high: string; prev: string; falls: string; tallyLabel: string; from: number;
  tag: string; date: string; title: string; sub: string; color: string; text: string; tone: string; size: number; font: string; align: string; top: number;
}
interface S {
  mode: Mode; u: number; box: HTMLElement; els: Record<string, HTMLElement>; cells: HTMLElement[];
  cv?: HTMLCanvasElement; off?: HTMLCanvasElement; tint?: HTMLCanvasElement;
  ser: Series | null; wide: Wide | null; job: Promise<void>;
}

const FONTS = () => Promise.all([document.fonts.load('400 60px "Bebas Neue"', '0123456789.,%+−/'), document.fonts.load('400 60px Anton', '0123456789.,%+−×'),
  document.fonts.load('700 48px "Noto Sans TC"', '0123456789.%−')]).then(() => {});

export const candles: ItemType<P, S> = {
  type: 'common.candles', label: 'K 線走勢', kind: 'overlay', category: 'number',
  doc: 'K 線走勢片的一整套（為 9:16 設計），mode 分：chart 黑底發光 K 線圖，鏡頭跟著最新一根往右走、價格範圍（對數）跟著縮放，整個畫面是它的；header 標頭：小標（label）、跳動的收盤大數字（近 20 根漲紅跌綠）、日期、右邊「較前高 −x%」（vs）或「歷史新高」（high）小牌，跌超過 5% 時寫前高日期（prev）；tally 一排方塊數大跌（falls 一行「高點日期|跌破門檻日期|收復日期」：跌破時那格變跌色、收復時變漲色打勾，右邊「n/總數」，左邊 tallyLabel，from 從片中第幾秒起算）；card 事件卡：左邊色槓（color）、類別小牌（tag）＋日期（date）、粗體標題（title）、一行副標（sub），從左滑進、標題故障感進場；big 一個大字（text，數字和百分比會從 0 跳上去；tone up 漲色／down 跌色／white／gold，font num 窄體數字／text 粗黑體，size 字級，align left／center）＋下面一行（sub）。'
    + '資料是專案自己的 CSV（data：檔案路徑如 media/data/ndx.csv 或直接貼 CSV 文字；一行「日期,開,高,低,收」，有標題列、多出 Adj Close、Volume 欄都可以，只有「日期,收」時畫成平的 K 棒；空著是一組示意的假資料）；'
    + 'keys 一行「片中秒|日期|視窗天數或 all」決定每一刻畫到哪一天、畫面看得到幾天（chart、header、tally 給同一組，三個就永遠對得上）；keys 和其他所有秒數都是片中的秒，不管項目從第幾秒開始。'
    + 'chart 另有：band 圖的上下緣（畫面高比例「0.55,0.86」）、tipX 最新一根的位置；sparks 火花時段（一行「秒-秒」）；markers 標記（一行「秒-秒|日期|字」，金色圓點＋字）；refs 參考虛線（一行「秒-秒|日期|字」，前高）；brackets 量測括號（一行「秒-秒|起點日期」，標漲跌幅）；crashes 大跌區段「高點日期|低點日期」＋ glow 時段讓它們亮起來、其他變暗；bolts 閃電劈下的秒數（「秒@日期」劈在那一天）；bursts 煙火；grays 轉黑白（休市那天）；reds 紅色警戒（暗角＋病毒粒子）；hud 警戒框（一行「秒-秒|字」）；pillars 白色光柱（一行「秒-秒|日期」）；walls 成分股磚牆（一行「秒-秒|起點日期|標題」，牆用 wall 的寬表 CSV：「date,AAPL:蘋果,MSFT:微軟,…」每格一檔股票的收盤，取前 12 檔，傾斜的 3D 磚牆，每塊磚寫從起點到走勢畫到那天的漲跌）。'
    + 'shocks 給同一組秒數，每個模式在那幾秒一起震（整個畫面一起跳，chart 加紅藍殘影和放大）；updown red 紅漲綠跌（台灣）、green 綠漲紅跌；top 是 DOM 模式的上緣（畫面高比例，-1＝各模式自己的位置）。股市、股價、指數、幣價、匯率、長期走勢、K線、股災回顧；配 common.thunder、common.impact、common.explode',
  params: [
    { key: 'mode', label: '模式（chart 走勢圖、header 標頭、tally 大跌計數、card 事件卡、big 大字）', type: 'enum', options: [...CANDLES_MODES], default: 'chart' },
    { key: 'data', label: '資料（CSV 檔案路徑或 CSV 文字；空著＝示意資料）', type: 'string', default: '' },
    { key: 'keys', label: '時間軸（一行「片中秒|日期|視窗天數或 all」）', type: 'text', default: '0|2000-01-03|120\n1.3|2004-02-03|260\n1.9|2004-02-03|300\n3|2009-12-18|all' },
    { key: 'updown', label: '漲跌顏色（red 紅漲綠跌、green 綠漲紅跌）', type: 'enum', options: ['red', 'green'], default: 'red' },
    { key: 'shocks', label: '一起震的秒數（逗號分隔，每個模式給同一組）', type: 'string', default: '' },
    { key: 'band', label: '圖的上下緣（chart；畫面高比例「上,下」）', type: 'string', default: '0.55,0.86' },
    { key: 'tipX', label: '最新一根的位置（chart；畫面寬比例）', type: 'number', min: 0.5, max: 0.95, step: 0.01, default: 0.8 },
    { key: 'sparks', label: '火花的時段（chart；一行「秒-秒」）', type: 'text', default: '' },
    { key: 'markers', label: '標記（chart；一行「秒-秒|日期|字」）', type: 'text', default: '' },
    { key: 'refs', label: '參考虛線（chart；一行「秒-秒|日期|字」）', type: 'text', default: '' },
    { key: 'brackets', label: '量測括號（chart；一行「秒-秒|起點日期」）', type: 'text', default: '' },
    { key: 'crashes', label: '大跌區段（chart；一行「高點日期|低點日期」）', type: 'text', default: '' },
    { key: 'glow', label: '大跌亮起來的時段（chart；一行「秒-秒」）', type: 'text', default: '' },
    { key: 'bolts', label: '閃電劈下的秒數（chart；逗號分隔，「秒@日期」劈在那一天）', type: 'string', default: '' },
    { key: 'bursts', label: '煙火爆開的秒數（chart；逗號分隔）', type: 'string', default: '' },
    { key: 'grays', label: '轉黑白的時段（chart；一行「秒-秒」）', type: 'text', default: '' },
    { key: 'reds', label: '紅色警戒的時段（chart；一行「秒-秒」）', type: 'text', default: '' },
    { key: 'hud', label: '警戒框（chart；一行「秒-秒|字」）', type: 'text', default: '' },
    { key: 'pillars', label: '白色光柱（chart；一行「秒-秒|日期」）', type: 'text', default: '' },
    { key: 'walls', label: '成分股磚牆（chart；一行「秒-秒|起點日期|標題」）', type: 'text', default: '' },
    { key: 'wall', label: '磚牆的資料（chart；寬表 CSV 路徑或文字：date,代號:名稱,…）', type: 'string', default: '' },
    { key: 'label', label: '小標（header）', type: 'string', default: '示意指數' },
    { key: 'vs', label: '小牌前的字（header）', type: 'string', default: '較前高' },
    { key: 'high', label: '創新高時的小牌（header）', type: 'string', default: '歷史新高' },
    { key: 'prev', label: '前高日期前的字（header）', type: 'string', default: '前高' },
    { key: 'falls', label: '大跌（tally；一行「高點日期|跌破門檻日期|收復日期」）', type: 'text', default: '' },
    { key: 'tallyLabel', label: '左邊的字（tally）', type: 'string', default: '跌逾兩成' },
    { key: 'from', label: '從片中第幾秒起算（tally）', type: 'number', min: 0, max: 600, step: 0.1, default: 0 },
    { key: 'tag', label: '類別小牌（card）', type: 'string', default: '股災' },
    { key: 'date', label: '日期（card）', type: 'string', default: '2008.09.15' },
    { key: 'title', label: '標題（card）', type: 'string', default: '金融海嘯' },
    { key: 'sub', label: '下面一行（card、big）', type: 'string', default: '' },
    { key: 'color', label: '色槓顏色（card）', type: 'color', default: GOLD },
    { key: 'text', label: '大字（big）', type: 'string', default: '−42.50%' },
    { key: 'tone', label: '大字顏色（big；up 漲色、down 跌色、white、gold）', type: 'enum', options: ['up', 'down', 'white', 'gold'], default: 'down' },
    { key: 'size', label: '字級（big；px，1080 寬）', type: 'number', min: 48, max: 320, step: 2, default: 200 },
    { key: 'font', label: '字型（big；num 窄體數字、text 粗黑體）', type: 'enum', options: ['num', 'text'], default: 'num' },
    { key: 'align', label: '對齊（big）', type: 'enum', options: ['left', 'center'], default: 'left' },
    { key: 'top', label: '上緣（畫面高比例；-1＝模式自己的位置）', type: 'number', min: -1, max: 0.95, step: 0.005, default: -1 },
  ],
  build(ctx) {
    const { root, W, H, params: p } = ctx;
    const mode = (CANDLES_MODES as readonly string[]).includes(p.mode) ? (p.mode as Mode) : 'chart';
    const u = Math.min(W, H) / 1080, els: Record<string, HTMLElement> = {};
    let box: HTMLElement;
    const s: S = { mode, u, box: root, els, cells: [], ser: null, wide: null, job: Promise.resolve() };
    if (mode === 'chart') {
      const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
      s.cv = mk(); s.cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
      root.appendChild(s.cv); s.off = mk(); s.tint = mk();
    } else if (mode === 'header') {
      box = el('div', `position:absolute;left:${W * 0.12}px;right:${W * 0.12}px;top:0;color:#fff`, root);
      const top = el('div', 'display:flex;align-items:baseline;justify-content:space-between', box);
      els.lab = el('div', `font:700 ${48 * u}px "Noto Sans TC";color:#8d969c;letter-spacing:${2 * u}px`, top);
      els.prev = el('div', `font:700 ${48 * u}px "Noto Sans TC";color:#8d969c;white-space:nowrap`, top);
      els.num = el('div', `font:400 ${168 * u}px/1.05 Anton;letter-spacing:${1 * u}px;margin-top:${4 * u}px`, box);
      const row = el('div', `display:flex;align-items:center;justify-content:space-between;margin-top:${4 * u}px`, box);
      els.date = el('div', `font:400 ${84 * u}px/1 "Bebas Neue";letter-spacing:${3 * u}px;color:#f1f3f4`, row);
      els.chip = el('div', `font:700 ${48 * u}px/1 "Noto Sans TC";padding:${10 * u}px ${18 * u}px;border-radius:${8 * u}px;white-space:nowrap`, row);
      s.box = box;
    } else if (mode === 'tally') {
      box = el('div', `position:absolute;left:${W * 0.12}px;right:${W * 0.12}px;top:0;display:flex;align-items:center;gap:${16 * u}px`, root);
      els.lab = el('div', `font:700 ${48 * u}px/1 "Noto Sans TC";color:#c9d0d4;white-space:nowrap;margin-right:${6 * u}px`, box);
      els.row = el('div', `display:flex;gap:${12 * u}px;flex:1`, box);
      els.cnt = el('div', `font:400 ${72 * u}px/1 "Bebas Neue";color:#fff;letter-spacing:${2 * u}px;white-space:nowrap`, box);
      s.box = box;
    } else if (mode === 'card') {
      box = el('div', `position:absolute;left:${W * 0.12}px;max-width:${W * 0.76}px;top:0;padding-left:${26 * u}px`, root);
      els.bar = el('div', `position:absolute;left:0;top:0;width:${7 * u}px;height:100%;border-radius:${4 * u}px;transform-origin:top`, box);
      const head = el('div', `display:flex;align-items:center;gap:${16 * u}px`, box);
      els.tag = el('div', `font:700 ${48 * u}px/1 "Noto Sans TC";padding:${8 * u}px ${14 * u}px;border-radius:${6 * u}px;color:#1a1206`, head);
      els.date = el('div', `font:400 ${60 * u}px/1 "Bebas Neue";color:#aab3b8;letter-spacing:${2 * u}px`, head);
      els.title = el('div', `font:900 ${96 * u}px/1.15 "Noto Sans TC";color:#fff;margin-top:${14 * u}px;white-space:nowrap`, box);
      els.sub = el('div', `font:700 ${52 * u}px/1.25 "Noto Sans TC";color:#d6dbde;margin-top:${8 * u}px;white-space:nowrap`, box);
      s.box = box;
    } else {
      box = el('div', `position:absolute;left:${W * 0.12}px;right:${W * 0.12}px;top:0`, root);
      els.main = el('div', 'white-space:nowrap', box);
      els.sub = el('div', `font:700 ${52 * u}px/1.25 "Noto Sans TC";color:#e8ecee;white-space:nowrap;margin-top:${6 * u}px`, box);
      s.box = box;
    }
    const words = [p.label, p.vs, p.high, p.prev, p.tallyLabel, p.tag, p.title, p.sub, p.text, ...lines(p.walls).map((l) => l.split('|')[2] ?? ''), ...lines(p.markers).map((l) => l.split('|')[2] ?? ''),
      ...lines(p.refs).map((l) => l.split('|')[2] ?? ''), ...lines(p.hud).map((l) => l.split('|')[1] ?? '')].join('');
    const needsData = mode === 'chart' || mode === 'header' || mode === 'tally';
    s.job = Promise.all([
      FONTS(), document.fonts.load('700 48px "Noto Sans TC"', words || '字'), document.fonts.load('900 96px "Noto Sans TC"', words || '字'),
      needsData ? loadBars(ctx, p.data).then((x) => { s.ser = x; }) : null,
      mode === 'chart' && p.walls ? loadWide(ctx, p.wall).then((x) => { s.wide = x; if (x) return document.fonts.load('700 50px "Noto Sans TC"', x.cols.map((c) => c.name).join('') || '字'); }) : null,
    ]).then(() => {});
    return s;
  },
  ready(s) { return s.job; },
  hide(s) { for (const c of [s.cv, s.off, s.tint]) if (c) { c.width = 0; c.height = 0; } },
  draw(ctx, s) {
    if (s.mode === 'chart') {
      const { W, H } = ctx;
      for (const c of [s.cv!, s.off!, s.tint!]) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      if (!s.ser) { const g = s.cv!.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); return; }
      drawChart(ctx, s, facts(s.ser));
    } else if (s.mode === 'header' || s.mode === 'tally') {
      if (!s.ser) { s.box.style.opacity = '0'; return; }
      (s.mode === 'header' ? drawHeader : drawTally)(ctx, s, facts(s.ser));
    } else (s.mode === 'card' ? drawCard : drawBig)(ctx, s);
  },
};
