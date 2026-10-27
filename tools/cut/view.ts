// "Show this part of the source" (from the podcast shorts' cut.ts, where one camera was cut into several virtual ones): the crop whose
// view of the source is centred on a point at a zoom, kept inside the picture, and a check that the view stays clear of the parts of
// the frame that must not show — a channel's watermark, the footage's own burned-in captions.
import { clamp, visibleRegion, type Crop } from '@tellcut/engine';

/** a rectangle of the source as fractions: [left, top, right, bottom] */
export type Rect = [number, number, number, number];

/** the visible part of the source for a crop, as a Rect */
export function viewRect(srcW: number, srcH: number, frameW: number, frameH: number, crop: Crop): Rect {
  const r = visibleRegion(srcW, srcH, frameW, frameH, crop);
  return [r.x0, r.y0, r.x0 + r.w, r.y0 + r.h];
}

/**
 * The crop whose view is centred on (cx, cy) — fractions of the source — at `zoom` (1 = the frame just covered by the whole source,
 * 2 = half of that across): the view's size from the zoom, its centre moved in so it stays inside the picture, then each focus axis
 * bisected (the view's start grows monotonically with it, clamping included).
 */
export function viewCrop(srcW: number, srcH: number, frameW: number, frameH: number, cx: number, cy: number, zoom = 1): Crop {
  const z = Math.max(1, zoom), whole = visibleRegion(srcW, srcH, frameW, frameH, { x: 0.5, y: 0.5, zoom: z });
  const want = { x: clamp(cx, whole.w / 2, 1 - whole.w / 2) - whole.w / 2, y: clamp(cy, whole.h / 2, 1 - whole.h / 2) - whole.h / 2 };
  const solve = (axis: 'x' | 'y') => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2, r = visibleRegion(srcW, srcH, frameW, frameH, { x: axis === 'x' ? m : 0.5, y: axis === 'y' ? m : 0.5, zoom: z });
      if ((axis === 'x' ? r.x0 : r.y0) < want[axis]) lo = m; else hi = m;
    }
    return Math.round(((lo + hi) / 2) * 1e6) / 1e6;
  };
  return { x: solve('x'), y: solve('y'), zoom: Math.round(z * 1e6) / 1e6 };
}

/** the keep-out rectangles a view overlaps (by more than a hair) */
export function viewHits(view: Rect, keepOut: Rect[]): Rect[] {
  const e = 1e-4;
  return keepOut.filter((k) => view[0] < k[2] - e && view[2] > k[0] + e && view[1] < k[3] - e && view[3] > k[1] + e);
}
