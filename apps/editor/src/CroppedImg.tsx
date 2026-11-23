// A small picture showing where its look is (pic-crop.ts cropView): a box filling its place (a size container) and the whole picture
// inside it, scaled so the crop just fits and moved so the crop is centred, the rest of the box filled with what is around the crop
// in the frame (clipped at the box's edges). Plain CSS with container units, for Chromium and Safari alike (no object-view-box);
// the custom properties carry the crop. Marked data-cropped.
import { cropStyles, type PicCrop } from './pic-crop.ts';

export function CroppedImg({ src, crop, onError }: { src: string; crop: PicCrop; onError: () => void }) {
  return (
    <span class="pic-crop" data-cropped>
      <img src={src} alt="" loading="lazy" onError={onError} style={cropStyles(crop)} />
    </span>
  );
}
