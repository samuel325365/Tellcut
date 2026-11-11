// common.grade, the one-colour kit's (onecolor-kit.ts) grade: the footage under it in black-and-white, in one colour, or as it is,
// switched on the beat (a flat fill blended 'color': grey takes the colour out, a colour gives every pixel its hue at the pixel's own
// lightness); deep also multiplies a light colour over the mono steps: with the one colour alone a bright sky stays nearly white.
import type { ItemType } from '@tellcut/engine';
import { FILL_CSS, GRADE_STEPS, deepFill, fill, stepsOf, valueAt, type FS } from './onecolor-kit.ts';

/** grade's fill for a step: bw grey, mono the item's colour, a #colour itself, anything else none */
export function gradeFill(v: string, color: string): string {
  return v === 'bw' ? '#808080' : v === 'mono' ? color : /^#[0-9a-f]{3,8}$/i.test(v) ? v : 'transparent';
}

interface GP { steps: string; color: string; deep: boolean; tone: string }
/** a grade's state: deep adds `w`, the multiplied layer beside its own */
interface GS extends FS { w?: HTMLElement }
/** Deep's layer goes beside the grade's own, right after it. Each item's layer is isolated and blends with one mode, and deep
 *  needs two over the footage (the colour, then a multiply): an element inside the grade's layer would only multiply the grade's
 *  own fill. Beside it, at the grade's place in the stack, it multiplies the graded picture below exactly as a wash item placed
 *  after the grade did. It keeps the layer's stacking, transform and showing, and leaves with it (hide, dispose). */
function deepLayer(root: HTMLElement, s: GS): HTMLElement | null {
  if (!root.parentElement) return null;
  if (!s.w) { s.w = document.createElement('div'); s.w.style.cssText = `${FILL_CSS};mix-blend-mode:multiply`; }
  if (s.w.previousElementSibling !== root) root.after(s.w);
  const r = root.style, w = s.w.style;
  w.zIndex = r.zIndex; w.transform = r.transform; w.transformOrigin = r.transformOrigin; w.display = '';
  return s.w;
}

export const grade: ItemType<GP, GS> = {
  type: 'common.grade', label: '單色調色', category: 'look', kind: 'overlay', blend: 'color',
  doc: '照拍子換調色：疊在影片上（整支片一個項目），steps「秒|bw／mono／none」（項目內秒數，一行一個）把下面的畫面換成黑白、color 色的單色、或原色（#顏色＝那個顏色的單色）；deep 讓單色更濃：mono 那幾段再乘上一層 tone 淺色（multiply），亮的天空也染色（以前要另外疊一個 common.wash）；字幕、文字積木要放在它之後才不會被染色；運動、單車、旅行的快剪，配 common.viewfinder、common.echo、common.poster',
  params: [
    { key: 'steps', label: '換色（秒|bw／mono／none，一行一個）', type: 'text', default: GRADE_STEPS },
    { key: 'color', label: '單色（mono）', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'deep', label: '加深（mono 那幾段再乘上 tone，亮的地方也染色）', type: 'bool', default: false },
    { key: 'tone', label: '加深乘上的顏色（deep）', type: 'color', default: '#ffa070' },
  ],
  build: (ctx) => fill(ctx.root),
  draw(ctx, s) {
    const v = valueAt(stepsOf(s.steps, ctx.params.steps), ctx.local);
    s.d.style.background = gradeFill(v, ctx.params.color);
    if (ctx.params.deep) { const w = deepLayer(ctx.root, s); if (w) w.style.background = deepFill(v, ctx.params.tone); }
    else if (s.w) s.w.style.display = 'none';
  },
  hide(s) { if (s.w) s.w.style.display = 'none'; },
  dispose(s) { s.w?.remove(); s.w = undefined; },
};
