// SVG helpers shared by the shape blocks (badge, burst).
import { rng } from '@tellcut/engine';

/** the SVG namespace, for document.createElementNS */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/** The points of a spiky star centred on (0,0): `n` spikes, tips at `outer`, valleys at `inner`; `wobble` (0–1) varies the tips from a seeded generator. */
export function spikePoints(n: number, outer: number, inner: number, rot = 0, wobble = 0, seed = 1): Array<[number, number]> {
  const r = rng(seed), pts: Array<[number, number]> = [];
  for (let i = 0; i < n * 2; i++) {
    const tip = i % 2 === 0, rad = (tip ? outer : inner) * (tip ? 1 - wobble * 0.25 * r() : 1 - wobble * 0.1 * r());
    const a = rot + (Math.PI * i) / n - Math.PI / 2;
    pts.push([+(Math.cos(a) * rad).toFixed(2), +(Math.sin(a) * rad).toFixed(2)]);
  }
  return pts;
}

/** An <svg> of `size` px square centred at its own middle (viewBox −size/2…size/2) holding one polygon. */
export function polygonSvg(): { svg: SVGSVGElement; poly: SVGPolygonElement } {
  const svg = document.createElementNS(SVG_NS, 'svg'), poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(poly);
  svg.style.overflow = 'visible';
  return { svg, poly };
}

export function setPolygon(svg: SVGSVGElement, poly: SVGPolygonElement, size: number, pts: Array<[number, number]>, fill: string, stroke: string, strokeWidth: number) {
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
  poly.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
  poly.setAttribute('fill', fill);
  poly.setAttribute('stroke', stroke);
  poly.setAttribute('stroke-width', String(strokeWidth));
}

const TAU = Math.PI * 2;
const f2 = (v: number) => v.toFixed(2);

/** A closed SVG path through `pts` with every corner rounded: each corner cut back by `rad` (at most 45 % of either edge) and joined
 *  by a quadratic curve through the corner (burst's star: a fat star with soft tips and valleys). */
export function roundedPath(pts: Array<[number, number]>, rad: number): string {
  const n = pts.length;
  return pts.map((P, i) => {
    const A = pts[(i + n - 1) % n], B = pts[(i + 1) % n];
    const la = Math.hypot(A[0] - P[0], A[1] - P[1]) || 1, lb = Math.hypot(B[0] - P[0], B[1] - P[1]) || 1, c = Math.min(rad, 0.45 * la, 0.45 * lb);
    const p1 = [P[0] + ((A[0] - P[0]) / la) * c, P[1] + ((A[1] - P[1]) / la) * c], p2 = [P[0] + ((B[0] - P[0]) / lb) * c, P[1] + ((B[1] - P[1]) / lb) * c];
    return `${i ? 'L' : 'M'}${f2(p1[0])},${f2(p1[1])} Q${f2(P[0])},${f2(P[1])} ${f2(p2[0])},${f2(p2[1])}`;
  }).join(' ') + ' Z';
}

/** A puffy cloud centred on (0,0), fitted inside a circle of radius `R`: `n` round bumps (5 at least) bulging out between points on
 *  a wide ellipse, each bump a little bigger or smaller (seeded), meeting in small inward cusps. `rx`, `ry`: the inner ellipse the
 *  words fit in (px). */
export function cloudPath(n: number, R: number, seed = 1): { d: string; rx: number; ry: number } {
  const r = rng(seed * 31 + 7), m = Math.max(5, Math.round(n)), ay = 0.72;
  r();   // the first draw of a small seed is small whatever the seed
  const pts = Array.from({ length: m }, (_, i) => { const a = ((i + 0.3 * (r() - 0.5)) / m) * TAU - Math.PI / 2; return [Math.cos(a), Math.sin(a) * ay] as [number, number]; });
  // each bump: an arc bigger than a half circle from one point to the next, bulging away from the middle
  const arcs = pts.map((P, i) => {
    const Q = pts[(i + 1) % m], h = Math.hypot(Q[0] - P[0], Q[1] - P[1]) / 2, rho = h * (1.03 + 0.14 * r());
    const mx = (P[0] + Q[0]) / 2, my = (P[1] + Q[1]) / 2, ml = Math.hypot(mx, my) || 1, off = Math.sqrt(Math.max(0, rho * rho - h * h));
    return { Q, rho, cx: mx + (mx / ml) * off, cy: my + (my / ml) * off };
  });
  const ext = Math.max(...arcs.map((a) => Math.max(Math.abs(a.cx) + a.rho, Math.abs(a.cy) + a.rho)));
  const s = R / ext;
  const d = `M${f2(pts[0][0] * s)},${f2(pts[0][1] * s)} ` + arcs.map((a) => `A${f2(a.rho * s)},${f2(a.rho * s)} 0 1 1 ${f2(a.Q[0] * s)},${f2(a.Q[1] * s)}`).join(' ') + ' Z';
  return { d, rx: s, ry: ay * s };
}

/** a paint splat's shape in units of its blob (about 0.85 across the middle), from `seed`: the blob's outline (a lumpy round, with a
 *  few fingers of paint shooting out of it, each ending in a bead), the drips running down from its lower half (x, the length below
 *  the blob's edge, the width) and the satellite drops thrown round it (where they land, their radius). `extent`: how far the whole
 *  splat reaches from the middle, fully grown. */
export function splatShape(seed = 1) {
  const r = rng(seed * 17 + 3), m = 36;
  r();
  const p1 = r() * TAU, p2 = r() * TAU, fingers = Array.from({ length: 5 }, (_, i) => ({ i: Math.floor(((i + 0.2 + 0.6 * r()) / 5) * m) % m, amp: 0.22 + 0.3 * r() }));
  const outline = Array.from({ length: m }, (_, i) => {
    const a = ((i + 0.3 * (r() - 0.5)) / m) * TAU - Math.PI / 2;
    let rad = 0.84 + 0.06 * Math.sin(2 * a + p1) + 0.05 * Math.sin(3 * a + p2) + 0.03 * (r() - 0.5);
    for (const f of fingers) rad += f.i === i ? f.amp : f.i === (i + 1) % m || f.i === (i + m - 1) % m ? f.amp * 0.18 : 0;
    return [Math.cos(a) * rad, Math.sin(a) * rad] as [number, number];
  });
  const beads = fingers.map((f) => { const [x, y] = outline[f.i], d = Math.hypot(x, y) || 1, b = 0.05 + 0.03 * r(); return { x: (x / d) * (d - b * 0.4), y: (y / d) * (d - b * 0.4), r: b }; });
  const drips = Array.from({ length: 3 }, (_, i) => ({ x: (i - 1) * 0.42 + (r() - 0.5) * 0.2, len: 0.18 + 0.3 * r(), w: 0.08 + 0.05 * r() }));
  const drops = Array.from({ length: 7 }, (_, i) => {
    const a = ((i + 0.6 * r()) / 7) * TAU - Math.PI / 2, dist = 1.15 + 0.3 * r();
    return { x: Math.cos(a) * dist, y: Math.sin(a) * dist, r: 0.025 + 0.05 * r() };
  });
  const edge = (x: number) => blobEdgeBelow(outline, x);
  const extent = Math.max(...outline.map(([x, y]) => Math.hypot(x, y)), ...beads.map((b) => Math.hypot(b.x, b.y) + b.r), ...drops.map((d) => Math.hypot(d.x, d.y) + d.r),
    ...drips.map((d) => Math.hypot(d.x, edge(d.x) + d.len + d.w * 0.75)));
  return { outline, beads, drips, drops, extent, edge };
}

/** how far down the blob's outline reaches at `x` (the lowest crossing of a vertical line there; 0.6 where nothing crosses) */
function blobEdgeBelow(outline: Array<[number, number]>, x: number): number {
  let low = -Infinity;
  outline.forEach((P, i) => {
    const Q = outline[(i + 1) % outline.length];
    if ((P[0] - x) * (Q[0] - x) <= 0 && P[0] !== Q[0]) low = Math.max(low, P[1] + ((x - P[0]) / (Q[0] - P[0])) * (Q[1] - P[1]));
  });
  return Number.isFinite(low) ? low : 0.6;
}

/** a closed smooth path through `pts` (Catmull-Rom as cubic Béziers), scaled by `s` */
export function smoothPath(pts: Array<[number, number]>, s = 1): string {
  const n = pts.length, at = (i: number) => pts[(i + n) % n];
  let d = `M${f2(pts[0][0] * s)},${f2(pts[0][1] * s)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f2(c1[0] * s)},${f2(c1[1] * s)} ${f2(c2[0] * s)},${f2(c2[1] * s)} ${f2(p2[0] * s)},${f2(p2[1] * s)}`;
  }
  return d + ' Z';
}

/** a clockwise circle as a closed subpath (so a union with other clockwise shapes leaves no hole under the nonzero rule) */
export const circlePath = (cx: number, cy: number, r: number) =>
  r <= 0 ? '' : `M${f2(cx - r)},${f2(cy)} A${f2(r)},${f2(r)} 0 1 1 ${f2(cx + r)},${f2(cy)} A${f2(r)},${f2(r)} 0 1 1 ${f2(cx - r)},${f2(cy)} Z`;
