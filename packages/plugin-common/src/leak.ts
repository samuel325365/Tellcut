// common.leak — a soft warm light leak laid over the picture in screen (it only brightens): a big warm glow with a pale core and a
// rose glow trailing behind it, drifting in from a corner or side and fading out again over the item, no grain, no flicker. travel 0
// keeps it at (x, y) instead, fading in and out and breathing a little (a low sun in a corner). Promoted 2026-11-03 from the Egypt photo
// films' own fx.leak, fx.lightleak and fx.glow. A pure function of time.
// The other looks (2026-11-15) keep the same sweep (from / travel / x / y, the brightness over time) and the screen blend:
// prism, a slanted rainbow band across the drift; bokeh, out-of-focus discs drifting and breathing (seeded); flare, an anamorphic
// streak through a bright point with ghost discs on the line through the frame's centre.
import { clamp, cssCamel, h, mulberry32, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';

type From = 'tl' | 'tr' | 'bl' | 'br' | 'l' | 'r';
type Look = 'glow' | 'prism' | 'bokeh' | 'flare';
interface P { look: Look; from: From; travel: number; x: number; y: number; peak: number; size: number; color: string; core: string; rose: string; seed: number; streak: string }
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

/** the drift's direction in px (a unit vector): along the path for a sweep, down-left for a still light */
export function leakDirection(p: Pick<P, 'from' | 'travel'>, W: number, H: number): [number, number] {
  const [, , dx, dy] = PATHS[p.from] ?? PATHS.tr, v = p.travel > 0 ? [dx * W, dy * H] : [-0.6 * W, 0.3 * H], n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
}

/** the prism's band: a CSS linear-gradient across the drift, its rainbow centred on (px, py), `half` px either side */
export function prismBand(W: number, H: number, u: [number, number], px: number, py: number, half: number, a: number): string {
  const deg = (Math.atan2(u[0], -u[1]) * 180) / Math.PI, L = Math.abs(W * u[0]) + Math.abs(H * u[1]);
  const at = (px - W / 2) * u[0] + (py - H / 2) * u[1] + L / 2;
  const hues: Array<[number, number, number, number]> = [[255, 60, 60, -0.8], [255, 150, 40, -0.5], [255, 235, 70, -0.22], [90, 255, 120, 0.05], [60, 200, 255, 0.32], [90, 90, 255, 0.58], [190, 80, 255, 0.82]];
  const al = clamp(a).toFixed(3);
  const stops = [`rgba(255,60,60,0) ${(at - half).toFixed(1)}px`, ...hues.map(([r, g, b, o]) => `rgba(${r},${g},${b},${al}) ${(at + o * half).toFixed(1)}px`), `rgba(190,80,255,0) ${(at + half).toFixed(1)}px`];
  return `linear-gradient(${deg.toFixed(2)}deg, ${stops.join(', ')})`;
}

/** how much farther the prism's band goes than the glow */
export const PRISM_REACH = 1.8;

/** how many bokeh discs */
const BOKEH_DISCS = 14;

/** the bokeh discs at `local` (`k` 0…1 of the way along the drift): a seeded spread over the frame (fractions), each drifting
 *  slowly and breathing; r in px. One mulberry32 sequence for the whole set: a Park-Miller generator per disc, seeded at even steps,
 *  started every disc in step, and its first two draws (x, y) put the discs on a few parallel diagonals. Each disc also gets its own
 *  row of the frame's height (a seeded shuffle, jittered within the row), so the discs scatter over the whole frame instead of
 *  clumping. */
export function bokehDiscs(p: Pick<P, 'seed' | 'size' | 'from' | 'travel'>, local: number, k: number, W: number, H: number): Array<{ x: number; y: number; r: number; level: number; tone: number }> {
  const [, , dx, dy] = PATHS[p.from] ?? PATHS.tr, drift = p.travel > 0 ? p.travel * 0.12 : 0;
  const r = mulberry32(Math.imul(Math.round(Number(p.seed) || 1), 0x9e3779b1) ^ 0x5bd1e995);
  const rows = Array.from({ length: BOKEH_DISCS }, (_, i) => i);
  for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
  return rows.map((row) => {
    const x = 0.03 + 0.94 * r(), y = (row + 0.15 + 0.7 * r()) / BOKEH_DISCS, vx = (r() - 0.5) * 0.02, vy = (r() - 0.5) * 0.02;
    const rad = (0.035 + 0.075 * r() * r()) * p.size * Math.max(W, H), w = 0.6 + 0.9 * r(), ph = r() * Math.PI * 2, tone = r();
    return { x: x + vx * local + dx * drift * k, y: y + vy * local + dy * drift * k, r: rad, level: 0.55 + 0.45 * Math.sin(local * w + ph), tone };
  });
}

/** the flare's ghosts: [how far along the line from the light through the frame's centre (1 = the mirror point), radius (of the long
 *  side at size 0.6), colour (streak, color, rose)] */
export const GHOSTS: Array<[number, number, number]> = [[0.55, 0.045, 0], [1.2, 0.09, 1], [1.45, 0.03, 2], [1.75, 0.13, 0], [2.15, 0.06, 1]];

export const leak: ItemType<P, S> = {
  type: 'common.leak', label: '柔光漏光', category: 'look', kind: 'overlay', over: 'picture', blend: 'screen',
  doc: '柔光漏光（light leak）：光從一角或一側慢慢掃過畫面再退去（screen 疊色只變亮、沒有顆粒、不閃）；travel 0 停在 (x, y) 淡入淡出、微微呼吸（角落的夕陽）；color、core、rose 換顏色，換成藍白就是冷光。look 換光的樣子（掃過的路線和亮暗一樣）',
  variants: { param: 'look', list: [
    { value: 'glow', label: '暖色柔光', doc: '一大團暖光加淡色光心、後面拖一團玫瑰色（預設的樣子）；回憶、旅行相簿、翻頁落地、封面、片頭片尾的暖色過場' },
    { value: 'prism', label: '彩虹光帶', doc: '一道斜斜的彩虹光帶掃過（掃得比 glow 遠，travel 的 1.8 倍）；陽光穿過玻璃、夢幻、青春、音樂' },
    { value: 'bokeh', label: '失焦光斑', doc: '十幾顆失焦的圓形光斑慢慢飄、一明一暗；夜景、節慶、浪漫、溫馨的結尾；seed 換位置' },
    { value: 'flare', label: '鏡頭光條', doc: '一條橫向拉長的變形鏡頭光條穿過一個亮點，連著畫面中心的斜線上有幾個小光圈；電影感、科幻、科技、片頭；streak 是光條顏色，預設藍白' },
  ] },
  params: [
    { key: 'look', label: '樣子（glow 暖色柔光、prism 彩虹光帶、bokeh 失焦光斑、flare 變形鏡頭光條）', type: 'enum', options: ['glow', 'prism', 'bokeh', 'flare'], default: 'glow' },
    { key: 'from', label: '從哪裡進來（tl 左上、tr 右上、bl 左下、br 右下、l 左、r 右）', type: 'enum', options: ['tl', 'tr', 'bl', 'br', 'l', 'r'], default: 'tr' },
    { key: 'travel', label: '掃過的距離（畫面比例；0＝停在 x, y）', type: 'number', min: 0, max: 1.5, step: 0.05, default: 0.6 },
    { key: 'x', label: '停留中心 x（travel 0）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.8 },
    { key: 'y', label: '停留中心 y（travel 0）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.15 },
    { key: 'peak', label: '最亮（0–1）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: 'size', label: '光的大小（畫面長邊比例）', type: 'number', min: 0.1, max: 1.5, step: 0.05, default: 0.6 },
    { key: 'color', label: '主色', type: 'color', default: '#ff9a52' },
    { key: 'core', label: '光心', type: 'color', default: '#ffe2b8' },
    { key: 'rose', label: '拖在後面的第三色（空＝不要）', type: 'color', default: '#ff6f7d' },
    { key: 'seed', label: '亂數種子（bokeh 光斑的位置）', type: 'number', min: 1, max: 9999, step: 1, default: 3 },
    { key: 'streak', label: '光條顏色（flare）', type: 'color', default: '#9cc4ff' },
  ],
  // named sets of these params (engine templates.ts); their golden samples are leak-tpl-<id>
  templates: [
    { id: 'prism-sweep', label: '彩虹光帶橫掃', doc: '音樂段落、青春回憶、夢幻的轉場：一道寬寬的彩虹光帶從左邊整片掃過去，比平常更亮更大', params: { look: 'prism', from: 'l', travel: 0.9, peak: 0.7, size: 0.8 } },
    { id: 'bokeh-night', label: '夜景光斑', doc: '夜景、夜市、節慶、溫馨的片尾：一大片失焦光斑停在畫面上慢慢一明一暗，不掃過', params: { look: 'bokeh', travel: 0, x: 0.5, y: 0.35, size: 1, peak: 0.65, seed: 14 } },
    { id: 'flare-top', label: '頂上的鏡頭光條', doc: '電影感的開場、逆光鏡頭、科幻片頭：一條很亮的橫向光條停在畫面上方偏右，光圈沿著斜線排到畫面另一邊', params: { look: 'flare', travel: 0, x: 0.7, y: 0.12, peak: 0.8 } },
    { id: 'warm-corner', label: '角落暖光', doc: '回憶、家庭、安靜的訪談：一團淡淡的暖光停在左上角，只微微挪一點，整段都在', params: { from: 'tl', travel: 0.2, peak: 0.4, size: 0.9 } },
    { id: 'sweep-fast', label: '快速掃光', doc: '兩個鏡頭之間的轉場：一團小而亮的暖光從左邊一路掃到右邊出去', params: { from: 'l', travel: 1.5, size: 0.4, peak: 0.8 } },
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
    if (p.look === 'prism') {
      // the rainbow band across the drift, a fainter narrower echo behind it, a soft haze of the core colour round the light
      // the band goes 1.8 times as far as the glow would: a thin band at the glow's place would only cross a corner
      const u = leakDirection(p, W, H), half = R * 0.3, back = half * 2.2, [bx, by] = leakCentre({ ...p, travel: p.travel * PRISM_REACH }, k);
      cssCamel(s.el, { background: [prismBand(W, H, u, bx * W, by * H, half, a * 0.9), prismBand(W, H, u, bx * W - u[0] * back, by * H - u[1] * back, half * 0.45, a * 0.35),
        glow(fx, fy, R * 0.6, [[p.core, a * 0.35, 0], [p.core, 0, 100]])].join(', ') });
      return;
    }
    if (p.look === 'bokeh') {
      // soft-edged discs a little brighter at the rim, as an out-of-focus lens draws a point of light
      const tones = [p.color, p.core, p.rose || p.core];
      cssCamel(s.el, { background: bokehDiscs(p, ctx.local, k, W, H).map((d) => {
        const c = tones[Math.min(2, Math.floor(d.tone * 3))], al = a * d.level * 1.1;
        return `radial-gradient(circle ${d.r.toFixed(1)}px at ${(d.x * W).toFixed(1)}px ${(d.y * H).toFixed(1)}px, ${withAlpha(c, clamp(al * 0.55))} 0%, ${withAlpha(c, clamp(al * 0.7))} 64%, ${withAlpha(c, clamp(al))} 80%, ${withAlpha(c, clamp(al * 0.4))} 90%, ${withAlpha(c, 0)} 100%)`;
      }).join(', ') });
      return;
    }
    if (p.look === 'flare') {
      // a hot point with a soft core, a bright line and a wider soft body stretched far sideways, a halo; ghost discs with a brighter
      // rim on the line from the light through the frame's centre, in the streak's and the leak's colours. Tuned 2026-11-15 to read over
      // bright footage (a pale sky), where the first, thinner streak and fainter ghosts all but vanished in the screen blend
      const X = fx * W, Y = fy * H, M = Math.max(W, H), tones = [p.streak, p.color, p.rose || p.core];
      const line = (rx: number, ry: number, al: number) =>
        `radial-gradient(ellipse ${rx.toFixed(1)}px ${ry.toFixed(1)}px at ${X.toFixed(1)}px ${Y.toFixed(1)}px, ${withAlpha(p.streak, clamp(al))} 0%, ${withAlpha(p.streak, clamp(al * 0.55))} 22%, ${withAlpha(p.streak, 0)} 100%)`;
      const ghost = ([t, r, tone]: [number, number, number]) => {
        const gx = X + (W / 2 - X) * t, gy = Y + (H / 2 - Y) * t, c = tones[tone], al = a * 0.85;
        return `radial-gradient(circle ${((r * p.size) / 0.6 * M).toFixed(1)}px at ${gx.toFixed(1)}px ${gy.toFixed(1)}px, ${withAlpha(c, clamp(al * 0.35))} 0%, ${withAlpha(c, clamp(al * 0.6))} 60%, ${withAlpha(c, clamp(al))} 84%, ${withAlpha(c, 0)} 100%)`;
      };
      cssCamel(s.el, { background: [
        glow(fx, fy, R * 0.16, [['#ffffff', a * 1.8, 0], ['#ffffff', a * 1.1, 30], [p.streak, a * 0.8, 55], [p.streak, 0, 100]]),
        line(R * 2.4, R * 0.034, a * 1.9), line(R * 1.7, R * 0.12, a * 0.9),
        glow(fx, fy, R * 0.5, [[p.streak, a * 0.6, 0], [p.streak, 0, 100]]),
        ...GHOSTS.map(ghost),
      ].join(', ') });
      return;
    }
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
