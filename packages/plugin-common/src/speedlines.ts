// common.speedlines — thin wedges radiating from a point, as in a comic: behind a burst or a sudden turn. Lengths and angles are seeded.
import { clamp, cssCamel, eOut3, frameOf, h, prog, rng, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';

interface P { x: number; y: number; count: number; inner: number; length: number; color: string; seed: number; flicker: boolean }
interface S { cv: HTMLCanvasElement }

export const speedlines: ItemType<P, S> = {
  type: 'common.speedlines', label: '速度線', category: 'mark', kind: 'overlay',
  doc: '從一個點向外放射的漫畫速度線（越來越長、微微閃動）；放在爆炸字卡後面或驚訝、衝刺、轉折的瞬間',
  params: [
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'count', label: '線的數量', type: 'number', min: 8, max: 120, step: 1, default: 48 },
    { key: 'inner', label: '起點半徑（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'length', label: '線長（畫面寬比例）', type: 'number', min: 0.05, max: 1.5, step: 0.01, default: 0.7 },
    { key: 'color', label: '顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'seed', label: '亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 9 },
    { key: 'flicker', label: '微微閃動', type: 'bool', default: true },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root);
    cv.width = ctx.W; cv.height = ctx.H;
    cssCamel(cv, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    return { cv };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H } = ctx, g = canvasAt(s.cv, W, H), cx = p.x * W, cy = p.y * H;
    g.clearRect(0, 0, W, H);
    // every other frame pair the lines swap to a second set, which reads as a shiver
    const set = p.flicker ? Math.floor(frameOf(ctx.local, ctx.fps) / 2) % 2 : 0, r = rng(p.seed + set * 101);
    const grow = eOut3(prog(ctx.local, 0, 0.25)), fade = 1 - prog(ctx.local, ctx.dur - 0.2, ctx.dur);
    g.fillStyle = p.color;
    g.globalAlpha = clamp(0.85 * fade);
    for (let i = 0; i < p.count; i++) {
      const a = ((i + r() * 0.8) / p.count) * Math.PI * 2, r0 = p.inner * W * (0.9 + 0.3 * r()), len = p.length * W * (0.35 + 0.65 * r()) * grow, wid = (0.004 + 0.012 * r()) * W;
      const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
      g.beginPath();
      g.moveTo(cx + dx * r0 + nx * wid, cy + dy * r0 + ny * wid);
      g.lineTo(cx + dx * (r0 + len), cy + dy * (r0 + len));
      g.lineTo(cx + dx * r0 - nx * wid, cy + dy * r0 - ny * wid);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  },
};
