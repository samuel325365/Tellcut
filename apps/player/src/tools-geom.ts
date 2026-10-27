// Pure geometry for the preview tools (picking, moving, scaling, mapping on-screen text to a param).
import type { Transform } from '@tellcut/engine';

export type Rect = { left: number; top: number; right: number; bottom: number };

export function union(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
}
export const inside = (r: Rect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** ids = items under the pointer, topmost first. Alt+click (cycle) steps below the current selection. */
export function pickAt(ids: string[], current: string | null, cycle: boolean): string | null {
  if (!ids.length) return null;
  const i = current ? ids.indexOf(current) : -1;
  return cycle && i >= 0 ? ids[(i + 1) % ids.length] : ids[0];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const base = (t?: Transform): Transform => t ?? { x: 0, y: 0, scale: 1, ox: 0.5, oy: 0.5 };

export function movedTransform(t: Transform | undefined, dx: number, dy: number): Transform {
  const b = base(t);
  return { ...b, x: r4(clamp(b.x + dx, -1, 1)), y: r4(clamp(b.y + dy, -1, 1)) };
}

/** Scales around `anchor` — the on-screen centre of what the item draws, in frame fractions — so the content stays put
 *  even after a move: the origin is re-anchored there (untransformed coordinates) and the translate compensates.
 *  Without an anchor the stored origin is kept (properties panel), and so it is for a moving layer (transform.keys): its origin
 *  is already the centre of what it draws, and the anchor, measured where the path has it now, does not hold for the other keys. */
export function scaledTransform(t: Transform | undefined, factor: number, anchor?: { cx: number; cy: number }): Transform {
  let b = base(t);
  if (anchor && !b.keys?.length) {
    // the layer point that is drawn at the anchor: p' = O + s(p - O) + T  =>  p = O + (p' - T - O) / s
    const qx = clamp(b.ox + (anchor.cx - b.x - b.ox) / b.scale, 0, 1), qy = clamp(b.oy + (anchor.cy - b.y - b.oy) / b.scale, 0, 1);
    // same picture with the origin at q: T' = T + (1 - s)(O - q)
    b = { ...b, x: r4(b.x + (1 - b.scale) * (b.ox - qx)), y: r4(b.y + (1 - b.scale) * (b.oy - qy)), ox: r4(qx), oy: r4(qy) };
  }
  return { ...b, scale: r4(clamp(b.scale * factor, 0.05, 10)) };
}

const bare = (s: string) => s.replace(/\s+/g, '');
/** texts: textContent from the clicked element outward. The first level whose text equals a param value (spaces ignored). */
export function textParamFor(texts: string[], params: Array<{ key: string; value: string }>): { key: string; index: number } | null {
  for (let index = 0; index < texts.length; index++) {
    const t = bare(texts[index]);
    if (!t) continue;
    const hit = params.find((p) => p.value && bare(p.value) === t);
    if (hit) return { key: hit.key, index };
  }
  return null;
}

/** Topmost-first ids; an item whose only hits cover ≥ 90% of the stage (particles, glows, vignettes) goes after the rest. */
const area = (r: Rect) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
/** Covers ≥ 90% of the stage: a background (video frame, full scene, particles), not something a click aims at. */
export const isFullFrame = (r: Rect, stage: Rect) => area(r) >= area(stage) * 0.9;
export function rankHits(hits: Array<{ id: string; rects: Rect[] }>, stage: Rect): string[] {
  const solid = hits.filter((h) => h.rects.some((r) => !isFullFrame(r, stage))), bg = hits.filter((h) => !solid.includes(h));
  return [...solid, ...bg].map((h) => h.id);
}
