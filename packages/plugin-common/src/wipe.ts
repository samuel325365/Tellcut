// common.wipe — a slanted band of colour crossing the screen, from the podcast-quote short's fx.wipe: the leading edge sweeps in
// (easing out) until the band covers everything at the item's middle, then the trailing edge sweeps out (easing in); a thin line in
// `edge` rides the moving side. Put the cut — a layout change, a new scene — at the middle of the item, on the top layer.
// mode hand (uk-transit's fx.handCover): a dark, soft-edged hand silhouette slaps up from the lower right over the lens, with a
// short motion trail, covers the whole frame at the item's middle, then slides away to the lower left.
// mode curl (t2-magazine's fx.magTurn, fd-map's notebook outro): a page turn. The item starts at the cut covered by the old page — a
// sheet in `color`, or the still of the outgoing shot (source / t / crop, in `win` or the whole frame) with any block drawn over it
// at `artAt` (art / artParams: a common.magazine page, whose window then holds the still) — and the page lifts along `angle`: the
// fold sweeps across, the lifted part is its mirrored back (`back` colour, a sheen from the fold, the print showing through faintly)
// throwing a soft shadow, a strip of shadow lies on the new page by the fold; `rev` plays it backwards (a page laid down: a
// magazine closing).
import { clamp, type Crop, cssCamel, eIn3Clamped, eIO3, eOut3, eOut3Clamped, h, type ItemType, lerp, resolveTheme, type Theme, withDefaults } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { magazine, magazineLayout } from './magazine.ts';
import { imagesReady, showStill, stillRef, windowEl, type Win } from './window.ts';
import { parseColor, toRgb } from './color.ts';

interface P {
  color: string; edge: string; slant: number; dir: 'right' | 'left'; line: number; mode: 'band' | 'hand' | 'curl' | 'tiles' | 'vortex' | 'stripes'; hand: string; cols: number; rows: number; words: string; colors: string;
  source: string; t: number; crop: Crop; win: string; art: string; artParams: Record<string, unknown>; artAt: number; angle: number; back: string; rev: boolean;
}
interface S { wrap: HTMLElement; band: HTMLElement; edge: HTMLElement; cv: HTMLCanvasElement; curl?: CurlS }


/** the band's left and right foot (px, before the slant) at progress u (0–1) of the item: [left, right] */
export function wipeEdges(u: number, W: number, sl: number): [number, number] {
  const L = u < 0.5 ? -sl : -sl + (W + 2 * sl) * eIn3Clamped((u - 0.5) * 2);
  const R = u < 0.5 ? -sl + (W + 2 * sl) * eOut3Clamped(u * 2) : W + sl;
  return [L, R];
}

export interface HandPose { x: number; y: number; s: number; r: number; cover: number }
/** mode hand at `local` of `dur`: the hand's centre (frame fractions), its scale and turn, and how much a flat dark cover hides
 *  (1 at the middle: it rises over the last 45 % of the way in and is gone by 40 % of the way out) */
export function handPose(local: number, dur: number): HandPose {
  const T = Math.max(0.05, dur / 2), hold = Math.min(0.06, dur / 10), rest = Math.max(0.05, dur - T - hold);
  if (local <= T) { const p = eIO3(clamp(local / T)); return { x: lerp(1.25, 0.5, p), y: lerp(1.3, 0.52, p), s: lerp(0.9, 4.2, p), r: lerp(-0.5, -0.15, p), cover: Math.pow(clamp((local / T - 0.55) / 0.45), 2) }; }
  if (local <= T + hold) return { x: 0.5, y: 0.52, s: 4.2, r: -0.15, cover: 1 };
  const p = eIO3(clamp((local - T - hold) / rest));
  return { x: lerp(0.5, -0.9, p), y: lerp(0.52, 1.3, p), s: lerp(4.2, 3.0, p), r: lerp(-0.15, 0.3, p), cover: Math.pow(1 - clamp(p / 0.4), 2) };
}

export const wipe: ItemType<P, S> = {
  type: 'common.wipe', label: '斜切色帶轉場', category: 'moment', kind: 'overlay',
  doc: '轉場：一條斜切的色帶從左掃到右（dir 可反向），項目正中間那一刻蓋滿整個畫面，前緣帶一條細線；剪接點（版面切換、換場）放在項目正中間，放在最上層（layer: top）；配 common.whoosh；mode hand 是手遮鏡頭：一隻暗色、邊緣模糊的手掌剪影帶著殘影從右下拍上來，項目正中間完全遮住鏡頭，再往左下滑開（換場、轉身、不想被拍）；mode curl 是翻頁：項目從剪接點開始，一開始整個畫面是舊的那一頁——color 色的紙，或上一個鏡頭的靜態圖（source／t／crop，放在 win 或整個畫面），上面可以疊一個積木停在 artAt（art／artParams，例如 common.magazine 的一頁，靜態圖就放進它的影片格）——接著沿 angle 捲起來：摺線掃過畫面，捲起的部分是鏡像的背面（back 色、摺線旁的反光、隱約透出正面的印刷）並投下陰影，新的一頁上摺線旁有一條陰影；rev 反著播（一頁蓋回來，雜誌闔上）；雜誌換頁、筆記本翻頁、章節切換，配 common.whoosh；mode tiles 是格子拼貼：畫面切成 cols × rows 格，紙色（color，兩種深淺）的格子一塊塊蓋上、正中間蓋滿，再一塊塊翻開，格子之間是 edge 色的細縫（剪貼簿、拼貼、相片牆換頁，配 common.slide；換頁後要留著格縫，用 common.scraps 的 grid）；mode vortex 是字的漩渦：一圈圈 color／edge 兩色相間的字環（words），相鄰兩圈反方向轉、整個慢慢放大，頭尾 0.12 秒淡入淡出、中間蓋滿畫面（城市、潮流、黑白字框的換章，配 common.monoframe）；mode stripes 是多色斜條：colors 幾種顏色（逗號分隔）的斜色條一條接一條掃過去，項目正中間最後一條蓋滿畫面，再一條條掃出去露出新畫面；斜度看 slant（上下兩端錯開幾個畫面寬，所以角度跟著畫面比例變：1 在 9:16 約 30 度、1:1 是 45 度、16:9 約 60 度），dir left 從右邊進來（多巴胺配色的換段，最後一個顏色用新段落的底色，配 common.backdrop 的 words）',
  params: [
    { key: 'color', label: '色帶顏色', type: 'color', default: '#ff4f2a', theme: 'palette.accent' },
    { key: 'edge', label: '前緣細線顏色', type: 'color', default: '#f4ecdc', theme: 'palette.paper' },
    { key: 'line', label: '細線粗細（以 1080 短邊計的 px，0＝沒有）', type: 'number', min: 0, max: 60, step: 1, default: 10 },
    { key: 'slant', label: '斜度（上下兩端錯開幾個畫面寬）', type: 'number', min: 0, max: 2, step: 0.01, default: 0.35 },
    { key: 'dir', label: '方向（right 從左往右、left 從右往左）', type: 'enum', options: ['right', 'left'], default: 'right' },
    { key: 'mode', label: '樣式（band 斜切色帶、hand 手遮鏡頭、curl 翻頁、tiles 格子拼貼、vortex 字的漩渦、stripes 多色斜條）', type: 'enum', options: ['band', 'hand', 'curl', 'tiles', 'vortex', 'stripes'], default: 'band' },
    { key: 'hand', label: '手的顏色（hand）', type: 'color', default: '#24140f' },
    { key: 'cols', label: '格子欄數（tiles；橫的那一邊）', type: 'number', min: 2, max: 20, step: 1, default: 5 },
    { key: 'rows', label: '格子列數（tiles）', type: 'number', min: 2, max: 30, step: 1, default: 9 },
    { key: 'words', label: '漩渦環上的字（vortex，會一直重複）', type: 'string', default: 'TELLCUT · ' },
    { key: 'colors', label: '斜條的顏色（stripes；逗號分隔，最後一條蓋滿畫面）', type: 'string', default: '#c6f03a,#ff3ea5,#ff7a1a,#3b4cf0' },
    { key: 'source', label: '翻頁：舊的那一頁上的素材（它的靜態圖；空＝一張 color 色的紙）', type: 'source-ref', default: '' },
    { key: 't', label: '翻頁：靜態圖取素材第幾秒（上一個鏡頭的最後一格）', type: 'number', min: 0, max: 36000, step: 0.01, default: 0 },
    { key: 'crop', label: '翻頁：靜態圖的裁切 { x, y, zoom }（配合上一個鏡頭）', type: 'json', default: { x: 0.5, y: 0.5, zoom: 1 } },
    { key: 'win', label: '翻頁：靜態圖放的位置「x,y,寬,高」（畫面比例；空＝疊的雜誌頁的影片格，或整個畫面）', type: 'string', default: '' },
    { key: 'art', label: '翻頁：疊在舊的那一頁上的積木（類型 id，例 common.magazine；空＝沒有）', type: 'string', default: '' },
    { key: 'artParams', label: '翻頁：疊的積木的參數', type: 'json', default: {} },
    { key: 'artAt', label: '翻頁：疊的積木停在它的第幾秒', type: 'number', min: 0, max: 600, step: 0.05, default: 3 },
    { key: 'angle', label: '翻頁：捲起的方向（度；0 從右邊往左捲、90 從下往上、45 從右下角）', type: 'number', min: -180, max: 360, step: 1, default: 14 },
    { key: 'back', label: '翻頁：紙背面的顏色', type: 'color', default: '#e7dfcf' },
    { key: 'rev', label: '翻頁：反著播（一頁蓋回來）', type: 'bool', default: false },
  ],
  // curl: the old page's still, and whatever the block hosted on it (art) needs, looked up in the registry as common.card does
  media(item, project, types) {
    const p = item.params as Partial<P>;
    if (p.mode !== 'curl') return { videos: [], stills: [] };
    const stills = p.source ? [stillRef({ source: p.source, t: Number(p.t) || 0 })] : [];
    const type = p.art && p.art !== wipe.type ? types?.(p.art) : undefined;
    if (!type?.media) return { videos: [], stills };
    const params = withDefaults(type.params, (p.artParams ?? {}) as Record<string, unknown>, project ? resolveTheme(project.meta.theme, project.meta) : undefined);
    const art = type.media({ ...item, params }, project, types);
    return { videos: art.videos, stills: [...stills, ...art.stills] };
  },
  build(ctx) {
    const wrap = h('div', null, null, ctx.root), band = h('div', null, null, wrap), edge = h('div', null, null, wrap);
    cssCamel(wrap, { position: 'absolute', inset: '0' });
    for (const e of [band, edge]) cssCamel(e, { position: 'absolute', inset: '0', willChange: 'clip-path' });
    const cv = h('canvas', null, null, wrap) as HTMLCanvasElement;
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none' });
    const s: S = { wrap, band, edge, cv };
    if (ctx.params.mode === 'curl') drawCurl(ctx, s);   // starts loading the still and the hosted block now, so ready() can wait
    return s;
  },
  async ready(s) {
    const c = s.curl;
    if (!c) return;
    await imagesReady([c.frontSheet.win.img, c.ghostSheet.win.img]);
    for (const sh of [c.frontSheet, c.ghostSheet]) if (sh.art?.type.ready) await sh.art.type.ready(sh.art.state);
  },
  hide(s) {
    freeCanvas(s.cv, s.curl?.shade);
    for (const sh of s.curl ? [s.curl.frontSheet, s.curl.ghostSheet] : []) if (sh.art?.type.hide) sh.art.type.hide(sh.art.state);
  },
  // the hosted blocks' GPU things, as the stage would free them (common.card does the same)
  dispose(s) {
    for (const sh of s.curl ? [s.curl.frontSheet, s.curl.ghostSheet] : []) disposeArt(sh);
  },
  draw(ctx, s) {
    const curl = ctx.params.mode === 'curl';
    cssCamel(s.wrap, { display: curl ? 'none' : 'block' });
    if (s.curl) cssCamel(s.curl.box, { display: curl ? 'block' : 'none' });
    if (curl) { drawCurl(ctx, s); return; }
    const hand = ctx.params.mode === 'hand' || ctx.params.mode === 'tiles' || ctx.params.mode === 'vortex' || ctx.params.mode === 'stripes';
    for (const e of [s.band, s.edge]) if (hand) cssCamel(e, { display: 'none' }); else if (e === s.band) cssCamel(e, { display: 'block' });
    cssCamel(s.cv, { display: hand ? 'block' : 'none' });
    // dir left mirrors only the shapes of band and hand (the hand then comes in from the lower left); the vortex draws words, which a
    // mirror would print backwards, so it spins the other way instead, and the tiles' order has no direction to mirror
    const mirror = ctx.params.dir === 'left' && (ctx.params.mode === 'band' || ctx.params.mode === 'hand' || ctx.params.mode === 'stripes');
    cssCamel(s.wrap, { transform: mirror ? 'scaleX(-1)' : 'none' });
    if (ctx.params.mode === 'vortex') { drawVortex(ctx.params, s, ctx.W, ctx.H, ctx.local, ctx.dur); return; }
    if (ctx.params.mode === 'tiles') { drawTiles(ctx.params, s, ctx.W, ctx.H, ctx.local, ctx.dur); return; }
    if (ctx.params.mode === 'stripes') { drawStripes(ctx.params, s, ctx.W, ctx.H, ctx.local, ctx.dur); return; }
    if (hand) { drawHand(ctx.params, s, ctx.W, ctx.H, ctx.local, ctx.dur); return; }
    const p = ctx.params, { W, H } = ctx, sl = p.slant * W, u = ctx.dur > 0 ? ctx.local / ctx.dur : 1, [L, R] = wipeEdges(u, W, sl);
    const poly = (a: number, b: number) => `polygon(${(a + sl).toFixed(1)}px 0px, ${(b + sl).toFixed(1)}px 0px, ${b.toFixed(1)}px ${H}px, ${a.toFixed(1)}px ${H}px)`;
    const e = p.line * (Math.min(W, H) / 1080);
    cssCamel(s.band, { background: p.color, clipPath: poly(L, R) });
    cssCamel(s.edge, { display: e > 0 ? 'block' : 'none', background: p.edge, clipPath: u < 0.5 ? poly(R - e, R) : poly(L - e, L) });
  },
};

/** mode tiles (the Collage pilot film's fx.mosaic, 2026-11-05): when tile (c, r) of cols × rows closes and opens, as shares of the
 *  item: each closes at its own moment in the first half and opens at its own in the second, so the frame is all covered at the middle */
export function tileTimes(c: number, r: number, cols: number, rows: number): [number, number] {
  const h = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }, i = r * cols + c + 1;
  return [0.04 + 0.34 * h(i), 0.56 + 0.34 * h(i + 911)];
}

/** mode tiles: the seams' width in px, 0.4 of `line` (px at 1080, k = short side / 1080) and at least a pixel; line 0 asks for none */
export const tileSeam = (line: number, k: number) => (line > 0 ? Math.max(1, line * 0.4 * k) : 0);

/** mode tiles: paper tiles in two shades of `color` snapping shut over the picture and flipping open again, thin `edge` seams between */
function drawTiles(p: P, s: S, W: number, H: number, local: number, dur: number) {
  const g = canvasAt(s.cv, W, H), u = dur > 0 ? local / dur : 1, cols = Math.max(2, Math.round(p.cols)), rows = Math.max(2, Math.round(p.rows));
  const cw = W / cols, ch = H / rows, seam = tileSeam(p.line, Math.min(W, H) / 1080), [cr, cg, cb] = toRgb(p.color);
  g.clearRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const [a, b] = tileTimes(c, r, cols, rows), k = Math.min(clamp((u - a) / 0.07), 1 - clamp((u - b) / 0.07));
    if (k <= 0) continue;
    const d = (r + c) % 3 === 0 ? 0.92 : 1, w = cw * (0.6 + 0.4 * eOut3(k)), hh = ch * (0.6 + 0.4 * eOut3(k));
    g.globalAlpha = k; g.fillStyle = `rgb(${Math.round(cr * d)},${Math.round(cg * d)},${Math.round(cb * d)})`;
    g.fillRect(c * cw + (cw - w) / 2, r * ch + (ch - hh) / 2, w, hh);
  }
  if (seam > 0) {
    g.globalAlpha = Math.min(1, 4 * Math.min(u, 1 - u)); g.fillStyle = p.edge;
    for (let c = 1; c < cols; c++) g.fillRect(c * cw - seam / 2, 0, seam, H);
    for (let r = 1; r < rows; r++) g.fillRect(0, r * ch - seam / 2, W, seam);
  }
  g.globalAlpha = 1;
}

/** mode stripes at progress u (0–1) for stripe i of n: the stripe's [left, right] across the slanted frame, from -1 (its far left)
 *  to 1; in the first half each right edge sweeps across (later stripes lag, so the last one covers all at the middle), in the second
 *  each left edge does, the last stripe leaving first. The lags and a stripe's sweep add up to exactly one half: with many colours
 *  the lag shrinks (a sweep never shorter than 0.2 of a half), so the last stripe still arrives at the middle and leaves by the end */
export function stripeSpan(u: number, i: number, n: number): [number, number] {
  const lag = Math.min(0.11, 0.8 / Math.max(1, n - 1)), span = 1 - (n - 1) * lag, io = (x: number) => eIO3(clamp(x));
  const inP = io((u * 2 - i * lag) / span), outP = io(((u - 0.5) * 2 - (n - 1 - i) * lag) / span);
  return [u < 0.5 ? -2 : -1 + 2 * outP, -1 + 2 * inP];
}

/** mode stripes: the colours of `colors` (comma separated) that can be read, else `color` alone. A canvas keeps its last fillStyle when
 *  given one it cannot read, so a mistyped colour used to paint its stripe in the colour before it. */
export function stripeColors(colors: string, color: string, ok = (c: string) => parseColor(c) !== null): string[] {
  const cols = String(colors ?? '').split(',').map((c) => c.trim()).filter((c) => c && ok(c));
  return cols.length ? cols : [color];
}

/** mode stripes (the Dopamine Colors pilot film's fx.stripes, 2026-11-06): slanted stripes of `colors`, one after another, the last
 *  covering the frame at the middle */
function drawStripes(p: P, s: S, W: number, H: number, local: number, dur: number) {
  const g = canvasAt(s.cv, W, H), u = dur > 0 ? clamp(local / dur) : 1;
  const cols = stripeColors(p.colors, p.color);
  const a = Math.atan2(p.slant * W, H), D = W * Math.abs(Math.cos(a)) + H * Math.abs(Math.sin(a)), L = D / 2 + 4, T = 2 * D;
  g.clearRect(0, 0, W, H);
  g.save(); g.translate(W / 2, H / 2); g.rotate(a);
  cols.forEach((c, i) => {
    const [l, r] = stripeSpan(u, i, cols.length), left = l <= -2 ? -T : l * L, right = r * L;
    if (right <= left) return;
    g.fillStyle = c; g.fillRect(left, -T, right - left, 2 * T);
  });
  g.restore();
}

/** mode vortex: how far it shows, fading in and out over 0.12 s at its ends, or over half of an item shorter than 0.24 s, so even a
 *  short one covers the frame at its middle */
export function vortexAlpha(local: number, dur: number) {
  const f = Math.max(1e-6, Math.min(0.12, dur / 2));
  return Math.min(clamp(local / f), clamp((dur - local) / f));
}

/** mode vortex (the Mono Frame pilot film's fx.vortex, 2026-11-05): rings of `words` in bands of `color` and `edge` by turns, each
 *  ring spinning the other way from its neighbours, the whole slowly zooming in; in and out over 0.12 s at its ends, the frame covered between */
function drawVortex(p: P, s: S, W: number, H: number, local: number, dur: number) {
  const g = canvasAt(s.cv, W, H), k = Math.min(W, H) / 1080, ring = 78 * k, z = 1 + 0.8 * (dur > 0 ? local / dur : 1), R = Math.hypot(W, H) / 2 / z + ring;
  const chars = [...String(p.words || '·')], px = ring * 0.62;
  g.clearRect(0, 0, W, H);
  g.save(); g.globalAlpha = vortexAlpha(local, dur); g.translate(W / 2, H / 2); g.scale(z, z);
  g.fillStyle = p.color; g.beginPath(); g.arc(0, 0, R + ring, 0, Math.PI * 2); g.fill();
  g.font = `700 ${px}px 'Space Grotesk', 'Noto Sans TC', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0, r = ring * 0.6; r < R + ring; i++, r += ring) {
    const dark = i % 2 === 1, mid = r + ring / 2, count = Math.max(6, Math.floor((2 * Math.PI * mid) / (px * 0.72))), rot = ((i % 2 ? -1 : 1) * (p.dir === 'left' ? -1 : 1) * 70 * local * Math.PI) / 180;
    g.fillStyle = dark ? p.color : p.edge; g.beginPath(); g.arc(0, 0, r + ring, 0, Math.PI * 2); g.arc(0, 0, r, 0, Math.PI * 2, true); g.fill();
    g.fillStyle = dark ? p.edge : p.color;
    for (let j = 0; j < count; j++) { g.save(); g.rotate(rot + (j / count) * Math.PI * 2); g.translate(0, -mid); g.fillText(chars[j % chars.length], 0, 0); g.restore(); }
  }
  g.restore();
}

/** mode hand: the palm, four fingers and a thumb as blurred ellipses (in a 1080 × 1920 frame's px, scaled to the frame), drawn at
 *  five poses 12 ms apart for a motion trail, then the flat cover */
function drawHand(p: P, s: S, W: number, H: number, local: number, dur: number) {
  const g = canvasAt(s.cv, W, H);
  const k = Math.max(W / 1080, H / 1920), [r, gg, b] = toRgb(p.hand), tone = (f: number) => `rgb(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(gg * f))},${Math.min(255, Math.round(b * f))})`;
  const one = (q: HandPose, a: number) => {
    g.save(); g.globalAlpha = a; g.translate(q.x * W, q.y * H); g.rotate(q.r); g.scale(q.s * k, q.s * k);
    const grd = g.createRadialGradient(0, 40, 20, 0, 0, 420);
    grd.addColorStop(0, tone(1.55)); grd.addColorStop(0.6, tone(1)); grd.addColorStop(1, tone(0.5));
    g.fillStyle = grd; g.filter = `blur(${(10 * k).toFixed(1)}px)`;
    g.beginPath(); g.ellipse(0, 120, 230, 260, 0, 0, Math.PI * 2);
    const fx = [-150, -55, 45, 140], fl = [300, 380, 370, 300];
    for (let i = 0; i < 4; i++) { g.moveTo(fx[i] + 48, 40); g.ellipse(fx[i], 40 - fl[i] / 2, 48, fl[i] / 2 + 40, 0.04 * (i - 1.5), 0, Math.PI * 2); }
    g.moveTo(-170, 220); g.ellipse(-250, 120, 60, 170, -0.8, 0, Math.PI * 2);
    g.fill(); g.restore();
  };
  for (let i = 4; i >= 0; i--) one(handPose(Math.max(0, local - i * 0.012), dur), i === 0 ? 1 : 0.22);
  const q = handPose(local, dur);
  g.filter = 'none';
  if (q.cover > 0) { g.globalAlpha = q.cover; g.fillStyle = tone(0.55); g.fillRect(0, 0, W, H); }
  g.globalAlpha = 1;
}

// ---------- mode curl: a page turning away ----------
type Pt = [number, number];
/** the part of a convex polygon where x·d ≥ f */
export function clipPoly(pts: Pt[], dx: number, dy: number, f: number): Pt[] {
  const out: Pt[] = [], P = (p: Pt) => p[0] * dx + p[1] * dy - f;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], pa = P(a), pb = P(b);
    if (pa >= 0) out.push(a);
    if ((pa >= 0) !== (pb >= 0)) { const q = pa / (pa - pb); out.push([a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q]); }
  }
  return out;
}

export interface Curl { flat: Pt[]; flap: Pt[]; band: Pt[]; fold: number; dx: number; dy: number; reach: number; matrix: [number, number, number, number, number, number] }
/** mode curl at turn progress u (0: the old page lies flat, 1: it is gone) in a W×H frame, the page lifting along `angle` (degrees, 0 =
 *  from the right edge towards the left, 90 = from the bottom up; t2-magazine's magTurn): the fold line x·d = fold sweeps across;
 *  `flat` is the part of the old page still lying down, `flap` the lifted part mirrored over the fold (its back), `band` the strip
 *  of shadow on the new page next to the fold, `matrix` the reflection across the fold (CSS matrix order) */
export function curlAt(u: number, angle: number, W: number, H: number): Curl {
  const th = (angle * Math.PI) / 180, dx = Math.cos(th), dy = Math.sin(th), corners: Pt[] = [[0, 0], [W, 0], [W, H], [0, H]];
  const pr = corners.map((q) => q[0] * dx + q[1] * dy), pmin = Math.min(...pr), pmax = Math.max(...pr), p = clamp(u);
  const fold = lerp(pmax, pmin, p), reach = (Math.max(W, H) / 1920) * (90 * Math.sin(Math.PI * p) + 10);
  const flat = clipPoly(corners, -dx, -dy, -fold);
  const flap = clipPoly(corners, dx, dy, fold).map((q): Pt => { const d = q[0] * dx + q[1] * dy - fold; return [q[0] - 2 * d * dx, q[1] - 2 * d * dy]; });
  const band = clipPoly(clipPoly(corners, dx, dy, fold), -dx, -dy, -(fold + reach));
  return { flat, flap, band, fold, dx, dy, reach, matrix: [1 - 2 * dx * dx, -2 * dx * dy, -2 * dx * dy, 1 - 2 * dy * dy, 2 * fold * dx, 2 * fold * dy] };
}

const polyCss = (pts: Pt[]) => (pts.length > 2 ? `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')})` : 'polygon(0 0, 0 0, 0 0)');
/** the still's window on the sheet: `win` "x,y,w,h" (fractions), else the hosted magazine page's window, else the whole frame */
export function curlWindow(p: Pick<P, 'win' | 'art' | 'artParams'>, W: number, H: number, safe?: Theme['safe']): [number, number, number, number] {
  const v = String(p.win ?? '').split(/[,\s]+/).filter(Boolean).map(Number);
  if (v.length === 4 && v.every(Number.isFinite)) return [v[0] * W, v[1] * H, v[2] * W, v[3] * H];
  if (p.art === magazine.type) { const ap = withDefaults(magazine.params, (p.artParams ?? {}) as Record<string, unknown>) as any; return magazineLayout(ap, W, H, safe).win; }
  return [0, 0, W, H];
}

interface Sheet { root: HTMLElement; fill: HTMLElement; win: Win; art?: { type: ItemType; params: Record<string, unknown>; root: HTMLElement; state: unknown } }
interface CurlS { box: HTMLElement; front: HTMLElement; frontSheet: Sheet; shade: HTMLCanvasElement; ghostClip: HTMLElement; ghost: HTMLElement; ghostSheet: Sheet; key: string }

function sheetEl(parent: HTMLElement): Sheet {
  const root = h('div', null, null, parent), fill = h('div', null, null, root);
  cssCamel(root, { position: 'absolute', left: '0', top: '0' });
  cssCamel(fill, { position: 'absolute', inset: '0' });
  return { root, fill, win: windowEl(root) };
}

function curlState(ctx: Parameters<typeof wipe.draw>[0], s: S): CurlS {
  if (s.curl) return s.curl;
  const box = h('div', null, null, ctx.root), front = h('div', null, null, box), shade = h('canvas', null, null, box) as HTMLCanvasElement, ghostClip = h('div', null, null, box), ghost = h('div', null, null, ghostClip);
  cssCamel(box, { position: 'absolute', inset: '0', overflow: 'hidden' });
  for (const e of [front, ghostClip]) cssCamel(e, { position: 'absolute', inset: '0' });
  cssCamel(shade, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
  cssCamel(ghost, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', opacity: '0.07' });
  s.curl = { box, front, frontSheet: sheetEl(front), shade, ghostClip, ghost, ghostSheet: sheetEl(ghost), key: '' };
  return s.curl;
}

function disposeArt(sh: Sheet) {
  if (sh.art?.type.dispose) sh.art.type.dispose(sh.art.state);
}

/** the old page's sheet: the colour, the still in its window, the hosted block drawn at artAt */
function drawSheet(ctx: Parameters<typeof wipe.draw>[0], sh: Sheet, changed: boolean) {
  const p = ctx.params, { W, H } = ctx, r = curlWindow(p, W, H, ctx.theme.safe);
  cssCamel(sh.root, { width: `${W}px`, height: `${H}px` });
  cssCamel(sh.fill, { background: p.source ? '#000000' : p.color });
  cssCamel(sh.win.box, { left: `${r[0]}px`, top: `${r[1]}px` });
  showStill(ctx.media, sh.win, p.source ? { source: p.source, t: Number(p.t) || 0, crop: p.crop } : null, r[2], r[3], p.source ? 1 : 0);
  const type = p.art && p.art !== wipe.type ? ctx.types?.(p.art) : undefined;
  if (changed) {
    if (sh.art?.type.hide) sh.art.type.hide(sh.art.state);
    disposeArt(sh);
    sh.art?.root.remove(); sh.art = undefined;
    if (type) {
      const params = withDefaults(type.params, (p.artParams ?? {}) as Record<string, unknown>, ctx.theme), root = h('div', null, null, sh.root);
      cssCamel(root, { position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px` });
      sh.art = { type, params, root, state: type.build({ ...ctx, root, params, local: p.artAt, t: ctx.t }) };
    }
  }
  if (sh.art) sh.art.type.draw({ ...ctx, root: sh.art.root, params: sh.art.params, local: Math.max(0, p.artAt), dur: Math.max(ctx.dur, p.artAt + 0.5) }, sh.art.state);
}

function drawCurl(ctx: Parameters<typeof wipe.draw>[0], s: S) {
  const p = ctx.params, { W, H } = ctx, c = curlState(ctx, s), k = Math.min(W, H) / 1080;
  const key = JSON.stringify([p.art, p.artParams, W, H]), changed = c.key !== key;
  c.key = key;
  drawSheet(ctx, c.frontSheet, changed);
  drawSheet(ctx, c.ghostSheet, changed);
  let u = eIO3(clamp(ctx.dur > 0 ? ctx.local / ctx.dur : 1));
  if (p.rev) u = 1 - u;
  const cu = curlAt(u, p.angle, W, H), [a, b, cc, d, e, f] = cu.matrix;
  cssCamel(c.box, { display: 'block' });
  cssCamel(c.front, { clipPath: polyCss(cu.flat) });
  cssCamel(c.ghostClip, { clipPath: polyCss(cu.flap), display: cu.flap.length > 2 ? 'block' : 'none' });
  cssCamel(c.ghost, { transform: `matrix(${[a, b, cc, d, e, f].map((v) => v.toFixed(5)).join(', ')})` });
  // the shadow on the new page by the fold, then the flap: the paper's back with a soft shadow and a sheen from the fold
  const g = canvasAt(c.shade, W, H), path = (pts: Pt[]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  const gx = cu.fold * cu.dx, gy = cu.fold * cu.dy;
  if (cu.band.length > 2) {
    const gr = g.createLinearGradient(gx, gy, gx + cu.dx * cu.reach, gy + cu.dy * cu.reach);
    gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; path(cu.band); g.fill();
  }
  if (cu.flap.length > 2) {
    g.save(); path(cu.flap);
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 40 * k; g.shadowOffsetX = -cu.dx * 14 * k; g.shadowOffsetY = -cu.dy * 14 * k + 6 * k;
    g.fillStyle = p.back; g.fill(); g.shadowColor = 'transparent';
    g.clip();
    const pmax = Math.max(...[[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => x * cu.dx + y * cu.dy)), ext = pmax - cu.fold;
    const sh = g.createLinearGradient(gx, gy, (cu.fold - ext) * cu.dx, (cu.fold - ext) * cu.dy);
    sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(0.18, 'rgba(255,255,255,0.1)'); sh.addColorStop(0.7, 'rgba(0,0,0,0.06)'); sh.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    g.restore();
  }
}
