// common.polaroid — a moment of the footage frozen into an instant photo: a white flash, then the print drops in at a tilt with a
// hand-written line under it. Highlights, travel, best moments. The still comes from the source at `t` (media(): exports prepare it).
// `crop` frames the still in the square print like a clip's crop (keep burned-in text out); `font` is the theme's display font unless
// set (a handwriting font such as LXGW WenKai TC makes the line look written).
import { clamp, coverPlacement, cssCamel, eBack, h, prog, textEm, type Crop, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';
import { cropOf } from './cells.ts';
import { fitPx } from './text.ts';
import { imagesReady } from './window.ts';

interface P { source: string; t: number; caption: string; x: number; y: number; size: number; tilt: number; flash: boolean; ink: string; font: string; crop: Crop }
interface S { flash: HTMLElement; card: HTMLElement; win: HTMLElement; img: HTMLImageElement; text: HTMLElement; src: string }

/** a crop written "x,y,zoom", the way every photo card and shot line writes one (a clip's crop: the point to aim at, 0–1, and a
 *  zoom); a part missing or not a number is the middle, zoom 1 */
export function cropText(text: unknown): Crop {
  const [x, y, zoom] = String(text ?? '').split(',').map((v) => v.trim());
  return cropOf({ x, y, zoom });
}

/** a usable crop ({ x, y, zoom }, or the same written "x,y,zoom"; anything missing is the middle at zoom 1), or null for the middle
 *  at zoom 1 (the print's plain cover) */
export function polaroidCrop(c: unknown): Crop | null {
  const o = (typeof c === 'string' ? cropText(c) : c && typeof c === 'object' ? c : {}) as Partial<Crop>, n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const crop = { x: clamp(n(o.x, 0.5)), y: clamp(n(o.y, 0.5)), zoom: Math.max(1, n(o.zoom, 1)) };
  return crop.x === 0.5 && crop.y === 0.5 && crop.zoom === 1 ? null : crop;
}

export const polaroid: ItemType<P, S> = {
  type: 'common.polaroid', label: '定格拍立得', category: 'frame', kind: 'overlay',
  doc: '把素材某一刻定格成拍立得：先閃白，相片斜斜落下、下方寫一行字；crop { x, y, zoom }（也可以寫成「x,y,zoom」，和其他相片卡、鏡頭行的寫法一樣）像主軌片段的 crop 一樣在方形相片裡取景（避開原片燒進去的字、對準臉）；下方的字預設用主題的標題字型，不是手寫，要手寫給 font（例如 LXGW WenKai TC）；精華、旅遊、最佳瞬間（c.polaroid 會從播放中的片段自動帶 source 與時間，並配快門聲；crop 不會自動帶，要自己給）',
  params: [
    { key: 'source', label: '素材', type: 'source-ref', default: '' },
    { key: 't', label: '素材的第幾秒', type: 'number', min: 0, max: 36000, step: 0.1, default: 0 },
    { key: 'caption', label: '相片下方的字', type: 'string', default: '最棒的一刻' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.42 },
    { key: 'size', label: '寬度（畫面短邊 %）', type: 'number', min: 20, max: 95, step: 1, default: 70 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -20, max: 20, step: 0.5, default: -4 },
    { key: 'flash', label: '閃白', type: 'bool', default: true },
    { key: 'ink', label: '字色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'font', label: '字型（預設是主題的標題字型；手寫給 LXGW WenKai TC）', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'crop', label: '相片的裁切 { x, y, zoom } 或「x,y,zoom」（x、y 是對準的點，0–1；zoom 1 以上放大；避開原片燒進去的字）', type: 'json', default: { x: 0.5, y: 0.5, zoom: 1 } },
  ],
  media(item) {
    const p = item.params as Partial<P>;
    return { videos: [], stills: p.source ? [{ source: p.source, t: Number(p.t) || 0, w: 720 }] : [] };
  },
  build(ctx) {
    const flash = h('div', null, null, ctx.root), card = h('div', null, null, ctx.root), win = h('div', null, null, card), img = document.createElement('img'), text = h('div', null, null, card);
    win.appendChild(img);
    cssCamel(flash, { position: 'absolute', inset: '0', background: '#ffffff', pointerEvents: 'none' });
    cssCamel(card, { position: 'absolute', boxSizing: 'border-box', background: '#fbfaf6' });
    // the photo's window: the still covers it (object-fit), or with a crop is placed in it the way a clip is
    cssCamel(win, { position: 'relative', overflow: 'hidden', width: '100%', background: '#2a2a2a' });
    cssCamel(img, { display: 'block', width: '100%', objectFit: 'cover', background: '#2a2a2a' });
    cssCamel(text, { whiteSpace: 'pre', textAlign: 'center', fontWeight: '700', lineHeight: '1' });
    const s: S = { flash, card, win, img, text, src: '' };
    polaroid.draw(ctx, s);   // starts loading the still now, so ready() can wait for it
    return s;
  },
  ready: (s) => imagesReady([s.img]),
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, w = (p.size / 100) * Math.min(W, H), pad = w * 0.055;
    if (p.source) {
      const src = ctx.media.stillUrl({ source: p.source, t: Number(p.t) || 0, w: 720 });
      if (src !== s.src) { s.src = src; s.img.src = src; }
    }
    cssCamel(s.flash, { display: p.flash ? 'block' : 'none', opacity: String(local < 0.04 ? 0.9 : 0.9 * (1 - prog(local, 0.04, 0.35))) });
    const drop = eBack(clamp((local - 0.08) / 0.5), 1.6), out = 1 - prog(local, dur - 0.3, dur);
    const hgt = w - 2 * pad;
    cssCamel(s.card, { left: `${p.x * W - w / 2}px`, top: `${p.y * H - (hgt + pad + w * 0.22) / 2}px`, width: `${w}px`, padding: `${pad}px ${pad}px 0`,
      boxShadow: `0 ${18 * k}px ${40 * k}px ${withAlpha('#000000', 0.45)}`, opacity: String(clamp((local - 0.06) / 0.12) * out),
      transform: `rotate(${p.tilt + (1 - drop) * 9}deg) scale(${1.3 - 0.3 * drop})`, transformOrigin: '50% 40%' });
    cssCamel(s.win, { height: `${hgt}px` });
    const crop = polaroidCrop(p.crop), iw = s.img.naturalWidth, ih = s.img.naturalHeight;
    if (crop && iw > 0 && ih > 0) {
      const b = coverPlacement(iw, ih, w - 2 * pad, hgt, crop);
      cssCamel(s.img, { position: 'absolute', maxWidth: 'none', objectFit: 'fill', left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
    } else cssCamel(s.img, { position: '', maxWidth: '', objectFit: 'cover', left: '', top: '', width: '100%', height: `${hgt}px` });
    // the line on one row (white-space pre), shrunk to the print's inner width when long; its longest row when written on several
    s.text.textContent = p.caption;
    const row = String(p.caption ?? '').split('\n').reduce((a, b) => (textEm(b) > textEm(a) ? b : a), '');
    cssCamel(s.text, { height: `${w * 0.22}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${fitPx(row, w * 0.075, w - 2 * pad)}px`, color: p.ink,
      fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, transform: 'rotate(-1.5deg)', opacity: String(clamp((local - 0.5) / 0.3)) });
  },
};
