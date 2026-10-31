// common.chart's line: one or more curves drawn along with a playhead, marks on them, a baseline, the axis' two ends.
import { clamp, eOut3, prog } from '@tellcut/engine';
import { spline } from '../inkline.ts';
import { type Pt } from '../sketch.ts';
import { parseNum, chartRows, chartSeries, hlIndex, textW, fitSize, type Env, T, M, pop, baseOf, sliceColors } from './shared.ts';

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

export function planLine(e: Env) {
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
