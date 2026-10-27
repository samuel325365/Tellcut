// common.glitch — torn bands that invert the picture under them, in short bursts. A layer cannot read the pixels below it, so this
// is a difference-blended set of bars rather than a true colour split; the bars come from a seeded generator, one set per two frames.
import { cssCamel, frameOf, h, rng, type ItemType } from '@tellcut/engine';

interface P { bands: number; density: number; maxHeight: number; seed: number; tint: boolean }
interface S { bars: HTMLElement[] }

export const glitch: ItemType<P, S> = {
  type: 'common.glitch', label: '故障干擾', category: 'look', kind: 'overlay', blend: 'difference',
  doc: '畫面被撕出幾條反相的橫帶，一陣一陣閃；轉場、驚嚇、科技感、「出事了」的瞬間（蓋在影片上，不是真正的 RGB 分離）',
  params: [
    { key: 'bands', label: '橫帶數量', type: 'number', min: 1, max: 14, step: 1, default: 6 },
    { key: 'density', label: '出現機率（0–1，越大越常閃）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'maxHeight', label: '橫帶最大高度（畫面高比例）', type: 'number', min: 0.005, max: 0.2, step: 0.005, default: 0.05 },
    { key: 'seed', label: '亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 5 },
    { key: 'tint', label: '帶青／洋紅色', type: 'bool', default: true },
  ],
  build(ctx) {
    const bars = Array.from({ length: ctx.params.bands }, () => { const b = h('div', null, null, ctx.root); cssCamel(b, { position: 'absolute', left: '0', right: '0' }); return b; });
    return { bars };
  },
  draw(ctx, s) {
    const p = ctx.params, { H } = ctx, step = Math.floor(frameOf(ctx.local, ctx.fps) / 2), r = rng(p.seed * 7919 + step * 104729);
    const on = r() < p.density;
    for (const b of s.bars) {
      const y = r(), hh = (0.2 + 0.8 * r()) * p.maxHeight, shift = (r() - 0.5) * 0.3, tone = r();
      cssCamel(b, { display: on ? 'block' : 'none', top: `${y * H}px`, height: `${hh * H}px`, transform: `translateX(${shift * ctx.W}px)`, background: p.tint ? (tone < 0.4 ? '#00ffff' : tone < 0.8 ? '#ff00ff' : '#ffffff') : '#ffffff' });
    }
  },
};
