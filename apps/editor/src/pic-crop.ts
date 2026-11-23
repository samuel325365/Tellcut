// A look's small picture cropped to where the look is (protocol LookCrop, measured by the server): the gallery card's strip and the
// Properties panel's look picker show that part of the golden frame; the large pictures always show the whole frame.
import type { CardGround, LookCrop } from '@tellcut/protocol';

/** a crop with the shape of the frame it is a part of (width / height), which the box it is shown in needs to keep its shape */
export interface PicCrop { box: LookCrop; ratio: number }

/** the width / height of a card's picture: a 16:9 or square film, else 9:16 (CardGround.aspect) */
export const frameRatio = (aspect?: CardGround['aspect']) => (aspect === 'wide' ? 16 / 9 : aspect === 'square' ? 1 : 9 / 16);

/** a look's crop from the gallery index, with its frame's shape; none for a look shown whole */
export const picCrop = (x: { crop?: LookCrop; aspect?: CardGround['aspect'] }): PicCrop | undefined =>
  x.crop ? { box: x.crop, ratio: frameRatio(x.aspect) } : undefined;

/** where a picture of the frame sits in a box of `cw` × `ch` pixels, and what part of the frame (fractions) the box shows */
export interface CropView { left: number; top: number; width: number; height: number; shown: LookCrop }

/** One axis: the frame drawn `f` long in a box `c` long, the crop's centre (fraction `mid`) at the box's centre, then moved so the
 *  frame covers the box; a frame shorter than the box is centred in it (the one case a band remains). */
const place = (c: number, f: number, mid: number) => Math.min(Math.max(c / 2 - mid * f, c - f), Math.max(0, (c - f) / 2));

/** How a crop is shown in a box of `cw` × `ch` (CroppedImg): the picture scaled so the crop just fits the box (the zoom the crop
 *  asks for), the crop centred, and the box filled with what is around it in the frame: the crop grown about its centre to the
 *  box's shape, moved to stay inside the frame. In a box of the crop's own shape that is the crop itself. The CSS draws the same
 *  with container units (styles.css .pic-crop > img mirrors this: keep the two alike), as the strip's boxes are as wide as a
 *  card allows. */
export function cropView({ box: [x, y, w, h], ratio }: PicCrop, cw: number, ch: number): CropView {
  const width = Math.min(cw / w, (ch * ratio) / h), height = width / ratio;
  const left = place(cw, width, x + w / 2), top = place(ch, height, y + h / 2);
  const sx = Math.max(0, -left / width), sy = Math.max(0, -top / height);
  return { left, top, width, height, shown: [sx, sy, Math.min(1 - sx, cw / width), Math.min(1 - sy, ch / height)] };
}

/** the custom properties the CSS places the picture by (.pic-crop > img): the crop's left, top, width and height (fractions) and
 *  the frame's width / height */
export function cropStyles({ box: [x, y, w, h], ratio }: PicCrop): string {
  const n = (v: number) => Math.round(v * 1e4) / 1e4;
  return `--x:${n(x)};--y:${n(y)};--w:${n(w)};--h:${n(h)};--r:${n(ratio)}`;
}
