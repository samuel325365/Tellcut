// A city-and-food magazine, promoted 2026-11-06 from the Fashion pilot film's fx.cover / fx.taste / fx.column / fx.wordbands (after the
// user's own Fashion style film). This file holds what its blocks share (the faces, the photo still, cover-cropping and fitting):
//   common.masthead   (masthead.ts) front: a cover over the footage, its masthead typed a letter at a time with a rule drawn under it,
//                     issue lines, contents down the right, an italic line wiped in; back: the back cover, a colour page with NEXT ISSUE,
//                     the masthead, a photo band and an italic line
//   common.spread     (spread.ts) a full magazine page: layout swatch, a colour page of a "taste index" (header, photo card, big number
//                     and a name, a swatch card in the page's colour); layout column, a paper page (a big number, a photo card, an
//                     outlined word over its foot, the column's name and a page number)
//   common.wordbands  (wordbands.ts) slanted bands of repeated italic serif words, each wider than the last until they fill the frame,
//                     a photo card in the middle (EAT · EVERY · SINGLE · BITE)
// The giant headline is the title template didone-full, the caption the template editorial-bar. Pure functions of time.
import { clamp, type SceneItem } from '@tellcut/engine';

export const DISPLAY = 'Playfair Display', SERIF = 'Noto Serif TC';
export const disp = (px: number, w = 900, it = false) => `${it ? 'italic ' : ''}${w} ${px}px "${DISPLAY}", "${SERIF}", serif`;
export type G = CanvasRenderingContext2D;

export const fontsReady = (text: string) => Promise.all([
  document.fonts.load(`900 80px "${DISPLAY}"`, 'AZ09'), document.fonts.load(`400 40px "${DISPLAY}"`, 'AZ09'),
  document.fonts.load(`italic 700 80px "${DISPLAY}"`, 'Az'), document.fonts.load(`italic 900 80px "${DISPLAY}"`, 'AZ'), document.fonts.load(`700 60px "${SERIF}"`, text || '字'),
]).then(() => undefined);
const stillOf = (source: string, t: number) => ({ source, t, w: 1080 });
/** the photo for `source` at `t`, made again when either changes */
export function photo(s: { img: HTMLImageElement | null; key: string }, media: { stillUrl(r: { source: string; t: number; w?: number }): string }, source: string, t: number) {
  const key = `${source}|${t}`;
  if (s.key === key) return;
  s.key = key;
  s.img = source ? Object.assign(new Image(), { src: media.stillUrl(stillOf(source, t)) }) : null;
}
/** an image covering the box (x, y, w, h), focused at (fx, fy); the box filled with `stand` while the image is not there */
export function coverImage(g: G, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, fx = 0.5, fy = 0.5, stand = '#8a8580') {
  if (!img || !img.complete || !img.naturalWidth) { g.fillStyle = stand; g.fillRect(x, y, w, h); return; }
  const ir = img.naturalWidth / img.naturalHeight, br = w / h;
  let sw = img.naturalWidth, sh = img.naturalHeight;
  if (ir > br) sw = sh * br; else sh = sw / br;
  const sx = clamp(fx * img.naturalWidth - sw / 2, 0, img.naturalWidth - sw), sy = clamp(fy * img.naturalHeight - sh / 2, 0, img.naturalHeight - sh);
  g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
export const track = (g: G, px: number) => { try { (g as unknown as { letterSpacing: string }).letterSpacing = `${(px * 0.22).toFixed(1)}px`; } catch { /* older canvases */ } };
export const untrack = (g: G) => { try { (g as unknown as { letterSpacing: string }).letterSpacing = '0px'; } catch { /* older canvases */ } };
/** set `font(px)` on g (tracked as track(g, spacing) when spacing is given), shrunk with its tracking so `text` is at most `room`
 *  wide, down to `min` of its size; the px it set. A text that fits is set exactly as before. */
export function fitSet(g: G, text: string, px: number, font: (px: number) => string, room: number, spacing?: number, min = 0.4): number {
  g.font = font(px); if (spacing !== undefined) track(g, spacing);
  const w = text ? g.measureText(text).width : 0;
  if (w <= room) return px;
  const s = Math.max(min, room / w);
  g.font = font(px * s); if (spacing !== undefined) track(g, spacing * s);
  return px * s;
}
export const stillMedia = (item: SceneItem) => {
  const p = item.params as { source?: string; t?: number };
  return { videos: [], stills: p.source ? [stillOf(p.source, Number(p.t) || 0)] : [] };
};
