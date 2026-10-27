// common.route look 'page' — the whole-page notebook route map of fd-map's fx.nbPage, made general: the places as a loop on a map
// of 1080 × 620 units (or where `pts` puts them), the whole way pencilled in faintly, a dashed ballpoint line drawn on leg by leg
// with a pen riding its tip, a red time label with a wavy underline beside each leg (`legs`), each place turning into a doodle and
// a red tick as it is reached, its name written under it on a highlighter swipe. The camera moves between modes (`cams`
// "seconds|mode"): full (the map in the middle), walk (the map up top, room for the footage below; on wide frames at the left),
// stop (small, on a scrap of paper in the corner, the current place pulsing), end (big, a little higher), near (close in on the
// current place). The lines boil 8 times a second; everything is drawn from the time alone. Text (names, labels, the note) is DOM.
import { clamp, cssCamel, eBack, eIO3, h, lerp, prog, textEm, type ItemCtx, type Theme } from '@tellcut/engine';
import { handFamily } from './hand.ts';
import { canvasAt } from './inkline.ts';
import { parseSteps, timeSpan } from './phone.ts';
import { ballpointStroke, cutPath, ellipsePts, pathLen, quadPts, wavePts, type Pt } from './sketch.ts';
import { withAlpha } from './color.ts';

export const MAP_W = 1080, MAP_H = 620;
const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'";

// ---------- doodles (a unit box −50…50; fd-map's food doodles under plain names) ----------
const ell = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = Math.PI * 2, n = 26): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const a = lerp(a0, a1, i / n); return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const seg = (x0: number, y0: number, x1: number, y1: number, n = 6): Pt[] => Array.from({ length: n + 1 }, (_, i) => [lerp(x0, x1, i / n), lerp(y0, y1, i / n)]);
const poly = (...pts: Pt[]): Pt[] => { const o: Pt[] = []; for (let i = 1; i < pts.length; i++) o.push(...seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 4).slice(i > 1 ? 1 : 0)); return o; };
const wav = (x0: number, y0: number, x1: number, y1: number, amp: number, n = 3): Pt[] => Array.from({ length: 25 }, (_, i) => { const q = i / 24; return [lerp(x0, x1, q) + Math.sin(q * Math.PI * 2 * n) * amp, lerp(y0, y1, q)]; });
export const DOODLES: Record<string, () => Pt[][]> = {
  bowl: () => [ell(0, 6, 42, 30, 0, Math.PI), ell(0, 6, 42, 9), ell(-13, -4, 13, 12), ell(13, -7, 13, 12), wav(-10, -22, -6, -46, 3, 1), wav(9, -26, 13, -48, 3, 1)],
  bun: () => [[...ell(0, 14, 40, 34, Math.PI, Math.PI * 2), ...ell(0, 14, 40, 8, 0, Math.PI)], seg(0, -18, -16, -2), seg(0, -18, 0, 0), seg(0, -18, 16, -2), ell(0, -20, 5, 4)],
  box: () => [poly([-42, -6], [26, -6], [26, 22], [-42, 22], [-42, -6]), poly([-42, -6], [-26, -22], [42, -22], [26, -6]), poly([42, -22], [42, 6], [26, 22]), ell(-24, 8, 5, 3.5), ell(-6, 12, 5, 3.5), ell(10, 6, 5, 3.5), ell(-14, -14, 5, 3), ell(14, -15, 5, 3)],
  jar: () => [poly([-30, -16], [30, -16], [32, 40], [-32, 40], [-30, -16]), poly([-34, -30], [34, -30], [34, -16], [-34, -16], [-34, -30]), wav(-22, 0, 22, 2, 5, 4).map(([x, y], i): Pt => [x, y + (i % 2 ? 4 : -4)]), wav(-20, 18, 20, 20, 5, 4).map(([x, y], i): Pt => [x, y + (i % 2 ? -4 : 4)])],
  tofu: () => [ell(-6, 24, 42, 11), poly([-34, 0], [-12, 0], [-12, 20], [-34, 20], [-34, 0]), poly([-34, 0], [-26, -9], [-4, -9], [-12, 0]), poly([-8, 4], [14, 4], [14, 22], [-8, 22], [-8, 4]), poly([-8, 4], [0, -5], [22, -5], [14, 4]), seg(38, -36, 34, 6), ell(33, 18, 3, 3)],
  cup: () => [ell(0, 12, 40, 28, 0, Math.PI), ell(0, 12, 40, 8), ell(0, 8, 32, 34, Math.PI, Math.PI * 2, 30).map(([x, y], i): Pt => [x, y + (i % 3 === 1 ? -3 : 0)]), ell(4, -30, 6, 6), seg(18, -10, 46, -40)],
  station: () => [poly([-30, -8], [30, -8], [30, 40], [-30, 40], [-30, -8]), poly([-13, -8], [-13, -40], [13, -40], [13, -8]), poly([-18, -40], [0, -54], [18, -40]), ell(0, -24, 9, 9), seg(0, -24, 0, -30, 2), seg(0, -24, 5, -22, 2), poly([-8, 40], [-8, 20], [8, 20], [8, 40]), poly([-24, 4], [-14, 4], [-14, 14], [-24, 14], [-24, 4]), poly([14, 4], [24, 4], [24, 14], [14, 14], [14, 4])],
  train: () => [poly([-48, -6], [22, -6], [22, 24], [-48, 24], [-48, -6]), poly([-48, -6], [-48, -34], [-18, -34], [-18, -6]), poly([-40, -28], [-26, -28], [-26, -14], [-40, -14], [-40, -28]), poly([2, -6], [2, -24], [12, -24], [12, -6]), poly([-1, -24], [15, -24]), poly([22, 24], [40, 24], [26, 6]), ell(-34, 30, 9, 9), ell(-8, 30, 9, 9), ell(12, 30, 7, 7), seg(-34, 30, 12, 30, 4)],
  house: () => [poly([-34, -4], [34, -4], [34, 40], [-34, 40], [-34, -4]), poly([-44, -2], [0, -42], [44, -2]), poly([-10, 40], [-10, 14], [10, 14], [10, 40]), poly([16, 2], [28, 2], [28, 12], [16, 12], [16, 2])],
  check: () => [poly([-22, 0], [-6, 18], [26, -26])],
  star: () => [Array.from({ length: 11 }, (_, i): Pt => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 20 : 46; return [Math.cos(a) * r, Math.sin(a) * r]; })],
  foot: () => [ell(0, 6, 9, 15), ell(-6, -15, 3, 3), ell(1, -17, 3, 3), ell(7, -14, 2.5, 2.5)],
};
export const DOODLE_NAMES = Object.keys(DOODLES);
const FOOD = ['bowl', 'bun', 'box', 'jar', 'tofu', 'cup'];
/** the doodle `name` at (x, y), `size` units across, turned `rot` */
export function doodlePts(name: string, x: number, y: number, size: number, rot = 0): Pt[][] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (DOODLES[name] ?? DOODLES.star)().map((l) => l.map(([a, b]): Pt => [x + (a * c - b * s) * (size / 100), y + (a * s + b * c) * (size / 100)]));
}

// ---------- the map ----------
/** the places (start first) in map units: `pts` "x,y|x,y" (map fractions) when it gives one for each, else a loop — the first half
 *  along the top from left to right, the rest back along the bottom (fd-map's seven places); `ring` (a tall frame that keeps the
 *  whole map in view): clockwise round a squarish ring from the top left, so the map fills more of the page */
export function pagePlaces(n: number, pts = '', ring = false): Pt[] {
  const given = String(pts ?? '').split('|').map((x) => x.split(',').map(Number)).filter((v) => v.length === 2 && v.every(Number.isFinite));
  if (given.length >= n) return given.slice(0, n).map(([x, y]) => [x * MAP_W, y * MAP_H]);
  const zig = [0, -30, 65, -10, 40, -25];
  if (ring && n >= 5) return Array.from({ length: n }, (_, i): Pt => {
    const a = (-3 * Math.PI) / 4 + (i * 2 * Math.PI) / n, c = Math.cos(a), sn = Math.sin(a), f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.6);
    return [540 + 370 * f(c) + zig[i % zig.length] * 0.3, 420 + 330 * f(sn) + zig[(i + 2) % zig.length] * 0.4];
  });
  if (n <= 3) return Array.from({ length: n }, (_, i) => [n > 1 ? 200 + (i * 680) / (n - 1) : 540, 310 + zig[i % zig.length]]);
  const m = Math.ceil(n / 2), b = n - m, out: Pt[] = [];
  for (let i = 0; i < m; i++) out.push([170 + (i * 690) / Math.max(1, m - 1), 150 + zig[i % zig.length]]);
  for (let j = 0; j < b; j++) out.push([b > 1 ? 830 - (j * 530) / (b - 1) : 640, 440 + zig[(j + 3) % zig.length] * 0.8 + (j === 0 ? -30 : 0)]);
  return out;
}
/** leg i: from place i to place i + 1 (i = count: the way back to the start), a gentle curve that starts and ends outside the circles */
export function legPath(P: Pt[], i: number): Pt[] {
  const a = P[i], b = P[(i + 1) % P.length], back = i === P.length - 1;
  if (back) { const x = Math.min(...P.map((q) => q[0])) - 110; return quadPts([a[0] - 26, a[1] - 10], [x, (a[1] + b[1]) / 2 + 40], [b[0] - 28, b[1] + 18], 40); }
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, s = 30 / L, cx = P.reduce((q, p) => q + p[0], 0) / P.length, cy = P.reduce((q, p) => q + p[1], 0) / P.length;
  const bu = 34 * (((a[0] + b[0]) / 2 - cx) * (-dy / L) + ((a[1] + b[1]) / 2 - cy) * (dx / L) >= 0 ? 1 : -1);
  return quadPts([a[0] + dx * s, a[1] + dy * s], [(a[0] + b[0]) / 2 - (dy / L) * bu, (a[1] + b[1]) / 2 + (dx / L) * bu], [b[0] - dx * s, b[1] - dy * s], 40);
}
/** where leg i's time label sits: off the middle of the curve, on its outer side, clear of it by half the label's width `half` */
export function legLabel(P: Pt[], i: number, half = 60): Pt {
  const L = legPath(P, i), m = L[Math.floor(L.length / 2)], a = L[0], b = L[L.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
  const cx = P.reduce((a, q) => a + q[0], 0) / P.length, cy = P.reduce((a, q) => a + q[1], 0) / P.length, nx = -dy / n, ny = dx / n, out = (m[0] - cx) * nx + (m[1] - cy) * ny >= 0 ? 1 : -1;
  const off = 40 + Math.abs(nx) * half;
  return [m[0] + nx * off * out, m[1] + ny * off * out];
}

/** when each place is reached: the start at from − 0.4 s, then `arrive` (comma separated, one per stop) or evenly to `to` */
export function arrivals(count: number, from: number, to: number, arrive = ''): number[] {
  const given = String(arrive ?? '').split(/[,，\s]+/).filter(Boolean).map(Number);
  const out = [Math.max(0, from - 0.4)];
  for (let n = 1; n <= count; n++) out.push(Number.isFinite(given[n - 1]) ? given[n - 1] : from + (n / Math.max(1, count)) * (to - from) - 0.05);
  return out;
}
/** leg n − 1 → n is drawn from a little after the place before it to the arrival */
export const legTimes = (arr: number[], n: number): [number, number] => { const a = arr[n - 1], b = arr[n]; return [a + Math.min(0.3, Math.max(0, b - a) * 0.15), Math.max(a + 0.05, b)]; };

export type Cam = 'full' | 'walk' | 'stop' | 'end' | 'near';
interface View { x: number; y: number; s: number }
/** the part of the map the camera frames, map units [x0, y0, x1, y1]: the places with room round them for the names under them, the
 *  labels beside the legs and the note */
export function contentBox(P: Pt[]): [number, number, number, number] {
  const xs = P.map((q) => q[0]), ys = P.map((q) => q[1]);
  return [Math.min(...xs) - 140, Math.min(...ys) - 100, Math.max(...xs) + 140, Math.max(...ys) + 150];
}
/** where the map lies in the frame for a mode: its top left and its scale (px per map unit), framing `box` (contentBox; the whole
 *  map by default); `cur` is the place to follow (near) */
export function camView(mode: Cam, W: number, H: number, safe: Theme['safe'], cur: Pt, box: [number, number, number, number] = [0, 0, MAP_W, MAP_H]): View {
  const tall = H / W >= 1.3, top = safe.top * H, bot = (1 - safe.bottom) * H, [bx0, by0, bx1, by1] = box, bw = bx1 - bx0, bh = by1 - by0;
  const full = tall ? Math.min((W * 0.92) / bw, ((bot - top) * 0.8) / bh) : Math.min((W * 0.86) / bw, (H * 0.76) / bh);
  const at = (sc: number, cx: number, cy: number): View => ({ x: cx - ((bx0 + bx1) / 2) * sc, y: cy - ((by0 + by1) / 2) * sc, s: sc });
  if (mode === 'walk') {
    if (tall) { const sc = Math.min((W * 0.92) / bw, (H * 0.36) / bh); return { x: W / 2 - ((bx0 + bx1) / 2) * sc, y: top - by0 * sc, s: sc }; }
    const sc = Math.min((W * 0.47) / bw, (H * 0.8) / bh);
    return { x: W * 0.04 - bx0 * sc, y: H / 2 - ((by0 + by1) / 2) * sc, s: sc };
  }
  if (mode === 'stop') { const sc = full * (tall ? 0.4 : 0.36); return { x: W * (tall ? 0.893 : 0.95) - bx1 * sc, y: top + 4 * (Math.min(W, H) / 1080) - by0 * sc, s: sc }; }
  if (mode === 'end') return at(full * (tall ? 1 : 0.92), W / 2, tall ? H * 0.41 : (top + bot) / 2);
  if (mode === 'near') { const sc = full * 1.45, cx = W / 2, cy = tall ? top + H * 0.2 : (top + bot) / 2; return { x: cx - cur[0] * sc, y: cy - cur[1] * sc, s: sc }; }
  return at(full, W / 2, (top + bot) / 2);
}
export const parseCams = (s: string) => parseSteps(String(s ?? '').replace(/[,，]/g, '\n')).map(({ t, v }) => ({ t, mode: (['full', 'walk', 'stop', 'end', 'near'].includes(v[0]) ? v[0] : 'full') as Cam }));

// ---------- the drawing ----------
export interface PageP {
  stops: number; names: string; start: string; startIcon: string; from: number; to: number; icons: string; legs: string; arrive: string; cams: string; pts: string;
  loop: string; flash: number; note: string; inset: string; handFont: string; paper: string; ink: string; accent: string; hl: string;
}
interface Label { el: HTMLElement }
export interface PageS { box: HTMLElement; cv: HTMLCanvasElement; names: Label[]; legs: Label[]; emoji: Label[]; note: HTMLElement; inset: HTMLElement; key: string }

export function pageState(root: HTMLElement): PageS {
  const box = h('div', null, null, root), cv = h('canvas', null, null, box) as HTMLCanvasElement;
  cssCamel(box, { position: 'absolute', inset: '0', overflow: 'hidden' });
  cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
  const txt = () => { const e = h('div', null, null, box); cssCamel(e, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', fontWeight: '700' }); return e; };
  return { box, cv, names: [], legs: [], emoji: [], note: txt(), inset: txt(), key: '' };
}

const write = (t: number, t0: number, n: number) => clamp((t - t0) / Math.max(0.25, Math.min(0.9, n * 0.09)));

/** the camera at t: the mode in force, eased from the one before over 0.45 s */
function camAt(t: number, cams: Array<{ t: number; mode: Cam }>, W: number, H: number, safe: Theme['safe'], cur: Pt, box: [number, number, number, number]): View & { small: number } {
  let m0: Cam = cams[0]?.mode ?? 'full', m1 = m0, q = 1;
  for (const c of cams) { if (t < c.t) break; m0 = m1; m1 = c.mode; q = eIO3(prog(t, c.t, c.t + 0.45)); }
  const a = camView(m0, W, H, safe, cur, box), b = camView(m1, W, H, safe, cur, box);
  return { x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), s: lerp(a.s, b.s, q), small: lerp(m0 === 'stop' ? 1 : 0, m1 === 'stop' ? 1 : 0, q) };
}

/** dashes along `pts` up to `frac`, each a ballpoint stroke */
function dashed(g: CanvasRenderingContext2D, pts: Pt[], o: { frac?: number; color: string; w: number; seed: number; t: number; alpha?: number; on?: number; off?: number }) {
  const p = cutPath(pts, o.frac ?? 1); if (p.length < 2) return;
  const on = o.on ?? 17, off = o.off ?? 12, put = (q: Pt[], k: number) => { if (q.length > 1) ballpointStroke(g, q, { w: o.w, color: o.color, seed: o.seed + k * 5, alpha: o.alpha, boil: 8, t: o.t }); };
  let acc = 0, k = 0, drawing = true, cur: Pt[] = [p[0]];
  for (let i = 1; i < p.length; i++) {
    let [x0, y0] = p[i - 1], d = Math.hypot(p[i][0] - x0, p[i][1] - y0);
    const [x1, y1] = p[i];
    while (d > 1e-9) {
      const lim = drawing ? on : off, step = Math.min(d, lim - acc), q = step / d, nx = lerp(x0, x1, q), ny = lerp(y0, y1, q);
      if (drawing) cur.push([nx, ny]);
      acc += step; d -= step; x0 = nx; y0 = ny;
      if (acc >= lim - 1e-6) { if (drawing) put(cur, k++); drawing = !drawing; acc = 0; cur = [[nx, ny]]; }
    }
  }
  if (drawing) put(cur, k);
}
function strokes(g: CanvasRenderingContext2D, list: Pt[][], o: { w: number; color: string; seed: number; t: number; frac?: number; alpha?: number }) {
  const lens = list.map(pathLen), tot = lens.reduce((a, b) => a + b, 0) || 1, f = clamp(o.frac ?? 1);
  let acc = 0;
  list.forEach((pts, i) => {
    const a = acc / tot, b = (acc + lens[i]) / tot; acc += lens[i];
    const local = clamp((f - a) / (b - a || 1));
    if (local > 0) ballpointStroke(g, pts, { w: o.w, color: o.color, seed: o.seed + i * 13, prog: local, alpha: o.alpha, boil: 8, t: o.t, overshoot: true });
  });
}
function pen(g: CanvasRenderingContext2D, x: number, y: number) {
  g.save(); g.translate(x, y); g.rotate(-0.62);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(14, 70, 12, 60, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b2f36'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-7, 26); g.lineTo(7, 26); g.closePath(); g.fill();
  g.fillStyle = '#c9ced6'; g.fillRect(-8, 26, 16, 14);
  g.fillStyle = '#2f59c9'; g.beginPath(); g.roundRect(-10, 40, 20, 130, 6); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-6, 48, 4, 110);
  g.restore();
}

export function drawRoutePage(ctx: ItemCtx<PageP>, s: PageS) {
  const p = ctx.params, { W, H, local: t, theme } = ctx, k = Math.min(W, H) / 1080, count = Math.max(1, Math.min(9, Math.round(p.stops)));
  const P = pagePlaces(count + 1, p.pts, H / W >= 1.3 && !/walk|stop/.test(String(p.cams ?? ''))), arr = arrivals(count, p.from, p.to >= 0 ? p.to : ctx.dur - 0.7, p.arrive), names = [p.start, ...String(p.names ?? '').split('|').map((x) => x.trim())];
  const icons = String(p.icons ?? '').split('|').map((x) => x.trim()), iconOf = (i: number) => (i === 0 ? p.startIcon || 'station' : icons[i - 1] || FOOD[(i - 1) % FOOD.length]);
  const labels = String(p.legs ?? '').split('|').map((x) => x.trim()), loop = timeSpan(p.loop);
  const pencil = withAlpha(p.ink, 0.42), ink2 = p.ink, fam = handFamily(p.handFont);
  // the place being walked to (or the last one reached): what near follows and stop pulses
  let cur = 0;
  for (let n = 1; n <= count; n++) if (t >= legTimes(arr, n)[0]) cur = n;
  const C = contentBox(P), cam = camAt(t, parseCams(p.cams), W, H, theme.safe, P[cur], C), small = cam.small, big = clamp(1 - small * 1.6);
  const g = canvasAt(s.cv, W, H), X = (q: Pt): Pt => [cam.x + q[0] * cam.s, cam.y + q[1] * cam.s];
  // the scrap of paper under the small map
  if (small > 0) {
    const x = cam.x + (C[0] - 22) * cam.s, y = cam.y + (C[1] - 16) * cam.s, w = (C[2] - C[0] + 44) * cam.s, hh = (C[3] - C[1] + 40) * cam.s;
    g.save(); g.globalAlpha = small; g.translate(x + w / 2, y + hh / 2); g.rotate(0.015);
    g.shadowColor = 'rgba(40,30,10,0.3)'; g.shadowBlur = 14 * k; g.shadowOffsetY = 5 * k;
    g.fillStyle = p.paper; g.fillRect(-w / 2, -hh / 2, w, hh); g.shadowColor = 'transparent';
    g.strokeStyle = withAlpha(p.ink, 0.12); g.lineWidth = k;
    for (let yy = -hh / 2 + 22 * k; yy < hh / 2; yy += 22 * k) { g.beginPath(); g.moveTo(-w / 2, yy); g.lineTo(w / 2, yy); g.stroke(); }
    g.restore();
  }
  s.inset.textContent = p.inset;
  cssCamel(s.inset, { display: p.inset && small > 0.9 ? 'block' : 'none', left: `${cam.x + C[2] * cam.s}px`, top: `${cam.y + (C[3] + 24) * cam.s + 10 * k}px`, transform: 'translateX(-100%)', fontFamily: fam, fontSize: `${28 * k}px`, color: pencil, opacity: String(small) });
  g.save(); g.translate(cam.x, cam.y); g.scale(cam.s, cam.s);
  const lw = 5 / (1 - small * 0.5), legsN = count + (loop ? 1 : 0);
  // the plan in pencil, then the ink legs as they are walked, the pen on the moving tip
  for (let i = 0; i < legsN; i++) dashed(g, legPath(P, i), { color: pencil, w: 3, alpha: 0.5, seed: 900 + i * 40, t });
  let tip: Pt | null = null;
  for (let n = 1; n <= legsN; n++) {
    const back = n > count, [t0, t1] = back ? [loop![0], loop![1] ?? loop![0] + 1.5] : legTimes(arr, n);
    if (t < t0) continue;
    const f = eIO3(prog(t, t0, t1));
    dashed(g, legPath(P, n - 1), { frac: f, color: back ? p.accent : p.ink, w: lw, seed: 100 + n * 50, t });
    if (f < 1) { const q = cutPath(legPath(P, n - 1), f); tip = q[q.length - 1]; }
  }
  // the places: a pencil circle until reached, then a white disc, the doodle and a red tick; the current one pulses when small
  P.forEach((q, i) => {
    const ta = arr[i];
    if (t < ta) { ballpointStroke(g, ellipsePts(q[0], q[1], 15, 15), { w: 3, color: pencil, alpha: 0.9, seed: 300 + i, boil: 8, t }); return; }
    const d = t - ta, pop = p.flash >= 0 && i > 0 ? Math.max(0, 1 - Math.abs(t - (p.flash + (i - 1) * 0.16) - 0.08) / 0.12) : 0;
    if (i === cur && small > 0.3 && i > 0) { const ph = (t * 1.6) % 1; g.globalAlpha = (1 - ph) * 0.5; g.strokeStyle = p.accent; g.lineWidth = 6; g.beginPath(); g.arc(q[0], q[1], 40 + ph * 50, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
    g.save(); g.translate(q[0], q[1]); g.scale(1 + pop * 0.3, 1 + pop * 0.3);
    g.fillStyle = withAlpha(p.paper, 0.9); g.beginPath(); g.arc(0, 0, 44 * eBack(clamp(d / 0.3), 1.6), 0, Math.PI * 2); g.fill();
    const icon = iconOf(i);
    if (DOODLES[icon]) strokes(g, doodlePts(icon, 0, 0, 82), { w: 4, color: p.ink, seed: 400 + i * 7, t, frac: clamp(d / 0.7) });
    if (i > 0) strokes(g, doodlePts('check', 30, -30, 54, ((i % 3) - 1) * 0.12), { w: 6, color: p.accent, seed: 500 + i, t, frac: clamp((d - 0.45) / 0.25) });
    g.restore();
    // the highlighter under the name
    const nm = names[i] ?? '', hw = textEm(nm) * 46 * clamp((d - 0.2) / 0.4);
    const [fx, fy] = X(q), seen = fx - (textEm(nm) * 46 * cam.s) / 2 >= 0.05 * W && fx + (textEm(nm) * 46 * cam.s) / 2 <= 0.95 * W && fy + 74 * cam.s <= 0.95 * H && fy + 74 * cam.s >= 0.05 * H;
    if (big > 0 && nm && hw > 0 && seen) { g.globalAlpha = big * 0.9; g.fillStyle = withAlpha(p.hl, 0.55); g.fillRect(q[0] - (textEm(nm) * 46) / 2, q[1] + 74 + 4, hw, 18); g.globalAlpha = 1; }
  });
  // the time labels (map units), pulled in from the frame's sides by up to 80 % of their half width; one further off (near) is left out
  const labAt = (n: number) => {
    const lab = labels[n - 1] ?? '', w = (textEm(lab) * 52) / 2 + 12, [lx, ly] = legLabel(P, n - 1, w), half = w * cam.s, m = 0.05 * W + 4 * k;
    const x0 = cam.x + lx * cam.s, sx = Math.min(Math.max(x0, m + half), W - m - half), sy = cam.y + ly * cam.s;
    return { lab, w, x: (sx - cam.x) / cam.s, y: ly, seen: half * 2 <= W - 2 * m && Math.abs(sx - x0) <= half * 0.8 && sy >= 0.05 * H && sy <= 0.95 * H };
  };
  for (let n = 1; n <= count; n++) {
    const tl = legTimes(arr, n)[1] - 0.2, L = labAt(n);
    if (!L.lab || t < tl || big <= 0 || !L.seen) continue;
    const { w, x: lx, y: ly } = L;
    ballpointStroke(g, wavePts(lx - w, ly + 34, lx + w, ly + 30, 3, 3), { w: 3, color: p.accent, prog: clamp((t - tl - 0.25) / 0.3), alpha: big, seed: 700 + n, boil: 8, t });
  }
  if (tip) pen(g, tip[0], tip[1]);
  g.restore();
  // the text: names, labels, emoji icons, the note; a word that would stand off the frame (near) is left out
  const inFrame = (x: number, y: number, half: number) => x - half >= 0.05 * W && x + half <= 0.95 * W && y >= 0.05 * H && y <= 0.95 * H;
  const key = JSON.stringify([count, names, labels]);
  if (s.key !== key) {
    s.key = key;
    for (const l of [...s.names, ...s.legs, ...s.emoji]) l.el.remove();
    const mk = (css: Record<string, string> = {}) => { const e = h('div', null, null, s.box); cssCamel(e, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', fontWeight: '700', ...css }); return { el: e }; };
    s.names = P.map(() => mk()); s.legs = Array.from({ length: count }, () => mk()); s.emoji = P.map(() => mk({ fontFamily: EMOJI, fontWeight: '400' }));
  }
  P.forEach((q, i) => {
    const [x, y] = X(q), ta = arr[i], nm = names[i] ?? '', e = s.names[i].el, f = t >= ta ? write(t, ta + 0.1, [...nm].length) : 0;
    e.textContent = nm;
    cssCamel(e, { display: nm && f > 0 && big > 0 && inFrame(x, y + 74 * cam.s, (textEm(nm) * 46 * cam.s) / 2) ? 'block' : 'none', left: `${x}px`, top: `${y + 74 * cam.s}px`, transform: 'translate(-50%, -50%)', fontFamily: fam, fontSize: `${46 * cam.s}px`, color: ink2, opacity: String(big),
      clipPath: `inset(-20% ${((1 - f) * 100).toFixed(2)}% -20% -5%)` });
    const icon = iconOf(i), em = s.emoji[i].el, pk = t >= ta ? eBack(clamp((t - ta) / 0.4), 1.9) : 0;
    em.textContent = DOODLES[icon] ? '' : icon;
    cssCamel(em, { display: !DOODLES[icon] && pk > 0 ? 'block' : 'none', left: `${x}px`, top: `${y}px`, fontSize: `${60 * cam.s}px`, transform: `translate(-50%, -50%) scale(${Math.max(0.01, pk).toFixed(4)})` });
  });
  for (let n = 1; n <= count; n++) {
    const L = labAt(n), lab = L.lab, e = s.legs[n - 1].el, tl = legTimes(arr, n)[1] - 0.2, [x, y] = X([L.x, L.y]), f = t >= tl ? write(t, tl, [...lab].length) : 0, pop = 1 + 0.18 * Math.max(0, 1 - (t - tl) / 0.25);
    e.textContent = lab;
    cssCamel(e, { display: lab && f > 0 && big > 0 && L.seen ? 'block' : 'none', left: `${x}px`, top: `${y}px`, transform: `translate(-50%, -50%) rotate(-2.3deg) scale(${pop.toFixed(4)})`, fontFamily: fam, fontSize: `${52 * cam.s}px`, color: p.accent, opacity: String(big),
      clipPath: `inset(-20% ${((1 - f) * 100).toFixed(2)}% -20% -5%)` });
  }
  s.note.textContent = p.note;
  const [nx, ny] = X([C[0] + 20, C[3] - 22]);
  cssCamel(s.note, { display: p.note && big > 0 ? 'block' : 'none', left: `${Math.max(nx, 0.05 * W + 6 * k)}px`, top: `${ny}px`, transform: 'rotate(-1.1deg)', transformOrigin: '0 50%', fontFamily: fam, fontWeight: '400', fontSize: `${34 * cam.s}px`, color: pencil, opacity: String(big * 0.95) });
}
