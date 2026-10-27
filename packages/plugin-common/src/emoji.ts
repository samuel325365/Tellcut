// common.emoji — an emoji as a sticker that pops in and wobbles, or a rain of them falling through the frame.
// mode float (t2-reels's fx.reelsHearts streams): a stream of hearts and emoji rising from (x, y) and swaying, `rate` a second,
// like a live stream's reactions; mode tap (its double-tap taps): one big heart pops at (x, y) with a ring of small hearts
// bursting out, then floats up and fades. In both, ♥ draws a heart of its own (pink and red) instead of a font's emoji.
import { clamp, cssCamel, eBack, eOut3, h, lerp, prog, rng, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';

interface P { mode: 'sticker' | 'rain' | 'float' | 'tap'; char: string; x: number; y: number; size: number; count: number; seed: number; rate: number }
interface S { drops: HTMLElement[]; cv: HTMLCanvasElement }
const FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
const HEART = '♥';
type G = CanvasRenderingContext2D;

/** a heart w wide centred at (cx, cy) as a path (t2-reels's heartPath) */
export function heartPath(g: G, cx: number, cy: number, w: number) {
  const r = w / 2;
  g.beginPath();
  g.moveTo(cx, cy + r * 0.95);
  g.bezierCurveTo(cx - r * 1.35, cy + r * 0.05, cx - r * 0.95, cy - r * 1.05, cx, cy - r * 0.38);
  g.bezierCurveTo(cx + r * 0.95, cy - r * 1.05, cx + r * 1.35, cy + r * 0.05, cx, cy + r * 0.95);
  g.closePath();
}

export interface Floater { x: number; y: number; size: number; alpha: number; char: string; tone: number }
/** mode float at `local`: every reaction on screen, each from the seed (born `rate` a second from 0, living 2–2.6 s, swaying and
 *  rising 560 px at a 1080 short side with an ease-out, popping in and fading over its last third); positions in px */
export function floaters(local: number, dur: number, rate: number, seed: number, chars: string[], x0: number, y0: number, px: number, k: number): Floater[] {
  const r = rng(seed * 977 + 131), n = rate > 0 ? Math.floor(dur * rate) : 0, out: Floater[] = [];
  for (let i = 0; i < n; i++) {
    const ts = (i + r() * 0.6) / rate, sway = r() * 2 - 1, life = 2.0 + r() * 0.6, sz = px * (0.3 + r() * 0.2), ci = Math.floor(r() * chars.length), tone = r();
    const u = (local - ts) / life;
    if (u < 0 || u > 1) continue;
    const x = x0 + sway * 70 * k * Math.sin(u * 5 + i) - 40 * k * u * (sway > 0 ? 1 : 0.4), y = y0 - 560 * k * eOut3(u);
    out.push({ x, y, size: sz * lerp(0.5, 1.1, eBack(Math.min(1, u * 4), 1.7)), alpha: u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1, char: chars[ci % chars.length], tone });
  }
  return out;
}

/** mode tap at `local`: the big heart's scale (up to 1.15, settling at 1, shrinking as it goes), how far it has risen (share of its size), its opacity */
export function tapPose(local: number): { scale: number; rise: number; alpha: number } {
  const u = local;
  if (u < 0 || u > 1.05) return { scale: 0, rise: 0, alpha: 0 };
  const scale = u < 0.28 ? eBack(u / 0.28, 1.7) * 1.15 : u < 0.6 ? 1.15 - 0.15 * eOut3((u - 0.28) / 0.32) : 1 - (0.4 * (u - 0.6)) / 0.45;
  return { scale: Math.max(0, scale), rise: u > 0.6 ? 0.43 * eOut3((u - 0.6) / 0.45) : 0, alpha: clamp(u > 0.6 ? 1 - (u - 0.6) / 0.45 : 1) };
}

const heartTone = (t: number) => (t < 0.6 ? '#ff3b5c' : t < 0.85 ? '#ff7a9c' : '#ffb03b');

export const emoji: ItemType<P, S> = {
  type: 'common.emoji', label: '表情貼圖', category: 'mark', kind: 'overlay',
  doc: '一個大 emoji 貼紙彈出並晃動（sticker），或一場 emoji 雨從上面落下（rain，滿版，check 不算它超出安全區）；float 是一串愛心和表情從 x、y 往上飄、左右搖（直播、社群的按讚反應，rate 每秒幾個）；tap 是雙擊的大愛心在 x、y 彈出、一圈小愛心炸開、再往上飄走淡掉；float、tap 裡的 ♥ 畫成粉紅色的愛心；情緒、笑點、慶祝、食物吃貨感、按讚',
  params: [
    { key: 'mode', label: '樣式（float 往上飄、tap 雙擊愛心）', type: 'enum', options: ['sticker', 'rain', 'float', 'tap'], default: 'sticker' },
    { key: 'char', label: '表情（一個或數個 emoji；float、tap 的 ♥ 是畫的愛心）', type: 'string', default: '🔥' },
    { key: 'x', label: 'x（畫面寬比例，sticker；float 的起點、tap 的中心）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.78 },
    { key: 'y', label: 'y（畫面高比例，sticker；float 的起點、tap 的中心）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'size', label: '大小（畫面短邊 %）', type: 'number', min: 2, max: 60, step: 0.5, default: 18 },
    { key: 'count', label: '數量（rain）', type: 'number', min: 1, max: 60, step: 1, default: 18 },
    { key: 'seed', label: '亂數種子（rain、float）', type: 'number', min: 1, max: 9999, step: 1, default: 11 },
    { key: 'rate', label: '每秒飄出幾個（float）', type: 'number', min: 0.5, max: 30, step: 0.5, default: 7 },
  ],
  build(ctx) {
    const n = ctx.params.mode === 'rain' ? ctx.params.count : ctx.params.mode === 'sticker' ? 1 : 0;
    const drops = Array.from({ length: n }, () => { const d = h('div', null, null, ctx.root); cssCamel(d, { position: 'absolute', lineHeight: '1', fontFamily: FONT, whiteSpace: 'pre' }); return d; });
    const cv = h('canvas', null, null, ctx.root) as HTMLCanvasElement;
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none', pointerEvents: 'none' });
    return { drops, cv };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H } = ctx, chars = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(p.char)].map((x) => x.segment), px = (p.size / 100) * Math.min(W, H);
    const reactions = p.mode === 'float' || p.mode === 'tap';
    cssCamel(s.cv, { display: reactions ? 'block' : 'none' });
    if (reactions) { drawReactions(ctx, s, chars.length ? chars : [HEART], px); return; }
    if (p.mode === 'sticker') {
      const d = s.drops[0], pop = eBack(prog(ctx.local, 0, 0.25), 2.4), out = 1 - prog(ctx.local, ctx.dur - 0.2, ctx.dur);
      d.textContent = p.char;
      cssCamel(d, { left: `${p.x * W}px`, top: `${p.y * H}px`, fontSize: `${px}px`, opacity: String(Math.min(1, prog(ctx.local, 0, 0.06) * 8) * out), transform: `translate(-50%, -50%) rotate(${8 * Math.sin(ctx.local * 7)}deg) scale(${pop})` });
      return;
    }
    const r = rng(p.seed);
    s.drops.forEach((d, i) => {
      const x = r(), speed = 0.35 + r() * 0.5, delay = r() * 1.2, sz = px * (0.5 + r() * 0.6), spin = (r() - 0.5) * 120, c = chars[i % chars.length];
      const fall = (ctx.local - delay) * speed;                         // screens fallen: 0 at the top edge, 1 at the bottom
      d.textContent = c;
      cssCamel(d, { left: `${x * W}px`, top: `${(-0.1 + fall * 1.2) * H}px`, fontSize: `${sz}px`, opacity: fall > 0 && fall < 1 ? '1' : '0', transform: `translate(-50%, -50%) rotate(${spin * (ctx.local - delay)}deg)` });
    });
  },
};

/** one reaction: a drawn heart for ♥, else the emoji in the colour font, centred at (x, y), `size` wide */
function glyph(g: G, c: string, x: number, y: number, size: number, tone: number) {
  if (c === HEART) { heartPath(g, x, y, size); g.fillStyle = heartTone(tone); g.fill(); return; }
  g.font = `${Math.round(size)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(c, x, y);
}

function drawReactions(ctx: Parameters<typeof emoji.draw>[0], s: S, chars: string[], px: number) {
  const p = ctx.params, { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, g = canvasAt(s.cv, W, H), x0 = p.x * W, y0 = p.y * H;
  const out = 1 - prog(local, dur - 0.3, dur);
  if (p.mode === 'float') {
    for (const f of floaters(local, dur, p.rate, p.seed, chars, x0, y0, px, k)) { g.globalAlpha = clamp(f.alpha) * out; glyph(g, f.char, f.x, f.y, f.size, f.tone); }
    g.globalAlpha = 1;
    return;
  }
  // tap: the big heart (a gradient for ♥) with a shadow, and eight small hearts bursting out and shrinking away
  const q = tapPose(local), size = px * 1.5, cy = y0 - q.rise * size, c = chars[0];
  if (q.scale <= 0) return;
  g.globalAlpha = q.alpha * out;
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 24 * k;
  if (c === HEART) {
    const s2 = size * q.scale, gr = g.createLinearGradient(x0 - s2 / 2, cy - s2 / 2, x0 + s2 / 2, cy + s2 / 2);
    gr.addColorStop(0, '#ff5f7e'); gr.addColorStop(1, '#ff2d55');
    heartPath(g, x0, cy, s2); g.fillStyle = gr; g.fill();
  } else glyph(g, c, x0, cy, size * q.scale, 0);
  g.shadowBlur = 0; g.shadowColor = 'transparent';
  const r = rng(p.seed * 1000 + 7);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.5, d = size * (0.54 + 0.6 * eOut3(clamp(local / 0.7))), bs = size * (0.093 + r() * 0.064) * (1 - clamp((local - 0.3) / 0.6));
    if (bs <= 1) continue;
    heartPath(g, x0 + Math.cos(a) * d, y0 + Math.sin(a) * d * 0.9, bs); g.fillStyle = i % 2 ? '#ff8fa8' : '#ff3b5c'; g.fill();
  }
  g.globalAlpha = 1;
}
