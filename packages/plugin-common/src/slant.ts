// common.slant — the frame cut into two or three full-bleed bands with parallel slanted edges, each band playing its own shot
// (cells.ts) and rushing in from the side with its picture, left and right in turn; a thin seam (or none) between them and an
// optional tag in each band's corner (BEFORE / AFTER). Bands stack on a tall frame and stand side by side on a wide one. Derived from
// common.comic's slanted panels, common.duo's split and common.popcard's shots that play inside the block. A pure function of time.
import { abs, cssCamel, h, type ItemType } from '@tellcut/engine';
import { cellDirs, cellEl, cellMedia, cellLive, cellProgress, offscreen, parseCellShots, preloadCell, revealTimes, showCell, type CellDir, type Rect } from './cells.ts';
import { imagesReady, type Win } from './window.ts';

interface P { count: number; shots: string; angle: number; times: string; from: string; slideDur: number; seam: number; seamColor: string; bg: string; labels: string; labelColor: string; labelBg: string; font: string; exitAt: number }
interface Band { el: HTMLElement; win: Win; seam: SVGPolylineElement; svg: SVGSVGElement; tag: HTMLElement }
interface S { ground: HTMLElement; bands: Band[] }
const SVG = 'http://www.w3.org/2000/svg';

export type Pt = [number, number];

/** the bands in px, corners clockwise from the top left: a tall frame's bands stacked, a wide frame's side by side; boundary k
 *  passes through the middle of the frame at k / count, slanted by `angle` degrees (count held to 2..3) */
export function slantPolys(count: number, angle: number, W: number, H: number): Pt[][] {
  const n = Math.max(2, Math.min(3, Math.round(Number(count) || 2))), t = Math.tan(((Number(angle) || 0) * Math.PI) / 180);
  if (H >= W) {
    const d = (W / 2) * t, edge = (k: number): [Pt, Pt] => (k === 0 ? [[0, 0], [W, 0]] : k === n ? [[0, H], [W, H]] : [[0, (k * H) / n + d], [W, (k * H) / n - d]]);
    return Array.from({ length: n }, (_, i) => { const [tl, tr] = edge(i), [bl, br] = edge(i + 1); return [tl, tr, br, bl]; });
  }
  const d = (H / 2) * t, edge = (k: number): [Pt, Pt] => (k === 0 ? [[0, 0], [0, H]] : k === n ? [[W, 0], [W, H]] : [[(k * W) / n + d, 0], [(k * W) / n - d, H]]);
  return Array.from({ length: n }, (_, i) => { const [lt, lb] = edge(i), [rt, rb] = edge(i + 1); return [lt, rt, rb, lb]; });
}

/** a polygon's bounding box [x, y, w, h] */
export function polyBox(poly: Pt[]): Rect {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]), x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

const bandCount = (p: Partial<P>) => Math.max(2, Math.min(3, Math.round(Number(p.count) || 3)));
/** where the bands come from: as given, else left and right in turn (top and bottom on a wide frame, where the bands stand side by side) */
function bandDirs(from: string, n: number, wide: boolean): CellDir[] {
  if (String(from ?? '').trim() || !wide) return cellDirs(from, n);
  return Array.from({ length: n }, (_, i) => (i % 2 ? 'bottom' : 'top'));
}

export const slant: ItemType<P, S> = {
  type: 'common.slant', label: '斜切分割', category: 'frame', kind: 'overlay',
  doc: '畫面斜切成 2～3 塊滿版的帶子（count；斜邊互相平行，angle 度），每塊自己播一段鏡頭，連同畫面從側邊交錯衝進來；直式片上下疊、橫式片左右並排；塊與塊之間一條細縫線（seam，0＝無縫），還沒進場的地方是 bg 色；shots 一行一塊「素材|素材秒|x,y,zoom|still」（帶子出現時從素材秒開始播；沒寫的塊是示意圖）；times、from 每塊出現的秒和方向（逗號分隔；沒寫的每 0.35 秒一塊，直式左右輪流、橫式上下輪流）；labels 每塊角落的小標籤（逗號分隔，例如 BEFORE,AFTER）；exitAt 之後帶子滑回去；格子裡的影片沒有聲音（聲音靠配樂、旁白或軌道上的片段），整頁蓋住時主軌可以不放片段；前後對比、運動、開場三連發',
  params: [
    { key: 'count', label: '幾塊（2 或 3）', type: 'number', min: 2, max: 3, step: 1, default: 3 },
    { key: 'shots', label: '每塊的鏡頭（一行一塊：素材|素材秒|x,y,zoom|still）', type: 'text', default: '' },
    { key: 'angle', label: '斜邊角度（度）', type: 'number', min: -30, max: 30, step: 0.5, default: 8 },
    { key: 'times', label: '每塊出現的秒（逗號分隔；空＝每 0.35 秒一塊）', type: 'string', default: '' },
    { key: 'from', label: '每塊從哪邊進來（left、right、top、bottom，逗號分隔或一個值；空＝輪流）', type: 'string', default: '' },
    { key: 'slideDur', label: '滑進來的長度（秒）', type: 'number', min: 0.05, max: 2, step: 0.05, default: 0.45 },
    { key: 'seam', label: '縫線寬（px，短邊 1080；0＝無縫）', type: 'number', min: 0, max: 40, step: 1, default: 12 },
    { key: 'seamColor', label: '縫線顏色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'bg', label: '還沒進場的地方的顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'labels', label: '每塊的小標籤（逗號分隔；空＝不顯示）', type: 'string', default: '' },
    { key: 'labelColor', label: '標籤字色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'labelBg', label: '標籤底色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'font', label: '標籤字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'exitAt', label: '帶子滑回去的秒（-1＝不收）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
  ],
  media(item) {
    const p = item.params as Partial<P>, n = bandCount(p), shots = parseCellShots(String(p.shots ?? ''));
    return cellMedia(Array.from({ length: n }, (_, i) => shots[i] ?? null), revealTimes(String(p.times ?? ''), n, 0.35), item.end - item.start);
  },
  build(ctx) {
    const s: S = { ground: abs(ctx.root, { inset: '0' }), bands: [] };
    slant.draw(ctx, s);   // starts loading the stills now, so ready() can wait for them
    return s;
  },
  ready: (s) => imagesReady(s.bands.map((b) => b.win.img)),
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, dur, theme } = ctx, k = Math.min(W, H) / 1080, n = bandCount(p), wide = W > H;
    const polys = slantPolys(n, p.angle, W, H), ats = revealTimes(p.times, n, 0.35), dirs = bandDirs(p.from, n, wide);
    const all = parseCellShots(p.shots), labels = String(p.labels ?? '').split(/[,，]/).map((l) => l.trim());
    while (s.bands.length < n) {
      const i = s.bands.length, el = abs(ctx.root, { inset: '0' });
      el.dataset.band = String(i);
      const win = cellEl(el), svg = document.createElementNS(SVG, 'svg') as SVGSVGElement, seam = document.createElementNS(SVG, 'polyline') as SVGPolylineElement;
      svg.appendChild(seam); el.appendChild(svg);
      cssCamel(svg as unknown as HTMLElement, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible' });
      const tag = h('div', null, null, el);
      tag.dataset.tag = String(i);
      cssCamel(tag, { position: 'absolute', whiteSpace: 'nowrap', fontWeight: '900', lineHeight: '1', boxSizing: 'border-box' });
      s.bands.push({ el, win, seam, svg, tag });
    }
    while (s.bands.length > n) s.bands.pop()!.el.remove();
    cssCamel(s.ground, { background: p.bg });
    polys.forEach((poly, i) => {
      const b = s.bands[i], q = cellLive(ats[i], dur) ? cellProgress(local, ats[i], p.slideDur, p.exitAt) : 0;
      if (q <= 0.0005) { cssCamel(b.el, { display: 'none' }); if (cellLive(ats[i], dur)) preloadCell(ctx, b.win, all[i] ?? null); return; }
      const box = polyBox(poly), [ox, oy] = offscreen(dirs[i], box, W, H), [x, y, w, hh] = box;
      cssCamel(b.el, { display: 'block', transform: `translate(${(ox * (1 - q)).toFixed(2)}px, ${(oy * (1 - q)).toFixed(2)}px)`,
        clipPath: `polygon(${poly.map(([px, py]) => `${px.toFixed(2)}px ${py.toFixed(2)}px`).join(', ')})` });
      cssCamel(b.win.box, { left: `${x.toFixed(2)}px`, top: `${y.toFixed(2)}px` });
      showCell(ctx, b.win, all[i] ?? null, local - ats[i], dur - ats[i], w, hh);
      // the seam on the band's leading edge (its top on a tall frame, its left on a wide one), drawn twice as wide: the clip keeps half
      const lead = i === 0 ? null : wide ? [poly[0], poly[3]] : [poly[0], poly[1]];
      b.seam.setAttribute('points', lead ? lead.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ') : '');
      b.seam.setAttribute('stroke', p.seamColor); b.seam.setAttribute('stroke-width', String(Math.max(0, p.seam) * 2 * k)); b.seam.setAttribute('fill', 'none');
      cssCamel(b.svg as unknown as HTMLElement, { display: lead && p.seam > 0 ? 'block' : 'none' });
      // the tag inside the band's top-left corner, below the platform's top band
      const label = labels[i] ?? '', fs = 40 * k, tl = poly[0], top = Math.max(poly[0][1], poly[1][1]);
      b.tag.textContent = label;
      cssCamel(b.tag, { display: label ? 'block' : 'none', fontFamily: `'${p.font}', sans-serif`, fontSize: `${fs.toFixed(2)}px`, color: p.labelColor, background: p.labelBg,
        padding: `${(0.25 * fs).toFixed(2)}px ${(0.5 * fs).toFixed(2)}px`, left: `${(Math.max(tl[0], wide ? poly[3][0] : 0) + Math.max(36 * k, theme.safe.side * W * 0.5)).toFixed(2)}px`,
        top: `${(Math.max(top + 28 * k, theme.safe.top * H)).toFixed(2)}px` });
    });
  },
};
