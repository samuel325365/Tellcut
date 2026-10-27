// common.tone — a colour grade laid over the whole picture in soft-light: a tinted glow in the middle and a dark rim. Its own block
// (not a common.film param) because the blend mode belongs to the item layer. Promoted from the zhongli-food short's fx.tone.
import { clamp, cssCamel, h, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';

interface P { color: string; edge: string; amount: number }
interface S { el: HTMLElement }

export const tone: ItemType<P, S> = {
  type: 'common.tone', label: '色調', category: 'look', kind: 'overlay', blend: 'soft-light',
  doc: '整片調色：柔光（soft-light）疊在影片上，中間一層色光、四周壓暗；預設暖色（街頭小吃、夕陽、懷舊），換成藍色就是冷調；常和 common.film 一起用',
  params: [
    { key: 'color', label: '中間的色光', type: 'color', default: '#ffbe78' },
    { key: 'edge', label: '四周的顏色', type: 'color', default: '#28140a' },
    { key: 'amount', label: '強度', type: 'number', min: 0, max: 1, step: 0.05, default: 0.55 },
  ],
  build(ctx) {
    const el = h('div', null, null, ctx.root);
    cssCamel(el, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    return { el };
  },
  draw(ctx, s) {
    const { color, edge, amount } = ctx.params, a = clamp(amount);
    cssCamel(s.el, { background: `radial-gradient(ellipse at 50% 45%, ${withAlpha(color, 0.55 * a)} 0%, ${withAlpha(color, 0.3 * a)} 45%, ${withAlpha(edge, 0.9 * a)} 100%)` });
  },
};
