// Black and white, promoted 2026-11-05 from the Mono Frame pilot film's fx.monoframe / fx.filmstrip (after the user's own Mono Frame
// style film):
//   common.monoframe  a frame of diagonal bands of repeated words round the picture, black on white and white on black by turns, the
//                     words drifting along their bands; a rounded window shows the footage, and can shrink and grow (win keys)
//   common.filmstrip  a page of two 35 mm film strips scrolling opposite ways, stills of the footage in their frames, sprocket holes and
//                     edge numbers
// The stacked title is the title template mono-cycle, the caption the template mono-box, the vortex common.wipe's mode vortex.
import { clamp, eIO3 as eIO, type ItemType, type SceneItem } from '@tellcut/engine';
import { canvasIn, rr } from './desk-kit.ts';
import { imagesReady } from './window.ts';

const LATIN = 'Space Grotesk', CJK = 'Noto Sans TC';
const face = (px: number) => `700 ${px}px "${LATIN}", "${CJK}", sans-serif`;
type Rect = [number, number, number, number];
// a face that fails to load draws with the fallback, as in the other blocks, rather than failing the item's ready
const fontsReady = (text: string) => Promise.all([document.fonts.load(`700 80px "${LATIN}"`, 'AZaz09·&').catch(() => []), document.fonts.load(`700 80px "${CJK}"`, text || '字').catch(() => [])]).then(() => undefined);

/** the window at `local` (frame fractions): "seconds|x,y,w,h" keys (in time order, however written) eased from one to the next; none =
 *  the frame inside the border, `border` of the short side on every side */
export function monoWindow(keys: string, local: number, W: number, H: number, border: number): Rect {
  const m = Math.min(W, H), bx = border * (m / W), by = border * (m / H), def: Rect = [bx, by, 1 - 2 * bx, 1 - 2 * by];
  const ks = String(keys ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [t, r] = l.split('|'), v = String(r ?? '').split(',').map(Number);
    return { t: Number(t) || 0, r: (v.length === 4 && v.every(Number.isFinite) ? v : def) as Rect };
  }).sort((a, b) => a.t - b.t);
  if (!ks.length) return def;
  if (local <= ks[0].t) return ks[0].r;
  for (let i = 0; i < ks.length - 1; i++) if (local < ks[i + 1].t) {
    const q = eIO((local - ks[i].t) / Math.max(1e-6, ks[i + 1].t - ks[i].t));
    return ks[i].r.map((v, j) => v + (ks[i + 1].r[j] - v) * q) as Rect;
  }
  return ks[ks.length - 1].r;
}

interface FP { text: string; border: number; band: number; angle: number; speed: number; radius: number; win: string; full: boolean; ink: string; paper: string }
interface FS { c: HTMLCanvasElement; text: string }
export const monoframe: ItemType<FP, FS> = {
  type: 'common.monoframe', label: '黑白字框', category: 'frame', kind: 'overlay',
  doc: '畫面四周一圈黑白斜紋字：一條條斜的帶子，ink 底 paper 字、paper 底 ink 字輪流，text 一直重複、沿著帶子慢慢走（speed），中間一個圓角的窗露出影片（border 框寬，畫面短邊比例）；win 讓窗縮放（一行一個「秒|x,y,寬,高」畫面比例，例如先縮成畫面中間一小條、再放大回滿），full 整個畫面都是字；一章一個項目、換章換字（城市名、主題字、中英文都可以）；配標題範本 mono-cycle、字幕範本 mono-box、common.wipe 的 vortex 換章、common.filmstrip 底片頁；旅行、城市、美食的潮流感短片',
  params: [
    { key: 'text', label: '帶子上的字（會一直重複）', type: 'string', default: 'HONG KONG · 香港 · ' },
    { key: 'border', label: '框寬（畫面短邊比例）', type: 'number', min: 0, max: 0.3, step: 0.005, default: 0.045 },
    { key: 'band', label: '帶子寬（px，短邊 1080）', type: 'number', min: 20, max: 200, step: 1, default: 62 },
    { key: 'angle', label: '斜度（度）', type: 'number', min: -60, max: 60, step: 1, default: -28 },
    { key: 'speed', label: '字走的速度（px／秒）', type: 'number', min: 0, max: 600, step: 5, default: 70 },
    { key: 'radius', label: '窗的圓角（px）', type: 'number', min: 0, max: 80, step: 1, default: 26 },
    { key: 'win', label: '窗的位置（一行一個「秒|x,y,寬,高」；空＝框內整塊）', type: 'text', default: '' },
    { key: 'full', label: '整個畫面都是字（沒有窗）', type: 'bool', default: false },
    { key: 'ink', label: '深色', type: 'color', default: '#0d0d0d' },
    { key: 'paper', label: '淺色', type: 'color', default: '#f4f4f0' },
  ],
  build(ctx) { return { c: canvasIn(ctx.root), text: ctx.params.text }; },
  ready(s) { return fontsReady(s.text); },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, u = Math.min(W, H) / 1080;
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const band = p.band * u, R = Math.hypot(W, H), px = band * 0.6, text = p.text || ' ';
    g.save(); g.translate(W / 2, H / 2); g.rotate((p.angle * Math.PI) / 180);
    g.font = face(px); g.textBaseline = 'middle';
    const tw = Math.max(1, g.measureText(text).width);
    for (let k = -Math.ceil(R / band / 2) - 1; k * band < R / 2 + band; k++) {
      const y = k * band, dark = ((k % 2) + 2) % 2 === 0;
      g.fillStyle = dark ? p.ink : p.paper; g.fillRect(-R / 2, y - band / 2, R, band);
      g.fillStyle = dark ? p.paper : p.ink;
      const off = (((local * p.speed * u * (dark ? 1 : -1) + k * 137 * u) % tw) + tw) % tw;
      // blank words: the bands alone (a blank is only a few px wide, and was written thousands of times a frame)
      if (text.trim()) for (let x = -R / 2 - off; x < R / 2; x += tw) g.fillText(text, x, y + px * 0.04);
    }
    g.restore();
    if (!p.full) {
      const [x, y, w, h] = monoWindow(p.win, local, W, H, p.border);
      g.save(); g.globalCompositeOperation = 'destination-out'; rr(g, x * W, y * H, w * W, h * H, p.radius * u); g.fill(); g.restore();
    }
  },
};

/** the stills: source seconds, comma or space separated */
export const parseStillTimes = (text: unknown) => String(text ?? '').split(/[\s,，]+/).filter(Boolean).map(Number).filter(Number.isFinite);
/** strip `col` (0 left, scrolling up; 1 right, scrolling down): which still frame `k` of the strip shows, `scrolled` frames along */
export function stripStill(k: number, col: number, scrolled: number, n: number): number {
  if (n <= 0) return 0;
  const i = k + (col ? Math.floor(n / 2) - scrolled : scrolled);
  return ((i % n) + n) % n;
}

/** strip `col`'s frames `run` px scrolled: each frame's top (before the gap), its still and its edge number. The offset and the
 *  count of whole frames scrolled come from one floor, so they wrap together: the left strip (scrolling up) takes its offset as
 *  pitch − (run mod pitch), in (0, pitch], which is pitch, not 0, at a whole number of frames (a wrap a frame early there showed every
 *  frame one still on for that one picture). The edge number moves with the frame the way its still does (k + scrolled on the left,
 *  k − scrolled on the right), so it stays printed on its frame instead of stepping two a frame. */
export function stripFrames(run: number, pitch: number, col: number, n: number, H: number): Array<{ k: number; y: number; still: number; no: number }> {
  const into = ((run % pitch) + pitch) % pitch, off = col ? into : pitch - into, scrolled = Math.floor(run / pitch), out = [];
  for (let k = -2; k * pitch < H + pitch * 2; k++) out.push({ k, y: k * pitch + off - pitch, still: stripStill(k, col, scrolled, n), no: 21 + ((((k + (col ? -scrolled : scrolled) + col * 7) % 18) + 18) % 18) });
  return out;
}

interface SP { source: string; stills: string; label: string; speed: number; bg: string }
interface SS { c: HTMLCanvasElement; imgs: HTMLImageElement[]; key: string }
const stillOf = (source: string, t: number) => ({ source, t, w: 640 });
function makeImgs(ctx: { params: SP; media: { stillUrl(r: { source: string; t: number; w?: number }): string } }, s: SS) {
  const key = `${ctx.params.source}|${ctx.params.stills}`;
  if (s.key === key) return;
  s.imgs = ctx.params.source ? parseStillTimes(ctx.params.stills).map((t) => { const i = new Image(); i.src = ctx.media.stillUrl(stillOf(ctx.params.source, t)); return i; }) : [];
  s.key = key;
}

export const filmstrip: ItemType<SP, SS> = {
  type: 'common.filmstrip', label: '捲動的底片', category: 'frame', kind: 'scene',
  doc: '一頁兩條 35mm 底片，一條往上、一條往下捲（speed 是每秒捲過幾個畫面高），格子裡是素材（source）在 stills 那幾秒的靜止畫面（逗號分隔，輪流出現），兩邊齒孔、格與格之間有片號（label 加上格號 21A、22A…）；底色 bg；放在影片下面當整頁的底（layer: under），字幕疊在上面；回顧、「還有好多想記住的」、一趟旅行的總整理；選沒有原片燒字的畫面（整格不裁切）',
  params: [
    { key: 'source', label: '素材', type: 'source-ref', default: '' },
    { key: 'stills', label: '畫面（素材秒，逗號分隔）', type: 'string', default: '0' },
    { key: 'label', label: '片號前面的字', type: 'string', default: 'TC 400 · SAFETY FILM' },
    { key: 'speed', label: '捲動速度（畫面高／秒）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.09 },
    { key: 'bg', label: '底色', type: 'color', default: '#0b0b0b' },
  ],
  media(item: SceneItem) {
    const p = item.params as unknown as SP;
    return { videos: [], stills: p.source ? parseStillTimes(p.stills).map((t) => stillOf(p.source, t)) : [] };
  },
  build(ctx) { const s: SS = { c: canvasIn(ctx.root), imgs: [], key: '' }; makeImgs(ctx, s); return s; },
  ready(s) { return Promise.all([fontsReady('字'), imagesReady(s.imgs)]).then(() => undefined); },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    makeImgs(ctx, s);
    const { local, dur, W, H, params: p } = ctx, u = Math.min(W, H) / 1080;
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = clamp(local / 0.15) * clamp((dur - local) / 0.15);
    g.fillStyle = p.bg; g.fillRect(0, 0, W, H);
    const sw = Math.min(W, H) * 0.44, fw = sw * 0.76, fh = fw / 1.5, gap = sw * 0.14, pitch = fh + gap, n = s.imgs.length, run = local * p.speed * H;
    [0.265, 0.735].forEach((cx, col) => {
      const x0 = cx * W - sw / 2;
      g.fillStyle = '#1b1b1b'; g.fillRect(x0, 0, sw, H);
      for (const { y, still, no } of stripFrames(run, pitch, col, n, H)) {
        const fx = cx * W - fw / 2, fy = y + gap / 2;
        g.fillStyle = '#e9e6dd';   // sprocket holes down both margins
        for (let hole = 0; hole < 4; hole++) {
          const hy = y + (hole + 0.5) * (pitch / 4) - 7 * u;
          rr(g, x0 + sw * 0.035, hy, sw * 0.06, 14 * u, 3 * u); g.fill(); rr(g, x0 + sw * 0.905, hy, sw * 0.06, 14 * u, 3 * u); g.fill();
        }
        g.fillStyle = '#333'; g.fillRect(fx, fy, fw, fh);
        const img = n ? s.imgs[still] : null;
        if (img && img.complete && img.naturalWidth) {
          const ir = img.naturalWidth / img.naturalHeight, fr = fw / fh;
          let sx = 0, sy = 0, sWd = img.naturalWidth, sHt = img.naturalHeight;
          if (ir > fr) { sWd = sHt * fr; sx = (img.naturalWidth - sWd) / 2; } else { sHt = sWd / fr; sy = (img.naturalHeight - sHt) / 2; }
          g.drawImage(img, sx, sy, sWd, sHt, fx, fy, fw, fh);
        }
        const ly = fy + fh + gap * 0.25;
        g.fillStyle = '#f0c040'; g.font = `500 ${15 * u}px "${LATIN}", sans-serif`; g.textBaseline = 'middle';
        g.textAlign = 'left'; g.fillText(`${no}`, fx, ly); g.textAlign = 'right'; g.fillText(`${p.label} · ${no}A`, fx + fw, ly);
      }
    });
    g.globalAlpha = 1;
  },
};
