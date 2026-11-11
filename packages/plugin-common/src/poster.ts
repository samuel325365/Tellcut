// common.poster, the one-colour kit's (onecolor-kit.ts) page: a slanted word over and under a bracketed photo card with a hard
// shadow, a faint giant word behind, a line of side text, a barcode. A pure function of time.
import { eOut3Clamped, type ItemType, type SceneItem } from '@tellcut/engine';
import { coverImage } from './editorial-kit.ts';
import { canvasAt, freeCanvas, canvasIn } from './inkline.ts';
import { brackets, fitted, fontsReady, said, sans, slanted, spaced } from './onecolor-kit.ts';
import { imagesReady } from './window.ts';

/** "source|t|fx,fy" lines */
export function parsePhotos(text: string): Array<{ source: string; t: number; fx: number; fy: number }> {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [source, t, f] = l.split('|'), [fx, fy] = String(f || '0.5,0.5').split(',').map(Number);
    return { source: source.trim(), t: Number(t) || 0, fx: Number.isFinite(fx) ? fx : 0.5, fy: Number.isFinite(fy) ? fy : 0.5 };
  });
}
/** which of `n` photos shows at `local`, a new one every `every` seconds, round and round */
export const photoIndex = (local: number, every: number, n: number) => (n ? Math.floor(Math.max(0, local) / Math.max(0.01, every)) % n : -1);

/** where the poster's parts go in a W×H frame (px), sized by the short side: the photo card (cx, cy, cw, ch; 4:3, 0.76 of the
 *  width in 9:16), the centres of the words above and below it (ty, by) at size tpx, and the barcode (from bx, byy, bh tall). In a
 *  frame less tall than 9:16 the card comes down a little and shrinks until the words and the barcode are all inside the height. */
export function posterLayout(W: number, H: number, barcode: boolean) {
  const u = Math.min(W, H) / 1080, tpx = 190 * u, half = 0.55 * tpx;
  // the card's top to the top word's centre, its foot to the bottom word's centre (0.07 H and 0.062 H in 9:16)
  const above = 134.4 * u, below = 119.04 * u;
  const cy = Math.max(0.235 * H, above + half + 40 * u), byy = 0.885 * H, bh = 44 * u, floor = barcode ? byy - 30 * u : H - 60 * u;
  const cw = Math.min(0.76 * W, (floor - cy - below - half) / 0.75), ch = cw * 0.75;
  return { u, tpx, cw, ch, cx: (W - cw) / 2, cy, ty: cy - above, by: cy + ch + below, bx: 0.12 * W, byy, bh };
}
interface PP { top: string; bottom: string; side: string; ghost: string; photos: string; every: number; barcode: string; color: string; ink: string; mark: string }
interface PS { c: HTMLCanvasElement; imgs: Array<{ img: HTMLImageElement; fx: number; fy: number }>; text: string }
export const poster: ItemType<PP, PS> = {
  type: 'common.poster', label: '單色海報頁', category: 'frame', kind: 'scene',
  doc: '一整頁單色（color）的海報頁，放在沒有影片的那段：背景一個淡淡的空心大字（ghost，空＝上方的字）慢慢飄，上方粗斜體大字（top）落下、下方大字（bottom）升起，中間一張相片卡（四角 mark 色的 L 角、右下黑色硬陰影，進場縮一下；photos「素材|秒|fx,fy」一行一張，多張時每 every 秒換一張，餐點、景點輪播），卡片右邊一行直排小字（side），barcode 不空時左下一條條碼和一行小字（片尾）；章節頁、清單頁、片尾 KEEP / GOING.；字幕放在下方大字之下',
  params: [
    { key: 'top', label: '上方大字', type: 'string', default: 'EAT.' },
    { key: 'bottom', label: '下方大字', type: 'string', default: '3 STOPS' },
    { key: 'side', label: '右側直排小字', type: 'string', default: '' },
    { key: 'ghost', label: '背景空心字（空＝上方大字）', type: 'string', default: '' },
    { key: 'photos', label: '相片（素材|秒|fx,fy，一行一張）', type: 'text', default: '' },
    { key: 'every', label: '多張時每幾秒換一張', type: 'number', min: 0.05, max: 10, step: 0.01, default: 0.24 },
    { key: 'barcode', label: '條碼下的小字（空＝沒有條碼）', type: 'string', default: '' },
    { key: 'color', label: '底色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'ink', label: '字色', type: 'color', default: '#111111' },
    { key: 'mark', label: '相片四角的 L 角', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
  ],
  media: (item: SceneItem) => ({ videos: [], stills: parsePhotos((item.params as Partial<PP>).photos ?? '').map((ph) => ({ source: ph.source, t: ph.t, w: 1080 })) }),
  build(ctx) {
    const p = ctx.params;
    const imgs = parsePhotos(p.photos).map((ph) => ({ img: Object.assign(new Image(), { src: ctx.media.stillUrl({ source: ph.source, t: ph.t, w: 1080 }) }), fx: ph.fx, fy: ph.fy }));
    return { c: canvasIn(ctx.root), imgs, text: `${p.top}${p.bottom}${p.side}${p.barcode}` };
  },
  ready: (s) => Promise.all([fontsReady(s.text), imagesReady(s.imgs.map((i) => i.img))]).then(() => undefined),
  hide: (s) => freeCanvas(s.c),
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, g = canvasAt(s.c, W, H), L = posterLayout(W, H, !!p.barcode), { u, cw, ch, cx, cy, tpx } = L;
    g.fillStyle = p.color; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.16; slanted(g, p.ghost || p.top, W / 2 - 30 * u * local, 0.47 * H, 560 * u, null, p.ink, 3 * u); g.globalAlpha = 1;
    const k = eOut3Clamped(local / 0.22), sc = 1.06 - 0.06 * k, ty = L.ty - 30 * u * (1 - k), by = L.by + 30 * u * (1 - k);
    const t1 = fitted(g, p.top, tpx, 0.76 * W), t2 = fitted(g, p.bottom, tpx, 0.76 * W);
    slanted(g, p.top, W / 2, ty, t1, p.ink); said(ctx, g, p.top, W / 2, ty, t1);
    g.save(); g.translate(W / 2, cy + ch / 2); g.scale(sc, sc); g.translate(-W / 2, -(cy + ch / 2));
    g.fillStyle = '#111111'; g.fillRect(cx + 18 * u, cy + 18 * u, cw, ch);
    const i = photoIndex(local, p.every, s.imgs.length), ph = i >= 0 ? s.imgs[i] : null;
    coverImage(g, ph?.img ?? null, cx, cy, cw, ch, ph?.fx ?? 0.5, ph?.fy ?? 0.5, '#777');
    g.strokeStyle = 'rgba(17,17,17,0.9)'; g.lineWidth = 3 * u; g.strokeRect(cx, cy, cw, ch);
    brackets(g, cx + 20 * u, cy + 20 * u, cw - 40 * u, ch - 40 * u, 46 * u, 5 * u, p.mark);
    g.restore();
    slanted(g, p.bottom, W / 2, by, t2, p.ink); said(ctx, g, p.bottom, W / 2, by, t2);
    if (p.side) {
      g.save(); g.translate(cx + cw + 44 * u, cy + 6 * u); g.rotate(Math.PI / 2);
      g.font = sans(17 * u); spaced(g, 4 * u); g.fillStyle = p.ink; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(p.side, 0, 0); spaced(g, 0); g.restore();
    }
    if (p.barcode) {
      const { bx, byy, bh } = L;
      g.fillStyle = p.ink;
      for (let x = bx, j = 0; x < bx + 300 * u; j++) { const w = (1 + ((j * 7 + 3) % 4)) * 2 * u; if (j % 3 !== 2) g.fillRect(x, byy, w, bh); x += w + 4 * u; }
      g.font = sans(15 * u); spaced(g, 5 * u); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(p.barcode, bx, byy + bh + 10 * u); spaced(g, 0);
    }
  },
};
