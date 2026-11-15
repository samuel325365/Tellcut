// common.film — film grain and a soft vignette in one overlay. The grain (redone 2026-11-01: the old 270 px tile stretched over the
// frame read as denim) is fine grey noise at the frame's own pixels — soft clumps of 1–2 px at 1080 — blended into the picture
// (soft-light for normal, overlay for overlay), so it shows most in the shadows and mid-tones and not at all in pure black or
// clipped white. Four noise tiles are made once; each frame shows one of them at an offset picked from the frame's number, so a
// frame looks the same however it is reached. look vhs (uk-dv's fx.dvLook): a home video tape — fixed scanlines, a warm cast with
// lifted blacks, the vignette, and tracking noise bands sliding down the frame at the times `tracking` gives.
// look super8 (2026-11-15): projected home movie film — a warm cast, the frame's brightness flickering, a heavier vignette, a thin
// black gate with rounded corners, vertical scratches that come and go and dust specks and hairs that change every two frames; the
// gate, the vignette and the dirt weave a pixel or two together (gate weave), smoothly. All seeded by the time, nothing kept.
// look print: the picture printed as a halftone. A dot screen (a rotated grid of soft dots, each going from black in its middle to
// white at its corners) is laid half over the picture, and a backdrop-filter: contrast() above it pushes every channel to ink or
// paper around the middle, so a dark place gets big dots and a light one small ones (the colours split into their own dots, as
// printed inks do), with a touch of sepia for the paper. backdrop-filter with contrast() works in every current browser.
import { clamp, cssCamel, h, lerp, rng, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';

interface P { grain: number; vignette: number; color: string; rate: number; look: 'grain' | 'vhs' | 'super8' | 'print'; blend: 'normal' | 'overlay'; tint: number; lines: number; tracking: string; letterbox: number; dot: number }
/** super8: the weaving wrapper, its gate and its dirt canvas, the flicker; print: the dot screen, the contrast, the paper */
interface S8 { weave: HTMLElement; gate: HTMLElement; dirt: HTMLCanvasElement; flick: HTMLElement; drawn: string }
interface Print { dots: HTMLElement; ink: HTMLElement }
interface S { cv: HTMLCanvasElement; tiles: HTMLCanvasElement[]; shown: string; vig: HTMLElement; cast: HTMLElement; scan: HTMLElement; band: HTMLCanvasElement; bars: HTMLElement[]; s8?: S8; print?: Print }

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
export function filmGrainBytes(k: number, size = TILE): Uint8ClampedArray {
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

/** super8's gate weave at `t` (px at 1080): a smooth wander of a pixel or two, more sideways than up and down */
export function gateWeave(t: number): [number, number] {
  const w = (a: number, f: number, ph: number) => a * Math.sin(2 * Math.PI * f * t + ph);
  return [w(0.9, 0.53, 1.3) + w(0.6, 1.37, 4.1) + w(0.3, 3.1, 0.2), w(0.5, 0.71, 2.2) + w(0.3, 1.91, 5.3)];
}

/** super8's flicker at frame n: a change of brightness, -1 (darker) … 1 (lighter); a new one each frame */
export function filmFlicker(n: number): number {
  const r = rng(7121 + n * 3301);
  r();
  return (r() - 0.5) * 2 * (r() < 0.15 ? 1 : 0.45);
}

/** super8's dirt at frame n (one set every two frames), at 1080: the scratches (each comes for a second or two at its own place and
 *  jitters), the dust specks and now and then a hair */
export function filmDirt(n: number, fps: number): { scratches: Array<{ x: number; y0: number; y1: number; w: number; light: boolean; a: number }>; specks: Array<{ x: number; y: number; r: number; light: boolean; a: number }>; hairs: Array<{ x: number; y: number; dx: number; dy: number; bend: number }> } {
  const step = Math.floor(n / 2), t = (step * 2) / Math.max(1, fps), r = rng(9173 + step * 7919);
  r();
  const scratches = [0, 1, 2].flatMap((j) => {
    const life = 1.3 + 0.4 * j, w = Math.floor(t / life + j * 0.37), q = rng(331 + j * 977 + w * 6151);
    q();
    if (q() > 0.55) return [];
    const x = q(), light = q() < 0.7, part = q() < 0.4, y0 = part ? q() * 0.6 : 0, y1 = part ? y0 + 0.2 + q() * 0.4 : 1;
    return [{ x: x + (r() - 0.5) * 0.004, y0, y1, w: 1 + q() * 1.5, light, a: (0.18 + 0.25 * r()) * (light ? 1 : 0.8) }];
  });
  const specks = Array.from({ length: 2 + Math.floor(r() * 6) }, () => ({ x: r(), y: r(), r: 1.2 + 3.8 * r() * r(), light: r() < 0.2, a: 0.55 + 0.35 * r() }));
  const hairs = r() < 0.22 ? [{ x: r(), y: r(), dx: (r() - 0.5) * 120, dy: (r() - 0.5) * 120, bend: (r() - 0.5) * 80 }] : [];
  return { scratches, specks, hairs };
}

/** print's dot screen: a CSS background of soft dots `cell` px apart, black in the middle of each to white at its corners */
export function dotScreenCss(cell: number): string {
  const c = Math.max(2, cell);
  return `radial-gradient(circle at 50% 50%, #000 0px, #fff ${(c * Math.SQRT1_2).toFixed(2)}px) 0 0 / ${c.toFixed(2)}px ${c.toFixed(2)}px`;
}

let sharedTiles: HTMLCanvasElement[] | null = null;
/** the TILES grain tiles as canvases, noised once for the page and shared by every film item (each is 1 MB, and noising one takes
 *  a while): they only depend on their number, and the items only read them as a pattern */
function grainTiles(): HTMLCanvasElement[] {
  return (sharedTiles ??= Array.from({ length: TILES }, (_, k) => {
    const c = h('canvas', null, null, null) as HTMLCanvasElement;
    c.width = TILE; c.height = TILE; c.dataset.tile = String(k);
    const g = c.getContext('2d')!, img = g.createImageData(TILE, TILE);
    img.data.set(filmGrainBytes(k));
    g.putImageData(img, 0, 0);
    return c;
  }));
}

export const film: ItemType<P, S> = {
  type: 'common.film', label: '底片質感', category: 'look', kind: 'overlay',
  doc: '整個畫面的細顆粒加柔和暗角（一個積木）；顆粒每格都不同、混進畫面裡（暗部和中間調最明顯，純黑和亮到頂的白不變）；想要底片、懷舊、有質感的感覺時蓋在最上層；grain 0.07–0.15 是淡淡的底片感，0.3 以上很粗；look vhs 是家用錄影帶：固定的掃描線、偏暖、黑色浮起來、暗角，tracking「秒:長:強度」那幾段一條追蹤雜訊帶從上往下滑過（換帶、回憶、老錄影帶、DV；配 common.whirr）；look super8 是放映出來的 8 釐米家庭電影：偏暖、亮度一格一格忽明忽暗、比較重的暗角和圓角的黑框、幾條直的刮痕來來去去、灰塵和毛髮每兩格換一次，整個框微微晃動（老家庭錄影、童年、上一代的回憶、復古婚禮；配 common.whirr 或放映機聲）；look print 是印刷的網點：畫面變成一格格斜排的網點，暗的地方點大、亮的地方點小，顏色也分成各自的點，再疊一層淡淡的紙色（雜誌、報紙、剪報、普普風、復古海報；dot 是網點間距；沒有暗角；它下面的字也會變成網點，字幕要放在它上面）；blend overlay 對比比較強、集中在中間調（品牌片、電影感，grain 約 0.07）',
  params: [
    { key: 'grain', label: '顆粒量（0.07–0.15 淡淡的，0.3 以上很粗）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    { key: 'vignette', label: '暗角強度', type: 'number', min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'color', label: '暗角顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'rate', label: '顆粒每秒換幾次', type: 'number', min: 1, max: 30, step: 1, default: 30 },
    { key: 'look', label: '樣子（grain 底片顆粒、vhs 錄影帶、super8 八釐米家庭電影、print 印刷網點）', type: 'enum', options: ['grain', 'vhs', 'super8', 'print'], default: 'grain' },
    { key: 'tint', label: '暖色偏（vhs、super8）', type: 'number', min: 0, max: 0.4, step: 0.01, default: 0.07 },
    { key: 'lines', label: '掃描線濃度（vhs）', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.11 },
    { key: 'tracking', label: '追蹤雜訊帶（「秒:長:強度」逗號分開，相對項目開始；vhs）', type: 'string', default: '' },
    { key: 'letterbox', label: '電影黑邊（中間畫面的寬高比，例如 2.39；0＝沒有）', type: 'number', min: 0, max: 4, step: 0.01, default: 0 },
    { key: 'dot', label: '網點間距（畫面短邊 %；print）', type: 'number', min: 0.3, max: 3, step: 0.05, default: 0.8 },
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
    const s: S = { cv, vig, cast, scan, band, tiles: grainTiles(), shown: '', bars };
    if (ctx.params.look === 'super8') {
      // the flicker lights or darkens the whole frame; the gate and the dirt weave together, a little larger than the frame so
      // their edge never shows
      const flick = abs(h('div', null, null, host)), weave = h('div', null, null, host);
      cssCamel(weave, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      const dirt = abs(h('canvas', null, null, weave)), gate = h('div', null, null, weave);
      cssCamel(gate, { position: 'absolute', pointerEvents: 'none' });
      dirt.width = 1; dirt.height = 1;
      s.s8 = { weave, gate, dirt, flick, drawn: '' };
    } else if (ctx.params.look === 'print') {
      // the dot screen turned 45° (oversized so the turn leaves no corner bare), then the contrast that reads it and the paper tone
      // (a touch of sepia), both in the backdrop filter: a blended paper layer here would make the container above the items an
      // isolated group, and the filter would see only the dots
      const dots = h('div', null, null, host), ink = abs(h('div', null, null, host));
      cssCamel(dots, { position: 'absolute', left: '-50%', top: '-50%', width: '200%', height: '200%', opacity: '0.5', transform: 'rotate(45deg)', pointerEvents: 'none' });
      cssCamel(ink, { backdropFilter: 'contrast(5) sepia(0.18)' });
      s.print = { dots, ink };
    }
    return s;
  },
  draw(ctx, s) {
    const { vignette, color, rate } = ctx.params, vhs = ctx.params.look === 'vhs', { W, H } = ctx;
    // super8's vignette is heavier; a printed page has none
    cssCamel(s.vig, { background: vignetteCss(color), opacity: String(s.print ? 0 : s.s8 ? clamp(vignette * 1.6) : clamp(vignette)) });
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
    if (s.print) {
      // the dots at `dot` % of the short side
      const k = Math.min(W, H) / 1080;
      cssCamel(s.print.dots, { background: dotScreenCss(clamp(Number(ctx.params.dot) || 0.8, 0.1, 10) / 100 * 1080 * k) });
    }
    if (s.s8) {
      drawSuper8(ctx.local, ctx.fps, W, H, clamp(ctx.params.tint), s);
      return;
    }
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
  hide(s) {
    s.band.width = 1; s.band.height = 1; s.cv.width = 1; s.cv.height = 1; s.shown = '';
    if (s.s8) { s.s8.dirt.width = 1; s.s8.dirt.height = 1; s.s8.drawn = ''; }
  },
};

/** super8 at `t`: the warm cast, the flicker, the vignette and gate weaving, the dirt of this frame */
function drawSuper8(t: number, fps: number, W: number, H: number, tint: number, s: S) {
  const s8 = s.s8!, k = Math.min(W, H) / 1080, n = Math.floor(t * fps + 1e-3), m = 4 * k;
  cssCamel(s.cast, { display: 'block', background: `rgba(255,150,70,${(tint * 1.3).toFixed(3)})` });
  cssCamel(s.scan, { display: 'none' }); cssCamel(s.band, { display: 'none' });
  const fl = filmFlicker(n);
  cssCamel(s8.flick, { background: fl > 0 ? `rgba(255,240,215,${(fl * 0.07).toFixed(4)})` : `rgba(0,0,0,${(-fl * 0.09).toFixed(4)})` });
  const [wx, wy] = gateWeave(t), move = `translate(${(wx * k).toFixed(2)}px, ${(wy * k).toFixed(2)}px)`;
  cssCamel(s8.weave, { transform: move }); cssCamel(s.vig, { transform: move });
  // the gate: a thin black edge with rounded corners, soft on the inside, reaching past the frame by the weave's room
  const edge = Math.max(2, 7 * k), rad = 34 * k;
  cssCamel(s8.gate, { left: `${(edge - m).toFixed(1)}px`, top: `${(edge - m).toFixed(1)}px`, right: `${(edge - m).toFixed(1)}px`, bottom: `${(edge - m).toFixed(1)}px`, borderRadius: `${rad.toFixed(1)}px`,
    boxShadow: `0 0 0 ${(40 * k + m).toFixed(1)}px #050403, inset 0 0 ${(26 * k).toFixed(1)}px ${(6 * k).toFixed(1)}px rgba(5,4,3,0.75)` });
  // the dirt, drawn again only when its two frames change (or the frame's size)
  const cw = Math.max(1, Math.round(W)), ch = Math.max(1, Math.round(H)), key = `${cw}x${ch}:${Math.floor(n / 2)}:${fps}`;
  if (key === s8.drawn) return;
  if (s8.dirt.width !== cw || s8.dirt.height !== ch) { s8.dirt.width = cw; s8.dirt.height = ch; }
  const g = s8.dirt.getContext('2d')!, d = filmDirt(n, fps);
  g.clearRect(0, 0, cw, ch);
  for (const sc of d.scratches) {
    g.fillStyle = sc.light ? `rgba(255,250,235,${sc.a.toFixed(3)})` : `rgba(10,8,6,${sc.a.toFixed(3)})`;
    g.fillRect(sc.x * W, sc.y0 * H, sc.w * k, (sc.y1 - sc.y0) * H);
  }
  for (const sp of d.specks) {
    g.fillStyle = sp.light ? `rgba(255,250,235,${(sp.a * 0.7).toFixed(3)})` : `rgba(12,10,8,${sp.a.toFixed(3)})`;
    g.beginPath(); g.ellipse(sp.x * W, sp.y * H, sp.r * k, sp.r * k * 0.75, sp.x * 6, 0, Math.PI * 2); g.fill();
  }
  for (const hr of d.hairs) {
    const x = hr.x * W, y = hr.y * H;
    g.strokeStyle = 'rgba(12,10,8,0.7)'; g.lineWidth = 1.4 * k;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (hr.dx / 2 + hr.bend) * k, y + (hr.dy / 2 - hr.bend) * k, x + hr.dx * k, y + hr.dy * k); g.stroke();
  }
  s8.drawn = key;
}
