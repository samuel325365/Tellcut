// common.sparkle — four-pointed stars: a burst that flies outward from a point, or a field that twinkles. Every star's place
// comes from a seeded generator, so a frame never depends on how it was reached.
import { clamp, cssCamel, eOut3, h, prog, rng, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';

interface P { mode: 'burst' | 'twinkle'; x: number; y: number; count: number; size: number; spread: number; color: string; seed: number }
interface S { cv: HTMLCanvasElement }

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (Math.PI / 4) * i, d = i % 2 ? r * 0.22 : r; g.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
  g.closePath();
  g.fill();
  g.restore();
}

export const sparkle: ItemType<P, S> = {
  type: 'common.sparkle', label: '閃光星星', category: 'mark', kind: 'overlay',
  doc: '四角星星：從一點炸開飛散（burst），或散在畫面上閃爍（twinkle）；慶祝、驚喜、強調、高級感',
  params: [
    { key: 'mode', label: '樣式', type: 'enum', options: ['burst', 'twinkle'], default: 'burst' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'count', label: '數量', type: 'number', min: 1, max: 80, step: 1, default: 18 },
    { key: 'size', label: '星星大小（畫面短邊 %）', type: 'number', min: 0.5, max: 12, step: 0.1, default: 3.5 },
    { key: 'spread', label: '散開範圍（畫面寬比例）', type: 'number', min: 0.05, max: 1.5, step: 0.01, default: 0.45 },
    { key: 'color', label: '顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'seed', label: '亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 7 },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root);
    cv.width = ctx.W; cv.height = ctx.H;
    cssCamel(cv, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    return { cv };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H } = ctx, g = canvasAt(s.cv, W, H), r = rng(p.seed);
    g.clearRect(0, 0, W, H);
    g.fillStyle = p.color;
    const base = (p.size / 100) * Math.min(W, H);
    for (let i = 0; i < p.count; i++) {
      const ang = r() * Math.PI * 2, dist = (0.35 + 0.65 * r()) * p.spread * W, sz = (0.5 + r()) * base, delay = r() * 0.25, spin = (r() - 0.5) * 3, ph = r() * 6.28;
      if (p.mode === 'burst') {
        const t = prog(ctx.local, delay, delay + 0.9), e = eOut3(t);
        if (t <= 0 || t >= 1) continue;
        g.globalAlpha = clamp(1 - t * t);
        star(g, p.x * W + Math.cos(ang) * dist * e, p.y * H + Math.sin(ang) * dist * e + 40 * t * t * (Math.min(W, H) / 1080), sz * (1 - 0.6 * t), spin * t * 2);
      } else {
        const tw = 0.5 + 0.5 * Math.sin(ctx.local * 5 + ph), fadeIn = prog(ctx.local, delay, delay + 0.3) * (1 - prog(ctx.local, ctx.dur - 0.3, ctx.dur));
        g.globalAlpha = clamp(tw * fadeIn);
        star(g, p.x * W + Math.cos(ang) * dist, p.y * H + Math.sin(ang) * dist * 1.3, sz * (0.5 + 0.7 * tw), spin);
      }
    }
    g.globalAlpha = 1;
  },
};
