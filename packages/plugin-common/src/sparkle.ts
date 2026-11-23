// common.sparkle — four-pointed stars: a burst that flies outward from a point, or a field that twinkles. Every star's place
// comes from a seeded generator, so a frame never depends on how it was reached.
// Modes (2026-11-15): confetti, coloured paper pieces falling from the top over the item, tumbling and swaying, in the theme's colours;
// glint, one bright point at (x, y) with a long four-way cross flare that grows, turns a little and dies (a product or metal "ting").
import { clamp, cssCamel, eIn3, eOut3, h, mulberry32, prog, rng, type ItemType } from '@tellcut/engine';
import { shade, withAlpha } from './color.ts';
import { canvasAt, freeCanvas } from './inkline.ts';

interface P { mode: 'burst' | 'twinkle' | 'confetti' | 'glint'; x: number; y: number; count: number; size: number; spread: number; color: string; seed: number }
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

/** confetti pieces per `count` */
export const CONFETTI_PER = 4;

/** the confetti's colours: `color` and the theme's accents and highlight, each once */
export const confettiColors = (color: string, palette: Partial<Record<string, string>>) =>
  [color, palette.accent, palette.accent2, palette.hl].filter((c, i, a): c is string => !!c && a.findIndex((d) => String(d).toLowerCase() === c.toLowerCase()) === i);

/** the confetti at `local`: each piece seeded by its own number (centre in px, size, turn, the tumble's squash -1…1, colour pick);
 *  pieces set off one after another over the item and fall past the bottom; those not in the frame are left out */
export function confettiPieces(p: Pick<P, 'count' | 'size' | 'seed'>, W: number, H: number, local: number, dur: number): Array<{ x: number; y: number; w: number; h: number; rot: number; squash: number; pick: number }> {
  const m = Math.min(W, H), base = (p.size / 100) * m, n = Math.max(1, Math.round(p.count)) * CONFETTI_PER, out = [];
  // the last pieces leave while the item still has a second to go, so the frame is full when it fades
  const window = Math.max(0.2, dur - 1);
  for (let i = 0; i < n; i++) {
    // mulberry32: neighbouring seeds of the Park-Miller rng start in step, which lined the pieces up
    const r = mulberry32(p.seed * 7919 + i * 104729 + 17);
    const x0 = r() * W, start = r() * (window + 0.6) - 0.6, fall = (0.36 + 0.24 * r()) * H, w = (0.8 + 0.8 * r()) * base, hh = w * (0.42 + 0.25 * r());
    const amp = (0.015 + 0.035 * r()) * m, sway = 1.4 + 1.8 * r(), tumble = 5 + 7 * r(), spin = (r() - 0.5) * 3, ph = r() * 6.283, pick = r();
    const tt = local - start;
    if (tt < 0) continue;
    const y = -hh * 2 + fall * tt;
    if (y > H + w) continue;
    out.push({ x: x0 + amp * Math.sin(sway * tt + ph), y, w, h: hh, rot: ph + spin * tt, squash: Math.cos(tumble * tt + ph * 1.7), pick });
  }
  return out;
}

/** the glint at `local`: its size (0–1 of the peak), turn in radians and strength; it grows over the first 0.3 of its time, then
 *  dies, all within the item's first second (or the whole item when shorter) */
export function glintAt(local: number, dur: number): { size: number; rot: number; alpha: number } {
  const T = Math.max(0.1, Math.min(dur, 1)), k = clamp(local / T);
  if (local < 0 || local >= T) return { size: 0, rot: 0, alpha: 0 };
  const grow = eOut3(prog(k, 0, 0.3)), die = eIn3(prog(k, 0.3, 1));
  return { size: grow * (1 - 0.65 * die), rot: -0.14 + 0.28 * k, alpha: 1 - die };
}

export const sparkle: ItemType<P, S> = {
  type: 'common.sparkle', label: '閃光星星', category: 'mark', kind: 'overlay',
  doc: '閃光的記號：四角星星炸開或閃爍、彩色紙片落下、十字光芒一閃；慶祝、驚喜、強調、高級感。',
  variants: { param: 'mode', list: [
    { value: 'burst', label: '星星炸開', doc: '四角星星從 (x, y) 一點炸開飛散（spread 是飛多遠）；答對、驚喜、強調的那一下' },
    { value: 'twinkle', label: '星星閃爍', doc: '四角星星散在 (x, y) 周圍（spread 是範圍），整段一閃一閃；高級感、夢幻' },
    { value: 'confetti', label: '彩色紙片', doc: '彩色紙片從畫面頂端整片落下，一邊翻一邊左右飄，顏色是 color 加 theme 的 accent、accent2、hl，在項目的時間裡陸續落下（x、y、spread 不用，每個 count 是四片紙）；生日、得獎、完成、開獎、派對' },
    { value: 'glint', label: '十字光芒', doc: '(x, y) 一個亮點拉出長長的十字光芒，變大、微微轉、再消失，在項目的第一秒裡（count、spread 不用）；商品、金屬、珠寶、新車、刀鋒「叮」一下的光' },
  ] },
  params: [
    { key: 'mode', label: '樣式', type: 'enum', options: ['burst', 'twinkle', 'confetti', 'glint'], default: 'burst' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'count', label: '數量（confetti 每一個是四片紙）', type: 'number', min: 1, max: 80, step: 1, default: 18 },
    { key: 'size', label: '星星大小（畫面短邊 %）', type: 'number', min: 0.5, max: 12, step: 0.1, default: 3.5 },
    { key: 'spread', label: '散開範圍（畫面短邊比例）', type: 'number', min: 0.05, max: 1.5, step: 0.01, default: 0.45 },
    { key: 'color', label: '顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'seed', label: '亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 7 },
  ],
  // named sets of these params (engine templates.ts); their golden samples are sparkle-tpl-<id>
  templates: [
    { id: 'confetti-rain', label: '彩紙雨', doc: '慶祝、得獎、生日：比 mode confetti 多一倍的彩色紙片從頂端整片落下，落滿畫面', params: { mode: 'confetti', count: 40 } },
    { id: 'glint-once', label: '亮點一閃', doc: '產品的亮點、珠寶、牙齒一閃：一個很大的十字光芒長出來、轉一點、消失，只一下', params: { mode: 'glint', size: 8 } },
    { id: 'star-burst', label: '星星大爆發', doc: '答對、變身、升級：比預設多、飛得更遠的星星從一點炸開', params: { count: 30, spread: 0.7 } },
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
    if (p.mode === 'confetti') return drawConfetti(g, p, W, H, ctx.local, ctx.dur, ctx.theme.palette);
    if (p.mode === 'glint') return drawGlint(g, p, W, H, ctx.local, ctx.dur);
    g.fillStyle = p.color;
    const base = (p.size / 100) * Math.min(W, H);
    for (let i = 0; i < p.count; i++) {
      const ang = r() * Math.PI * 2, dist = (0.35 + 0.65 * r()) * p.spread * Math.min(W, H), sz = (0.5 + r()) * base, delay = r() * 0.25, spin = (r() - 0.5) * 3, ph = r() * 6.28;
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

/** mode confetti: paper rectangles, squashed by the tumble, the back side a shade darker */
function drawConfetti(g: CanvasRenderingContext2D, p: P, W: number, H: number, local: number, dur: number, palette: Partial<Record<string, string>>) {
  const cols = confettiColors(p.color, palette);
  g.globalAlpha = clamp(1 - prog(local, dur - 0.4, dur));
  for (const c of confettiPieces(p, W, H, local, dur)) {
    const col = cols[Math.min(cols.length - 1, Math.floor(c.pick * cols.length))];
    g.save();
    g.translate(c.x, c.y);
    g.rotate(c.rot);
    g.scale(Math.max(0.08, Math.abs(c.squash)), 1);
    g.fillStyle = c.squash < 0 ? shade(col, 0.72) : col;
    g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    g.restore();
  }
  g.globalAlpha = 1;
}

/** mode glint: a soft halo, a long four-way cross (the level arms the longest), short diagonal rays and a white-hot core */
function drawGlint(g: CanvasRenderingContext2D, p: P, W: number, H: number, local: number, dur: number) {
  const gl = glintAt(local, dur);
  if (gl.size <= 0.001 || gl.alpha <= 0.001) return;
  const base = (p.size / 100) * Math.min(W, H), x = p.x * W, y = p.y * H, L = base * 9 * gl.size, w = Math.max(1, base * 0.13 * gl.size);
  g.globalAlpha = clamp(gl.alpha);
  const halo = g.createRadialGradient(x, y, 0, x, y, base * 2.6 * gl.size);
  halo.addColorStop(0, withAlpha(p.color, 0.75)); halo.addColorStop(0.35, withAlpha(p.color, 0.25)); halo.addColorStop(1, withAlpha(p.color, 0));
  g.fillStyle = halo;
  g.beginPath(); g.arc(x, y, base * 2.6 * gl.size, 0, Math.PI * 2); g.fill();
  const ray = (a: number, len: number, half: number) => {
    const dx = Math.cos(a), dy = Math.sin(a), grad = g.createLinearGradient(x, y, x + dx * len, y + dy * len);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.25, withAlpha(p.color, 0.9)); grad.addColorStop(1, withAlpha(p.color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - dy * half, y + dx * half);
    g.lineTo(x + dx * len, y + dy * len);
    g.lineTo(x + dy * half, y - dx * half);
    g.closePath();
    g.fill();
  };
  for (let i = 0; i < 4; i++) ray(gl.rot + (i * Math.PI) / 2, i % 2 ? L * 0.7 : L, w);
  for (let i = 0; i < 4; i++) ray(gl.rot + Math.PI / 4 + (i * Math.PI) / 2, L * 0.22, w * 0.7);
  const core = g.createRadialGradient(x, y, 0, x, y, base * 0.7 * gl.size);
  core.addColorStop(0, '#ffffff'); core.addColorStop(0.5, 'rgba(255,255,255,0.85)'); core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.beginPath(); g.arc(x, y, base * 0.7 * gl.size, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
}
