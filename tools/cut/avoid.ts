// Crop a clip so the footage's own caption row falls outside the frame (toolkit phase 2d): the smallest zoom, with the focus
// moved up as needed, whose visible part of the source ends above the caption.
import { coverPlacement, type Crop } from '@tellcut/engine';

const MARGIN = 0.012;
/** seconds around each detected caption stretch that count as captioned too: one frame a second misses lines that change fast or
 *  sit on a busy picture, and the spans of a talking vlog come out in 3-second pieces with gaps between (t2-map-assets cropped every
 *  clip itself because of them) */
export const BURNED_PAD = 3;

/** The part of the source (as fractions of its height) that a frame shows for a crop. */
export function visibleRows(srcW: number, srcH: number, frameW: number, frameH: number, crop: Crop): [number, number] {
  const b = coverPlacement(srcW, srcH, frameW, frameH, crop);
  return [(0 - b.top) / b.height, (frameH - b.top) / b.height];
}

/** whether the frame already shows nothing of the caption row for this crop */
export function captionClear(o: { srcW: number; srcH: number; frameW: number; frameH: number; captionTop: number }, crop: Crop): boolean {
  const [t, b] = visibleRows(o.srcW, o.srcH, o.frameW, o.frameH, crop);
  return t >= -0.002 && b <= o.captionTop - MARGIN;
}

/**
 * A crop that keeps the caption row (top edge at `captionTop`, a fraction of the source height) out of the frame, close to `want`;
 * null when the source is already clear of it or no zoom up to `maxZoom` manages it.
 */
export function avoidCaptionCrop(o: { srcW: number; srcH: number; frameW: number; frameH: number; captionTop: number; want: Crop; maxZoom?: number }): Crop | null {
  const { want } = o;
  const clear = (c: Crop) => captionClear(o, c);
  if (clear(want)) return null;
  const foci = [want.y, ...[0.45, 0.35, 0.25, 0.15, 0.05, 0].filter((y) => y < want.y)];
  for (let z = Math.max(1, want.zoom); z <= (o.maxZoom ?? 2.2) + 1e-9; z = Math.round((z + 0.02) * 100) / 100) {
    for (const y of foci) {
      const c = { x: want.x, y, zoom: z };
      if (clear(c)) return c;
    }
  }
  return null;
}
