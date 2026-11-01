// Crop a clip so the footage's own caption row falls outside the frame (toolkit phase 2d): the smallest zoom, with the focus
// moved up as needed, whose visible part of the source ends above the caption. The zoom is capped by the footage's resolution
// (a 720p shot zoomed 1.7× in a 1080p film goes soft), and a subject the asked-for crop shows (the faces in it) stays in frame.
import { coverPlacement, lerpCrop, r6, type Crop } from '@tellcut/engine';
import { viewCrop, viewRect, type Rect } from './view.ts';

const MARGIN = 0.012;
/** seconds around each detected caption stretch that count as captioned too: one frame a second misses lines that change fast or
 *  sit on a busy picture, and the spans of a talking vlog come out in 3-second pieces with gaps between (t2-map-assets cropped every
 *  clip itself because of them) */
export const BURNED_PAD = 3;
/** avoidBurned's zoom: source pixels drawn at most UPSCALE times their size on the frame (a 720p shot in a 1080p film already is
 *  1.5×), but always up to MIN_ZOOM (no more than a slow push takes anyway), and never past MAX_ZOOM */
export const UPSCALE = 1.6, MIN_ZOOM = 1.25, MAX_ZOOM = 2.2;

/** The part of the source (as fractions of its height) that a frame shows for a crop. */
export function visibleRows(srcW: number, srcH: number, frameW: number, frameH: number, crop: Crop): [number, number] {
  const b = coverPlacement(srcW, srcH, frameW, frameH, crop);
  return [(0 - b.top) / b.height, (frameH - b.top) / b.height];
}

/** The most avoidBurned may zoom a source of this size in a frame of this size (pixels), see UPSCALE. */
export function burnedZoomCap(srcW: number, srcH: number, frameW: number, frameH: number): number {
  const base = Math.max(frameW / srcW, frameH / srcH);
  return Math.floor(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, UPSCALE / base)) * 100) / 100;
}

type Geometry = { srcW: number; srcH: number; frameW: number; frameH: number; captionTop: number };

/** whether the frame already shows nothing of the caption row for this crop */
export function captionClear(o: Geometry, crop: Crop): boolean {
  const [t, b] = visibleRows(o.srcW, o.srcH, o.frameW, o.frameH, crop);
  return t >= -0.002 && b <= o.captionTop - MARGIN;
}

/** what of `subject` ([left, top, right, bottom] of the source) a view has to go on showing: each axis the view shows it whole on */
export type Keep = { cols?: [number, number]; rows?: [number, number] };
const EPS = 0.004;
export function keepOf(view: Rect, subject: Rect): Keep {
  const inCols = subject[0] >= view[0] - EPS && subject[2] <= view[2] + EPS, inRows = subject[1] >= view[1] - EPS && subject[3] <= view[3] + EPS;
  return { ...(inCols ? { cols: [subject[0], subject[2]] as [number, number] } : {}), ...(inRows ? { rows: [subject[1], subject[3]] as [number, number] } : {}) };
}
const keeps = (view: Rect, k: Keep | undefined) => !k || ((!k.cols || (k.cols[0] >= view[0] - EPS && k.cols[1] <= view[2] + EPS))
  && (!k.rows || (k.rows[0] >= view[1] - EPS && k.rows[1] <= view[3] + EPS)));

/**
 * A crop that keeps the caption row (top edge at `captionTop`, a fraction of the source height) out of the frame, close to `want`;
 * null when the source is already clear of it or no zoom up to `maxZoom` manages it. `keep`: what of the subject every candidate
 * must still show; the focus may then move sideways onto it as well as up.
 */
export function avoidCaptionCrop(o: Geometry & { want: Crop; maxZoom?: number; keep?: Keep }): Crop | null {
  const { want } = o;
  const clear = (c: Crop) => captionClear(o, c) && keeps(viewRect(o.srcW, o.srcH, o.frameW, o.frameH, c), o.keep);
  if (captionClear(o, want)) return null;
  // the focus moved up in steps (moving it down only shows more of the caption)
  const foci = [want.y];
  for (let y = Math.ceil(want.y * 20 - 1e-9) / 20 - 0.05; y > -1e-9; y = Math.round((y - 0.05) * 100) / 100) if (y < want.y) foci.push(Math.max(0, Math.round(y * 100) / 100));
  for (let z = Math.max(1, want.zoom); z <= (o.maxZoom ?? MAX_ZOOM) + 1e-9; z = Math.round((z + 0.02) * 100) / 100) {
    const xs = [want.x, ...(o.keep?.cols ? [viewCrop(o.srcW, o.srcH, o.frameW, o.frameH, (o.keep.cols[0] + o.keep.cols[1]) / 2, 0.5, z).x] : [])];
    for (const x of xs) for (const y of foci) {
      const c = { x, y, zoom: z };
      if (clear(c)) return c;
    }
  }
  return null;
}

/**
 * avoidBurned for one clip's move ({ from, to }): both ends cleared of the caption, or neither — `why` says what stopped it:
 * 'zoom' (more than `maxZoom` needed) or 'subject' (clearing it would crop the `subject` the asked-for crop shows).
 */
export function avoidBurnedMove(o: Geometry & { maxZoom: number }, want: { from: Crop; to: Crop }, subject?: Rect): { from: Crop; to: Crop; why?: 'zoom' | 'subject' } {
  const fix = (c: Crop): Crop | 'zoom' | 'subject' => {
    if (captionClear(o, c)) return c;
    const keep = subject ? keepOf(viewRect(o.srcW, o.srcH, o.frameW, o.frameH, c), subject) : undefined;
    const r = avoidCaptionCrop({ ...o, want: c, keep });
    return r ?? (keep && (keep.cols || keep.rows) && avoidCaptionCrop({ ...o, want: c }) ? 'subject' : 'zoom');
  };
  const from = fix(want.from), to = fix(want.to);
  if (typeof from === 'string' || typeof to === 'string') return { ...want, why: from === 'subject' || to === 'subject' ? 'subject' : 'zoom' };
  return { ...want, from, to };
}

/** a move { from, to } spread over pieces of these lengths in order (tighten's pieces of one clip): no jump at a join */
export function spreadMove(move: { from: Crop; to: Crop }, lens: number[]): Array<{ from: Crop; to: Crop }> {
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const at = (p: number): Crop => { const c = lerpCrop(move.from, move.to, p); return { x: r6(c.x), y: r6(c.y), zoom: r6(c.zoom) }; };
  return lens.map((l) => { const r = { from: at(acc / total), to: at((acc + l) / total) }; acc += l; return r; });
}
