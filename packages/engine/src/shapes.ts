// Picture windows: the named shapes a video clip can be cut to (`shape: { type: 'circle' }`), beside the older polygon of corners.
// Everything here is pure: shapePath turns a shape into SVG path data in px for a w × h frame, the same for the same arguments
// (seeded shapes use a seeded generator, a wobbling blob is a function of the clip's local time), so draw(t) stays a pure function
// of t. The stage draws a path as `clip-path: path(…)`; the text shape is drawn by the stage itself (an SVG <clipPath> of <text>,
// it needs the fonts), and only its fitting is here (fitText).
import { z } from 'zod';

export const SHAPE_TYPES = ['circle', 'ellipse', 'arch', 'heart', 'star', 'ngon', 'stamp', 'bubble', 'blob', 'torn', 'brush', 'slats', 'text'] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];
/** where a speech bubble's tail points */
export const BUBBLE_TAILS = ['bottom-left', 'bottom', 'bottom-right', 'left', 'right', 'top-left', 'top', 'top-right'] as const;
/** the theme's font roles a text shape can use (theme.fonts) */
export const SHAPE_FONTS = ['display', 'body', 'mono'] as const;

/** One parameter of a named shape, as data for the editor's fields and the Cut API's doc: `int` and `number` have min and max,
 *  `enum` its options, `sides` is a string of the letters t, b, l, r (each at most once), `text` is words (one line, or two split
 *  by a line break). A `required` one has no default. */
export interface ShapeParam {
  key: string; kind: 'int' | 'number' | 'enum' | 'sides' | 'text';
  min?: number; max?: number; default?: number | string; options?: readonly string[]; required?: boolean; doc: string;
}
const seed: ShapeParam = { key: 'seed', kind: 'int', min: 0, max: 99999, default: 1, doc: 'which of the shape\'s random variants: the same seed is always the same shape' };
const round: ShapeParam = { key: 'round', kind: 'number', min: 0, max: 1, default: 0, doc: 'how much every corner is rounded (0 sharp, 1 as round as the sides allow)' };
const rough: ShapeParam = { key: 'rough', kind: 'number', min: 0, max: 1, default: 0.5, doc: 'how ragged the edge is' };

/** Every named shape's parameters (the circle, ellipse, arch and heart have none). Shapes keep their own proportion and sit centred
 *  in the frame (circle, heart, star, ngon, and the arch, which is never wider than tall); the others fill the frame (a brush
 *  stroke at most 1 : 2.6 high). */
export const SHAPE_PARAMS: { readonly [K in ShapeType]: readonly ShapeParam[] } = {
  circle: [], ellipse: [], arch: [], heart: [],
  star: [
    { key: 'points', kind: 'int', min: 3, max: 24, default: 5, doc: 'how many tips' },
    { key: 'inner', kind: 'number', min: 0.1, max: 0.95, default: 0.45, doc: 'the inner corners\' distance from the centre as a fraction of the tips\' (many points and a high inner: a burst)' },
    round,
  ],
  ngon: [
    { key: 'sides', kind: 'int', min: 3, max: 12, default: 6, doc: 'how many sides (3 a triangle, 4 a diamond, 6 a hexagon)' },
    round,
    { key: 'turn', kind: 'number', min: -180, max: 180, default: 0, doc: 'turned by this many degrees (0: a corner at the top; a square is sides 4, turn 45)' },
  ],
  stamp: [{ key: 'teeth', kind: 'int', min: 4, max: 60, default: 16, doc: 'how many perforation bites along the longer side' }],
  bubble: [{ key: 'tail', kind: 'enum', options: BUBBLE_TAILS, default: 'bottom-left', doc: 'where the speech bubble\'s tail points' }],
  blob: [seed,
    { key: 'lobes', kind: 'int', min: 3, max: 9, default: 5, doc: 'how many bulges' },
    { key: 'wobble', kind: 'number', min: 0, max: 1, default: 0, doc: 'how much it slowly moves (0 still)' }],
  torn: [seed, rough, { key: 'sides', kind: 'sides', default: 'tblr', doc: 'which edges are torn: letters of t (top), b (bottom), l (left), r (right)' }],
  brush: [seed, rough],
  slats: [
    { key: 'count', kind: 'int', min: 2, max: 12, default: 4, doc: 'how many slats' },
    { key: 'gap', kind: 'number', min: 0, max: 0.25, default: 0.04, doc: 'the gap between slats, as a fraction of the frame\'s short side' },
    { key: 'angle', kind: 'number', min: -90, max: 90, default: 0, doc: 'the slats\' tilt in degrees (0 upright, 90 lying across)' },
  ],
  text: [
    { key: 'text', kind: 'text', required: true, doc: 'the words the picture plays inside: one line, or two split by a line break; short and heavy reads best' },
    { key: 'font', kind: 'enum', options: SHAPE_FONTS, default: 'display', doc: 'which of the theme\'s fonts' },
    { key: 'weight', kind: 'int', min: 100, max: 900, default: 900, doc: 'the font weight (heavy letters show more picture)' },
    { key: 'line', kind: 'number', min: 0.7, max: 1.6, default: 1, doc: 'the distance between the two lines\' baselines, in font sizes' },
  ],
};

const SIDES_RE = /^(?!.*(.).*\1)[tblr]{1,4}$/;
const TEXT_RE = /^[^\n]+(\n[^\n]+)?$/;
const zodOf = (p: ShapeParam) => {
  const s = p.kind === 'int' ? z.number().int().min(p.min!).max(p.max!)
    : p.kind === 'number' ? z.number().min(p.min!).max(p.max!)
    : p.kind === 'enum' ? z.enum(p.options as unknown as [string, ...string[]])
    : p.kind === 'sides' ? z.string().regex(SIDES_RE, 'letters of t, b, l, r, each at most once')
    : z.string().max(60).regex(TEXT_RE, 'one line, or two split by one line break');
  return p.required ? s : s.optional();
};

export type NamedShape =
  | { type: 'circle' } | { type: 'ellipse' } | { type: 'arch' } | { type: 'heart' }
  | { type: 'star'; points?: number; inner?: number; round?: number }
  | { type: 'ngon'; sides?: number; round?: number; turn?: number }
  | { type: 'stamp'; teeth?: number }
  | { type: 'bubble'; tail?: (typeof BUBBLE_TAILS)[number] }
  | { type: 'blob'; seed?: number; lobes?: number; wobble?: number }
  | { type: 'torn'; seed?: number; rough?: number; sides?: string }
  | { type: 'brush'; seed?: number; rough?: number }
  | { type: 'slats'; count?: number; gap?: number; angle?: number }
  | { type: 'text'; text: string; font?: (typeof SHAPE_FONTS)[number]; weight?: number; line?: number };
export type TextShape = Extract<NamedShape, { type: 'text' }>;
/** a polygon: corners in fractions of the frame */
export type PolygonShape = ReadonlyArray<readonly [number, number]>;
export type ShapeInput = PolygonShape | NamedShape;

/** A named shape: strict, per type (an unknown key or a parameter out of range is an error, as with transitions). Built from
 *  SHAPE_PARAMS, so the data the editor reads and what the schema accepts cannot drift apart. */
export const NamedShapeZ = z.discriminatedUnion('type', SHAPE_TYPES.map((t) =>
  z.strictObject({ type: z.literal(t), ...Object.fromEntries(SHAPE_PARAMS[t].map((p) => [p.key, zodOf(p)])) })) as unknown as
  [z.ZodObject<{ type: z.ZodLiteral<ShapeType> }>, ...Array<z.ZodObject<{ type: z.ZodLiteral<ShapeType> }>>]) as unknown as z.ZodType<NamedShape>;

export const isNamedShape = (s: ShapeInput | undefined | null): s is NamedShape => !!s && !Array.isArray(s) && typeof (s as NamedShape).type === 'string';
/** Whether a clip is cut to a shape (a polygon of at least 3 corners or a named shape): such a clip's reveals are drawn as a
 *  dissolve (geometry.ts drawnTransition), since a reveal and the shape are both the frame's clip-path. */
export const isShaped = (it: { shape?: ShapeInput }) => isNamedShape(it.shape) || (Array.isArray(it.shape) && it.shape.length >= 3);

/** a named shape's parameter, its default when it does not set it */
function opt<T extends number | string>(s: NamedShape, key: string): T {
  const v = (s as Record<string, unknown>)[key];
  return (v ?? SHAPE_PARAMS[s.type].find((p) => p.key === key)?.default) as T;
}

// ── numbers and path data ───────────────────────────────────────────────────────────────────────────────────────────────────

type Pt = [number, number];
/** a coordinate in path data: two decimals, never -0 */
const f = (v: number) => String(Math.round(v * 100) / 100 + 0);
const P = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
/** the circle's quarter as a cubic: control points this far along the tangents, of the radius */
const K = 0.5522847498;

/** a seeded number in [0, 1): the same seed and index always give the same number (an integer hash, no state) */
function rand(seedN: number, i: number): number {
  let x = Math.imul((seedN | 0) ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul(i + 1, 0x9e3779b1);
  x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
/** smooth value noise in [-1, 1] along u: seeded values at the integers, eased between them */
function noise1(seedN: number, u: number): number {
  const i = Math.floor(u), t = u - i, w = t * t * (3 - 2 * t);
  return (rand(seedN, i) * 2 - 1) * (1 - w) + (rand(seedN, i + 1) * 2 - 1) * w;
}

interface Box { x: number; y: number; w: number; h: number }
/** the largest box of this aspect (w / h) inside `b`, centred */
const contain = (b: Box, aspect: number): Box => {
  const w = Math.min(b.w, b.h * aspect), h = w / aspect;
  return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
};
/** points scaled uniformly (keeping their proportion) to fill `b` and centred in it */
function fitPoints(pts: Pt[], b: Box): Pt[] {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  const c = contain(b, w / h), k = c.w / w;
  return pts.map(([x, y]) => [c.x + (x - x0) * k, c.y + (y - y0) * k]);
}
/** points stretched to fill `b` exactly (their bounding box onto it) */
function stretchPoints(pts: Pt[], b: Box): Pt[] {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1;
  return pts.map(([x, y]) => [b.x + ((x - x0) / w) * b.w, b.y + ((y - y0) / h) * b.h]);
}
const polyline = (pts: Pt[]) => `M${pts.map(P).join('L')}Z`;
/** a polygon with each corner rounded by a quadratic through it, cut back `round` × half of the shorter side next to it */
function roundedPolygon(pts: Pt[], r: number): string {
  if (r <= 0) return polyline(pts);
  const n = pts.length, a: Pt[] = [], b: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const v = pts[i], p = pts[(i + n - 1) % n], q = pts[(i + 1) % n];
    const lp = Math.hypot(p[0] - v[0], p[1] - v[1]), lq = Math.hypot(q[0] - v[0], q[1] - v[1]), d = 0.5 * r * Math.min(lp, lq);
    a.push([v[0] + ((p[0] - v[0]) * d) / lp, v[1] + ((p[1] - v[1]) * d) / lp]);
    b.push([v[0] + ((q[0] - v[0]) * d) / lq, v[1] + ((q[1] - v[1]) * d) / lq]);
  }
  return `M${P(a[0])}${pts.map((v, i) => `Q${P(v)} ${P(b[i])}L${P(a[(i + 1) % n])}`).join('')}Z`;
}
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const kx = K * rx, ky = K * ry;
  return `M${P([cx + rx, cy])}C${P([cx + rx, cy + ky])} ${P([cx + kx, cy + ry])} ${P([cx, cy + ry])}C${P([cx - kx, cy + ry])} ${P([cx - rx, cy + ky])} ${P([cx - rx, cy])}`
    + `C${P([cx - rx, cy - ky])} ${P([cx - kx, cy - ry])} ${P([cx, cy - ry])}C${P([cx + kx, cy - ry])} ${P([cx + rx, cy - ky])} ${P([cx + rx, cy])}Z`;
}
/** A closed smooth curve through the points (Catmull–Rom as cubics), its control points kept inside `b` (a curve stays inside
 *  its control points' hull, so the shape never leaves the frame). */
function smoothClosed(pts: Pt[], b: Box): string {
  const n = pts.length, cl = (p: Pt): Pt => [Math.min(b.x + b.w, Math.max(b.x, p[0])), Math.min(b.y + b.h, Math.max(b.y, p[1]))];
  let d = `M${P(cl(pts[0]))}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = cl([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]), c2 = cl([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]);
    d += `C${P(c1)} ${P(c2)} ${P(cl(p2))}`;
  }
  return `${d}Z`;
}

// ── the shapes ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** the heart in an 80 × 80 square: two round lobes (radius 20) meeting in a cleft, sides curving down to the point */
const HEART = (() => {
  const r = 20, k = K * r;
  return [
    'M0 20', `C0 ${20 - k} ${20 - k} 0 20 0`, `C${20 + k} 0 40 ${20 - k} 40 20`, `C40 ${20 - k} ${60 - k} 0 60 0`, `C${60 + k} 0 80 ${20 - k} 80 20`,
    'C80 42 66 58 40 80', 'C14 58 0 42 0 20', 'Z',
  ].join('');
})();
/** path data moved and scaled: (x, y) → (ox + k·x, oy + k·y); for the heart, written in its own square */
const mapPath = (d: string, ox: number, oy: number, k: number) =>
  d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => `${f(ox + k * +x)} ${f(oy + k * +y)}`);

function arch(b: Box): string {
  const c = contain(b, Math.min(b.w / b.h, 0.85)), r = c.w / 2, k = K * r, x1 = c.x + c.w, y1 = c.y + c.h, ys = c.y + r;
  return `M${P([c.x, y1])}L${P([c.x, ys])}C${P([c.x, ys - k])} ${P([c.x + r - k, c.y])} ${P([c.x + r, c.y])}C${P([c.x + r + k, c.y])} ${P([x1, ys - k])} ${P([x1, ys])}L${P([x1, y1])}Z`;
}

function star(s: NamedShape, b: Box): string {
  const n = opt<number>(s, 'points'), inner = opt<number>(s, 'inner');
  const pts: Pt[] = Array.from({ length: 2 * n }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? inner : 1; return [r * Math.cos(a), r * Math.sin(a)]; });
  return roundedPolygon(fitPoints(pts, b), opt<number>(s, 'round'));
}

function ngon(s: NamedShape, b: Box): string {
  const n = opt<number>(s, 'sides'), turn = (opt<number>(s, 'turn') * Math.PI) / 180;
  const pts: Pt[] = Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + turn + (2 * Math.PI * i) / n; return [Math.cos(a), Math.sin(a)]; });
  return roundedPolygon(fitPoints(pts, b), opt<number>(s, 'round'));
}

/** A postage stamp: the frame's rectangle with half-round bites along every side, at an even pitch (the longer side has `teeth`,
 *  the shorter as many as fit at about the same pitch), the corners left whole. */
function stamp(s: NamedShape, b: Box): string {
  const teeth = opt<number>(s, 'teeth'), long = Math.max(b.w, b.h), pitch = long / teeth;
  const nx = Math.max(2, Math.round(b.w / pitch)), ny = Math.max(2, Math.round(b.h / pitch));
  const rr = 0.3 * Math.min(b.w / nx, b.h / ny), k = K * rr;
  const corners: Pt[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  let d = `M${P(corners[0])}`;
  for (let side = 0; side < 4; side++) {
    const A = corners[side], B = corners[(side + 1) % 4], n = side % 2 ? ny : nx, len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const u: Pt = [(B[0] - A[0]) / len, (B[1] - A[1]) / len], nIn: Pt = [-u[1], u[0]];   // clockwise on screen: the inside is to the right
    const at = (c: Pt, du: number, dn: number): Pt => [c[0] + u[0] * du + nIn[0] * dn, c[1] + u[1] * du + nIn[1] * dn];
    for (let i = 0; i < n; i++) {
      const c: Pt = [A[0] + u[0] * ((i + 0.5) * len) / n, A[1] + u[1] * ((i + 0.5) * len) / n];
      d += `L${P(at(c, -rr, 0))}C${P(at(c, -rr, k))} ${P(at(c, -k, rr))} ${P(at(c, 0, rr))}C${P(at(c, k, rr))} ${P(at(c, rr, k))} ${P(at(c, rr, 0))}`;
    }
    d += `L${P(B)}`;
  }
  return `${d}Z`;
}

/** A speech bubble: a rounded rectangle with a tail on one side reaching the frame's edge; the body leaves the tail's depth free. */
function bubble(s: NamedShape, b: Box): string {
  const tail = opt<string>(s, 'tail'), S = Math.min(b.w, b.h), depth = 0.2 * S;
  const side = tail.startsWith('bottom') ? 2 : tail.startsWith('top') ? 0 : tail === 'left' ? 3 : 1;
  const body: Box = { x: b.x + (side === 3 ? depth : 0), y: b.y + (side === 0 ? depth : 0), w: b.w - (side % 2 ? depth : 0), h: b.h - (side % 2 ? 0 : depth) };
  const R = 0.22 * Math.min(body.w, body.h), k = K * R;
  // where along the tail's side (walking clockwise) the tail sits, and which way its tip leans (+: further along the walk)
  const [pos, lean] = ({ 'top-left': [0.28, -1], top: [0.5, 0], 'top-right': [0.72, 1], right: [0.62, 1], 'bottom-right': [0.28, -1], bottom: [0.5, 0], 'bottom-left': [0.72, 1], left: [0.38, -1] } as Record<string, [number, number]>)[tail];
  const corners: Pt[] = [[body.x, body.y], [body.x + body.w, body.y], [body.x + body.w, body.y + body.h], [body.x, body.y + body.h]];
  let d = '';
  for (let i = 0; i < 4; i++) {
    const A = corners[i], B = corners[(i + 1) % 4], len = Math.hypot(B[0] - A[0], B[1] - A[1]), u: Pt = [(B[0] - A[0]) / len, (B[1] - A[1]) / len], out: Pt = [u[1], -u[0]];
    const along = (t: number, o = 0): Pt => [A[0] + u[0] * t + out[0] * o, A[1] + u[1] * t + out[1] * o];
    d += i === 0 ? `M${P(along(R))}` : '';
    if (i === side) {
      const straight = len - 2 * R, half = 0.11 * straight, mid = R + pos * straight;
      const tip = Math.min(len, Math.max(0, mid + lean * 2.2 * half));
      // the leading edge curves into the tip, the trailing one comes back almost straight
      d += `L${P(along(mid - half))}Q${P(along(mid - half + 0.2 * (tip - mid + half), 0.6 * depth))} ${P(along(tip, depth))}L${P(along(mid + half))}`;
    }
    const C = corners[(i + 1) % 4], v: Pt = [(corners[(i + 2) % 4][0] - C[0]), (corners[(i + 2) % 4][1] - C[1])], lv = Math.hypot(v[0], v[1]);
    const w: Pt = [v[0] / lv, v[1] / lv];
    d += `L${P(along(len - R))}C${P(along(len - R + k))} ${P([C[0] + w[0] * (R - k), C[1] + w[1] * (R - k)])} ${P([C[0] + w[0] * R, C[1] + w[1] * R])}`;
  }
  return `${d}Z`;
}

/** The blob's outline: the frame's ellipse pushed in and out along its normal by a few seeded waves (the `lobes` bulges strongest),
 *  then stretched to fill the frame. The waves run along the ellipse's length and push by a share of its short radius, so a lobe at
 *  the end of a wide frame is as wide and as deep as one along its side (waves round a circle, stretched, came out as points
 *  there). Wobble moves each wave's phase and size slowly with the clip's local time, a few seconds a cycle. */
function blobPoints(s: NamedShape, local: number, w: number, h: number): Pt[] {
  const sd = opt<number>(s, 'seed'), lobes = opt<number>(s, 'lobes'), wob = opt<number>(s, 'wobble');
  // the lobes' wave carries the shape; the low waves (2, 3) only lean it
  const waves = [[lobes, 0.16], [2, 0.06], [3, 0.05], [lobes + 1, 0.04]].map(([k, amp], j) => {
    const ph = rand(sd, 10 + j) * 2 * Math.PI, hz = 0.12 + 0.12 * rand(sd, 20 + j), ph2 = rand(sd, 30 + j) * 2 * Math.PI;
    return { k, amp: amp * (1 + wob * 0.45 * Math.sin(2 * Math.PI * hz * 0.7 * local + ph2)), ph: ph + wob * 1.1 * Math.sin(2 * Math.PI * hz * local + ph2) };
  });
  const rx = w / 2, ry = h / 2, R = Math.min(rx, ry), M = 360, cum = [0];
  for (let i = 1; i <= M; i++) {
    const a0 = (2 * Math.PI * (i - 1)) / M, a1 = (2 * Math.PI * i) / M;
    cum.push(cum[i - 1] + Math.hypot(rx * (Math.cos(a1) - Math.cos(a0)), ry * (Math.sin(a1) - Math.sin(a0))));
  }
  const L = cum[M], N = 64, out: Pt[] = [];
  for (let j = 0, i = 0; j < N; j++) {
    const at = (L * j) / N;
    while (cum[i + 1] < at) i++;
    const a = ((i + (at - cum[i]) / (cum[i + 1] - cum[i] || 1)) * 2 * Math.PI) / M;
    const nx = Math.cos(a) / rx, ny = Math.sin(a) / ry, nl = Math.hypot(nx, ny);
    const push = R * waves.reduce((t, wv) => t + wv.amp * Math.cos((wv.k * 2 * Math.PI * at) / L + wv.ph), 0);
    out.push([rx * Math.cos(a) + (nx / nl) * push, ry * Math.sin(a) + (ny / nl) * push]);
  }
  return out;
}

/** Torn paper: on each torn side the edge runs inside the frame along a slow wander, a little askew to the frame (a tear is never
 *  parallel to the sheet's edge), roughened by fine fibres. The wander, not the fibres, carries the depth: fibres as deep as the
 *  edge read as noise, not as a tear. */
function torn(s: NamedShape, b: Box): string {
  const sd = opt<number>(s, 'seed'), rg = opt<number>(s, 'rough'), sides = opt<string>(s, 'sides');
  const S = Math.min(b.w, b.h), D = (0.025 + 0.06 * rg) * S, step = 0.006 * S;
  // clockwise: top (l→r), right (t→b), bottom (r→l), left (b→t); the letter of each and its start corner
  const order = ['t', 'r', 'b', 'l'], corners: Pt[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  const depth = (k: number) => (sides.includes(order[k]) ? D : 0);
  const pts: Pt[] = [];
  for (let k = 0; k < 4; k++) {
    const A = corners[k], B = corners[(k + 1) % 4], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const u: Pt = [(B[0] - A[0]) / len, (B[1] - A[1]) / len], nIn: Pt = [-u[1], u[0]];
    const at = (t: number, o: number): Pt => [A[0] + u[0] * t + nIn[0] * o, A[1] + u[1] * t + nIn[1] * o];
    // the corner: inside by both sides' depths
    pts.push(at(depth((k + 3) % 4) * 0.6, depth(k) * 0.6));
    if (!depth(k)) continue;
    const key = sd * 7 + k * 1013;
    const skew = (rand(key + 5, 0) * 2 - 1) * 0.35;
    for (let t = step, i = 0; t < len - step; i++) {
      const wander = noise1(key, t / (0.3 * S)) * 0.45 + noise1(key + 1, t / (0.07 * S)) * 0.25 + skew * (t / len - 0.5) * 2;
      // fibres: fine and shallow, a short noise with a little grain on it (grain alone made the edge grass)
      const fibre = noise1(key + 2, t / (0.015 * S)) * (0.06 + 0.1 * rg) + (rand(key + 3, i) * 2 - 1) * 0.04;
      pts.push(at(t, D * Math.min(1, Math.max(0, 0.5 + 0.5 * wander + fibre))));
      t += step * (0.5 + rand(key + 4, i));
    }
  }
  return polyline(pts);
}

/** One brush stroke laid across the frame: a band, at most 1 : 2.6 high, landing round at the left, its edges slightly uneven, and
 *  running out at the right as a dry brush does: the bristles part into tufts of uneven widths, some splitting off deep inside
 *  the stroke (a thin dry streak) and some only at its end, fanning a little apart, each tapering its own way (to a needle, or
 *  full-bellied and late) to a different length, a few of them ending blunt and ragged. All of it from the seed, more uneven
 *  the rougher. (Even streaks tapering alike read as a comb, not a hand.) */
function brush(s: NamedShape, b: Box): string {
  const sd = opt<number>(s, 'seed'), rg = opt<number>(s, 'rough');
  const bh = Math.min(b.h, b.w / 2.6), band: Box = { x: b.x, y: b.y + (b.h - bh) / 2, w: b.w, h: bh };
  // unit space: u along (0..1), v across (the band 1 high round 0); a gentle bow and tilt from the seed
  const bow = 0.06 + 0.08 * rand(sd, 1), tilt = (rand(sd, 2) - 0.5) * 0.08, cl = (u: number) => -bow * Math.sin(Math.PI * u) + tilt * (u - 0.5);
  const half = (u: number, side: number) => 0.5 * (1 - 0.1 * u) * (1 + rg * (0.05 * noise1(sd * 3 + side, u * 9) + 0.025 * noise1(sd * 5 + side, u * 47)));
  const U0 = 0.06, END = 0.8, M = 5 + Math.floor(rand(sd, 3) * 4);
  // the tufts' shares of the band's height, uneven (up to about 1 : 4, more when rough)
  // (spread out first and then shuffled, so a seed never draws them all alike)
  const wts = Array.from({ length: M }, (_, j) => 0.25 + ((j + rand(sd, 70 + j)) / M) * (0.9 + 1.2 * rg));
  for (let j = M - 1; j > 0; j--) { const k = Math.floor(rand(sd, 170 + j) * (j + 1)); [wts[j], wts[k]] = [wts[k], wts[j]]; }
  const total = wts.reduce((x, y) => x + y, 0);
  const at: number[] = [0];
  for (const w of wts) at.push(at[at.length - 1] + w / total);
  const minShare = Math.min(...wts) / total, fan = (0.6 + 1.2 * rand(sd, 4)) * (0.5 + rg);
  /** the line between tuft k − 1 and tuft k (k = 0 the band's top edge, k = M its bottom one): its share of the way across, a
   *  little fanned out past END, and wavering a little (less than a fifth of the narrowest tuft, so the lines keep their order) */
  const line = (k: number, u: number) => {
    const top = cl(u) - half(u, 0), bot = cl(u) + half(u, 1), past = Math.max(0, u - END);
    const waver = k === 0 || k === M ? 0 : 0.2 * minShare * noise1(sd * 13 + k, u * 30);
    return top + (at[k] + waver) * (bot - top) + fan * (at[k] - 0.5) * past * past;
  };
  // where each line parts (the outer edges begin to taper): some deep inside the stroke, some only at its end
  const part = Array.from({ length: M + 1 }, (_, k) => END + (k === 0 || k === M ? 0.01 + 0.03 * rand(sd, 80 + k) : (rand(sd, 60 + k) - 0.62) * (0.1 + 0.12 * rg)));
  const tail: Pt[] = [];
  for (let j = 0; j < M; j++) {
    const a = part[j], c = part[j + 1], from = Math.max(a, c) + 0.035;
    // how far it reaches, where its tip sits across it, how its sides taper (power above 1: full-bellied, late; below: a needle)
    const reach = Math.max(from, 0.84 + 0.16 * rand(sd, 40 + j) ** (1.2 - 0.6 * rg));
    const mid = 0.25 + 0.5 * rand(sd, 90 + j), pt = 0.8 + 1.3 * rand(sd, 100 + j), pb = 0.8 + 1.3 * rand(sd, 110 + j);
    const blunt = rand(sd, 120 + j) < 0.2 + 0.25 * rg, end = blunt ? 0.55 + 0.2 * rand(sd, 130 + j) : 1;
    const spine = (u: number) => line(j, u) + mid * (line(j + 1, u) - line(j, u));
    /** a side of the tuft from its line (k) at `start` to the tip, at u: g its share of the way to the spine */
    const side = (k: number, start: number, u: number, p: number): Pt => [u, line(k, u) + end * ((u - start) / (reach - start)) ** p * (spine(u) - line(k, u))];
    /** the u a side is drawn at: every STEP from where its line parts, then the tip. The two sides that part from one line share
     *  them, so at each one the upper side is above the lower and their straight pieces cannot cross (sampled each at its own
     *  pace, the pieces cut across each other where they part). */
    const STEP = 0.005, us = (start: number, stop: number) => { const o: number[] = []; for (let u = start + STEP; u < stop - 0.3 * STEP; u += STEP) o.push(u); return [...o, stop]; };
    for (const u of us(a, reach)) tail.push(side(j, a, u, pt));
    // a blunt end is cut off askew: its lower side stops a little short of the upper one
    const back = [c, ...us(c, blunt ? reach - Math.min(0.4 * (reach - c), 0.006 + 0.014 * rand(sd, 140 + j)) : reach)].reverse();
    for (const u of blunt ? back : back.slice(1)) tail.push(side(j + 1, c, u, pb));
  }
  const top: Pt[] = [], bottom: Pt[] = [];
  for (let u = U0; u < part[0]; u += 0.004) top.push([u, line(0, u)]);
  for (let u = U0; u < part[M]; u += 0.004) bottom.push([u, line(M, u)]);
  // the landing: a round cap with a slight flattening, from the bottom edge round to the top
  const cap: Pt[] = [];
  for (let i = 1; i < 24; i++) {
    const a = Math.PI / 2 + (i / 24) * Math.PI, r = 1 + rg * 0.06 * noise1(sd * 11, i * 0.7);
    cap.push([U0 + U0 * 1.15 * r * Math.cos(a), cl(U0) + (half(U0, 0) + half(U0, 1)) / 2 * r * Math.sin(a) * 0.98]);
  }
  const pts = [...top, [part[0], line(0, part[0])] as Pt, ...tail, ...bottom.reverse(), ...cap];
  return polyline(stretchPoints(pts, band));
}

/** Slats: the frame cut into `count` parallel strips with gaps between, tilted by `angle` (each strip the frame's rectangle cut by
 *  two parallel lines, so the outer ones of a tilted set are triangles or trapezoids). One subpath each, all drawn the same way
 *  round and not overlapping, so the nonzero rule fills each once.
 *  Tilted, a gap running into a corner of the frame (or just past it) left slivers there: a notch of background with a spike of
 *  slat either side, or a foot of slat a few px wide. So the outer two strips may be wider or narrower than the inner ones (which
 *  stay equal to each other, and may give a little), and the layout is the one nearest the even layout in which every corner of
 *  the frame lies well inside a slat (or, when none does, the one that comes closest). Upright or lying across (no corner but
 *  the run's two ends), that is the even layout itself. */
function slats(s: NamedShape, b: Box): string {
  const n = opt<number>(s, 'count'), a = (opt<number>(s, 'angle') * Math.PI) / 180, nx = Math.cos(a), ny = Math.sin(a);
  const rect: Pt[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]], proj = (p: Pt) => p[0] * nx + p[1] * ny;
  const ps = rect.map(proj), lo = Math.min(...ps), L = Math.max(...ps) - lo;
  const gap = Math.min(opt<number>(s, 'gap') * Math.min(b.w, b.h), (0.8 * L) / Math.max(1, n - 1)), even = (L - (n - 1) * gap) / n;
  /** a convex polygon cut to the side of the line proj = c where proj·sign ≥ c·sign */
  const cut = (poly: Pt[], c: number, sign: number) => {
    const out: Pt[] = [], inside = (p: Pt) => (proj(p) - c) * sign >= 0;
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], ip = inside(p), iq = inside(q);
      if (ip) out.push(p);
      if (ip !== iq) { const t = (c - proj(p)) / (proj(q) - proj(p)); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    });
    return out;
  };
  /** the strips' [start, end] along the run: the first `w0` wide, the inner ones `w`, the last what is left */
  type Run = Array<[number, number]>;
  const layout = (w0: number, w: number): Run => {
    const out: Run = [];
    for (let i = 0, at = lo; i < n; i++) { const e = i === n - 1 ? lo + L : at + (i === 0 ? w0 : w); out.push([at, e]); at = e + gap; }
    return out;
  };
  // the frame's corners inside the run (not at its two ends): a cut line near one of them is what leaves a sliver
  const mids = ps.filter((p) => p - lo > 1e-6 * L && lo + L - p > 1e-6 * L);
  /** how far every inner corner is into its slat (0 in a gap), in even slat widths; CLEAR is enough */
  const clearOf = (st: Run) => Math.min(Infinity, ...mids.map((c) => Math.max(0, ...st.map(([p0, p1]) => Math.min(c - p0, p1 - c))) / even));
  const CLEAR = 0.2;
  let best = layout(even, even), bestClear = clearOf(best);
  if (bestClear < CLEAR) {
    // the outer slats from 0.6 to 1.8 times an even one, the inner ones within 20 %, nearest the even layout first
    const tries: Array<{ w0: number; w: number; cost: number }> = [];
    for (let i = -20; i <= 20; i++) for (let j = -40; j <= 80; j++) {
      if (n === 2 && i !== 0) continue;
      const w = even * (1 + i / 100), w0 = even * (1 + j / 100), w1 = L - w0 - (n - 2) * w - (n - 1) * gap;
      if (w1 < 0.6 * even - 1e-9 || w1 > 1.8 * even + 1e-9) continue;
      tries.push({ w0, w, cost: Math.max(Math.abs(w0 - even), Math.abs(w1 - even)) / even + Math.abs(i) / 100 });
    }
    tries.sort((x, y) => x.cost - y.cost);
    for (const t of tries) {
      const st = layout(t.w0, t.w), cl = clearOf(st);
      if (cl > bestClear) { best = st; bestClear = cl; }
      if (cl >= CLEAR) break;
    }
  }
  return best.map(([p0, p1]) => cut(cut(rect, p0, 1), p1, -1)).filter((p) => p.length >= 3).map(polyline).join('');
}

/**
 * A shape as SVG path data in px for a w × h frame (absolute M, L, C, Q and Z only; every subpath closed). `local`: the clip's
 * local seconds (only a wobbling blob reads it). `inset`: px kept free all round, so an outline of twice that width stroked on the
 * path stays inside the frame. A polygon's corners are fractions of the frame. '' for the text shape (the stage draws it).
 */
export function shapePath(shape: ShapeInput, w: number, h: number, local = 0, inset = 0): string {
  const b: Box = { x: inset, y: inset, w: Math.max(1e-3, w - 2 * inset), h: Math.max(1e-3, h - 2 * inset) };
  if (!isNamedShape(shape)) return shape.length >= 3 ? polyline(shape.map(([x, y]) => [b.x + x * b.w, b.y + y * b.h])) : '';
  switch (shape.type) {
    case 'circle': { const c = contain(b, 1); return ellipsePath(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, c.h / 2); }
    case 'ellipse': return ellipsePath(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2);
    case 'arch': return arch(b);
    case 'heart': { const c = contain(b, 1); return mapPath(HEART, c.x, c.y, c.w / 80); }
    case 'star': return star(shape, b);
    case 'ngon': return ngon(shape, b);
    case 'stamp': return stamp(shape, b);
    case 'bubble': return bubble(shape, b);
    case 'blob': return smoothClosed(stretchPoints(blobPoints(shape, local, b.w, b.h), b), b);
    case 'torn': return torn(shape, b);
    case 'brush': return brush(shape, b);
    case 'slats': return slats(shape, b);
    case 'text': return '';
  }
}

// ── reading paths back: polygons, area, the safe rectangle ──────────────────────────────────────────────────────────────────

/** Path data (as shapePath writes it) as polygons, its curves cut into short straight pieces. */
export function flattenPath(d: string, steps = 12): Pt[][] {
  const out: Pt[][] = [], re = /([MLCQZ])([^MLCQZ]*)/g;
  let cur: Pt[] = [], at: Pt = [0, 0], m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const n = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    if (m[1] === 'M') { if (cur.length) out.push(cur); at = [n[0], n[1]]; cur = [at]; }
    else if (m[1] === 'L') { at = [n[0], n[1]]; cur.push(at); }
    else if (m[1] === 'C' || m[1] === 'Q') {
      const p0 = at, c = m[1] === 'C' ? [[n[0], n[1]], [n[2], n[3]], [n[4], n[5]]] as Pt[] : [[n[0], n[1]], [n[2], n[3]]] as Pt[];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, s = 1 - t;
        cur.push(c.length === 3
          ? [s ** 3 * p0[0] + 3 * s * s * t * c[0][0] + 3 * s * t * t * c[1][0] + t ** 3 * c[2][0], s ** 3 * p0[1] + 3 * s * s * t * c[0][1] + 3 * s * t * t * c[1][1] + t ** 3 * c[2][1]]
          : [s * s * p0[0] + 2 * s * t * c[0][0] + t * t * c[1][0], s * s * p0[1] + 2 * s * t * c[0][1] + t * t * c[1][1]]);
      }
      at = c[c.length - 1];
    } else if (m[1] === 'Z') { if (cur.length) out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}
const polyArea = (p: Pt[]) => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
/** the share of a w × h frame a shape covers (its subpaths do not overlap), from its flattened path; null for the text shape */
export function shapeArea(shape: ShapeInput, w: number, h: number, local = 0): number | null {
  if (isNamedShape(shape) && shape.type === 'text') return null;
  return flattenPath(shapePath(shape, w, h, local)).reduce((s, p) => s + polyArea(p), 0) / (w * h);
}

const inside = (poly: Pt[], x: number, y: number) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

/** The share (0–1) of an oval [cx, cy, rx, ry] (fractions of the frame) that a shape drawn in a frame of `aspect` (width over
 *  height) shows, sampled on a grid over the oval: how much of a face is seen, which its box against shapeSafe's rectangle overstates
 *  (a face is round, its box's corners are not face). null for the text shape. */
export function shapeHolds(shape: ShapeInput, aspect: number, oval: readonly [number, number, number, number], local = 0): number | null {
  if (isNamedShape(shape) && shape.type === 'text') return null;
  const w = 1000 * aspect, h = 1000, polys = flattenPath(shapePath(shape, w, h, local)), [cx, cy, rx, ry] = oval, N = 24;
  let all = 0, seen = 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const u = (2 * i) / N - 1, v = (2 * j) / N - 1;
    if (u * u + v * v > 1) continue;
    all++;
    if (polys.some((p) => inside(p, (cx + u * rx) * w, (cy + v * ry) * h))) seen++;
  }
  return all ? seen / all : 0;
}

/**
 * The rectangle of the frame a shape certainly shows, as fractions of the frame [x, y, w, h], for framing faces: the largest one of
 * the shape's own proportion centred on (one of) its pieces. `aspect` is the frame's width over its height (a circle in a wide
 * frame is in its middle). A wobbling blob's is shrunk to stay inside while it moves. null for the text shape (letters show no
 * whole face, on purpose) and for a polygon of fewer than 3 corners.
 */
export function shapeSafe(shape: ShapeInput, aspect = 1): [number, number, number, number] | null {
  if (isNamedShape(shape) && shape.type === 'text') return null;
  if (!isNamedShape(shape) && shape.length < 3) return null;
  const w = 1000 * aspect, h = 1000;
  let best: [number, number, number, number] | null = null;
  for (const poly of flattenPath(shapePath(shape, w, h))) {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const fits = (k: number) => {
      const hw = ((x1 - x0) * k) / 2, hh = ((y1 - y0) * k) / 2;
      if (![[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].every(([a, c]) => inside(poly, cx + a * hw, cy + c * hh))) return false;
      return !poly.some(([x, y]) => Math.abs(x - cx) < hw && Math.abs(y - cy) < hh);
    };
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
    const k = lo * (isNamedShape(shape) && shape.type === 'blob' && opt<number>(shape, 'wobble') > 0 ? 0.85 : 1);
    const rw = (x1 - x0) * k, rh = (y1 - y0) * k;
    if (!best || rw * rh > best[2] * w * best[3] * h) best = [(cx - rw / 2) / w, (cy - rh / 2) / h, rw / w, rh / h];
  }
  return best && (best.map((v) => Math.round(v * 1e4) / 1e4) as [number, number, number, number]);
}

// ── the text shape's fitting ────────────────────────────────────────────────────────────────────────────────────────────────

/** one line's ink at font size 100: left and right of the origin, above and below the baseline (canvas TextMetrics' actual box) */
export interface InkBox { left: number; right: number; ascent: number; descent: number }
export interface FittedText { size: number; rows: Array<{ text: string; x: number; y: number }> }
/**
 * The text shape's lines as large as fit in the w × h frame less `inset` all round, centred: the font size and each line's origin
 * (x at its start, y its baseline) in px. `measure` gives a line's ink box at font size 100. Fitted on the ink, not the font's line
 * box, so heavy capitals fill the frame.
 */
export function fitText(shape: TextShape, w: number, h: number, measure: (line: string) => InkBox, inset = 0): FittedText {
  const lines = shape.text.split('\n'), gap = 100 * opt<number>(shape, 'line'), ink = lines.map(measure);
  const top = Math.min(...ink.map((m, i) => i * gap - m.ascent)), bottom = Math.max(...ink.map((m, i) => i * gap + m.descent));
  const width = Math.max(1, ...ink.map((m) => m.left + m.right)), height = Math.max(1, bottom - top);
  const aw = Math.max(1, w - 2 * inset), ah = Math.max(1, h - 2 * inset), k = Math.min(aw / width, ah / height);
  const blockTop = h / 2 - (k * height) / 2;
  return { size: Math.round(100 * k * 100) / 100,
    rows: lines.map((text, i) => ({ text, x: Math.round((w / 2 - (k * (ink[i].right - ink[i].left)) / 2) * 100) / 100 + 0, y: Math.round((blockTop + k * (i * gap - top)) * 100) / 100 + 0 })) };
}
/** the text shape's font role and weight, defaults filled */
export const textFont = (s: TextShape) => ({ role: opt<(typeof SHAPE_FONTS)[number]>(s, 'font'), weight: opt<number>(s, 'weight') });
