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
 *  differently), so it can still be grabbed, dragged in or deleted; it keeps its own height (a drag sets the level too). */
export function envelopeHandles(pts: Pt[], w: number, r: number): Array<Pt & { out: boolean }> {
  const inset = Math.min(r, w / 2);
  return pts.map((p) => (p.x < -1e-6 ? { x: inset, y: p.y, out: true } : p.x > w + 1e-6 ? { x: w - inset, y: p.y, out: true } : { ...p, out: false }));
}
