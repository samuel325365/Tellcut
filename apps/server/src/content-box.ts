// Where a block's look is in its golden picture, for the gallery's small pictures (the card's strip and the editor's look picker):
// a look that covers only a sliver of the frame (a thin progress bar along an edge, a ring in a corner, a pen mark) is unreadable
// shrunk whole, so its small picture shows the part of the frame where it is. "Where it is" is where its picture differs from what
// the block's other pictures agree on: over a group of pictures of one ground and shape, each cell of a coarse grid takes the
// value most of the group agree on (within THRESHOLD; the consensus, the ground the looks leave alone), and a picture's content is
// where it is farther than THRESHOLD from it. Not the median: where most looks of a block draw something (the bottom edge of a
// progress block, each look in its own colour) the median is one of those, and every look that leaves that edge alone would count it
// as its own; the looks drawn there disagree with each other, the ground agrees with itself. Pure: the server decodes the pictures (look-crops.ts) and this only measures them.
import type { Rgba } from '@tellcut/media-node';
import type { LookCrop } from '@tellcut/protocol';

/** a part of the frame as fractions of its width and height (0–1): left, top, width, height (protocol LookCrop) */
export type Crop = LookCrop;

/** the grid's long side, in cells: coarse enough to be quick and to average antialiasing away, fine enough for a 2 px bar */
export const GRID = 96;
/** how far (0–255, the largest of a cell's premultiplied R, G, B, A differences) a cell must be from the consensus to be content */
export const THRESHOLD = 24;
/** A faint change (0–255, as THRESHOLD) still counts against cropping: a look that changes the whole frame faintly (scan lines
 *  over the picture, a slight tint) and strongly in one place only is no look of that place. One whose cells farther than this
 *  from the consensus are MAX_AREA of the frame or more is shown whole. */
export const FAINT = 8;
/** a group smaller than this has no consensus worth the name (two pictures: which one is the ground?) */
export const MIN_GROUP = 3;
/** a look whose content box covers this share of the frame or more fills the frame (a backdrop, a grade): shown whole */
export const MAX_AREA = 0.35;
/** the box is padded by this share of its larger side, so the look keeps a little of what is around it */
export const PAD = 0.15;
/** no side of a crop is shorter than this share of the frame's short side (a dot is not blown up to a blur) */
export const MIN_SIDE = 0.25;
/** the crop's shape (width / height, in pixels): square, as the editor's look picker tiles are; the gallery strip's boxes are a
 *  little narrower than square, and either shows the crop whole inside its box */
export const CROP_ASPECT = 1;

/** the picture shrunk to the grid (gw × gh cells, 4 channels each: R, G, B premultiplied by alpha, and alpha), cell means */
function shrink(p: Rgba, gw: number, gh: number): Float32Array {
  const sum = new Float64Array(gw * gh * 4), n = new Uint32Array(gw * gh), d = p.data;
  for (let y = 0; y < p.height; y++) {
    const cy = Math.min(gh - 1, Math.floor(((y + 0.5) * gh) / p.height));
    for (let x = 0; x < p.width; x++) {
      const cx = Math.min(gw - 1, Math.floor(((x + 0.5) * gw) / p.width)), c = cy * gw + cx, i = (y * p.width + x) * 4, a = d[i + 3];
      sum[c * 4] += (d[i] * a) / 255; sum[c * 4 + 1] += (d[i + 1] * a) / 255; sum[c * 4 + 2] += (d[i + 2] * a) / 255; sum[c * 4 + 3] += a;
      n[c]++;
    }
  }
  return Float32Array.from(sum, (s, i) => s / (n[i >> 2] || 1));
}

const median = (v: number[]) => { v.sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
/** how far apart two cells are: the largest of their channels' differences */
const far = (a: Float32Array, i: number, b: Float32Array, j: number) =>
  Math.max(Math.abs(a[i] - b[j]), Math.abs(a[i + 1] - b[j + 1]), Math.abs(a[i + 2] - b[j + 2]), Math.abs(a[i + 3] - b[j + 3]));

/** the consensus of the grids: each cell the value of the picture the most others are within THRESHOLD of there, a tie going to
 *  the one nearest the cells' channel-wise median */
function consensus(grids: Float32Array[]): Float32Array {
  const out = new Float32Array(grids[0].length), mid = new Float32Array(4);
  for (let c = 0; c < out.length; c += 4) {
    for (let k = 0; k < 4; k++) mid[k] = median(grids.map((g) => g[c + k]));
    let best = 0, most = -1, near = Infinity;
    grids.forEach((g, i) => {
      let n = 0;
      for (const h of grids) if (far(g, c, h, c) <= THRESHOLD) n++;
      const d = far(g, c, mid, 0);
      if (n > most || (n === most && d < near)) { best = i; most = n; near = d; }
    });
    for (let k = 0; k < 4; k++) out[c + k] = grids[best][c + k];
  }
  return out;
}

/** The content box of each picture of a group (one ground and shape, all the same pixel size), as fractions of the frame, or
 *  undefined where there is none (no difference from the consensus) or it is not worth cropping to (it, or the cells a FAINT
 *  change sets apart, covering MAX_AREA of the frame or more). A group
 *  smaller than MIN_GROUP gets none. */
export function contentBoxes(pics: readonly Rgba[]): (Crop | undefined)[] {
  if (pics.length < MIN_GROUP) return pics.map(() => undefined);
  const { width: W, height: H } = pics[0];
  if (pics.some((p) => p.width !== W || p.height !== H)) throw new Error('contentBoxes: the pictures of a group must be one size');
  const gw = W >= H ? GRID : Math.max(1, Math.round((GRID * W) / H)), gh = H >= W ? GRID : Math.max(1, Math.round((GRID * H) / W));
  const grids = pics.map((p) => shrink(p, gw, gh)), cons = consensus(grids);
  return grids.map((g) => {
    let x0 = gw, y0 = gh, x1 = -1, y1 = -1, faint = 0;
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      const c = (cy * gw + cx) * 4, d = far(g, c, cons, c);
      if (d > FAINT) faint++;
      if (d > THRESHOLD) { x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy); }
    }
    if (x1 < 0 || faint >= MAX_AREA * gw * gh) return undefined;
    const box: Crop = [x0 / gw, y0 / gh, (x1 + 1 - x0) / gw, (y1 + 1 - y0) / gh];
    return box[2] * box[3] >= MAX_AREA ? undefined : cropAround(box, W, H);
  });
}

/** A content box (fractions) made into a crop of a W × H frame: padded by PAD of its larger side, at least MIN_SIDE of the short
 *  side each way, grown to CROP_ASPECT about its centre, no larger than the frame and moved inside it; rounded to 4 decimals.
 *  Undefined when that is the whole frame (nothing to zoom). */
export function cropAround([fx, fy, fw, fh]: Crop, W: number, H: number, aspect = CROP_ASPECT): Crop | undefined {
  let w = fw * W, h = fh * H;
  const cx = (fx + fw / 2) * W, cy = (fy + fh / 2) * H, pad = PAD * Math.max(w, h), least = MIN_SIDE * Math.min(W, H);
  const pw = Math.min(W, Math.max(least, w + 2 * pad)), ph = Math.min(H, Math.max(least, h + 2 * pad));
  // grown to the aspect, then no larger than the frame; a side the frame cut short takes the other back to the aspect, as far as
  // the padded box lets it (a bar the frame's width: as tall as the frame is wide, not as tall as the bar padded was wide)
  w = Math.min(W, Math.max(pw, ph * aspect)); h = Math.min(H, Math.max(ph, pw / aspect));
  h = Math.max(ph, Math.min(h, w / aspect)); w = Math.max(pw, Math.min(w, h * aspect));
  const x = Math.min(W - w, Math.max(0, cx - w / 2)), y = Math.min(H - h, Math.max(0, cy - h / 2));
  const r = (v: number) => Math.round(v * 1e4) / 1e4, crop: Crop = [r(x / W), r(y / H), r(w / W), r(h / H)];
  return crop[2] >= 0.999 && crop[3] >= 0.999 ? undefined : crop;
}
