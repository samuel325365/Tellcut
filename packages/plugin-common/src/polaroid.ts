// common.polaroid — a moment of the footage frozen into an instant photo: a white flash, then the print drops in at a tilt with a
// hand-written line under it. Highlights, travel, best moments. The still comes from the source at `t` (media(): exports prepare it).
import { clamp, cssCamel, eBack, h, prog, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';
import { imagesReady } from './window.ts';

interface P { source: string; t: number; caption: string; x: number; y: number; size: number; tilt: number; flash: boolean; ink: string; font: string }
interface S { flash: HTMLElement; card: HTMLElement; img: HTMLImageElement; text: HTMLElement; src: string }

export const polaroid: ItemType<P, S> = {
  type: 'common.polaroid', label: '定格拍立得', category: 'frame', kind: 'overlay',
  doc: '把素材某一刻定格成拍立得：先閃白，相片斜斜落下、下方手寫一行字；精華、旅遊、最佳瞬間（c.polaroid 會從播放中的片段自動帶 source 與時間，並配快門聲）',
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
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  media(item) {
    const p = item.params as Partial<P>;
    return { videos: [], stills: p.source ? [{ source: p.source, t: Number(p.t) || 0, w: 720 }] : [] };
  },
  build(ctx) {
    const flash = h('div', null, null, ctx.root), card = h('div', null, null, ctx.root), img = document.createElement('img'), text = h('div', null, null, card);
    card.insertBefore(img, text);
    cssCamel(flash, { position: 'absolute', inset: '0', background: '#ffffff', pointerEvents: 'none' });
    cssCamel(card, { position: 'absolute', boxSizing: 'border-box', background: '#fbfaf6' });
    cssCamel(img, { display: 'block', width: '100%', objectFit: 'cover', background: '#2a2a2a' });
    cssCamel(text, { whiteSpace: 'pre', textAlign: 'center', fontWeight: '700', lineHeight: '1' });
    const s: S = { flash, card, img, text, src: '' };
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
    cssCamel(s.img, { height: `${hgt}px` });
    s.text.textContent = p.caption;
    cssCamel(s.text, { height: `${w * 0.22}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${w * 0.075}px`, color: p.ink,
      fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, transform: 'rotate(-1.5deg)', opacity: String(clamp((local - 0.5) / 0.3)) });
  },
};
