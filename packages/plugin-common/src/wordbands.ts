// common.wordbands, the magazine kit's (editorial-kit.ts) beat page: slanted bands of repeated italic serif words, each wider than the
// last until they fill the frame, a photo card in the middle (EAT · EVERY · SINGLE · BITE). A pure function of time.
import { clamp, eOut3Clamped, type ItemType } from '@tellcut/engine';
import { canvasIn } from './desk-kit.ts';
import { coverImage, disp, fontsReady, photo, stillMedia } from './editorial-kit.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { imagesReady } from './window.ts';

export interface Band { t: number; word: string; bc: string; tc: string }
/** "seconds|WORD|band colour|word colour" a line */
export function parseBands(text: unknown): Band[] {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [t, word = '', bc, tc] = l.split('|').map((x) => x.trim());
    return { t: Number(t) || 0, word, bc: bc || '#c23b2c', tc: tc || '#ffffff' };
  });
}
/** band k of n's height (px) once it has grown in: the last just covers the W×H frame tipped `angle` degrees (W |sin| + H |cos|,
 *  across the band), each before it 2.1 times thinner than the next, or less (but at least 0.12 H) when there are many */
export function bandHeight(k: number, n: number, W: number, H: number, angle: number): number {
  const a = (angle * Math.PI) / 180, full = W * Math.abs(Math.sin(a)) + H * Math.abs(Math.cos(a));
  const step = n > 1 ? clamp(Math.pow(full / (0.12 * H), 1 / (n - 1)), 1, 2.1) : 1;
  return full / Math.pow(step, Math.max(0, n - 1 - k));
}

interface BP { source: string; t: number; bands: string; bg: string; angle: number }
interface BS { c: HTMLCanvasElement; img: HTMLImageElement | null; key: string; bandsText?: string; bands: Band[] }
export const wordbands: ItemType<BP, BS> = {
  type: 'common.wordbands', label: '斜字帶', category: 'moment', kind: 'scene',
  doc: '一串斜的色帶，帶上重複的斜體粗襯線字慢慢滑動，中間一張白框相片（source 在 t 秒的畫面）：bands 一行一條「秒|字|帶色|字色」，每一條在自己的秒出現、比上一條寬一倍，最後一條蓋滿畫面；bg 是底色；放在影片下面當整頁（layer: under）；「EAT · EVERY · SINGLE · BITE」這種一字一拍的口號、章節之間的節奏段、美食雜誌風；配 common.masthead、common.spread',
  params: [
    { key: 'source', label: '相片素材', type: 'source-ref', default: '' },
    { key: 't', label: '相片取素材第幾秒', type: 'number', min: 0, max: 99999, step: 0.01, default: 0 },
    { key: 'bands', label: '色帶（一行一條：秒|字|帶色|字色）', type: 'text', default: '0|TASTE|#c23b2c|#f6efe4\n0.4|EVERY|#f2b730|#1d1a17\n0.8|SINGLE|#141414|#f6efe4\n1.2|BITE|#8e7cc3|#f6efe4' },
    { key: 'bg', label: '底色', type: 'color', default: '#efe9df' },
    { key: 'angle', label: '斜度（度）', type: 'number', min: -30, max: 30, step: 1, default: -9 },
  ],
  media: stillMedia,
  build(ctx) { const s: BS = { c: canvasIn(ctx.root), img: null, key: '', bands: [] }; photo(s, ctx.media, ctx.params.source, ctx.params.t); return s; },
  ready(s) { return Promise.all([fontsReady(''), imagesReady([s.img])]).then(() => undefined); },
  hide(s) { freeCanvas(s.c); },
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    photo(s, ctx.media, p.source, p.t);
    g.globalAlpha = clamp(local / 0.1);
    g.fillStyle = p.bg; g.fillRect(0, 0, W, H);
    if (s.bandsText !== p.bands) { s.bandsText = p.bands; s.bands = parseBands(p.bands); }   // parsed once per value, not every frame
    const bands = s.bands;
    let k = -1; bands.forEach((b, i) => { if (local >= b.t) k = i; });
    if (k < 0) { g.globalAlpha = 1; return; }
    const b = bands[k], R = Math.hypot(W, H), h = bandHeight(k, bands.length, W, H, p.angle) * (0.75 + 0.25 * eOut3Clamped((local - b.t) / 0.25));
    g.save(); g.translate(W / 2, H / 2); g.rotate((p.angle * Math.PI) / 180);
    g.fillStyle = b.bc; g.fillRect(-R / 2, -h / 2, R, h);
    g.beginPath(); g.rect(-R / 2, -h / 2, R, h); g.clip();
    const fs = Math.min(h * 0.62, 170 * u), rows = Math.max(1, Math.floor(h / (fs * 1.05)));
    g.font = disp(fs, 900, true); g.fillStyle = b.tc; g.textBaseline = 'middle';
    const tw = Math.max(1, g.measureText(b.word + ' ').width);
    for (let r = 0; r < rows; r++) {
      const y = -h / 2 + (r + 0.5) * (h / rows), off = (((local * 160 * u * (r % 2 ? 1 : -1) + r * 97 * u) % tw) + tw) % tw;
      for (let x = -R / 2 - off; x < R / 2; x += tw) g.fillText(b.word, x, y);
    }
    g.restore();
    const ph = Math.min(H * 0.42, h * 0.72), pw = ph * 0.78, bd = 10 * u;   // the photo card in the middle
    g.save(); g.translate(W / 2, H / 2); g.rotate((p.angle * Math.PI) / 360);
    g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 20 * u; g.fillStyle = '#fff'; g.fillRect(-pw / 2 - bd, -ph / 2 - bd, pw + 2 * bd, ph + 2 * bd); g.shadowColor = 'transparent';
    coverImage(g, s.img, -pw / 2, -ph / 2, pw, ph, 0.5, 0.6); g.restore();
    g.globalAlpha = 1;
  },
};
