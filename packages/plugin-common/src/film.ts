// common.film — film grain and a soft vignette in one overlay. The grain (redone 2026-11-01: the old 270 px tile stretched over the
// frame read as denim) is fine grey noise at the frame's own pixels — soft clumps of 1–2 px at 1080 — blended into the picture
// (soft-light for normal, overlay for overlay), so it shows most in the shadows and mid-tones and not at all in pure black or
// clipped white. Four noise tiles are made once; each frame shows one of them at an offset picked from the frame's number, so a
// frame looks the same however it is reached. look vhs (uk-dv's fx.dvLook): a home video tape — fixed scanlines, a warm cast with
// lifted blacks, the vignette, and tracking noise bands sliding down the frame at the times `tracking` gives.
import { clamp, cssCamel, h, lerp, rng, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';

interface P { grain: number; vignette: number; color: string; rate: number; look: 'grain' | 'vhs'; blend: 'normal' | 'overlay'; tint: number; lines: number; tracking: string; letterbox: number }
interface S { cv: HTMLCanvasElement; tiles: HTMLCanvasElement[]; shown: string; vig: HTMLElement; cast: HTMLElement; scan: HTMLElement; band: HTMLCanvasElement; bars: HTMLElement[] }

/** a noise tile's side (px at 1080) and how many there are */
export const TILE = 512, TILES = 4;
/** the tiles' spread around mid-grey (one standard deviation, 0–255) */
const SPREAD = 48;

/** a circular (wrapping) separable gaussian blur of a size×size field, in place */
function blur(a: Float32Array, size: number, sigma: number) {
  const r = Math.ceil(sigma * 3), w: number[] = [];
  for (let i = -r; i <= r; i++) w.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const sum = w.reduce((x, y) => x + y, 0), k = Float32Array.from(w, (x) => x / sum), line = new Float32Array(size + 2 * r), out = new Float32Array(size);
  // one line at a time, padded with its own other end so it wraps; rows (step 1), then columns (step size)
  const pass = (start: number, step: number) => {
    for (let i = 0; i < size; i++) line[i + r] = a[start + i * step];
    for (let i = 0; i < r; i++) { line[i] = a[start + (size - r + i) * step]; line[size + r + i] = a[start + i * step]; }
    for (let x = 0; x < size; x++) { let v = 0; for (let i = 0; i <= 2 * r; i++) v += line[x + i] * k[i]; out[x] = v; }
    for (let i = 0; i < size; i++) a[start + i * step] = out[i];
  };
  for (let y = 0; y < size; y++) pass(y * size, 1);
  for (let x = 0; x < size; x++) pass(x, size);
}

/** white gaussian noise, blurred by sigma and scaled to a standard deviation of 1 */
function field(r: () => number, size: number, sigma: number): Float32Array {
  const a = new Float32Array(size * size);
  for (let i = 0; i < a.length; i++) a[i] = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  blur(a, size, sigma);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  const n = Math.sqrt(s / a.length) || 1;
  for (let i = 0; i < a.length; i++) a[i] /= n;
  return a;
}

const made = new Map<string, Uint8ClampedArray>();
/** one grain tile as RGBA bytes: opaque grey around 128 (128 leaves the picture as it is under soft-light and overlay), soft
 *  clumps of 1–2 px (fine noise blurred a little, plus a weaker coarser layer so it does not look like digital noise); it wraps
 *  without a seam. The same k gives the same tile (made once and kept). */
export function grainTile(k: number, size = TILE): Uint8ClampedArray {
  const key = `${k}:${size}`, kept = made.get(key);
  if (kept) return kept;
  const r = rng(1000 + k * 7919), fine = field(r, size, 0.65), coarse = field(r, size, 1.6), d = new Uint8ClampedArray(size * size * 4);
  const a = 0.85, b = 0.5, n = Math.sqrt(a * a + b * b);
  for (let i = 0; i < fine.length; i++) {
    const v = Math.round(128 + ((a * fine[i] + b * coarse[i]) / n) * SPREAD);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  made.set(key, d);
  return d;
}

/** the grain layer's opacity for `grain` 0–1. Measured on a mid-grey sky at 1080: the grain's spread there is about 20·grain^0.6
 *  levels (of 255) in both blends — 0.07 (the presets' value) ≈ 4, 0.1 ≈ 5, 0.3 ≈ 10, 1 ≈ 20 (heavy). Soft-light (normal) moves a
 *  mid-tone about half as far as overlay for the same layer, so its layer is twice as opaque. */
export function grainOpacity(grain: number, blend: P['blend']): number {
  const g = clamp(Number(grain) || 0);
  if (g <= 0) return 0;
  const op = Math.pow(g, 0.6);
  return clamp(blend === 'overlay' ? op * 0.55 : op);
}

/** which tile a frame shows and where it starts: frame n of the grain's own rate, so a frame is the same however it is reached */
export function grainPick(local: number, rate: number): { n: number; tile: number; ox: number; oy: number } {
  const n = Math.floor(Math.max(0, local) * Math.max(1, Number(rate) || 1) + 1e-6), r = rng(4049 + n * 6151);
  r();
  return { n, tile: n % TILES, ox: Math.floor(r() * TILE), oy: Math.floor(r() * TILE) };
}

/** the vignette: a lens-like falloff as a radial gradient — clear to 30% of the way out, then easing in (no edge where it starts,
 *  the old linear ramp read as a dark ring), at its full colour a little past the corners (about 0.7 of it at a corner) */
export function vignetteCss(color: string): string {
  const stops: string[] = [];
  for (let p = 30; p <= 120; p += 10) stops.push(`${withAlpha(color, +Math.pow(clamp((p / 100 - 0.3) / 0.85), 1.8).toFixed(3))} ${p}%`);
  return `radial-gradient(ellipse at center, ${stops.join(', ')})`;
}

/** "秒:長:強度, …" as [start, length, strength] (the strength 0–1, 0.6 when left out) */
export function parseTracking(s: unknown): Array<[number, number, number]> {
  return String(s ?? '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean).map((x) => x.split(/[:：]/).map(Number))
    .filter((v) => Number.isFinite(v[0]) && Number.isFinite(v[1]) && v[1] > 0).map((v) => [v[0], v[1], clamp(Number.isFinite(v[2]) ? v[2] : 0.6)] as [number, number, number]);
}

/** one tracking band centred at cy, hh tall: a darker strip full of bright and dark streaks and a thin bright tear line */
export function trackingBand(g: CanvasRenderingContext2D, W: number, cy: number, hh: number, strength: number, seed: number, k: number) {
  const r = rng(seed);
  g.fillStyle = `rgba(0,0,0,${0.18 * strength})`; g.fillRect(0, cy - hh / 2, W, hh);
  const n = Math.round(10 + 20 * strength);
  for (let i = 0; i < n; i++) {
    const y = cy - hh / 2 + r() * hh, ht = (1 + r() * 4 * strength) * k, x = r() * W * 0.9 - W * 0.1, w = W * (0.15 + r() * 0.8), v = r() < 0.75 ? 255 : 20;
    g.fillStyle = `rgba(${v},${v},${v},${(0.35 + r() * 0.55) * strength})`; g.fillRect(x, y, w, ht);
  }
  g.fillStyle = `rgba(255,255,255,${0.6 * strength})`; g.fillRect(0, cy + hh * (r() - 0.5) * 0.6, W, (2 + 2 * strength) * k);
}

let sharedTiles: HTMLCanvasElement[] | null = null;
/** the TILES grain tiles as canvases, noised once for the page and shared by every film item (each is 1 MB, and noising one takes
 *  a while): they only depend on their number, and the items only read them as a pattern */
function grainTiles(): HTMLCanvasElement[] {
  return (sharedTiles ??= Array.from({ length: TILES }, (_, k) => {
    const c = h('canvas', null, null, null) as HTMLCanvasElement;
    c.width = TILE; c.height = TILE; c.dataset.tile = String(k);
    const g = c.getContext('2d')!, img = g.createImageData(TILE, TILE);
    img.data.set(grainTile(k));
    g.putImageData(img, 0, 0);
    return c;
  }));
}

export const film: ItemType<P, S> = {
  type: 'common.film', label: '底片質感', category: 'look', kind: 'overlay',
  doc: '整個畫面的細顆粒加柔和暗角（一個積木）；顆粒每格都不同、混進畫面裡（暗部和中間調最明顯，純黑和亮到頂的白不變）；想要底片、懷舊、有質感的感覺時蓋在最上層；grain 0.07–0.15 是淡淡的底片感，0.3 以上很粗；look vhs 是家用錄影帶：固定的掃描線、偏暖、黑色浮起來、暗角，tracking「秒:長:強度」那幾段一條追蹤雜訊帶從上往下滑過（換帶、回憶、老錄影帶、DV；配 common.whirr）；blend overlay 對比比較強、集中在中間調（品牌片、電影感，grain 約 0.07）',
  params: [
    { key: 'grain', label: '顆粒量（0.07–0.15 淡淡的，0.3 以上很粗）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    { key: 'vignette', label: '暗角強度', type: 'number', min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'color', label: '暗角顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'rate', label: '顆粒每秒換幾次', type: 'number', min: 1, max: 30, step: 1, default: 30 },
    { key: 'look', label: '樣子（grain 底片顆粒、vhs 錄影帶）', type: 'enum', options: ['grain', 'vhs'], default: 'grain' },
    { key: 'tint', label: '暖色偏（vhs）', type: 'number', min: 0, max: 0.4, step: 0.01, default: 0.07 },
    { key: 'lines', label: '掃描線濃度（vhs）', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.11 },
    { key: 'tracking', label: '追蹤雜訊帶（「秒:長:強度」逗號分開，相對項目開始；vhs）', type: 'string', default: '' },
    { key: 'letterbox', label: '電影黑邊（中間畫面的寬高比，例如 2.39；0＝沒有）', type: 'number', min: 0, max: 4, step: 0.01, default: 0 },
    { key: 'blend', label: '顆粒的混合方式（normal 柔光，暗部和中間調最明顯；overlay 疊加，對比較強、集中在中間調；兩種的純黑、純白都不變）', type: 'enum', options: ['normal', 'overlay'], default: 'normal' },
  ],
  build(ctx) {
    const abs = <T extends HTMLElement>(e: T) => { cssCamel(e, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' }); return e; };
    // the item's layer is blended into the picture (an isolated layer's own children cannot blend with what is under it), so it
    // holds only the grain; the vignette, the tape and the bars go to the container above the items, drawn normally
    const host = ctx.top;
    cssCamel(ctx.root, { mixBlendMode: ctx.params.blend === 'overlay' ? 'overlay' : 'soft-light' });
    const cast = abs(h('div', null, null, host)), scan = abs(h('div', null, null, host)), vig = abs(h('div', null, null, host));
    const band = abs(h('canvas', null, null, host)), cv = abs(h('canvas', null, null, ctx.root));
    // the letterbox bars, above the grain
    const bars = [0, 1].map((i) => { const b = h('div', null, null, host); b.dataset.bar = i ? 'bottom' : 'top'; cssCamel(b, { position: 'absolute', left: '0', right: '0', background: '#000', pointerEvents: 'none', display: 'none' }); return b; });
    cv.width = 1; cv.height = 1;
    band.width = 1; band.height = 1;
    return { cv, vig, cast, scan, band, tiles: grainTiles(), shown: '', bars };
  },
  draw(ctx, s) {
    const { vignette, color, rate } = ctx.params, vhs = ctx.params.look === 'vhs', { W, H } = ctx;
    cssCamel(s.vig, { background: vignetteCss(color), opacity: String(clamp(vignette)) });
    // the grain: at the frame's own pixels (scaled with the frame's short side from 1080), one tile at an offset per frame
    const op = grainOpacity(ctx.params.grain, ctx.params.blend);
    cssCamel(s.cv, { opacity: String(+op.toFixed(4)), display: op > 0 ? 'block' : 'none' });
    if (op > 0) {
      const cw = Math.max(1, Math.round(W)), ch = Math.max(1, Math.round(H)), k = Math.min(W, H) / 1080, pick = grainPick(ctx.local, rate);
      const key = `${cw}x${ch}:${pick.n}`;
      if (key !== s.shown) {
        if (s.cv.width !== cw || s.cv.height !== ch) { s.cv.width = cw; s.cv.height = ch; }
        const g = s.cv.getContext('2d')!;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, cw, ch);
        g.setTransform(k, 0, 0, k, -pick.ox * k, -pick.oy * k);
        g.fillStyle = g.createPattern(s.tiles[pick.tile], 'repeat') ?? '#808080';
        g.fillRect(pick.ox, pick.oy, cw / k, ch / k);
        g.setTransform(1, 0, 0, 1, 0, 0);
        s.shown = key;
      }
    }
    // the letterbox: bars that leave a picture of that width-to-height in the middle (none on a frame already that wide)
    const lb = Number(ctx.params.letterbox) || 0, barH = lb > 0 ? (H - W / lb) / 2 : 0;
    s.bars.forEach((b, i) => cssCamel(b, barH > 0.5 ? { display: 'block', height: `${barH.toFixed(2)}px`, top: i ? 'auto' : '0', bottom: i ? '0' : 'auto' } : { display: 'none' }));
    for (const e of [s.cast, s.scan, s.band]) cssCamel(e, { display: vhs ? 'block' : 'none' });
    if (!vhs) return;
    // the tape: a warm cast with a hint of blue in the blacks, one dark line every 4 px (at 1080)
    const t = ctx.local, k = Math.min(W, H) / 1080, gap = Math.max(2, Math.round(4 * k)), lh = Math.max(1, Math.round(1.6 * k));
    cssCamel(s.cast, { background: `linear-gradient(rgba(20,30,60,0.05), rgba(20,30,60,0.05)), rgba(255,170,95,${clamp(ctx.params.tint)})` });
    cssCamel(s.scan, { background: `repeating-linear-gradient(180deg, rgba(0,0,0,${clamp(ctx.params.lines)}) 0px, rgba(0,0,0,${clamp(ctx.params.lines)}) ${lh}px, transparent ${lh}px, transparent ${gap}px)` });
    // the tracking bands: drawn at the frame's own size, the streaks changing 30 times a second
    const bands = parseTracking(ctx.params.tracking).filter(([a, len]) => t >= a && t < a + len);
    if (!bands.length) { cssCamel(s.band, { display: 'none' }); return; }
    if (s.band.width !== Math.round(W) || s.band.height !== Math.round(H)) { s.band.width = Math.round(W); s.band.height = Math.round(H); }
    const g = s.band.getContext('2d')!;
    g.clearRect(0, 0, s.band.width, s.band.height);
    for (const [a, len, str] of bands) {
      const p = (t - a) / len, fr = Math.floor(t * 30), hh = H * (0.05 + 0.08 * str);
      trackingBand(g, W, lerp(-hh, H + hh, p), hh, str, fr * 7 + Math.round(a * 100), k);
      if (str > 0.7) trackingBand(g, W, lerp(H * 0.7, H * 1.2, p), hh * 0.6, str * 0.7, fr * 13 + 5, k);
    }
  },
  // hidden: give back the frame-sized canvases (the grain is drawn again when the item comes back)
  hide(s) { s.band.width = 1; s.band.height = 1; s.cv.width = 1; s.cv.height = 1; s.shown = ''; },
};
