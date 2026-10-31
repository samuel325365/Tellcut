// common.chart's drawing: each shape of the plan painted in the look (clean, hand, woodcut), and the card under it.
import { clamp, eOut3 } from '@tellcut/engine';
import { cutPath, ellipsePts, hash, hatchFill, inkStroke, inkStrokes, loopPts, markerStroke, quadPts, rectSides, rrectPts, type PenStyle, type Pt } from '../sketch.ts';
import { type Look, type ChartP, type Box, type Mk, boxLoopPts } from './shared.ts';

export interface R { look: Look; pen: PenStyle; u: number; boil: number; t: number; ink: string }
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
export function drawCard(g: CanvasRenderingContext2D, c: Box, p: ChartP, r: R, radius: number, local: number) {
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
