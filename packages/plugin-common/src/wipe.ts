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
import { clamp, type Crop, cssCamel, eIn3, eIO3, eOut3, h, type ItemType, lerp, resolveTheme, type Theme, withDefaults } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { magazine, magazineLayout } from './magazine.ts';
import { imagesReady, showStill, stillRef, windowEl, type Win } from './window.ts';
import { toRgb } from './color.ts';

interface P {
  color: string; edge: string; slant: number; dir: 'right' | 'left'; line: number; mode: 'band' | 'hand' | 'curl'; hand: string;
  source: string; t: number; crop: Crop; win: string; art: string; artParams: Record<string, unknown>; artAt: number; angle: number; back: string; rev: boolean;
}
interface S { wrap: HTMLElement; band: HTMLElement; edge: HTMLElement; cv: HTMLCanvasElement; curl?: CurlS }

const eOut = (x: number) => eOut3(clamp(x));
const eIn = (x: number) => eIn3(clamp(x));

/** the band's left and right foot (px, before the slant) at progress u (0–1) of the item: [left, right] */
export function wipeEdges(u: number, W: number, sl: number): [number, number] {
  const L = u < 0.5 ? -sl : -sl + (W + 2 * sl) * eIn((u - 0.5) * 2);
  const R = u < 0.5 ? -sl + (W + 2 * sl) * eOut(u * 2) : W + sl;
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
  doc: '轉場：一條斜切的色帶從左掃到右（dir 可反向），項目正中間那一刻蓋滿整個畫面，前緣帶一條細線；剪接點（版面切換、換場）放在項目正中間，放在最上層（layer: top）；配 common.whoosh；mode hand 是手遮鏡頭：一隻暗色、邊緣模糊的手掌剪影帶著殘影從右下拍上來，項目正中間完全遮住鏡頭，再往左下滑開（換場、轉身、不想被拍）；mode curl 是翻頁：項目從剪接點開始，一開始整個畫面是舊的那一頁——color 色的紙，或上一個鏡頭的靜態圖（source／t／crop，放在 win 或整個畫面），上面可以疊一個積木停在 artAt（art／artParams，例如 common.magazine 的一頁，靜態圖就放進它的影片格）——接著沿 angle 捲起來：摺線掃過畫面，捲起的部分是鏡像的背面（back 色、摺線旁的反光、隱約透出正面的印刷）並投下陰影，新的一頁上摺線旁有一條陰影；rev 反著播（一頁蓋回來，雜誌闔上）；雜誌換頁、筆記本翻頁、章節切換，配 common.whoosh',
  params: [
    { key: 'color', label: '色帶顏色', type: 'color', default: '#ff4f2a', theme: 'palette.accent' },
    { key: 'edge', label: '前緣細線顏色', type: 'color', default: '#f4ecdc', theme: 'palette.paper' },
    { key: 'line', label: '細線粗細（以 1080 短邊計的 px，0＝沒有）', type: 'number', min: 0, max: 60, step: 1, default: 10 },
    { key: 'slant', label: '斜度（上下兩端錯開幾個畫面寬）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'dir', label: '方向（right 從左往右、left 從右往左）', type: 'enum', options: ['right', 'left'], default: 'right' },
    { key: 'mode', label: '樣式（band 斜切色帶、hand 手遮鏡頭、curl 翻頁）', type: 'enum', options: ['band', 'hand', 'curl'], default: 'band' },
    { key: 'hand', label: '手的顏色（hand）', type: 'color', default: '#24140f' },
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
    const hand = ctx.params.mode === 'hand';
    for (const e of [s.band, s.edge]) if (hand) cssCamel(e, { display: 'none' }); else if (e === s.band) cssCamel(e, { display: 'block' });
    cssCamel(s.cv, { display: hand ? 'block' : 'none' });
    cssCamel(s.wrap, { transform: ctx.params.dir === 'left' ? 'scaleX(-1)' : 'none' });   // hand: dir left comes in from the lower left
    if (hand) { drawHand(ctx.params, s, ctx.W, ctx.H, ctx.local, ctx.dur); return; }
    const p = ctx.params, { W, H } = ctx, sl = p.slant * W, u = ctx.dur > 0 ? ctx.local / ctx.dur : 1, [L, R] = wipeEdges(u, W, sl);
    const poly = (a: number, b: number) => `polygon(${(a + sl).toFixed(1)}px 0px, ${(b + sl).toFixed(1)}px 0px, ${b.toFixed(1)}px ${H}px, ${a.toFixed(1)}px ${H}px)`;
    const e = p.line * (Math.min(W, H) / 1080);
    cssCamel(s.band, { background: p.color, clipPath: poly(L, R) });
    cssCamel(s.edge, { display: e > 0 ? 'block' : 'none', background: p.edge, clipPath: u < 0.5 ? poly(R - e, R) : poly(L - e, L) });
  },
};

/** mode hand: the palm, four fingers and a thumb as blurred ellipses (in a 1080 × 1920 frame's px, scaled to the frame), drawn at
 *  five poses 12 ms apart for a motion trail, then the flat cover */
function drawHand(p: P, s: S, W: number, H: number, local: number, dur: number) {
  const g = s.cv.getContext('2d')!;
  if (s.cv.width !== Math.round(W) || s.cv.height !== Math.round(H)) { s.cv.width = Math.round(W); s.cv.height = Math.round(H); }
  g.clearRect(0, 0, s.cv.width, s.cv.height);
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
function drawSheet(ctx: Parameters<typeof wipe.draw>[0], sh: Sheet, key: string, changed: boolean) {
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
  void key;
  if (sh.art) sh.art.type.draw({ ...ctx, root: sh.art.root, params: sh.art.params, local: Math.max(0, p.artAt), dur: Math.max(ctx.dur, p.artAt + 0.5) }, sh.art.state);
}

function drawCurl(ctx: Parameters<typeof wipe.draw>[0], s: S) {
  const p = ctx.params, { W, H } = ctx, c = curlState(ctx, s), k = Math.min(W, H) / 1080;
  const key = JSON.stringify([p.art, p.artParams, W, H]), changed = c.key !== key;
  c.key = key;
  drawSheet(ctx, c.frontSheet, key, changed);
  drawSheet(ctx, c.ghostSheet, key, changed);
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
