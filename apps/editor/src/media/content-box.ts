// A block's gallery picture is mostly its dark stage with the block small in it (spec 2026-11-10-media-panel-visual §3): at the
// width of a library card many would look alike. The card shows only the part that is not background: measured once per picture
// in the browser on a small copy, cached by URL, shown at the picture's own proportions.
import { useEffect, useState } from 'preact/hooks';

export interface Box { x: number; y: number; w: number; h: number }

/** the part of a picture (RGBA pixels) that differs from its top-left corner colour, as fractions of it; null when it is all background */
export function contentBox(px: Uint8ClampedArray, w: number, h: number, tolerance = 24): Box | null {
  const r = px[0], g = px[1], b = px[2];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - b) <= tolerance) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h };
}

const MARGIN = 0.08;
/** the CSS that makes `box` (with a margin, grown to the card's shape about its middle) fill a card; null to show the picture as it
 *  is (nothing found, or the part is nearly all of it). Aspects are width / height. */
export function cropStyle(box: Box | null, url: string, picAspect: number, cardAspect: number) {
  if (!box || (box.w > 0.85 && box.h > 0.85)) return null;
  let x = Math.max(0, box.x - MARGIN), y = Math.max(0, box.y - MARGIN);
  let w = Math.min(1, box.x + box.w + MARGIN) - x, h = Math.min(1, box.y + box.h + MARGIN) - y;
  const cx = x + w / 2, cy = y + h / 2;
  // the same shape as the card, in the picture's own pixels: grow the narrow side
  if ((w / h) * picAspect < cardAspect) w = (h * cardAspect) / picAspect; else h = (w * picAspect) / cardAspect;
  if (w > 1 || h > 1) return null;
  x = Math.min(1 - w, Math.max(0, cx - w / 2)); y = Math.min(1 - h, Math.max(0, cy - h / 2));
  const pct = (at: number, size: number) => (size < 1 ? ((at / (1 - size)) * 100).toFixed(2) : '0');
  return { backgroundImage: `url(${url})`, backgroundSize: `${(100 / w).toFixed(2)}% auto`, backgroundPosition: `${pct(x, w)}% ${pct(y, h)}%` };
}

const measured = new Map<string, { box: Box | null; aspect: number }>();
/** the card style for a picture: the whole picture until it is measured (or when it cannot be) */
export function useCropStyle(url: string | undefined, cardAspect: number) {
  const [m, setM] = useState(url ? measured.get(url) : undefined);
  useEffect(() => {
    if (!url || measured.has(url)) { setM(url ? measured.get(url) : undefined); return; }
    let live = true;
    const img = new Image();
    img.onload = () => {
      try {
        const w = 64, h = Math.max(1, Math.round((64 * img.naturalHeight) / img.naturalWidth)), c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        if (!g) return;
        g.drawImage(img, 0, 0, w, h);
        const r = { box: contentBox(g.getImageData(0, 0, w, h).data, w, h), aspect: img.naturalWidth / img.naturalHeight };
        measured.set(url, r);
        if (live) setM(r);
      } catch { /* a tainted or broken picture: shown whole */ }
    };
    img.src = url;
    return () => { live = false; };
  }, [url]);
  if (!url) return null;
  return (m && cropStyle(m.box, url, m.aspect, cardAspect)) ?? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: '50% 50%' };
}
