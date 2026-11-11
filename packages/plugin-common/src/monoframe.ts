// common.monoframe, the black-and-white kit's (mono-kit.ts) frame: diagonal bands of repeated words round the picture, black on white
// and white on black by turns, the words drifting along their bands; a rounded window shows the footage, and can shrink and grow (win
// keys). A pure function of time.
import { eIO3 as eIO, type ItemType } from '@tellcut/engine';
import { canvasIn, rr } from './desk-kit.ts';
import { CJK, LATIN, fontsReady } from './mono-kit.ts';

const face = (px: number) => `700 ${px}px "${LATIN}", "${CJK}", sans-serif`;
type Rect = [number, number, number, number];

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
