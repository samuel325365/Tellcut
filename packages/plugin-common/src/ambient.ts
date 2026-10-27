// common.ambient — a whole-picture background whose colour moves along a ramp as a level changes (going deeper, later, colder),
// with drifting specks and light shafts that fade as it goes. Promoted from a deep-sea explainer short's effect; it lies under the
// video like common.backdrop, and takes the same levels.ts stops as common.meter.
// look "sky" (the katie-sweet16 short's fx.sky): the day's weather as the backdrop — the stops are moods (0 dawn, 1 storm, 2 clearing,
// 3 golden hour, 4 dusk, 5 night; fractions blend), with drifting soft clouds, thin rain in the storm, a sun glow and slow rays as it
// clears, warm string-light glow at dusk, still stars at night, and lightning flashes at the `flash` times.
import { cssCamel, h, rng, type ItemType } from '@tellcut/engine';
import { levelAt, levelFrac, parseLevels } from './levels.ts';
import { toRgb, type RGB } from './color.ts';
import { canvasAt, freeCanvas } from './inkline.ts';

interface P {
  stops: string; ease: number; max: number; scale: 'linear' | 'log'; colors: string; spread: number;
  specks: number; drift: 'up' | 'down' | 'none'; speck: string; glowFrom: number; accent: string; shafts: number; seed: number;
  look: 'ramp' | 'sky'; flash: string;
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
  doc: '整片背景的顏色沿著一串顏色隨「程度」漸變（越潛越深、越晚越暗、越冷越藍），加上飄動的微粒與漸漸消失的光束；放在影片之下，數值和 common.meter 共用；look sky 是一天的天色：程度的值換成天色（0 清晨、1 暴風雨、2 放晴、3 黃金時刻、4 黃昏、5 夜晚），有飄動的雲、暴風雨的細雨、放晴的陽光、黃昏的燈串光暈、夜晚的星星，flash 的時間閃電（慶生、婚禮、一天的 vlog 的天氣起伏；雷聲配 common.thunder）',
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
    { key: 'look', label: '樣子（ramp 顏色沿著一串顏色漸變；sky 一天的天色：程度的值是天色 0 清晨、1 暴風雨、2 放晴、3 黃金時刻、4 黃昏、5 夜晚，小數是兩種之間，有雲、雨、陽光、黃昏的燈串光暈、星星）', type: 'enum', options: ['ramp', 'sky'], default: 'ramp' },
    { key: 'flash', label: '閃電（sky；秒，逗號分隔，相對項目開始；空＝沒有）', type: 'string', default: '' },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root);
    cv.width = ctx.W; cv.height = ctx.H;
    cssCamel(cv, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    return { cv };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    if (ctx.params.look === 'sky') { drawSky(ctx, s); return; }
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

// ---- look sky ---------------------------------------------------------------------------------------------------------------------
/** one mood of the sky: top and bottom colours, the clouds' colour and strength, and how much rain, sun, dusk glow and stars it has */
interface Mood { top: RGB; bot: RGB; cloud: RGB; ca: number; rain: number; sun: number; bokeh: number; stars: number }
export const SKY_MOODS: Mood[] = [
  { top: [150, 168, 190], bot: [226, 214, 210], cloud: [236, 236, 240], ca: 0.35, rain: 0, sun: 0.25, bokeh: 0, stars: 0 },   // 0 dawn
  { top: [52, 62, 78], bot: [104, 118, 136], cloud: [70, 80, 96], ca: 0.75, rain: 1, sun: 0, bokeh: 0, stars: 0 },             // 1 storm
  { top: [118, 152, 196], bot: [242, 214, 196], cloud: [250, 246, 242], ca: 0.45, rain: 0, sun: 0.75, bokeh: 0, stars: 0 },    // 2 clearing
  { top: [214, 148, 104], bot: [250, 214, 160], cloud: [255, 228, 196], ca: 0.3, rain: 0, sun: 1, bokeh: 0.15, stars: 0 },     // 3 golden hour
  { top: [58, 42, 72], bot: [180, 110, 104], cloud: [120, 84, 110], ca: 0.25, rain: 0, sun: 0.2, bokeh: 1, stars: 0.2 },       // 4 dusk
  { top: [18, 20, 38], bot: [52, 44, 72], cloud: [40, 40, 64], ca: 0.2, rain: 0, sun: 0, bokeh: 0.35, stars: 1 },              // 5 night
];
/** the sky at mood m (0–5, fractions blend two moods) */
export function skyMood(m: number): Mood {
  const x = Math.max(0, Math.min(SKY_MOODS.length - 1, Number.isFinite(m) ? m : 0)), i = Math.min(SKY_MOODS.length - 2, Math.floor(x)), q = x - i, a = SKY_MOODS[i], b = SKY_MOODS[i + 1];
  const c = (u: RGB, v: RGB) => u.map((n, j) => n + (v[j] - n) * q) as RGB, l = (u: number, v: number) => u + (v - u) * q;
  return { top: c(a.top, b.top), bot: c(a.bot, b.bot), cloud: c(a.cloud, b.cloud), ca: l(a.ca, b.ca), rain: l(a.rain, b.rain), sun: l(a.sun, b.sun), bokeh: l(a.bokeh, b.bokeh), stars: l(a.stars, b.stars) };
}
/** how bright the lightning is at item time t: a quick pulse at each flash time and a smaller second one a quarter second later */
export function flashAt(times: string, t: number): number {
  let a = 0;
  for (const t0 of String(times ?? '').split(/[,，]/).filter((v) => v.trim() !== '').map(Number).filter((v) => Number.isFinite(v) && v >= 0)) {
    const d = t - t0;
    if (d < 0 || d >= 0.7) continue;
    a = Math.max(a, Math.max(0, 1 - d / 0.12) * 0.6 + (d > 0.18 && d < 0.32 ? 0.4 * (1 - Math.abs(d - 0.25) / 0.07) : 0));
  }
  return Math.min(0.7, a);
}

function drawSky(ctx: Parameters<typeof ambient.draw>[0], s: S) {
  const p = ctx.params, { W, H } = ctx, S0 = Math.min(W, H), k = S0 / 1080, g = canvasAt(s.cv, W, H), t = ctx.local, wide = W / S0;
  const M = skyMood(levelAt(parseLevels(p.stops), t, p.ease));
  const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  // every place comes from the seed in the same order each frame (the parts a mood leaves out still take their numbers)
  const r = rng(p.seed);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, css(M.top)); bg.addColorStop(1, css(M.bot));
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // the sun's glow, upper right, with a few slow rays
  if (M.sun > 0.01) {
    const sx = W * 0.8, sy = H * 0.1 + (1 - M.sun) * H * 0.05, R = Math.hypot(W, H) * 0.55;
    const rg = g.createRadialGradient(sx, sy, 0, sx, sy, R);
    rg.addColorStop(0, `rgba(255,236,196,${0.75 * M.sun})`); rg.addColorStop(0.25, `rgba(255,214,160,${0.3 * M.sun})`); rg.addColorStop(1, 'rgba(255,214,160,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.save(); g.translate(sx, sy); g.rotate(t * 0.01); g.fillStyle = `rgba(255,240,210,${0.05 * M.sun})`;
    for (let i = 0; i < 7; i++) { g.rotate((Math.PI * 2) / 7); g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 1.6, -R * 0.08); g.lineTo(R * 1.6, R * 0.08); g.closePath(); g.fill(); }
    g.restore();
  }
  // clouds: soft three-puff blobs drifting slowly sideways, in the top and bottom bands
  for (let i = 0; i < Math.round(9 * wide); i++) {
    const bx = r(), by = r(), sz = 0.35 + r() * 0.4, sp = (0.004 + r() * 0.006) / wide;
    const x = (((bx + t * sp) % 1.4) - 0.2) * W, y = (by < 0.5 ? by * 0.45 : 0.62 + (by - 0.5) * 0.7) * H, rad = sz * S0 * 0.6;
    for (let j = 0; j < 3; j++) {
      const ox = (j - 1) * rad * 0.55, oy = (j === 1 ? -0.18 : 0.05) * rad, rr = rad * (j === 1 ? 0.75 : 0.6);
      const cg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
      cg.addColorStop(0, css(M.cloud, M.ca * 0.55)); cg.addColorStop(1, css(M.cloud, 0));
      g.fillStyle = cg; g.fillRect(x + ox - rr, y + oy - rr, rr * 2, rr * 2);
    }
  }
  // rain: sparse thin slanted streaks
  const rain = M.rain > 0.02;
  if (rain) { g.strokeStyle = `rgba(214,224,236,${0.35 * M.rain})`; g.lineWidth = 2 * k; g.lineCap = 'round'; g.beginPath(); }
  for (let i = 0; i < Math.round(46 * wide); i++) {
    const x0 = r() * W * 1.2, y0 = r(), sp = 0.55 + r() * 0.35, len = (40 + r() * 50) * k;
    if (!rain) continue;
    const y = ((y0 + t * sp) % 1) * (H + 200 * k) - 100 * k, x = x0 - y * 0.18;
    g.moveTo(x, y); g.lineTo(x - len * 0.18, y + len);
  }
  if (rain) g.stroke();
  // warm string-light glow at dusk
  for (let i = 0; i < Math.round(22 * wide); i++) {
    const x = r() * W, y = (r() < 0.5 ? r() * 0.26 : 0.68 + r() * 0.3) * H, rad = (18 + r() * 46) * k, ph = r() * 6.28;
    if (M.bokeh <= 0.02) continue;
    const a = M.bokeh * (0.22 + 0.12 * Math.sin(t * 0.9 + ph)), gl = g.createRadialGradient(x, y, 0, x, y, rad);
    gl.addColorStop(0, `rgba(255,214,150,${a})`); gl.addColorStop(0.6, `rgba(255,190,120,${a * 0.45})`); gl.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = gl; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // still stars at night, twinkling a little
  for (let i = 0; i < Math.round(60 * wide); i++) {
    const x = r() * W, y = (r() < 0.55 ? r() * 0.27 : 0.7 + r() * 0.3) * H, rad = (1.2 + r() * 2.2) * k, ph = r() * 6.28;
    if (M.stars <= 0.02) continue;
    g.fillStyle = `rgba(255,248,232,${M.stars * (0.45 + 0.25 * Math.sin(t * 0.7 + ph))})`;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // lightning: the whole sky flashes pale blue-white
  const fl = flashAt(p.flash, t);
  if (fl > 0) { g.fillStyle = `rgba(236,240,255,${fl})`; g.fillRect(0, 0, W, H); }
}
