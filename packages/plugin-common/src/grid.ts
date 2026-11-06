// common.grid — a clean grid of cells on a plain ground (straight edges, thin gaps, rounded corners, no ink lines), each cell playing
// its own shot (cells.ts) and coming in one by one: fade, scale, slide or wipe, the picture moving with its cell. Derived from
// common.comic's one-panel-at-a-time page and common.popcard's shots that play inside the block. A pure function of time.
import { abs, cssCamel, type ItemType } from '@tellcut/engine';
import { cellDirs, cellEl, cellMedia, cellLive, cellProgress, offscreen, parseCellShots, preloadCell, revealTimes, showCell, type CellDir, type Rect } from './cells.ts';
import { imagesReady, type Win } from './window.ts';

export type GridLayout = 'two' | 'three' | 'four' | 'bento' | 'six';
type Reveal = 'fade' | 'scale' | 'slide' | 'wipe';
interface P { layout: GridLayout; boxes: string; shots: string; times: string; reveal: Reveal; revealDur: number; from: string; gap: number; margin: number; radius: number; gutter: string; exitAt: number }
interface Cell { wrap: HTMLElement; win: Win }
interface S { ground: HTMLElement; cells: Cell[] }

/** the layouts as shares of the inner box (inside the margin): x, y, w, h, for a tall frame (a wide one swaps x and y) */
export const GRID_LAYOUTS: Record<GridLayout, Array<[number, number, number, number]>> = {
  two: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
  three: [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
  four: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
  bento: [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.25], [0.5, 0.5, 0.5, 0.25], [0, 0.75, 1, 0.25]],
  six: [0, 1, 2].flatMap((r) => [[0, r / 3, 0.5, 1 / 3], [0.5, r / 3, 0.5, 1 / 3]] as Array<[number, number, number, number]>),
};

/** own boxes: "x,y,w,h" frame shares one a line (bad lines dropped) */
function ownBoxes(text: string): Array<[number, number, number, number]> {
  return String(text ?? '').split('\n').map((l) => l.trim().split(',').map(Number))
    .filter((v) => v.length === 4 && v.every(Number.isFinite) && v[2] > 0 && v[3] > 0) as Array<[number, number, number, number]>;
}

/** the cells in px: own `boxes` as given (no gap), else the layout in the box inside the margin, inner edges pulled in by half a gap */
export function gridBoxes(p: Pick<P, 'layout' | 'boxes' | 'gap' | 'margin'>, W: number, H: number): Rect[] {
  const own = ownBoxes(p.boxes);
  if (own.length) return own.map(([x, y, w, h]) => [x * W, y * H, w * W, h * H]);
  const k = Math.min(W, H) / 1080, m = (Number(p.margin) || 0) * k, g = ((Number(p.gap) || 0) * k) / 2, wide = W > H;
  const iw = W - 2 * m, ih = H - 2 * m, eps = 1e-9;
  return (GRID_LAYOUTS[p.layout] ?? GRID_LAYOUTS.bento).map(([a, b, c, d]) => {
    const [fx, fy, fw, fh] = wide ? [b, a, d, c] : [a, b, c, d];
    const l = fx > eps ? g : 0, r = fx + fw < 1 - eps ? g : 0, t = fy > eps ? g : 0, bt = fy + fh < 1 - eps ? g : 0;
    const q = (v: number) => Math.round(v * 1e6) / 1e6;
    return [q(m + fx * iw + l), q(m + fy * ih + t), q(fw * iw - l - r), q(fh * ih - t - bt)];
  });
}

/** a cell `q` of the way in (0 out, 1 settled) */
export function gridMotion(reveal: Reveal, dir: CellDir, q: number, box: Rect, W: number, H: number): { dx: number; dy: number; scale: number; opacity: number; clip: string } {
  const out = { dx: 0, dy: 0, scale: 1, opacity: 1, clip: 'none' };
  if (q >= 1) return out;
  if (reveal === 'fade') return { ...out, opacity: q };
  if (reveal === 'scale') return { ...out, scale: q };
  if (reveal === 'wipe') {
    const c = `${Math.round((1 - q) * 1e4) / 100}%`;
    out.clip = dir === 'left' ? `inset(0 ${c} 0 0)` : dir === 'right' ? `inset(0 0 0 ${c})` : dir === 'top' ? `inset(0 0 ${c} 0)` : `inset(${c} 0 0 0)`;
    return out;
  }
  const [dx, dy] = offscreen(dir, box, W, H);
  return { ...out, dx: dx * (1 - q), dy: dy * (1 - q) };
}

const shotsOf = (p: Partial<P>, count: number) => { const s = parseCellShots(String(p.shots ?? '')); return Array.from({ length: count }, (_, i) => s[i] ?? null); };

export const grid: ItemType<P, S> = {
  type: 'common.grid', label: '網格分割', category: 'frame', kind: 'overlay',
  doc: '乾淨的網格版面：素色底（gutter）上幾個直角、圓角、細縫的格子，每格自己播一段鏡頭，一格一格出現（reveal：fade 淡入、scale 放大、slide 滑入、wipe 擦開，影片跟著格子動）；layout 選版面（two 上下、three 上一下二、four 2×2、bento 一大兩小加一橫條、six 2×3；橫式片自動變左右），boxes 自己寫格子（一行一格「x,y,w,h」畫面比例）；shots 一行一格「素材|素材秒|x,y,zoom|still」（格子出現時從素材秒開始播；still 定格；沒寫的格子是示意圖）；times、from 每格出現的秒和方向（逗號分隔；沒寫的每 0.4 秒一格、左右輪流）；exitAt 之後格子反著收回；格子裡的影片沒有聲音（聲音靠配樂、旁白或軌道上的片段），整頁蓋住時主軌可以不放片段；和漫畫頁不同：沒有黑框線和集中線；合輯、前後比較、清單、一次看好幾個地方',
  params: [
    { key: 'layout', label: '版面（two 上下、three 上一下二、four 2×2、bento 一大兩小加一橫條、six 2×3）', type: 'enum', options: ['two', 'three', 'four', 'bento', 'six'], default: 'bento' },
    { key: 'boxes', label: '自己寫格子（一行一格：x,y,w,h，畫面比例；空＝照版面）', type: 'text', default: '' },
    { key: 'shots', label: '每格的鏡頭（一行一格：素材|素材秒|x,y,zoom|still）', type: 'text', default: '' },
    { key: 'times', label: '每格出現的秒（逗號分隔；空＝每 0.4 秒一格）', type: 'string', default: '' },
    { key: 'reveal', label: '出現方式（fade 淡入、scale 放大、slide 滑入、wipe 擦開）', type: 'enum', options: ['fade', 'scale', 'slide', 'wipe'], default: 'slide' },
    { key: 'revealDur', label: '出現的長度（秒）', type: 'number', min: 0.05, max: 2, step: 0.05, default: 0.45 },
    { key: 'from', label: '滑入、擦開的方向（left、right、top、bottom，逗號分隔或一個值；空＝左右輪流）', type: 'string', default: '' },
    { key: 'gap', label: '格子間的縫（px，短邊 1080）', type: 'number', min: 0, max: 80, step: 1, default: 12 },
    { key: 'margin', label: '外圈留邊（px，短邊 1080）', type: 'number', min: 0, max: 200, step: 1, default: 24 },
    { key: 'radius', label: '格子圓角（px，短邊 1080）', type: 'number', min: 0, max: 120, step: 1, default: 24, theme: 'radius' },
    { key: 'gutter', label: '縫和外圈的顏色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'exitAt', label: '格子收回去的秒（-1＝不收）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
  ],
  media(item) {
    const p = item.params as Partial<P>, count = gridBoxes({ layout: p.layout ?? 'bento', boxes: p.boxes ?? '', gap: 0, margin: 0 }, 1080, 1920).length;
    return cellMedia(shotsOf(p, count), revealTimes(String(p.times ?? ''), count, 0.4), item.end - item.start);
  },
  build(ctx) {
    const ground = abs(ctx.root, { inset: '0' });
    const s: S = { ground, cells: [] };
    grid.draw(ctx, s);   // starts loading the stills now, so ready() can wait for them
    return s;
  },
  ready: (s) => imagesReady(s.cells.map((c) => c.win.img)),
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080;
    const boxes = gridBoxes(p, W, H), n = boxes.length, ats = revealTimes(p.times, n, 0.4), dirs = cellDirs(p.from, n), shots = shotsOf(p, n);
    while (s.cells.length < n) {
      const wrap = abs(ctx.root, { overflow: 'hidden' });
      s.cells.push({ wrap, win: cellEl(wrap) });
    }
    while (s.cells.length > n) s.cells.pop()!.wrap.remove();
    cssCamel(s.ground, { background: p.gutter });
    boxes.forEach((box, i) => {
      const c = s.cells[i], q = cellLive(ats[i], dur) ? cellProgress(local, ats[i], p.revealDur, p.exitAt) : 0;
      if (q <= 0.0005) { cssCamel(c.wrap, { display: 'none' }); if (cellLive(ats[i], dur)) preloadCell(ctx, c.win, shots[i]); return; }
      const m = gridMotion(p.reveal, dirs[i], q, box, W, H), [x, y, w, h] = box;
      cssCamel(c.wrap, { display: 'block', left: `${x.toFixed(2)}px`, top: `${y.toFixed(2)}px`, width: `${w.toFixed(2)}px`, height: `${h.toFixed(2)}px`,
        borderRadius: `${(Math.max(0, p.radius) * k).toFixed(2)}px`, opacity: String(m.opacity), clipPath: m.clip,
        transform: `translate(${m.dx.toFixed(2)}px, ${m.dy.toFixed(2)}px) scale(${m.scale.toFixed(4)})` });
      cssCamel(c.win.box, { left: '0', top: '0' });
      showCell(ctx, c.win, shots[i], local - ats[i], dur - ats[i], w, h);
    });
  },
};
