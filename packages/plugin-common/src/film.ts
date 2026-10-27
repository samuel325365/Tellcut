// common.film — film grain and a dark vignette in one overlay. The grain is four fixed noise tiles that take turns, so a frame
// looks the same however it is reached. look vhs (uk-dv's fx.dvLook): a home video tape — fixed scanlines, a warm cast with lifted
// blacks, the vignette, and tracking noise bands sliding down the frame at the times `tracking` gives. blend overlay (the brand
// spike's grain, spec 2026-10-25-brand-preset §6.2-5): grey noise blended by overlay, so pure black and white stay as they are.
import { clamp, cssCamel, h, lerp, rng, type ItemType } from '@tellcut/engine';

interface P { grain: number; vignette: number; color: string; rate: number; look: 'grain' | 'vhs'; blend: 'normal' | 'overlay'; tint: number; lines: number; tracking: string; letterbox: number }
interface S { cv: HTMLCanvasElement; tiles: ImageData[]; shown: number; vig: HTMLElement; cast: HTMLElement; scan: HTMLElement; band: HTMLCanvasElement; bars: HTMLElement[] }

const TILE = 270;

/** one noise tile: black and white specks of random alpha (normal), or opaque grey around the middle, 128 ± 60 (overlay: 128 leaves
 *  the picture as it is) */
export function tile(ctx: CanvasRenderingContext2D, k: number, grey = false): ImageData {
  const img = ctx.createImageData(TILE, TILE), r = rng(1000 + k * 7919), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (grey) { d[i] = d[i + 1] = d[i + 2] = Math.round(128 + (r() - 0.5) * 120); d[i + 3] = 255; continue; }
    const v = r() < 0.5 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = Math.floor(r() * 56);
  }
  return img;
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

export const film: ItemType<P, S> = {
  type: 'common.film', label: '底片質感', category: 'look', kind: 'overlay',
  doc: '整個畫面的顆粒加暗角（一個積木）；想要底片、懷舊、有質感的感覺時蓋在最上層；look vhs 是家用錄影帶：固定的掃描線、偏暖、黑色浮起來、暗角，tracking「秒:長:強度」那幾段一條追蹤雜訊帶從上往下滑過（換帶、回憶、老錄影帶、DV；配 common.whirr）；blend overlay 是灰階雜訊疊加，純黑不會被提亮（品牌片、電影感，grain 約 0.07）',
  params: [
    { key: 'grain', label: '顆粒量', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'vignette', label: '暗角強度', type: 'number', min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'color', label: '暗角顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'rate', label: '顆粒每秒換幾次', type: 'number', min: 1, max: 30, step: 1, default: 12 },
    { key: 'look', label: '樣子（grain 底片顆粒、vhs 錄影帶）', type: 'enum', options: ['grain', 'vhs'], default: 'grain' },
    { key: 'tint', label: '暖色偏（vhs）', type: 'number', min: 0, max: 0.4, step: 0.01, default: 0.07 },
    { key: 'lines', label: '掃描線濃度（vhs）', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.11 },
    { key: 'tracking', label: '追蹤雜訊帶（「秒:長:強度」逗號分開，相對項目開始；vhs）', type: 'string', default: '' },
    { key: 'letterbox', label: '電影黑邊（中間畫面的寬高比，例如 2.39；0＝沒有）', type: 'number', min: 0, max: 4, step: 0.01, default: 0 },
    { key: 'blend', label: '顆粒的混合方式（normal 黑白點蓋上去；overlay 灰階雜訊疊加，純黑、純白不變，顆粒量 0.07 左右就夠）', type: 'enum', options: ['normal', 'overlay'], default: 'normal' },
  ],
  build(ctx) {
    const abs = <T extends HTMLElement>(e: T) => { cssCamel(e, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' }); return e; };
    // blend overlay: the item's layer is blended by overlay (an isolated layer's own children cannot blend with the picture under
    // it), so it holds only the grain; the vignette, the tape and the bars go to the container above the items, drawn normally
    const overlay = ctx.params.blend === 'overlay', host = overlay ? ctx.top : ctx.root;
    if (overlay) cssCamel(ctx.root, { mixBlendMode: 'overlay' });
    const cast = abs(h('div', null, null, host)), scan = abs(h('div', null, null, host)), vig = abs(h('div', null, null, host));
    const band = abs(h('canvas', null, null, host)), cv = abs(h('canvas', null, null, ctx.root));
    // the letterbox bars, above the grain
    const bars = [0, 1].map((i) => { const b = h('div', null, null, host); b.dataset.bar = i ? 'bottom' : 'top'; cssCamel(b, { position: 'absolute', left: '0', right: '0', background: '#000', pointerEvents: 'none', display: 'none' }); return b; });
    cv.width = TILE; cv.height = TILE;
    band.width = 1; band.height = 1;
    const g = cv.getContext('2d')!;
    return { cv, vig, cast, scan, band, tiles: [0, 1, 2, 3].map((k) => tile(g, k, overlay)), shown: -1, bars };
  },
  draw(ctx, s) {
    const { grain, vignette, color, rate } = ctx.params, i = Math.floor(ctx.local * rate) % 4, vhs = ctx.params.look === 'vhs';
    cssCamel(s.vig, { background: `radial-gradient(ellipse at center, transparent 35%, ${color} 115%)`, opacity: String(clamp(vignette)) });
    cssCamel(s.cv, { opacity: String(clamp(grain)) });
    if (i !== s.shown) { s.shown = i; s.cv.getContext('2d')!.putImageData(s.tiles[i], 0, 0); }
    // the letterbox: bars that leave a picture of that width-to-height in the middle (none on a frame already that wide)
    const lb = Number(ctx.params.letterbox) || 0, barH = lb > 0 ? (ctx.H - ctx.W / lb) / 2 : 0;
    s.bars.forEach((b, i) => cssCamel(b, barH > 0.5 ? { display: 'block', height: `${barH.toFixed(2)}px`, top: i ? 'auto' : '0', bottom: i ? '0' : 'auto' } : { display: 'none' }));
    for (const e of [s.cast, s.scan, s.band]) cssCamel(e, { display: vhs ? 'block' : 'none' });
    if (!vhs) return;
    // the tape: a warm cast with a hint of blue in the blacks, one dark line every 4 px (at 1080)
    const { W, H, local: t } = ctx, k = Math.min(W, H) / 1080, gap = Math.max(2, Math.round(4 * k)), lh = Math.max(1, Math.round(1.6 * k));
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
  hide(s) { s.band.width = 1; s.band.height = 1; },
};
