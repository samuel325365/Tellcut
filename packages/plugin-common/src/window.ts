// A picture window in a physical thing that moves (a postcard, a polaroid, a photo frame, a TV), from the uk-postcard short: while the
// thing moves, the window shows a still of the footage (placed exactly as the engine places the clip: coverPlacement); once it has
// settled, the window becomes a hole — through the block and everything it drew under it — and the clip on the track below, whose
// `frame` is that window, plays through it. Shared by common.postcard and common.frame.
import { coverPlacement, cssCamel, h, type Crop, type MediaApi } from '@tellcut/engine';

/** a still of a source at `t` s (a photo: t 0), placed in the window with `crop`; `file`: a picture file in the project instead */
export interface Still { source: string; t: number; crop?: Crop; file?: string }
export const stillRef = (s: Still, w = 1080) => ({ source: s.source, t: Number(s.t) || 0, w });
export const stillKey = (s?: Still | null) => (s ? `${s.source}@${s.t}|${s.file ?? ''}` : '');
const CROP: Crop = { x: 0.5, y: 0.5, zoom: 1 };

export interface Win { box: HTMLElement; img: HTMLImageElement; ph: HTMLElement; src: string }

/** the window: a clipping box with the still's <img> and a painted stand-in (a low sun over the sea) for when there is no footage */
export function windowEl(parent: HTMLElement): Win {
  const box = h('div', null, null, parent), ph = h('div', null, null, box), img = document.createElement('img');
  box.appendChild(img);
  cssCamel(box, { position: 'absolute', overflow: 'hidden' });
  cssCamel(ph, { position: 'absolute', inset: '0',
    background: 'radial-gradient(circle at 50% 66%, #f6c26b 0 9%, rgba(246,194,107,0.35) 9.5% 16%, transparent 16.5%), linear-gradient(180deg, #9cc3d8 0%, #e8d3b0 62%, #6f93a8 63%, #3f6478 100%)' });
  cssCamel(img, { position: 'absolute', display: 'none', maxWidth: 'none' });
  return { box, img, ph, src: '' };
}

export const stillUrl = (media: MediaApi, s: Still) => (s.file ? media.fileUrl(s.file) : media.stillUrl(stillRef(s)));

/** show `s` in the window (w × h px) at `alpha`; without a still the stand-in shows. The <img> loads once per still. */
export function showStill(media: MediaApi, win: Win, s: Still | null | undefined, w: number, hh: number, alpha = 1) {
  const src = s?.source || s?.file ? stillUrl(media, s) : '';
  if (src !== win.src) { win.src = src; if (src) win.img.src = src; else win.img.removeAttribute('src'); }
  const ok = !!src && win.img.complete && win.img.naturalWidth > 0;
  cssCamel(win.box, { width: `${w}px`, height: `${hh}px`, opacity: String(alpha), display: alpha > 0 ? 'block' : 'none' });
  cssCamel(win.ph, { display: src ? 'none' : 'block' });
  if (!ok) { cssCamel(win.img, { display: 'none' }); return; }
  const b = coverPlacement(win.img.naturalWidth, win.img.naturalHeight, w, hh, s?.crop ?? CROP);
  cssCamel(win.img, { display: 'block', left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
}

/** resolves once every image has loaded (or failed): ItemType.ready */
export const imagesReady = (imgs: HTMLImageElement[]) =>
  Promise.all(imgs.filter((i) => i.getAttribute('src')).map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => {})))).then(() => {});

/** Cut a hole the size of `rect` ([x, y, w, h] px in `el`) out of `el` with a CSS mask (null: no hole) — what lies under the window.
 *  `r` rounds the hole's corners (a phone's video window); the layer must cover the corners round it, or the clip's own square
 *  corners show there. */
export function punch(el: HTMLElement, rect: [number, number, number, number] | null, r = 0) {
  if (!rect) { cssCamel(el, { maskImage: 'none', webkitMaskImage: 'none' }); return; }
  const [x, y, w, hh] = rect.map((v) => v.toFixed(2));
  const hole = r > 0 ? roundRectUrl(rect[2], rect[3], r) : 'linear-gradient(#000, #000)';
  const img = `linear-gradient(#000, #000), ${hole}`, size = `100% 100%, ${w}px ${hh}px`, pos = `0 0, ${x}px ${y}px`;
  cssCamel(el, { maskImage: img, maskSize: size, maskPosition: pos, maskRepeat: 'no-repeat', maskComposite: 'exclude',
    webkitMaskImage: img, webkitMaskSize: size, webkitMaskPosition: pos, webkitMaskRepeat: 'no-repeat', webkitMaskComposite: 'xor' });
}
/** a filled rounded rectangle w × h with corners r, as a CSS url() image */
export const roundRectUrl = (w: number, hh: number, r: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w.toFixed(2)}' height='${hh.toFixed(2)}'><rect width='100%' height='100%' rx='${Math.min(r, w / 2, hh / 2).toFixed(2)}'/></svg>`)}")`;

/** a rect in px of a W×H frame as the clip `frame` (fractions), rounded like cut.ts does */
export const asFrame = (r: [number, number, number, number], W: number, H: number): [number, number, number, number] =>
  [r[0] / W, r[1] / H, r[2] / W, r[3] / H].map((v) => Math.round(v * 1e5) / 1e5) as [number, number, number, number];
