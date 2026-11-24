// common.tone — a colour grade laid over the whole picture in soft-light: a tinted glow in the middle and a dark rim. Its own block
// (not a common.film param) because the blend mode belongs to the item layer. Promoted from a food-review hook short's fx.tone.
import { clamp, cssCamel, h, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';

interface P { color: string; edge: string; amount: number }
interface S { els: HTMLElement[] }

/** How many soft-light passes the amount can stack: amount n lays the glow and rim n times, each pass blending with the picture the
 *  ones before made. One pass at full is as far as the look ever went (soft-light moves a channel little), too faint to tell a cool
 *  tone from the warm one on a busy picture; the extra passes stay empty up to amount 1, so what drew before draws the same. */
export const TONE_PASSES = 3;

/** pass `k`'s share of the amount: the first takes 0…1, the second 1…2, the third 2…3 */
export const passShare = (amount: number, k: number) => clamp((Number.isFinite(amount) ? amount : 0) - k);

export const tone: ItemType<P, S> = {
  type: 'common.tone', label: '色調', category: 'look', kind: 'overlay', over: 'picture', blend: Array<string>(TONE_PASSES).fill('soft-light'), likeness: 'colour',
  doc: '整片調色：柔光（soft-light）疊在影片上，中間一層色光、四周壓暗；預設暖色（街頭小吃、夕陽、懷舊），換成藍色就是冷調；amount 1 以上再疊一層柔光（最多 3），色調一眼看得出來；常和 common.film 一起用',
  params: [
    { key: 'color', label: '中間的色光', type: 'color', default: '#ffbe78' },
    { key: 'edge', label: '四周的顏色', type: 'color', default: '#28140a' },
    { key: 'amount', label: '強度（0–3；1 以上再疊一層柔光，色調更明顯）', type: 'number', min: 0, max: TONE_PASSES, step: 0.05, default: 0.55 },
  ],
  templates: [
    { id: 'golden-hour', label: '金色黃昏', doc: '夕陽、街頭小吃、懷舊：整片濃的橘金色，四周壓成深棕', params: { color: '#ffa040', edge: '#3a1606', amount: 3 } },
    { id: 'blue-hour', label: '藍調夜色', doc: '夜晚、下雨、冷清或安靜的段落：整片偏藍，四周沉成深藍', params: { color: '#6fb0ff', edge: '#081a40', amount: 3 } },
    { id: 'pink-dream', label: '粉紫夢境', doc: '約會、咖啡廳、甜點、回憶：粉色的光，四周染成深紫', params: { color: '#ff8cc0', edge: '#3a0a2a', amount: 3 } },
    { id: 'teal', label: '青綠電影感', doc: '海邊、城市夜景、旅行：青綠色的光，四周壓成深青，像電影調色', params: { color: '#5fe0d0', edge: '#04202a', amount: 2.5 } },
  ],
  build(ctx) {
    // the first pass in the item's own layer, the others in the further layers the stage made for the other blend modes
    const els = [ctx.root, ...(ctx.layers ?? [])].slice(0, TONE_PASSES).map((parent) => {
      const el = h('div', null, null, parent);
      cssCamel(el, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      return el;
    });
    return { els };
  },
  draw(ctx, s) {
    const { color, edge, amount } = ctx.params;
    s.els.forEach((el, k) => {
      const a = passShare(amount, k);
      // (the first pass draws its gradient whatever the amount, as it always did; an extra pass with nothing to add draws nothing)
      cssCamel(el, { background: k === 0 || a > 0 ? `radial-gradient(ellipse at 50% 45%, ${withAlpha(color, 0.55 * a)} 0%, ${withAlpha(color, 0.3 * a)} 45%, ${withAlpha(edge, 0.9 * a)} 100%)` : 'none' });
    });
  },
};
