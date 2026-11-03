// common.leak — a soft warm light leak laid over the picture in screen (it only brightens): a big warm glow with a pale core and a
// rose glow trailing behind it, drifting in from a corner or side and fading out again over the item, no grain, no flicker. travel 0
// keeps it at (x, y) instead, fading in and out and breathing a little (a low sun in a corner). Promoted 2026-11-03 from the Egypt photo
// films' own fx.leak, fx.lightleak and fx.glow. A pure function of time.
import { clamp, cssCamel, h, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';

type From = 'tl' | 'tr' | 'bl' | 'br' | 'l' | 'r';
interface P { from: From; travel: number; x: number; y: number; peak: number; size: number; color: string; core: string; rose: string }
interface S { el: HTMLElement }

/** where the glow starts (frame fractions, just outside the frame) and the way it drifts, for each `from` */
const PATHS: Record<From, [number, number, number, number]> = {
  tl: [-0.1, -0.1, 1, 0.55], tr: [1.1, -0.1, -1, 0.55], bl: [-0.1, 1.1, 1, -0.55], br: [1.1, 1.1, -1, -0.55],
  l: [-0.15, 0.4, 1, 0.1], r: [1.15, 0.35, -1, 0.1],
};

/** how bright the leak is at `local` (0…peak): one sweep in and out over the item, or (travel 0) in and out over 0.6 s with a slow breath */
export function leakLevel(p: Pick<P, 'travel' | 'peak'>, local: number, dur: number): number {
  if (p.travel > 0) return Math.pow(Math.sin(Math.PI * clamp(local / Math.max(0.01, dur))), 1.3) * p.peak;
  return p.peak * clamp(local / 0.6) * clamp((dur - local) / 0.6) * (0.85 + 0.15 * Math.sin(local * 2.2));
}

/** the glow's centre in frame fractions, `k` (0…1) of the way along its drift */
export function leakCentre(p: Pick<P, 'from' | 'travel' | 'x' | 'y'>, k: number): [number, number] {
  if (p.travel <= 0) return [p.x, p.y];
  const [sx, sy, dx, dy] = PATHS[p.from] ?? PATHS.tr;
  return [sx + dx * p.travel * k, sy + dy * p.travel * k];
}

export const leak: ItemType<P, S> = {
  type: 'common.leak', label: '柔光漏光', category: 'look', kind: 'overlay', blend: 'screen',
  doc: '暖色柔光（light leak）：一大團暖光加淡色光心、後面拖一團玫瑰色，從一角或一側慢慢掃過畫面再退去（screen 疊色只變亮、沒有顆粒、不閃）；travel 0 停在 (x, y) 淡入淡出、微微呼吸（角落的夕陽）；回憶、旅行相簿、翻頁落地、封面、片頭片尾的暖色過場；color、core、rose 換顏色，換成藍白就是冷光',
  params: [
    { key: 'from', label: '從哪裡進來（tl 左上、tr 右上、bl 左下、br 右下、l 左、r 右）', type: 'enum', options: ['tl', 'tr', 'bl', 'br', 'l', 'r'], default: 'tr' },
    { key: 'travel', label: '掃過的距離（畫面比例；0＝停在 x, y）', type: 'number', min: 0, max: 1.5, step: 0.05, default: 0.6 },
    { key: 'x', label: '停留中心 x（travel 0）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.8 },
    { key: 'y', label: '停留中心 y（travel 0）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.15 },
    { key: 'peak', label: '最亮（0–1）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: 'size', label: '光的大小（畫面長邊比例）', type: 'number', min: 0.1, max: 1.5, step: 0.05, default: 0.6 },
    { key: 'color', label: '主色', type: 'color', default: '#ff9a52' },
    { key: 'core', label: '光心', type: 'color', default: '#ffe2b8' },
    { key: 'rose', label: '拖在後面的第三色（空＝不要）', type: 'color', default: '#ff6f7d' },
  ],
  build(ctx) {
    const el = h('div', null, null, ctx.root);
    cssCamel(el, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    return { el };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H } = ctx;
    const a = leakLevel(p, ctx.local, ctx.dur);
    if (a <= 0.002) { cssCamel(s.el, { background: 'none' }); return; }
    const k = ctx.motion.ease.inOut(clamp(ctx.local / Math.max(0.01, ctx.dur)));
    const [fx, fy] = leakCentre(p, k), R = p.size * Math.max(W, H);
    const [, , dx, dy] = PATHS[p.from] ?? PATHS.tr;
    const glow = (cx: number, cy: number, r: number, stops: Array<[string, number, number]>) =>
      `radial-gradient(circle ${r.toFixed(1)}px at ${(cx * W).toFixed(1)}px ${(cy * H).toFixed(1)}px, ${stops.map(([c, al, at]) => `${withAlpha(c, clamp(al))} ${at}%`).join(', ')})`;
    // top to bottom: the pale core, the warm body, the rose trailing behind (back along the drift; up-left of a still glow)
    const layers = [
      glow(fx, fy, R * 0.5, [[p.core, a * 0.9, 0], [p.core, 0, 100]]),
      glow(fx, fy, R, [[p.color, a, 0], [p.color, a * 0.35, 45], [p.color, 0, 100]]),
    ];
    if (p.rose) {
      const back = p.travel > 0 ? [-dx, -dy] : [-0.6, -0.3];
      layers.push(glow(fx + back[0] * 0.3, fy + back[1] * 0.3 * (W / H), R * 0.5, [[p.rose, a * 0.5, 0], [p.rose, 0, 100]]));
    }
    cssCamel(s.el, { background: layers.join(', ') });
  },
};
