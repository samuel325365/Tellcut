// Hand-drawn pens shared by the common blocks, gathered from the shorts that each wrote their own: crayon (fd-tangyuan, fd-ice,
// fd-gacha: wobbly passes whose width comes and goes, thin at both ends), pencil (fishing1: two passes along the normal, in short grainy pieces of graphite),
// ballpoint (fd-map: the felt-pen line of inkline.ts with a lift-off overshoot) and marker (fd-quotes: one fat jittered line with
// a wet streak). Any of them is drawn on with `prog` (0–1, a round pen tip on its end while it moves) and can boil: with
// `boil` > 0 it is redrawn with a new wobble that many times a second, from `t`. Crayon colouring-in is hatched (two layers of
// slanted strokes, a little over the line) or scribbled (one zigzag), and a crayon layer gets the paper's grain punched out of
// it. The shapes the pens draw (loops, stars, hearts, sides that overrun their corners) are point lists. Every function is pure:
// the same arguments and the same t draw the same picture.
import { clamp, hash01, rng as lcg } from '@tellcut/engine';
import { boiled, penPath } from './inkline.ts';
import { handLoopPts, heartPts, wave } from './hand.ts';

type G = CanvasRenderingContext2D;
export type Pt = [number, number];
export type PenStyle = 'smooth' | 'ballpoint' | 'marker' | 'crayon' | 'pencil';
export { boiled, handLoopPts, heartPts };

/** a fixed sequence of numbers in 0–1 from a seed: the engine's LCG, any number taken as a seed (the sketches' pictures depend on this mapping) */
export const rng = (seed: number) => lcg((Math.abs(Math.floor(seed)) % 2147483646) + 1);
/** a fixed number in 0–1 for (i, s) */
export const hash = (i: number, s = 0) => hash01(i, s, 0.5);

// ---------- paths ----------
export const pathLen = (p: Pt[]) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };

/** the path up to the fraction f of its length (the last point cut into its segment) */
export function cutPath(p: Pt[], f: number): Pt[] {
  if (f >= 1) return p;
  if (f <= 0 || p.length < 2) return [];
  const L = pathLen(p) * f, out: Pt[] = [p[0]];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (acc + d >= L) { const q = (L - acc) / (d || 1); out.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * q, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * q]); return out; }
    acc += d; out.push(p[i]);
  }
  return out;
}

export interface Sample { x: number; y: number; d: number; nx: number; ny: number }
/** the path resampled every `step` px: each sample with its distance along and the unit normal */
export function resample(pts: Pt[], step: number): Sample[] {
  const out: Sample[] = [];
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay) || 0.0001, n = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < n; j++) { const t = j / n; out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, d: d + L * t, nx: -(by - ay) / L, ny: (bx - ax) / L }); }
    d += L;
  }
  const [lx, ly] = pts[pts.length - 1], prev = out[out.length - 1] ?? { nx: 0, ny: 1 };
  out.push({ x: lx, y: ly, d, nx: prev.nx, ny: prev.ny });
  return out;
}

// ---------- shapes ----------
export function ellipsePts(cx: number, cy: number, rx: number, ry: number, o: { turns?: number; a0?: number; n?: number; rot?: number } = {}): Pt[] {
  const turns = o.turns ?? 1, a0 = o.a0 ?? -Math.PI / 2, n = o.n ?? Math.ceil(48 * turns), rot = o.rot ?? 0, out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 * turns, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
}
/** the four sides of a rectangle, each running `over` px past its corners (drawn by hand, one side after another) */
export const rectSides = (x: number, y: number, w: number, h: number, over = 0): Pt[][] => [
  [[x - over, y], [x + w + over, y]], [[x + w, y - over], [x + w, y + h + over]], [[x + w + over, y + h], [x - over, y + h]], [[x, y + h + over], [x, y - over]],
];
/** a closed rounded rectangle from the middle of its top edge, clockwise; `over` (0–1 of the first side) runs on past the start */
export function rrectPts(x: number, y: number, w: number, h: number, r: number, over = 0, n = 10): Pt[] {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const out: Pt[] = [[x + w / 2, y]];
  const arc = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
  out.push([x + w / 2 + (w / 2 - r) * over * 2, y]);
  return out;
}
/** a five-pointed star (closed), points R out, the inner corners `inner` × R */
export function starPts(cx: number, cy: number, R: number, rot = 0, inner = 0.45): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= 10; i++) { const a = rot - Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * inner : R; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
/** a wavy line from (x0, y0) to (x1, y1): `waves` swings of `amp` across it */
export function wavePts(x0: number, y0: number, x1: number, y1: number, amp: number, waves = 3, n = 32): Pt[] {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L, out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const q = i / n, o = Math.sin(q * Math.PI * 2 * waves) * amp; out.push([x0 + (x1 - x0) * q + nx * o, y0 + (y1 - y0) * q + ny * o]); }
  return out;
}
/** a quadratic curve from a through control c to b */
export function quadPts(a: Pt, c: Pt, b: Pt, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const q = i / n, u = 1 - q; out.push([u * u * a[0] + 2 * u * q * c[0] + q * q * b[0], u * u * a[1] + 2 * u * q * c[1] + q * q * b[1]]); }
  return out;
}
/** the two strokes of an arrow head at the end of `pts`, `len` long, opened ±`spread` radians */
export function arrowHead(pts: Pt[], len: number, spread = 0.5): Pt[] {
  const a = pts[pts.length - 1], b = pts[Math.max(0, pts.length - 4)] ?? pts[0], ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
  return [[a[0] - Math.cos(ang - spread) * len, a[1] - Math.sin(ang - spread) * len], a, [a[0] - Math.cos(ang + spread) * len, a[1] - Math.sin(ang + spread) * len]];
}
/** points moved and scaled: (x, y) × s, rotated `rot`, then + (ox, oy) */
export const place = (pts: Pt[], ox: number, oy: number, s = 1, rot = 0): Pt[] => {
  const c = Math.cos(rot), n = Math.sin(rot);
  return pts.map(([x, y]) => [ox + (x * c - y * n) * s, oy + (x * n + y * c) * s]);
};

// ---------- pens ----------
export interface StrokeOpts {
  /** line width in px */ w: number;
  color: string;
  seed?: number;
  /** how much of the line is drawn (0–1) */ prog?: number;
  alpha?: number;
  /** redraws a second (0 = a fixed wobble) and the time it is drawn at */ boil?: number; t?: number;
  /** px per 1080 of the short side: the wobble's size and period follow it */ u?: number;
  /** wobble size in px (each pen has its own default) */ amp?: number;
  /** crayon: passes (3) */ passes?: number;
  /** a round pen tip on the end while the line is being drawn */ tip?: boolean;
  /** ballpoint and marker: the end runs on a little past its last point (a pen lifting off) */ overshoot?: boolean;
}

/** a crayon line: `passes` wobbly passes, the width coming and going in chunks, thin at both ends */
export function crayonStroke(g: G, pts: Pt[], o: StrokeOpts) {
  const prog = clamp(o.prog ?? 1);
  if (prog <= 0 || pts.length < 2) return;
  const u = o.u ?? 1, w = o.w, seed = boiled(o.seed ?? 1, o.t, o.boil), amp = o.amp ?? 1.6 * u, passes = o.passes ?? 3, alpha = o.alpha ?? 0.9;
  const P = resample(pts, 5 * u), total = P[P.length - 1].d, upto = total * prog, end = 18 * u;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = o.color;
  for (let p = 0; p < passes; p++) {
    const r = rng(seed * 31 + p * 7 + 3), ox = (r() - 0.5) * w * 0.45, oy = (r() - 0.5) * w * 0.45, pw = p === 0 ? w : w * (0.45 + 0.35 * r());
    g.globalAlpha = alpha * (p === 0 ? 1 : 0.6);
    let k = 0;
    while (k < P.length - 1 && P[k].d < upto) {
      const k2 = Math.min(P.length - 1, k + 6), mid = (P[k].d + P[k2].d) / 2, taper = Math.min(1, mid / end, (total - mid) / end);
      g.lineWidth = Math.max(u, pw * (0.72 + 0.4 * (0.5 + 0.5 * wave(mid / (37 * u), seed + p))) * (0.55 + 0.45 * taper));
      g.beginPath();
      for (let j = k; j <= k2 && P[j].d <= upto + 5 * u; j++) {
        const q = P[j], off = wave(q.d / (28 * u), seed + p * 1.3) * amp, x = q.x + q.nx * off + ox, y = q.y + q.ny * off + oy;
        if (j === k) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke(); k = k2;
    }
  }
  g.restore();
}

/** a pencil line (fishing1's two passes, given graphite's look): the path cut into short pieces, each a little lighter or darker
 *  (the paper's tooth), pressed harder and softer along the way and lifted at both ends; a wide soft body under a darker core, and
 *  a second, thinner pass that drifts off the line and back, starting a little late and stopping a little early */
export function pencilStroke(g: G, pts: Pt[], o: StrokeOpts) {
  const prog = clamp(o.prog ?? 1);
  if (pts.length < 2 || prog <= 0) return;
  const u = o.u ?? 1, w = o.w, amp = o.amp ?? 1.2 * u, sd = boiled(o.seed ?? 1, o.t, o.boil), a0 = o.alpha ?? 0.92;
  const P = resample(pts, 3 * u), total = P[P.length - 1].d, upto = total * prog, end = Math.min(26 * u, total * 0.3);
  // a smooth normal at each sample (across its neighbours), so corners do not tear the passes apart
  const N = P.map((_, j) => {
    const a = P[Math.max(0, j - 1)], b = P[Math.min(P.length - 1, j + 1)], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    return [-dy / L, dx / L] as Pt;
  });
  const ph = [0, 1, 2, 3].map((i) => hash(sd * 3 + i, i + 1) * Math.PI * 2);
  const sway = (d: number, k: number) => amp * (Math.sin((d / u) * 0.018 + ph[k * 2]) + 0.6 * Math.sin((d / u) * 0.051 + ph[k * 2 + 1]));
  const press = (d: number) => 0.74 + 0.26 * wave(d / (70 * u), sd);
  const lift = (d: number, from: number, to: number) => clamp(Math.min((d - from) / end, (to - d) / end));
  // the second pass: a little late, a little early, drifting 0.15–0.95 widths off the line
  const s0 = (0.02 + 0.05 * hash(sd, 7)) * total, s1 = total * (1 - 0.06 * hash(sd, 8));
  const passes: Array<{ off: (d: number) => number; w: number; a: number; from: number; to: number; grain: number; k: number }> = [
    { off: (d) => sway(d, 0), w: w * 1.2, a: a0 * 0.5, from: 0, to: total, grain: 0.7, k: 0 },
    { off: (d) => sway(d, 0), w: w * 0.55, a: a0, from: 0, to: total, grain: 0.4, k: 1 },
    { off: (d) => sway(d, 1) * 1.3 + w * (0.55 + 0.4 * wave(d / (55 * u), sd + 5)), w: w * 0.45, a: a0 * 0.5, from: s0, to: s1, grain: 0.6, k: 2 },
  ];
  g.save(); g.strokeStyle = o.color; g.lineCap = 'butt'; g.lineJoin = 'round';
  const ga = g.globalAlpha;
  for (const ps of passes) {
    for (let j = 0; j < P.length - 1; j++) {
      const A = P[j], B = P[j + 1];
      if (A.d >= upto) break;
      if (B.d <= ps.from || A.d >= ps.to) continue;
      const f = B.d > upto ? (upto - A.d) / (B.d - A.d || 1) : 1, mid = (A.d + Math.min(B.d, upto)) / 2;
      const t = lift(mid, ps.from, ps.to), pr = press(mid), gr = hash(j * 3 + ps.k, sd + 11);
      const alpha = ps.a * pr * (1 - ps.grain + ps.grain * gr) * (0.5 + 0.5 * t);
      if (alpha <= 0.004) continue;
      const oa = ps.off(A.d), ob = ps.off(B.d), bx = A.x + (B.x - A.x) * f, by = A.y + (B.y - A.y) * f;
      g.globalAlpha = ga * alpha; g.lineWidth = Math.max(0.6 * u, ps.w * (0.75 + 0.25 * pr) * (0.45 + 0.55 * t));
      g.beginPath(); g.moveTo(A.x + N[j][0] * oa, A.y + N[j][1] * oa); g.lineTo(bx + N[j + 1][0] * ob, by + N[j + 1][1] * ob); g.stroke();
    }
  }
  g.restore();
}

/** the last point pushed on by 6 % of the last segment: a pen lifting off runs a little past where it meant to stop */
const overshot = (pts: Pt[]): Pt[] => {
  if (pts.length < 2) return pts;
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  return [...pts.slice(0, -1), [b[0] + (b[0] - a[0]) * 0.06, b[1] + (b[1] - a[1]) * 0.06]];
};

/** a ballpoint line: the felt-pen line of inkline.ts (two passes, a fixed wobble at each point) */
export function ballpointStroke(g: G, pts: Pt[], o: StrokeOpts) {
  const prog = clamp(o.prog ?? 1);
  if (prog <= 0 || pts.length < 2) return;
  const a = g.globalAlpha;
  penPath(g, prog >= 1 && o.overshoot ? overshot(pts) : pts, o.w, o.color, o.seed ?? 1, prog, { boil: o.boil, t: o.t, alpha: a * (o.alpha ?? 1) });
  g.globalAlpha = a;
}

/** a marker line: one fat line through jittered points and a thin lighter streak along it (the felt tip's wet line) */
export function markerStroke(g: G, pts: Pt[], o: StrokeOpts) {
  const prog = clamp(o.prog ?? 1);
  if (prog <= 0 || pts.length < 2) return;
  const u = o.u ?? 1, r = rng(boiled(o.seed ?? 1, o.t, o.boil) * 9973), j = o.amp ?? 2.5 * u, w = o.w;
  const q = cutPath((prog >= 1 && o.overshoot ? overshot(pts) : pts).map(([x, y]) => [x + (r() - 0.5) * 2 * j, y + (r() - 0.5) * 2 * j] as Pt), prog);
  if (q.length < 2) return;
  g.save(); g.globalAlpha *= o.alpha ?? 1; g.strokeStyle = o.color; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w;
  g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.globalAlpha *= 0.28; g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1, w * 0.22);
  const s = cutPath(q, 0.96);
  g.beginPath(); s.forEach(([x, y], i) => (i ? g.lineTo(x + w * 0.12, y - w * 0.12) : g.moveTo(x + w * 0.12, y - w * 0.12))); g.stroke();
  g.restore();
}

/** a plain line (no wobble), drawn on with prog */
export function smoothStroke(g: G, pts: Pt[], o: StrokeOpts) {
  const q = cutPath(pts, clamp(o.prog ?? 1));
  if (q.length < 2) return;
  g.save(); g.globalAlpha *= o.alpha ?? 1; g.strokeStyle = o.color; g.lineWidth = o.w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.restore();
}

/** a line in any pen; with `tip` a round tip sits on its end while it is being drawn */
export function inkStroke(g: G, pts: Pt[], style: PenStyle, o: StrokeOpts) {
  const prog = clamp(o.prog ?? 1);
  if (prog <= 0 || pts.length < 2) return;
  if (style === 'crayon') crayonStroke(g, pts, o);
  else if (style === 'pencil') pencilStroke(g, pts, o);
  else if (style === 'ballpoint') ballpointStroke(g, pts, o);
  else if (style === 'marker') markerStroke(g, pts, o);
  else smoothStroke(g, pts, o);
  if (o.tip && prog < 1) {
    const end = cutPath(pts, prog), [x, y] = end[end.length - 1];
    g.save(); g.globalAlpha *= o.alpha ?? 1; g.fillStyle = o.color; g.beginPath(); g.arc(x, y, o.w * (style === 'pencil' ? 0.7 : 0.6), 0, Math.PI * 2); g.fill(); g.restore();
  }
}

/** several lines drawn one after another over prog (each gets the share of its length), seeds stepping on from o.seed */
export function inkStrokes(g: G, list: Pt[][], style: PenStyle, o: StrokeOpts) {
  const lens = list.map(pathLen), tot = lens.reduce((a, b) => a + b, 0) || 1, f = clamp(o.prog ?? 1);
  let acc = 0;
  list.forEach((pts, i) => {
    const a = acc / tot, b = (acc + lens[i]) / tot;
    acc += lens[i];
    const local = clamp((f - a) / (b - a || 1));
    if (local > 0) inkStroke(g, pts, style, { ...o, prog: local, seed: (o.seed ?? 1) + i * 13, tip: o.tip && local < 1 });
  });
}

// ---------- colouring in ----------
const bounds = (pts: Pt[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};
const clipTo = (g: G, pts: Pt[]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip(); };

export interface FillOpts { u?: number; w?: number; gap?: number; angle?: number; alpha?: number; seed?: number; prog?: number; spill?: number; boil?: number; t?: number }
/** crayon colouring-in (fishing1): two layers of slanted, slightly curved strokes, coloured a little past the line; laid one by one with prog */
export function hatchFill(g: G, pts: Pt[], color: string, o: FillOpts = {}) {
  const prog = clamp(o.prog ?? 1);
  if (prog <= 0 || pts.length < 3) return;
  const u = o.u ?? 1, sd = boiled(o.seed ?? 1, o.t, o.boil), b = bounds(pts), sc = 1 + (o.spill ?? 0.03), ox = (hash(sd, 2) - 0.5) * 7 * u, oy = (hash(sd, 3) - 0.5) * 7 * u;
  g.save();
  clipTo(g, pts.map(([x, y]) => [b.cx + (x - b.cx) * sc + ox, b.cy + (y - b.cy) * sc + oy]));
  const R = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 12 * u, gap = (o.gap ?? 5.5) * u, n = Math.ceil((2 * R) / gap), alpha = o.alpha ?? 0.6;
  g.strokeStyle = color; g.lineCap = 'round';
  const a0 = g.globalAlpha;
  for (let layer = 0; layer < 2; layer++) {
    const ang = (o.angle ?? -1.05) + layer * 0.55, dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    for (let i = 0; i < n; i++) {
      if (i / n > prog) break;
      const hh = hash(i + layer * 997, sd), off = -R + i * gap + (hh - 0.5) * gap * 0.7, bx = b.cx + nx * off, by = b.cy + ny * off;
      g.globalAlpha = a0 * alpha * (layer ? 0.5 : 1) * (0.6 + 0.4 * hash(i, sd + 1));
      g.lineWidth = (o.w ?? 6.5) * u * (0.7 + 0.6 * hh);
      g.beginPath(); g.moveTo(bx - dx * R, by - dy * R);
      g.quadraticCurveTo(bx + nx * (hh - 0.5) * 5 * u, by + ny * (hh - 0.5) * 5 * u, bx + dx * R, by + dy * R); g.stroke();
    }
  }
  g.restore();
}

/** crayon colouring-in (fd-tangyuan): one zigzag crayon stroke back and forth across the shape, clipped to it; drawn on with prog */
export function scribbleFill(g: G, pts: Pt[], color: string, o: FillOpts = {}) {
  const prog = clamp(o.prog ?? 1);
  if (prog <= 0 || pts.length < 3) return;
  const u = o.u ?? 1, w = (o.w ?? 12) * u, gap = (o.gap ?? 9) * u, angle = o.angle ?? -0.6, b = bounds(pts);
  g.save(); clipTo(g, pts);
  const R = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + w, ca = Math.cos(angle), sa = Math.sin(angle), zig: Pt[] = [];
  let k = 0;
  for (let v = -R; v <= R; v += gap) { const a = k++ % 2 ? R : -R; zig.push([b.cx + ca * a - sa * v, b.cy + sa * a + ca * v]); }
  crayonStroke(g, zig, { w, color, seed: o.seed ?? 1, boil: o.boil, t: o.t, u, amp: 2.2 * u, passes: 1, alpha: o.alpha ?? 0.75, prog });
  g.restore();
}

/** a flat fill of the closed shape */
export function flatFill(g: G, pts: Pt[], color: string, alpha = 1) {
  if (pts.length < 3) return;
  g.save(); g.globalAlpha *= alpha; g.fillStyle = color;
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  g.restore();
}

// ---------- the paper's grain ----------
/** a software canvas (a GPU one can come back empty once Chrome puts it to sleep, and its anti-aliasing can change between draws) */
function softCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  c.getContext('2d', { willReadFrequently: true });
  return c;
}
let TILE: HTMLCanvasElement | null = null;
/** a fixed 192 px tile of little holes and short streaks (crayon skipping over the paper's tooth) */
export function grainTile(): HTMLCanvasElement {
  if (TILE) return TILE;
  const c = softCanvas(192, 192), g = c.getContext('2d')!, r = rng(9173);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${(0.25 + r() * 0.55).toFixed(3)})`; const s = 0.8 + r() * 1.8; g.fillRect(r() * 192, r() * 192, s, s * (0.6 + r())); }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${(0.3 + r() * 0.5).toFixed(3)})`; g.fillRect(r() * 192, r() * 192, 3 + r() * 7, 1); }
  TILE = c;
  return c;
}

/** a crayon layer the size of the frame, reused from draw to draw */
export interface GrainLayer { cv?: HTMLCanvasElement }
/** the layer cleared and ready to draw crayon on */
export function grainBegin(L: GrainLayer, W: number, H: number): G {
  if (!L.cv || L.cv.width !== Math.round(W) || L.cv.height !== Math.round(H)) L.cv = softCanvas(W, H);
  const g = L.cv.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, L.cv.width, L.cv.height);
  return g;
}
/** the grain punched out of the layer (`density` 0–1, the tile scaled by `u`), then the layer drawn onto `target` */
export function grainEnd(L: GrainLayer, target: G, density = 0.5, u = 1) {
  const cv = L.cv;
  if (!cv) return;
  const g = cv.getContext('2d')!;
  if (density > 0) {
    const pat = g.createPattern(grainTile(), 'repeat');
    if (pat) {
      if (u !== 1 && pat.setTransform) pat.setTransform(new DOMMatrix().scale(u, u));
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = clamp(density); g.globalCompositeOperation = 'destination-out';
      g.fillStyle = pat; g.fillRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
  }
  target.drawImage(cv, 0, 0);
}

/** handLoopPts round an ellipse (the default loop the pens draw round something) */
export const loopPts = (cx: number, cy: number, rx: number, ry: number, p: number, seed: number, a0 = -2.2, turns = 1.12) => handLoopPts(cx, cy, rx, ry, p, seed, a0, turns);
