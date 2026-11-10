// common.backdrop — a patterned background for the whole picture, under the video: gingham, dots, stripes, grid, plain or a gradient.
// Pure CSS gradients on one div. `drift` slides the pattern; the offset is a function of the item's time only.
// `glow` adds a light rising from the bottom edge whose strength follows "秒:強度" stops, pulsing with `glowPulse` (from the baking-sin
// short's espresso background, which glowed redder as the sin meter climbed).
// pattern 'diamond' with `pool` and `vignette` is the food-receipt short's shop counter: a rubber-mat diamond grid, a warm pool of
// light where the work happens, dark corners.
// pattern 'spot' is the podcast-quote short's poster ground: a plain dark colour with a soft light from the top edge (color2 at `tint`)
// and a darker foot.
// pattern 'words' (the Dopamine Colors pilot film's fx.wordwall, 2026-11-06) fills the page with rows of `word` in outlined heavy serif
// (color2 at `tint`), neighbouring rows sliding opposite ways at `drift`; `bits` scatters small confetti (dots, four-point sparkles,
// zigzags, crosses) down both sides, twinkling, on any pattern.
import { clamp, cssCamel, h, rng, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';
import { levelAt, parseLevels } from './levels.ts';

interface P { pattern: 'gingham' | 'dots' | 'stripes' | 'grid' | 'solid' | 'gradient' | 'diamond' | 'spot' | 'words'; word: string; bits: number; seed: number; color: string; color2: string; tint: number; scale: number; drift: number; glow: string; glowColor: string; glowPulse: number; pool: number; poolColor: string; poolY: number; vignette: number }
interface S { el: HTMLElement; glow: HTMLElement; pool: HTMLElement; cv: HTMLCanvasElement; word: string }

/** the confetti's colours: the theme's, without the page's own */
const bitColors = (palette: Record<string, string>, color: string) =>
  [palette.accent, palette.accent2, palette.hl, palette.ink, palette.paper].filter((c, i, a) => c && a.indexOf(c) === i && c.toLowerCase() !== String(color).toLowerCase());

/** where confetti bit i of a seed sits and what it is: x near one side, y anywhere, its kind (0 dot, 1 sparkle, 2 zigzag, 3 cross),
 *  its size share, colour pick and phase */
export function bitAt(seed: number, i: number): { x: number; y: number; kind: number; size: number; phase: number; pick: number } {
  const r = rng(seed * 7919 + i * 104729);
  const side = r() < 0.5, x = side ? 0.02 + 0.1 * r() : 0.88 + 0.1 * r();
  return { x, y: 0.06 + 0.88 * r(), kind: Math.floor(r() * 4), pick: r(), phase: r() * 6.283, size: r() };
}

/** pattern words: rows of the word, outlined, neighbouring rows sliding opposite ways; `row` px high */
function drawWords(g: CanvasRenderingContext2D, p: P, W: number, H: number, k: number, row: number, local: number) {
  const fs = row * 0.92, word = `${String(p.word || 'HELLO').trim()} `, rows = Math.ceil(H / row);
  g.font = `900 ${fs}px 'Playfair Display', 'Noto Serif TC', serif`; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.strokeStyle = withAlpha(p.color2, p.tint); g.lineWidth = 2.6 * k; g.lineJoin = 'round';
  const ww = Math.max(1, g.measureText(word).width);
  for (let r = 0; r < rows; r++) {
    const dir = r % 2 ? -1 : 1, shift = ((((dir * p.drift * k * local) + r * ww * 0.37) % ww) + ww) % ww;
    // a decoration, not words to read: not reported to check
    for (let x = shift - ww; x < W + ww; x += ww) g.strokeText(word, x, (r + 0.86) * row);
  }
}

/** the confetti: `n` small bits down both sides, bobbing and twinkling */
function drawBits(g: CanvasRenderingContext2D, n: number, seed: number, cols: string[], W: number, H: number, k: number, local: number) {
  for (let i = 0; i < n && cols.length; i++) {
    const b = bitAt(seed, i), tw = 0.75 + 0.25 * Math.sin(local * 5 + b.phase), sz = (10 + 10 * b.size) * k * tw, col = cols[Math.floor(b.pick * cols.length)];
    g.save(); g.translate(b.x * W, b.y * H + Math.sin(local * 2 + b.phase) * 6 * k); g.rotate(b.phase);
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 4 * k; g.lineCap = 'round'; g.beginPath();
    if (b.kind === 0) { g.arc(0, 0, sz * 0.6, 0, 6.283); g.fill(); }
    if (b.kind === 1) { for (let j = 0; j < 8; j++) { const a = (j * Math.PI) / 4, rr = j % 2 ? sz * 0.28 : sz * 1.1; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); }
    if (b.kind === 2) { for (let j = 0; j <= 4; j++) g.lineTo((j - 2) * sz * 0.6, j % 2 ? -sz * 0.45 : sz * 0.45); g.stroke(); }
    if (b.kind === 3) { g.moveTo(-sz * 0.6, -sz * 0.6); g.lineTo(sz * 0.6, sz * 0.6); g.moveTo(sz * 0.6, -sz * 0.6); g.lineTo(-sz * 0.6, sz * 0.6); g.stroke(); }
    g.restore();
  }
}

/** the glow's strength at t (0–1): the stops eased over 0.4 s, then a pulse of `pulse` around it */
export const glowAt = (stops: string, pulse: number, t: number) => {
  const lv = parseLevels(stops);
  if (!lv.length) return 0;
  const v = clamp(levelAt(lv, t, 0.4));
  return clamp(v * (1 - pulse * 0.5 + pulse * 0.5 * Math.sin(t * 9)));
};

/** The CSS background (image, size) of a pattern at `s` px cells; the grid's and diamond's lines are 2 px × `k` (the frame's short
 *  side / 1080), so they keep their weight against the cells in a bigger frame */
export function patternCss(p: Pick<P, 'pattern' | 'color' | 'color2' | 'tint'>, s: number, k = 1): { image: string; size: string } {
  const c2 = withAlpha(p.color2, p.tint), lw = 2 * k;
  switch (p.pattern) {
    case 'gingham': return { image: `repeating-linear-gradient(0deg, ${c2} 0 ${s}px, transparent ${s}px ${2 * s}px), repeating-linear-gradient(90deg, ${c2} 0 ${s}px, transparent ${s}px ${2 * s}px)`, size: 'auto' };
    case 'stripes': return { image: `repeating-linear-gradient(45deg, ${c2} 0 ${s / 2}px, transparent ${s / 2}px ${s}px)`, size: 'auto' };
    case 'dots': return { image: `radial-gradient(circle, ${c2} ${s * 0.12}px, transparent ${s * 0.13}px)`, size: `${s}px ${s}px` };
    case 'grid': return { image: `linear-gradient(0deg, ${c2} 0 ${lw}px, transparent ${lw}px), linear-gradient(90deg, ${c2} 0 ${lw}px, transparent ${lw}px)`, size: `${s}px ${s}px` };
    case 'diamond': return { image: `repeating-linear-gradient(45deg, ${c2} 0 ${lw}px, transparent ${lw}px ${s}px), repeating-linear-gradient(-45deg, ${c2} 0 ${lw}px, transparent ${lw}px ${s}px)`, size: 'auto' };
    case 'spot': return { image: `radial-gradient(120% 60% at 50% 0%, ${c2} 0%, ${withAlpha(p.color2, 0)} 55%), linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.38) 100%)`, size: 'auto' };
    case 'gradient': return { image: `linear-gradient(160deg, ${p.color}, ${p.color2})`, size: 'auto' };
    default: return { image: 'none', size: 'auto' };
  }
}

export const backdrop: ItemType<P, S> = {
  type: 'common.backdrop', label: '背景圖樣', category: 'look', kind: 'scene',
  doc: '整片的圖樣背景（格紋、圓點、斜紋、方格、純色、漸層），放在影片之下；影片縮成面板時露出來的底，顏色走 theme；glow 讓底部透出一片光，強度照「秒:強度」變（跟著分數、情緒越來越熱）；diamond 是收銀台止滑墊的菱格紋，pool 加一圈暖光、vignette 壓暗四角（深色收銀台、工作檯）；spot 是深色海報底：上緣透下一片柔光（color2、濃度 tint）、下方漸暗（金句、訪談、Podcast）；words 是多巴胺字牆：整頁一列一列重複 word（外框粗襯線字，color2 色、濃度 tint，列高 scale），相鄰兩列以 drift 反方向滑（段落底色常換：萊姆綠、鈷藍、桃紅、橘，配 common.popcard、common.sticker、標題範本 pop）；bits 在兩側撒幾個小碎片（圓點、四角星、鋸齒線、小叉，theme 的顏色，會閃），任何圖樣都能加',
  params: [
    { key: 'pattern', label: '圖樣', type: 'enum', options: ['gingham', 'dots', 'stripes', 'grid', 'solid', 'gradient', 'diamond', 'spot', 'words'], default: 'gingham' },
    { key: 'word', label: '重複的字（words）', type: 'string', default: 'HELLO' },
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
    { key: 'bits', label: '兩側的小碎片數（0＝沒有）', type: 'number', min: 0, max: 40, step: 1, default: 0 },
    { key: 'seed', label: '碎片的亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 3 },
  ],
  build(ctx) {
    const el = h('div', null, null, ctx.root);
    cssCamel(el, { position: 'absolute', inset: '0' });
    const glow = h('div', null, null, ctx.root);
    cssCamel(glow, { position: 'absolute', inset: '0', display: 'none' });
    const pool = h('div', null, null, ctx.root);
    cssCamel(pool, { position: 'absolute', inset: '0', display: 'none' });
    const cv = h('canvas', null, null, ctx.root) as HTMLCanvasElement;
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none' });
    return { el, glow, pool, cv, word: ctx.params.pattern === 'words' ? String(ctx.params.word || 'A') : '' };
  },
  ready: (s) => (s.word ? document.fonts.load("900 60px 'Playfair Display'", s.word).then(() => undefined) : Promise.resolve()),
  hide(s) { s.cv.width = 0; s.cv.height = 0; },
  draw(ctx, s) {
    const p = ctx.params, k = Math.min(ctx.W, ctx.H) / 1080, css = patternCss(p, p.scale * k, k), d = p.drift * k * ctx.local;
    cssCamel(s.el, { backgroundColor: p.pattern === 'gradient' ? 'transparent' : p.color, backgroundImage: css.image, backgroundSize: css.size, backgroundPosition: p.pattern === 'words' ? '0px 0px' : `${d}px ${d}px` });
    const canvas = p.pattern === 'words' || (p.bits ?? 0) > 0;
    cssCamel(s.cv, { display: canvas ? 'block' : 'none' });
    if (canvas) {
      if (s.cv.width !== ctx.W || s.cv.height !== ctx.H) { s.cv.width = ctx.W; s.cv.height = ctx.H; }
      const g = s.cv.getContext('2d');
      if (g) {
        g.clearRect(0, 0, ctx.W, ctx.H);
        if (p.pattern === 'words') drawWords(g, p, ctx.W, ctx.H, k, Math.max(10, p.scale) * k, ctx.local);
        drawBits(g, Math.round(p.bits ?? 0), p.seed ?? 3, bitColors(ctx.theme.palette as unknown as Record<string, string>, p.color), ctx.W, ctx.H, k, ctx.local);
      }
    }
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
