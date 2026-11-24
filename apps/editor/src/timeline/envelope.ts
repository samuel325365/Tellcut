// Volume line geometry: +6 dB at the top of the clip, -40 dB at the bottom (values beyond are drawn at the edge).
export const VIEW_TOP_DB = 6, VIEW_BOTTOM_DB = -40;

export const dbToY = (db: number, h: number) => {
  const c = Math.min(VIEW_TOP_DB, Math.max(VIEW_BOTTOM_DB, db));
  return Math.round(((VIEW_TOP_DB - c) / (VIEW_TOP_DB - VIEW_BOTTOM_DB)) * h * 1000) / 1000;
};
export const yToDb = (y: number, h: number) => Math.round((VIEW_TOP_DB - (y / h) * (VIEW_TOP_DB - VIEW_BOTTOM_DB)) * 10) / 10;

/** Envelope points (clip-relative seconds, dB) as pixels; no envelope is a flat 0 dB line. */
export function envelopePoints(env: Array<[number, number]> | undefined, len: number, pps: number, h: number) {
  if (!env?.length) return [{ x: 0, y: dbToY(0, h) }, { x: len * pps, y: dbToY(0, h) }];
  return env.map(([t, db]) => ({ x: t * pps, y: dbToY(db, h) }));
}

type Pt = { x: number; y: number };
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const lerp = (a: Pt, b: Pt, x: number) => r3(a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));

/** The drawn line over a clip w px wide: flat before the first point and after the last, and cut at the clip's edges. A trim
 *  keeps points that now lie before the head (or past the tail) so the level stays on their ramp; the line enters the clip
 *  at that ramp's height instead of starting flat at the first point's and doubling back. A step on an edge takes the level
 *  that plays inside the clip (after it at the head, before it at the tail). */
export function envelopeLine(pts: Pt[], w: number): Pt[] {
  const edge = (i: number, x: number) => (i < 0 ? pts[pts.length - 1].y : i === 0 ? pts[0].y : lerp(pts[i - 1], pts[i], x));
  const head = edge(pts.findIndex((p) => p.x > 0), 0), tail = edge(pts.findIndex((p) => p.x >= w), w);
  return [{ x: 0, y: head }, ...pts.filter((p) => p.x > 0 && p.x < w), { x: w, y: tail }];
}

/** Where each point's handle is drawn: a point outside the clip sits just inside the nearer edge, flagged `out` (drawn
 *  differently), so it can still be grabbed, dragged in or deleted. Its ring sits on the drawn line there, not at the point's
 *  own level: the line enters the clip at its ramp's height (`envelopeLine`), and a ring at another height would look
 *  detached from it, as if it were a point inside. The drag starts from the ring, so nudging it brings the point in at the
 *  level the line already had there and the line inside barely changes. Several points out on one side share that spot
 *  (stacked rings, each still its own handle). With the line's height `h`, a ring is kept `pad` px inside its top and bottom
 *  (where the line runs along the clip's top or bottom it would ride on the selection frame and the fade handles); `lineY` is
 *  then the line's own height there, which a drag starts from, so the point still enters at the line's level. */
export function envelopeHandles(pts: Pt[], w: number, r: number, h = Infinity, pad = 0): Array<Pt & { out: boolean; lineY?: number }> {
  const inset = Math.min(r, w / 2), line = envelopeLine(pts, w);
  // the drawn line's height at x (0..w): its xs run from 0 to w in order
  const onLine = (x: number) => {
    const i = line.findIndex((p) => p.x >= x);
    return i <= 0 ? line[Math.max(i, 0)].y : line[i].x === x ? line[i].y : lerp(line[i - 1], line[i], x);
  };
  const ring = (x: number) => {
    const y = onLine(x), kept = h >= 2 * pad ? Math.min(h - pad, Math.max(pad, y)) : h / 2;
    return kept === y ? { x, y, out: true } : { x, y: kept, lineY: y, out: true };
  };
  return pts.map((p) => (p.x < -1e-6 ? ring(inset) : p.x > w + 1e-6 ? ring(w - inset) : { ...p, out: false }));
}
