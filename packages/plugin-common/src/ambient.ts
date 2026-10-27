// common.ambient — a whole-picture background whose colour moves along a ramp as a level changes (going deeper, later, colder),
// with drifting specks and light shafts that fade as it goes. Promoted from a deep-sea explainer short's effect; it lies under the
// video like common.backdrop, and takes the same levels.ts stops as common.meter.
import { cssCamel, h, rng, type ItemType } from '@tellcut/engine';
import { levelAt, levelFrac, parseLevels } from './levels.ts';
import { toRgb, type RGB } from './color.ts';
import { canvasAt, freeCanvas } from './inkline.ts';

interface P {
  stops: string; ease: number; max: number; scale: 'linear' | 'log'; colors: string; spread: number;
  specks: number; drift: 'up' | 'down' | 'none'; speck: string; glowFrom: number; accent: string; shafts: number; seed: number;
}
interface S { cv: HTMLCanvasElement }

const hex = (c: string) => toRgb(c);
/** the colour at f (0–1) along the ramp */
export function rampAt(colors: RGB[], f: number): RGB {
  if (colors.length === 1) return colors[0];
  const x = Math.min(0.999, Math.max(0, f)) * (colors.length - 1), i = Math.floor(x), q = x - i;
  return colors[i].map((v, k) => Math.round(v + (colors[i + 1][k] - v) * q)) as RGB;
}
const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export const ambient: ItemType<P, S> = {
  type: 'common.ambient', label: '漸變氛圍背景', category: 'look', kind: 'scene',
  doc: '整片背景的顏色沿著一串顏色隨「程度」漸變（越潛越深、越晚越暗、越冷越藍），加上飄動的微粒與漸漸消失的光束；放在影片之下，數值和 common.meter 共用',
  params: [
    { key: 'stops', label: '程度（秒:值[:s]，逗號分隔；和數值計同一串；:數字＝這一站的變化秒數）', type: 'text', default: '0:0, 0.8:0.5, 1.6:1' },
    { key: 'ease', label: '變化時間 (s)', type: 'number', min: 0, max: 3, step: 0.05, default: 0.8 },
    { key: 'max', label: '最大值（0＝最大的那個值）', type: 'number', min: 0, max: 1e9, step: 1, default: 0 },
    { key: 'scale', label: '刻度', type: 'enum', options: ['linear', 'log'], default: 'linear' },
    { key: 'colors', label: '顏色（由淺到深，逗號分隔）', type: 'string', default: '#2bb3d6,#0c4e80,#051630,#01040a' },
    { key: 'spread', label: '上下的深淺差（0–1）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.3 },
    { key: 'specks', label: '微粒數量', type: 'number', min: 0, max: 300, step: 1, default: 110 },
    { key: 'drift', label: '微粒飄的方向', type: 'enum', options: ['up', 'down', 'none'], default: 'up' },
    { key: 'speck', label: '微粒顏色', type: 'color', default: '#dcf0ff' },
    { key: 'glowFrom', label: '程度超過多少時有微粒發光（0–1；1＝不發光）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: 'accent', label: '發光顏色', type: 'color', default: '#5fe3ff', theme: 'palette.accent' },
    { key: 'shafts', label: '光束強度（程度越深越淡；0＝沒有）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.18 },
    { key: 'seed', label: '亂數種子', type: 'number', min: 1, max: 99999, step: 1, default: 20231 },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root);
    cv.width = ctx.W; cv.height = ctx.H;
    cssCamel(cv, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    return { cv };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H } = ctx, k = Math.min(W, H) / 1080, g = canvasAt(s.cv, W, H), t = ctx.local;
    const levels = parseLevels(p.stops), f = levelFrac(levelAt(levels, t, p.ease), levels, p.max, p.scale);
    const ramp = p.colors.split(/[,，]/).map((c) => c.trim()).filter(Boolean).map(hex), colors = ramp.length ? ramp : [[0, 0, 0] as RGB];
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, css(rampAt(colors, f)));
    bg.addColorStop(1, css(rampAt(colors, Math.min(1, f + p.spread))));
    g.globalAlpha = 1; g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // light from above, gone by about half way down
    const shaft = p.shafts * Math.max(0, 1 - f * 2.2);
    if (shaft > 0) {
      g.save(); g.globalAlpha = shaft;
      for (let i = 0; i < 4; i++) {
        const x0 = W * (0.15 + i * 0.24) + Math.sin(t * 0.4 + i) * 30 * k, lg = g.createLinearGradient(0, 0, 0, H * 0.9);
        lg.addColorStop(0, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = lg; g.beginPath();
        g.moveTo(x0 - 30 * k, 0); g.lineTo(x0 + 30 * k, 0); g.lineTo(x0 + 160 * k, H * 0.9); g.lineTo(x0 + 40 * k, H * 0.9); g.closePath(); g.fill();
      }
      g.restore();
    }
    // specks: every place from the seed, every move from the time (the same frame draws the same)
    const r = rng(p.seed), dir = p.drift === 'up' ? -1 : p.drift === 'down' ? 1 : 0, deep = p.glowFrom < 1 ? Math.max(0, (f - p.glowFrom) / (1 - p.glowFrom)) : 0;
    const speck = hex(p.speck), acc = hex(p.accent);
    for (let i = 0; i < p.specks; i++) {
      const x0 = r(), y0 = r(), rad = (1.2 + r() * 3.2) * k, v = 0.02 + r() * 0.05, ph = r() * 6.28;
      const y = ((((y0 + dir * t * v) % 1) + 1) % 1) * H, x = x0 * W + Math.sin(t * 0.7 + ph) * 12 * k, lit = deep > 0 && i % 7 === 0;
      g.fillStyle = lit ? css(acc, 0.35 + 0.5 * deep * (0.5 + 0.5 * Math.sin(t * 2 + ph))) : css(speck, 0.18 + 0.25 * (1 - f));
      g.beginPath(); g.arc(x, y, lit ? rad * 1.6 : rad, 0, Math.PI * 2); g.fill();
    }
  },
};
