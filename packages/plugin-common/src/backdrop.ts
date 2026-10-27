// common.backdrop — a patterned background for the whole picture, under the video: gingham, dots, stripes, grid, plain or a gradient.
// Pure CSS gradients on one div. `drift` slides the pattern; the offset is a function of the item's time only.
// `glow` adds a light rising from the bottom edge whose strength follows "秒:強度" stops, pulsing with `glowPulse` (from the baking-sin
// short's espresso background, which glowed redder as the sin meter climbed).
// pattern 'diamond' with `pool` and `vignette` is the food-receipt short's shop counter: a rubber-mat diamond grid, a warm pool of
// light where the work happens, dark corners.
// pattern 'spot' is the podcast-quote short's poster ground: a plain dark colour with a soft light from the top edge (color2 at `tint`)
// and a darker foot.
import { clamp, cssCamel, h, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';
import { levelAt, parseLevels } from './levels.ts';

interface P { pattern: 'gingham' | 'dots' | 'stripes' | 'grid' | 'solid' | 'gradient' | 'diamond' | 'spot'; color: string; color2: string; tint: number; scale: number; drift: number; glow: string; glowColor: string; glowPulse: number; pool: number; poolColor: string; poolY: number; vignette: number }
interface S { el: HTMLElement; glow: HTMLElement; pool: HTMLElement }

/** the glow's strength at t (0–1): the stops eased over 0.4 s, then a pulse of `pulse` around it */
export const glowAt = (stops: string, pulse: number, t: number) => {
  const lv = parseLevels(stops);
  if (!lv.length) return 0;
  const v = clamp(levelAt(lv, t, 0.4));
  return clamp(v * (1 - pulse * 0.5 + pulse * 0.5 * Math.sin(t * 9)));
};

/** The CSS background (image, size) of a pattern at `s` px cells. */
export function patternCss(p: Pick<P, 'pattern' | 'color' | 'color2' | 'tint'>, s: number): { image: string; size: string } {
  const c2 = withAlpha(p.color2, p.tint);
  switch (p.pattern) {
    case 'gingham': return { image: `repeating-linear-gradient(0deg, ${c2} 0 ${s}px, transparent ${s}px ${2 * s}px), repeating-linear-gradient(90deg, ${c2} 0 ${s}px, transparent ${s}px ${2 * s}px)`, size: 'auto' };
    case 'stripes': return { image: `repeating-linear-gradient(45deg, ${c2} 0 ${s / 2}px, transparent ${s / 2}px ${s}px)`, size: 'auto' };
    case 'dots': return { image: `radial-gradient(circle, ${c2} ${s * 0.12}px, transparent ${s * 0.13}px)`, size: `${s}px ${s}px` };
    case 'grid': return { image: `linear-gradient(0deg, ${c2} 0 2px, transparent 2px), linear-gradient(90deg, ${c2} 0 2px, transparent 2px)`, size: `${s}px ${s}px` };
    case 'diamond': return { image: `repeating-linear-gradient(45deg, ${c2} 0 2px, transparent 2px ${s}px), repeating-linear-gradient(-45deg, ${c2} 0 2px, transparent 2px ${s}px)`, size: 'auto' };
    case 'spot': return { image: `radial-gradient(120% 60% at 50% 0%, ${c2} 0%, ${withAlpha(p.color2, 0)} 55%), linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.38) 100%)`, size: 'auto' };
    case 'gradient': return { image: `linear-gradient(160deg, ${p.color}, ${p.color2})`, size: 'auto' };
    default: return { image: 'none', size: 'auto' };
  }
}

export const backdrop: ItemType<P, S> = {
  type: 'common.backdrop', label: '背景圖樣', category: 'look', kind: 'scene',
  doc: '整片的圖樣背景（格紋、圓點、斜紋、方格、純色、漸層），放在影片之下；影片縮成面板時露出來的底，顏色走 theme；glow 讓底部透出一片光，強度照「秒:強度」變（跟著分數、情緒越來越熱）；diamond 是收銀台止滑墊的菱格紋，pool 加一圈暖光、vignette 壓暗四角（深色收銀台、工作檯）；spot 是深色海報底：上緣透下一片柔光（color2、濃度 tint）、下方漸暗（金句、訪談、Podcast）',
  params: [
    { key: 'pattern', label: '圖樣', type: 'enum', options: ['gingham', 'dots', 'stripes', 'grid', 'solid', 'gradient', 'diamond', 'spot'], default: 'gingham' },
    { key: 'color', label: '底色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'color2', label: '圖樣顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'tint', label: '圖樣濃度（0–1）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.14 },
    { key: 'scale', label: '格子大小（以 1080 短邊計的 px）', type: 'number', min: 10, max: 400, step: 1, default: 70 },
    { key: 'drift', label: '圖樣漂移（px／秒）', type: 'number', min: -400, max: 400, step: 1, default: 0 },
    { key: 'glow', label: '底部光暈強度（秒:0–1，逗號分隔；空＝沒有）', type: 'string', default: '' },
    { key: 'glowColor', label: '光暈顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'glowPulse', label: '光暈脈動（0–1）', type: 'number', min: 0, max: 1, step: 0.05, default: 0 },
    { key: 'pool', label: '一圈暖光的強度（0–1；0＝沒有）', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'poolColor', label: '暖光顏色', type: 'color', default: '#ffd696' },
    { key: 'poolY', label: '暖光中心高度（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'vignette', label: '四角壓暗（0–1）', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
  ],
  build(ctx) {
    const el = h('div', null, null, ctx.root);
    cssCamel(el, { position: 'absolute', inset: '0' });
    const glow = h('div', null, null, ctx.root);
    cssCamel(glow, { position: 'absolute', inset: '0', display: 'none' });
    const pool = h('div', null, null, ctx.root);
    cssCamel(pool, { position: 'absolute', inset: '0', display: 'none' });
    return { el, glow, pool };
  },
  draw(ctx, s) {
    const p = ctx.params, k = Math.min(ctx.W, ctx.H) / 1080, css = patternCss(p, p.scale * k), d = p.drift * k * ctx.local;
    cssCamel(s.el, { backgroundColor: p.pattern === 'gradient' ? 'transparent' : p.color, backgroundImage: css.image, backgroundSize: css.size, backgroundPosition: `${d}px ${d}px` });
    const a = p.glow ? glowAt(p.glow, p.glowPulse, ctx.local) : 0;
    cssCamel(s.glow, { display: a > 0 ? 'block' : 'none', opacity: String(a),
      background: `radial-gradient(ellipse 120% 70% at 50% 110%, ${withAlpha(p.glowColor, 0.85)}, ${withAlpha(p.glowColor, 0)} 100%)` });
    // the pool of light and the dark corners (static)
    const pool = p.pool ?? 0, vig = p.vignette ?? 0, S = Math.max(ctx.W, ctx.H);
    const layers = [pool > 0 ? `radial-gradient(circle ${0.4 * S}px at 50% ${(p.poolY ?? 0.6) * 100}%, ${withAlpha(p.poolColor ?? '#ffd696', pool)}, ${withAlpha(p.poolColor ?? '#ffd696', 0)})` : '',
      vig > 0 ? `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,${vig}) 100%)` : ''].filter(Boolean);
    cssCamel(s.pool, { display: layers.length ? 'block' : 'none', background: layers.reverse().join(', ') || 'none' });
  },
};
