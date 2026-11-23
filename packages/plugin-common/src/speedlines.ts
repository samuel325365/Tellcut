// common.speedlines — thin wedges radiating from a point, as in a comic: behind a burst or a sudden turn. Lengths and angles are seeded.
// Looks (2026-11-15): radial is the drawing above; focus is manga concentration lines, thick dark wedges coming in from every edge
// toward (x, y) and stopping short of a clear ellipse round it; streak is parallel speed streaks flying across the whole frame in one
// direction (`angle`). All seeded, a pure function of the item's time and frame number.
import { clamp, cssCamel, eOut3, frameOf, h, prog, rng, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';
import { canvasAt, freeCanvas } from './inkline.ts';

type Look = 'radial' | 'focus' | 'streak';
interface P { look: Look; x: number; y: number; count: number; inner: number; length: number; angle: number; color: string; seed: number; flicker: boolean }
interface S { cv: HTMLCanvasElement }

/** the clear ellipse of the focus look: `inner` of the short side, stretched along the frame's long side by √(long / short) */
export function focusEllipse(inner: number, W: number, H: number): [number, number] {
  const m = Math.min(W, H), r = inner * m, s = Math.sqrt(Math.max(W, H) / m);
  return W >= H ? [r * s, r] : [r, r * s];
}

/** the focus look's wedges: each a base just outside the frame (`half` its half width) and a tip at `tip` px from (cx, cy) along `a`,
 *  at or past the clear ellipse; `set` picks the second shuffle of the shiver, `grow` (0–1) brings the tips in from the edge */
export function focusWedges(p: Pick<P, 'count' | 'inner' | 'seed'>, W: number, H: number, cx: number, cy: number, set: number, grow: number): Array<{ a: number; tip: number; out: number; half: number }> {
  const m = Math.min(W, H), [rx, ry] = focusEllipse(p.inner, W, H), r = rng(p.seed * 31 + 7 + set * 101);
  // far enough to leave the frame from any focus point
  const out = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 0.02 * m;
  return Array.from({ length: Math.max(1, Math.round(p.count)) }, (_, i) => {
    const a = ((i + r() * 0.9) / p.count) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    // the ellipse's radius along a, then a seeded reach past it: most stop near the ellipse, a few stay short by the edge
    const edge = 1 / Math.hypot(c / Math.max(1, rx), s / Math.max(1, ry)), reach = edge * (1 + 0.55 * r() * r());
    const tip = out - (out - Math.min(out, reach)) * grow, half = (0.006 + 0.026 * r() * r()) * m;
    return { a, tip, out, half };
  });
}

/** the streak look's streaks at `local`: tail and head points in px and the half width at the head; each crosses the frame at its own
 *  seeded speed and comes round again, so the picture depends only on the time */
export function streakLines(p: Pick<P, 'count' | 'length' | 'angle' | 'seed'>, W: number, H: number, local: number): Array<{ x0: number; y0: number; x1: number; y1: number; half: number; alpha: number }> {
  const m = Math.min(W, H), th = (p.angle * Math.PI) / 180, dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx, r = rng(p.seed * 53 + 11);
  // the frame's half extent along the flight and across it
  const A = (Math.abs(W * dx) + Math.abs(H * dy)) / 2, B = (Math.abs(W * nx) + Math.abs(H * ny)) / 2;
  return Array.from({ length: Math.max(1, Math.round(p.count)) }, (_, i) => {
    const lane = ((i + r()) / p.count) * 2 - 1, len = p.length * m * (0.3 + 0.7 * r()), half = (0.002 + 0.008 * r() * r()) * m;
    const speed = (1.6 + 2.4 * r()) * m, loop = 2 * A + len, phase = r() * loop, alpha = 0.45 + 0.55 * r();
    const head = ((((phase + speed * local) % loop) + loop) % loop) - A, tail = head - len;
    const ox = W / 2 + nx * lane * B, oy = H / 2 + ny * lane * B;
    return { x0: ox + dx * tail, y0: oy + dy * tail, x1: ox + dx * head, y1: oy + dy * head, half, alpha };
  });
}

export const speedlines: ItemType<P, S> = {
  type: 'common.speedlines', label: '速度線', category: 'mark', kind: 'overlay',
  doc: '漫畫的速度線，放在爆炸字卡後面或驚訝、衝刺、轉折的瞬間；look 換樣子：從一點放射、四邊往中心的集中線，或整面平行飛過的速度線。',
  variants: { param: 'look', list: [
    { value: 'radial', label: '放射線', doc: '從 (x, y) 一個點向外放射的漫畫速度線，越來越長、微微閃動（inner 是起點半徑、length 是線長）；爆炸字卡後面、驚訝或轉折的那一下' },
    { value: 'focus', label: '集中線', doc: '漫畫的集中線：粗黑的楔形從畫面四邊往 (x, y) 收，中間留一圈乾淨的橢圓（inner 是橢圓大小），線會抖；震驚、登場、特寫一張臉、「就是他！」' },
    { value: 'streak', label: '平行速度線', doc: '整個畫面平行的速度線，長短粗細不一，朝 angle 的方向一直飛過去；衝刺、趕路、快轉、車窗外，疊在畫面上用白色更好看' },
  ] },
  params: [
    { key: 'look', label: '樣子（radial 從一點放射、focus 四邊往中心的集中線、streak 整面平行的速度線）', type: 'enum', options: ['radial', 'focus', 'streak'], default: 'radial' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'count', label: '線的數量', type: 'number', min: 8, max: 120, step: 1, default: 48 },
    { key: 'inner', label: '起點半徑（畫面短邊比例；focus 是中間空出的橢圓）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'length', label: '線長（畫面短邊比例；focus 不用）', type: 'number', min: 0.05, max: 1.5, step: 0.01, default: 0.7 },
    { key: 'angle', label: '飛的方向（streak；度，0＝往右、90＝往下）', type: 'number', min: -180, max: 180, step: 1, default: 0 },
    { key: 'color', label: '顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'seed', label: '亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 9 },
    { key: 'flicker', label: '微微閃動', type: 'bool', default: true },
  ],
  // named sets of these params (engine templates.ts); their golden samples are speedlines-tpl-<id>
  templates: [
    { id: 'manga-focus', label: '漫畫集中線', doc: '驚訝、強調一個人或一樣東西：很密的集中線從四邊往中間收，中間留一大塊乾淨的橢圓給主角', params: { look: 'focus', count: 90, inner: 0.38 } },
    { id: 'rush-right', label: '往右衝', doc: '奔跑、開車、快速移動：整面平行的速度線往右飛', params: { look: 'streak', count: 60 } },
    { id: 'fall-down', label: '往下墜', doc: '下墜、往下衝、跳下去：長長的直線整面往下飛', params: { look: 'streak', angle: 90, count: 40, length: 1.2 } },
    { id: 'burst-center', label: '中心爆發', doc: '登場、衝刺、大揭曉：很多長線從中心附近一圈放射出去，比預設更密、更靠近中心', params: { count: 80, inner: 0.15, length: 1 } },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root);
    cv.width = ctx.W; cv.height = ctx.H;
    cssCamel(cv, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    return { cv };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H } = ctx, m = Math.min(W, H), g = canvasAt(s.cv, W, H), cx = p.x * W, cy = p.y * H;
    g.clearRect(0, 0, W, H);
    // every other frame pair the lines swap to a second set, which reads as a shiver
    const set = p.flicker ? Math.floor(frameOf(ctx.local, ctx.fps) / 2) % 2 : 0, r = rng(p.seed + set * 101);
    const grow = eOut3(prog(ctx.local, 0, 0.25)), fade = 1 - prog(ctx.local, ctx.dur - 0.2, ctx.dur);
    g.fillStyle = p.color;
    if (p.look === 'focus') {
      // solid ink, as a comic page prints them
      g.globalAlpha = clamp(0.95 * fade);
      for (const w of focusWedges(p, W, H, cx, cy, set, grow)) {
        const dx = Math.cos(w.a), dy = Math.sin(w.a), nx = -dy, ny = dx;
        g.beginPath();
        g.moveTo(cx + dx * w.out + nx * w.half, cy + dy * w.out + ny * w.half);
        g.lineTo(cx + dx * w.tip, cy + dy * w.tip);
        g.lineTo(cx + dx * w.out - nx * w.half, cy + dy * w.out - ny * w.half);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
      return;
    }
    if (p.look === 'streak') {
      // each streak a sliver from a fine tail to a rounded head, fading in along its length; they ease in over the first 0.15 s
      const on = prog(ctx.local, 0, 0.15) * fade;
      const clear = withAlpha(p.color, 0);
      for (const l of streakLines(p, W, H, ctx.local)) {
        const len = Math.hypot(l.x1 - l.x0, l.y1 - l.y0) || 1, ux = (l.x1 - l.x0) / len, uy = (l.y1 - l.y0) / len;
        const grad = g.createLinearGradient(l.x0, l.y0, l.x1, l.y1);
        grad.addColorStop(0, clear); grad.addColorStop(0.7, p.color); grad.addColorStop(1, p.color);
        g.globalAlpha = clamp(l.alpha * on);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(l.x0, l.y0);
        g.lineTo(l.x1 - uy * l.half, l.y1 + ux * l.half);
        g.arc(l.x1, l.y1, l.half, Math.atan2(ux, -uy), Math.atan2(-ux, uy), true);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
      return;
    }
    g.globalAlpha = clamp(0.85 * fade);
    for (let i = 0; i < p.count; i++) {
      const a = ((i + r() * 0.8) / p.count) * Math.PI * 2, r0 = p.inner * m * (0.9 + 0.3 * r()), len = p.length * m * (0.35 + 0.65 * r()) * grow, wid = (0.004 + 0.012 * r()) * m;
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
