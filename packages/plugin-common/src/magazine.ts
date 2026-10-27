// common.magazine — a magazine page the footage plays inside, made general from t2-magazine's fx.magPage: magazine stock (common.paper's
// print look), a masthead with the issue line, the issue number and a row of page squares, a rule pair, the page's window (a hole:
// the clip on the track below plays through it; its `frame` is magazineWindow(params, W, H); an overlay, so whatever it draws over
// the window shows), still cells drifting slowly (stills
// "source|seconds|x,y,zoom", '-' a painted stand-in), tags on the cells (a red English chip over a big serif line), the kicker
// chip and the headline over the window (big at first, settling small at settleAt), a pull quote laid over a cell (dark wash, the
// red quote mark, big serif lines that rise or slam, a rule and who said it) and the foot line with the page number.
// layout cover: a huge italic masthead, the window bleeding to the edges, a red banner headline sliding across its foot, cover
// lines on the cells and a barcode. list: the window, then the kicker and headline on the paper and numbered rows coming in one by
// one (a contents page, a top five). back: the footage fills the page under a dark wash, the masthead, a big closing line, a
// second line and a red button with a play mark (where the full film is).
// Tall frames stack the window over the cells; square and wide frames put the cells (and list rows) in a column beside it. Sizes
// go by min(W, H), text keeps 5 % off the edges, every word is a parameter. Fonts: Playfair Display (Google) and Noto Serif TC.
import { abs, clamp, cssCamel, defaultSafe, eBack, eIO3, eOut3, h, type ItemType, lerp, prog, rng, textEm, type Theme } from '@tellcut/engine';
import { parseStills } from './camcorder.ts';
import { canvasAt } from './inkline.ts';
import { paintPrint } from './paper.ts';
import { quoteLines } from './quote.ts';
import { asFrame, imagesReady, showStill, stillRef, windowEl, type Still, type Win } from './window.ts';
import { timeSpan } from './phone.ts';
import { nl } from './text.ts';
import { withAlpha } from './color.ts';

type Layout = 'feature' | 'cover' | 'list' | 'back';
type Rect = [number, number, number, number];
interface P {
  layout: Layout; title: string; issue: string; issueSub: string; no: string; page: number; pages: number; kicker: string; headline: string; deck: string;
  settleAt: number; cells: string; drift: number; tags: string; quote: string; quoteAt: number; quoteEnd: number; quoteCell: number; quoteEn: string;
  quoteBy: string; slam: boolean; items: string; banner: string; bannerEn: string; bannerAt: number; lines: string; linesAt: number; barcode: boolean;
  cta: string; ctaAt: number; foot: string; win: string; aspect: number; paper: string; ink: string; accent: string; display: string; serif: string;
}
interface Tag { box: HTMLElement; wash: HTMLElement; en: HTMLElement; zh: HTMLElement }
interface Row { box: HTMLElement; no: HTMLElement; title: HTMLElement; note: HTMLElement; rule: HTMLElement }
interface S {
  bg: HTMLCanvasElement; bgKey: string; cellsEl: HTMLElement; cells: Win[]; cellKey: string; mast: HTMLElement; issue: HTMLElement; issueSub: HTMLElement;
  no: HTMLElement; squares: HTMLElement; foot: HTMLElement; folio: HTMLElement; kicker: HTMLElement; head: HTMLElement; headLines: HTMLElement[]; headKey: string;
  deck: HTMLElement; tagsEl: HTMLElement; tags: Tag[]; tagKey: string; q: { wrap: HTMLElement; wash: HTMLElement; mark: HTMLElement; en: HTMLElement; body: HTMLElement; rule: HTMLElement; by: HTMLElement; lines: HTMLElement[]; key: string };
  rowsEl: HTMLElement; rows: Row[]; rowKey: string; banner: HTMLElement; bannerTxt: HTMLElement; bannerEn: HTMLElement; covEl: HTMLElement; cov: HTMLElement[]; covKey: string;
  codeCv: HTMLCanvasElement; code: HTMLElement; back: HTMLElement; cta: HTMLElement; ctaTxt: HTMLElement;
}

const play = (f: string) => `'${f || 'Playfair Display'}', 'Playfair Display', 'Noto Serif TC', serif`;
const serifF = (f: string) => `'${f || 'Noto Serif TC'}', 'Noto Serif TC', serif`;
const SHADOW = (k: number, a = 0.6) => `0 ${3 * k}px ${16 * k}px rgba(0,0,0,${a})`;
const pad2 = (n: number) => String(Math.max(0, Math.round(n))).padStart(2, '0');
/** "\n" in a single-line param, or a typed "\\n" / "/" */
const nlLines = (s: string) => nl(s).split('\n').map((x) => x.trim()).filter(Boolean);
const breakLines = (s: string) => nl(s).split(/\n|\//).map((x) => x.trim()).filter(Boolean);

/** Where everything goes in a W×H frame (px). Tall frames: head band, the window, the cells under it; square and wide: the window at
 *  the left, the cells (or the list) in a column. `win` "x,y,w,h" (fractions) puts the window somewhere else; `aspect` > 0 fixes
 *  its shape. tx / ty / fy: the text margins (5 % off the edges and a little more), the foot rule's y. */
export function magazineLayout(p: Pick<P, 'layout' | 'cells' | 'win' | 'aspect'> & { title?: string }, W: number, H: number, safe: Theme['safe'] = defaultSafe(W, H)) {
  const k = Math.min(W, H) / 1080, tall = H / W >= 1.3, gm = 24 * k, gap = 14 * k, layout: Layout = (['feature', 'cover', 'list', 'back'] as const).includes(p.layout) ? p.layout : 'feature';
  const tx = Math.max(0.05 * W + 10 * k, gm + 24 * k), ty = 0.05 * H + 6 * k, fy = 0.95 * H - 30 * k;
  const max = layout === 'cover' ? 2 : layout === 'feature' ? 3 : 0, n = Math.min(max, parseStills(p.cells).length);
  const headTop = ty, headH = 112 * k, top = headTop + headH + 6 * k, bottom = fy - 14 * k, aw = W - 2 * gm, ah = bottom - top;
  let win: Rect = [gm, top, aw, ah], cells: Rect[] = [], mast = 0, mastW = W - 2 * tx - 330 * k, column: Rect = [0, 0, 0, 0];
  const asp = Number(p.aspect) > 0 ? Number(p.aspect) : 0;
  if (layout === 'back') win = [0, 0, W, H];
  else if (layout === 'cover') {
    mastW = tall ? W - 2 * tx - W * 0.3 : W * 0.36 - 2 * tx;
    mast = Math.min(250 * k, mastW / mastEm(p.title ?? 'JOURNAL'));
    if (tall) {
      const wy = ty + mast * 0.86 + 16 * k, cellH = n ? Math.round(H * 0.27) : 0, wh = (n ? H - cellH - gap : H) - wy;
      win = [0, wy, W, asp ? Math.min(wh, W / asp) : wh];
      const cy = H - cellH, cw = n === 2 ? (W - 8 * k) / 2 : W;
      cells = Array.from({ length: n }, (_, i) => [i * (cw + 8 * k), cy, cw, cellH] as Rect);
    } else {
      const cw = W * 0.36;
      win = [cw, 0, W - cw, H];
      const y = H * 0.6, ch = H * 0.4 - 0, w = n === 2 ? (cw - 8 * k) / 2 : cw;
      cells = Array.from({ length: n }, (_, i) => [i * (w + 8 * k), y, w, ch] as Rect);
      column = [tx, ty, cw - 2 * tx + gm, y - ty];
    }
  } else if (layout === 'list') {
    if (tall) { const wh = asp ? Math.min(ah * 0.5, aw / asp) : ah * 0.38; win = [gm, top, aw, wh]; column = [tx, top + wh + 34 * k, W - 2 * tx, bottom - (top + wh + 34 * k)]; }
    else { const ww = asp ? Math.min(aw * 0.62, ah * asp) : aw * 0.52; win = [gm, top, ww, ah]; column = [gm + ww + 44 * k, top + 10 * k, W - (gm + ww + 44 * k) - tx, ah - 10 * k]; }
  } else if (tall) {
    const share = [1, 0.55, 0.5, 0.426][n], wh = asp ? Math.min(ah * 0.7, aw / asp) : ah * share;
    win = [gm, top, aw, wh];
    const y = top + wh + gap, rest = bottom - y;
    if (n === 1) cells = [[gm, y, aw, rest]];
    else if (n === 2) { const w = (aw - gap) / 2; cells = [[gm, y, w, rest], [gm + w + gap, y, w, rest]]; }
    else if (n === 3) { const h0 = (rest - gap) * 0.6, w = (aw - gap) / 2, y2 = y + h0 + gap; cells = [[gm, y, aw, h0], [gm, y2, w, bottom - y2], [gm + w + gap, y2, w, bottom - y2]]; }
  } else {
    const ww = n === 0 ? aw : asp ? Math.min(aw * 0.72, ah * asp) : aw * 0.6;
    win = [gm, top, ww, ah];
    const x = gm + ww + gap, cw = W - gm - x;
    if (n === 1) cells = [[x, top, cw, ah]];
    else if (n === 2) { const hh = (ah - gap) / 2; cells = [[x, top, cw, hh], [x, top + hh + gap, cw, hh]]; }
    else if (n === 3) { const h0 = (ah - gap) * 0.56, w = (cw - gap) / 2, y2 = top + h0 + gap; cells = [[x, top, cw, h0], [x, y2, w, bottom - y2], [x + w + gap, y2, w, bottom - y2]]; }
  }
  const v = String(p.win ?? '').split(/[,\s]+/).filter(Boolean).map(Number);
  if (v.length === 4 && v.every(Number.isFinite)) win = [v[0] * W, v[1] * H, v[2] * W, v[3] * H];
  void safe;
  return { k, tall, layout, gm, tx, ty, fy, headTop, headH, top, bottom, win, cells, mast, mastW, column, n };
}

/** the window as the clip's `frame` (fractions); `params` as given to the item (the rest are the defaults) */
export function magazineWindow(params: Partial<P> = {}, W = 1080, H = 1920, safe?: Theme['safe']) {
  const p = { layout: params.layout ?? 'feature', cells: params.cells ?? DEFAULT_CELLS, win: params.win ?? '', aspect: params.aspect ?? 0, title: params.title ?? 'JOURNAL' } as P;
  return asFrame(magazineLayout(p, W, H, safe).win, W, H);
}

/** "seconds[-seconds]|cell|EN|中文" lines: tags on the cells */
export function parseTags(text: string) {
  return nl(text).split('\n').map((l) => l.split('|').map((x) => x.trim())).map(([t, cell, en, zh]) => ({ span: timeSpan(t ?? ''), cell: Math.round(Number(cell) || 0), en: en ?? '', zh: zh ?? '' }))
    .filter((x) => x.span && (x.en || x.zh)).map((x) => ({ at: x.span![0], until: x.span![1], cell: x.cell, en: x.en, zh: x.zh }));
}
/** "seconds|title|note" lines: the list layout's rows */
export function parseItems(text: string) {
  return nl(text).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x.length >= 2 && x[1])
    .map(([t, title, note]) => ({ at: Number(t) || 0, title, note: note ?? '' })).slice(0, 8);
}
/** a cell's still at `local`: its crop pushed in slowly (`drift` of zoom a second, 12 % at most), every other cell pulling out */
export function cellCrop(s: Still, i: number, local: number, drift: number) {
  const c = s.crop ?? { x: 0.5, y: 0.5, zoom: 1 }, d = Math.min(0.12, Math.max(0, drift) * Math.max(0, local));
  return { ...c, zoom: c.zoom * (i % 2 ? 1 + 0.12 - d : 1 + d) };
}

const DEFAULT_CELLS = '-\n-\n-';
/** the width of a masthead in em of Playfair Display italic 900 (an estimate: capitals are wide), for the layout */
export const mastEm = (s: string) => [...String(s ?? '')].reduce((w, c) => w + (/[A-Z]/.test(c) ? 0.8 : /[a-z]/.test(c) ? 0.56 : /[0-9]/.test(c) ? 0.62 : c === ' ' ? 0.28 : /[\u2E80-\uFFFF]/.test(c) ? 1 : 0.42), 0) || 1;
let measurer: CanvasRenderingContext2D | null = null;
/** the drawn width of `text` in `font` (a CSS font), px */
const measure = (text: string, font: string) => { measurer ??= document.createElement('canvas').getContext('2d'); if (!measurer) return 0; measurer.font = font; return measurer.measureText(text).width; };
const line = (parent: HTMLElement, css: Record<string, string> = {}) => abs(parent, { whiteSpace: 'pre', lineHeight: '1', ...css });

/** the paper with the window cut out, the rules, the cells' and the window's ink borders, the barcode's bars */
function paintPage(c: HTMLCanvasElement, p: P, W: number, H: number, L: ReturnType<typeof magazineLayout>) {
  const g = canvasAt(c, W, H), { k, win } = L;
  if (L.layout === 'back') return;
  paintPrint(g, p.paper, W, H, k);
  g.clearRect(win[0], win[1], win[2], win[3]);
  g.strokeStyle = p.ink; g.lineWidth = 2 * k;
  const edged = L.layout !== 'cover';
  if (edged) for (const r of [win, ...L.cells]) g.strokeRect(r[0] + k, r[1] + k, r[2] - 2 * k, r[3] - 2 * k);
  g.fillStyle = p.ink;
  if (L.layout === 'feature' || L.layout === 'list') {
    const y = L.headTop + L.headH - 14 * k;
    g.fillRect(L.gm, y, W - 2 * L.gm, 4 * k); g.fillRect(L.gm, y + 8 * k, W - 2 * L.gm, 1.5 * k);
    g.fillRect(L.gm, L.fy, W - 2 * L.gm, 1.5 * k);
  }
  if (L.layout === 'cover') { if (L.tall) g.fillRect(0, win[1] - 10 * k, W, 4 * k); else g.fillRect(win[0] - 10 * k, 0, 4 * k, H); }
}

/** the barcode's bars (seeded) in a w × h box at x, y */
function bars(g: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, ink: string) {
  const r = rng(77);
  g.fillStyle = '#ffffff'; g.fillRect(x - 10 * (w / 170), y - 10 * (w / 170), w + 20 * (w / 170), hh + 46 * (w / 170));
  g.fillStyle = ink;
  let px = x;
  const u = w / 170;
  while (px < x + w) { const bw = (1 + Math.floor(r() * 4)) * u; if (r() > 0.42) g.fillRect(px, y, Math.min(bw, x + w - px), hh); px += bw + u; }
}

export const magazine: ItemType<P, S> = {
  type: 'common.magazine', label: '雜誌頁', category: 'frame', kind: 'overlay',
  doc: '雜誌的一頁，影片從版面上的影片格（洞）播出來（主軌片段 frame＝magazineWindow(參數)）：雜誌紙、刊頭（title）＋期別（issue／issueSub）、期號與頁碼（no／page）和一排頁碼方塊、雙線；layout feature 內頁：影片格下面幾格慢慢推近的靜態圖（cells「素材|秒|x,y,zoom」，- 是畫的示意圖）、格子上的標籤（tags「秒|格|EN|中文」）、影片左上紅底欄目（kicker）＋白色大標（headline，settleAt 縮小）、拉引言疊在格子上（quote＋quoteAt，slam 砸下、quoteEn 英文小字、quoteBy 出處）、頁腳；cover 封面：超大斜體刊頭、出血大影片、紅色橫幅大標滑進（banner／bannerEn）、下方格子上的封面標（lines）、條碼；list 清單頁：影片在上、紙上欄目＋大標、編號清單一列列進來（items「秒|標題|說明」，目錄、排行）；back 封底：影片滿版壓暗、刊頭、收尾大字（headline／deck）、紅色播放按鈕（cta）；直式影片在上格子在下，方形、橫式格子在右；專訪、旅行特刊、人物誌、開箱、排行；換頁配 common.wipe mode curl',
  params: [
    { key: 'layout', label: '版型（feature 內頁、cover 封面、list 清單頁、back 封底）', type: 'enum', options: ['feature', 'cover', 'list', 'back'], default: 'feature' },
    { key: 'title', label: '刊頭（雜誌名）', type: 'string', default: 'JOURNAL' },
    { key: 'issue', label: '期別（英文小字）', type: 'string', default: 'THE SUMMER ISSUE' },
    { key: 'issueSub', label: '期別（中文）', type: 'string', default: '夏日特刊' },
    { key: 'no', label: '期號', type: 'string', default: 'No.01' },
    { key: 'page', label: '頁碼', type: 'number', min: 0, max: 99, step: 1, default: 2 },
    { key: 'pages', label: '頁碼方塊數（0＝不顯示）', type: 'number', min: 0, max: 12, step: 1, default: 5 },
    { key: 'kicker', label: '欄目（紅底小字；空＝沒有）', type: 'string', default: 'FEATURE' },
    { key: 'headline', label: '大標（\\n 換行）', type: 'text', default: '慢慢走，\n慢慢看' },
    { key: 'deck', label: '副標（大標下的一行）', type: 'string', default: '' },
    { key: 'settleAt', label: '大標縮小的時間（秒；-1＝不縮）', type: 'number', min: -1, max: 600, step: 0.05, default: 2.4 },
    { key: 'cells', label: '靜圖格「素材|秒|x,y,zoom」一行一格（- 是示意圖；內頁最多 3 格、封面 2 格）', type: 'text', default: DEFAULT_CELLS },
    { key: 'drift', label: '靜圖每秒推近多少（0＝不動）', type: 'number', min: 0, max: 0.1, step: 0.001, default: 0.012 },
    { key: 'tags', label: '格子上的標籤「秒[-秒]|格|EN|中文」一行一個', type: 'text', default: '' },
    { key: 'quote', label: '拉引言（\\n 換行）', type: 'text', default: '' },
    { key: 'quoteAt', label: '拉引言出現的時間（秒；-1＝沒有）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'quoteEnd', label: '拉引言收起的時間（秒；-1＝留到最後）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'quoteCell', label: '拉引言疊在第幾格（-1＝影片格上）', type: 'number', min: -1, max: 2, step: 1, default: 0 },
    { key: 'quoteEn', label: '拉引言上方的英文小字', type: 'string', default: '' },
    { key: 'quoteBy', label: '拉引言出處', type: 'string', default: '' },
    { key: 'slam', label: '拉引言砸下（大字從大縮回、閃一下）', type: 'bool', default: false },
    { key: 'items', label: '清單頁：每列「秒|標題|說明」（最多 8 列）', type: 'text', default: '0.6|第一站|早上的市場\n1.0|第二站|海邊的咖啡\n1.4|第三站|山上的老城' },
    { key: 'banner', label: '封面：紅色橫幅大標', type: 'string', default: '本期特輯' },
    { key: 'bannerEn', label: '封面：橫幅下的英文小字', type: 'string', default: 'THE SPECIAL ISSUE' },
    { key: 'bannerAt', label: '封面：橫幅滑進來的時間（秒）', type: 'number', min: 0, max: 600, step: 0.05, default: 0.3 },
    { key: 'lines', label: '封面：格子上的封面標（一行一格，/ 換行）', type: 'text', default: '號稱世上/最慢的城市\n當地人/專訪' },
    { key: 'linesAt', label: '封面：封面標出現的時間（秒）', type: 'number', min: 0, max: 600, step: 0.05, default: 1.2 },
    { key: 'barcode', label: '封面、封底：條碼', type: 'bool', default: true },
    { key: 'cta', label: '封底：紅色按鈕的字（空＝沒有）', type: 'string', default: '完整版看長片' },
    { key: 'ctaAt', label: '封底：按鈕出現的時間（秒）', type: 'number', min: 0, max: 600, step: 0.05, default: 1.1 },
    { key: 'foot', label: '頁腳（空＝刊頭・期別）', type: 'string', default: '' },
    { key: 'win', label: '影片格「x,y,寬,高」（畫面比例；空＝依版型）', type: 'string', default: '' },
    { key: 'aspect', label: '影片格的寬高比（寬÷高；0＝依版型）', type: 'number', min: 0, max: 3, step: 0.01, default: 0 },
    { key: 'paper', label: '紙色', type: 'color', default: '#f1ebdf', theme: 'palette.paper' },
    { key: 'ink', label: '墨色', type: 'color', default: '#161412', theme: 'palette.ink' },
    { key: 'accent', label: '紅色（欄目、橫幅、引號、按鈕）', type: 'color', default: '#c3122f', theme: 'palette.accent' },
    { key: 'display', label: '英文標題字型', type: 'string', default: 'Playfair Display' },
    { key: 'serif', label: '中文明體字型', type: 'string', default: 'Noto Serif TC' },
  ],
  media(item) {
    const p = item.params as Partial<P>;
    return { videos: [], stills: parseStills(p.cells ?? DEFAULT_CELLS).filter((s) => s.source).map((s) => stillRef(s)) };
  },
  build(ctx) {
    const root = ctx.root, bg = h('canvas', null, null, root) as HTMLCanvasElement;
    cssCamel(bg, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    const back = abs(root, { inset: '0' }), cellsEl = abs(root, { inset: '0' }), tagsEl = abs(root, { inset: '0' });
    const qwrap = abs(root, { overflow: 'hidden' }), q = { wrap: qwrap, wash: abs(qwrap, { inset: '0' }), mark: line(qwrap), en: line(qwrap, { fontStyle: 'italic', fontWeight: '700' }), body: abs(qwrap), rule: abs(qwrap), by: line(qwrap, { fontWeight: '700' }), lines: [] as HTMLElement[], key: '' };
    const s: S = {
      bg, bgKey: '', cellsEl, cells: [], cellKey: '', mast: line(root, { fontStyle: 'italic', fontWeight: '900' }), issue: line(root, { fontWeight: '700', letterSpacing: '0.02em' }), issueSub: line(root, { fontWeight: '700' }),
      no: line(root, { fontWeight: '900' }), squares: abs(root), foot: line(root, { fontWeight: '700' }), folio: line(root, { fontWeight: '700' }),
      kicker: line(root, { fontWeight: '900', color: '#ffffff' }), head: abs(root), headLines: [], headKey: '', deck: line(root, { fontWeight: '700' }),
      tagsEl, tags: [], tagKey: '', q, rowsEl: abs(root, { inset: '0' }), rows: [], rowKey: '',
      banner: abs(root), bannerTxt: line(root, { fontWeight: '900', color: '#ffffff', textAlign: 'center' }), bannerEn: line(root, { fontStyle: 'italic', fontWeight: '700', color: '#ffffff', textAlign: 'center' }),
      covEl: abs(root, { inset: '0' }), cov: [], covKey: '', codeCv: h('canvas', null, null, root) as HTMLCanvasElement, code: line(root, { fontWeight: '700', textAlign: 'center' }), back,
      cta: abs(root), ctaTxt: line(root, { fontWeight: '900', color: '#ffffff' }),
    };
    magazine.draw(ctx, s);   // starts loading the cells' stills now, so ready() can wait for them
    return s;
  },
  async ready(s) {
    await imagesReady(s.cells.map((c) => c.img));
    if (typeof document === 'undefined' || !document.fonts) return;
    await Promise.all(["italic 900 40px 'Playfair Display'", "900 40px 'Playfair Display'", "700 40px 'Playfair Display'", "italic 700 40px 'Playfair Display'", "900 40px 'Noto Serif TC'", "700 40px 'Noto Serif TC'"]
      .map((f) => document.fonts.load(f, 'JOURNAL 永').catch(() => [])));
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local: t, theme } = ctx, L = magazineLayout(p, W, H, theme.safe), { k, win, layout } = L;
    const disp = play(p.display), ser = serifF(p.serif), white = '#ffffff';
    const bgKey = JSON.stringify([W, H, layout, win, L.cells, p.paper, p.ink, p.barcode]);
    if (s.bgKey !== bgKey) {
      s.bgKey = bgKey; paintPage(s.bg, p, W, H, L);
      const b = barcodeBox(L, W, H), m = 12 * k, coded = p.barcode && (layout === 'cover' || layout === 'back');
      cssCamel(s.codeCv, { position: 'absolute', display: coded ? 'block' : 'none', left: `${b[0] - m}px`, top: `${b[1] - m}px`, width: `${b[2] + 2 * m}px`, height: `${b[3] + 2 * m + 40 * k}px` });
      if (coded) bars(canvasAt(s.codeCv, b[2] + 2 * m, b[3] + 2 * m + 40 * k), m, m, b[2], b[3], p.ink);
    }
    // the back cover's wash over the full-page footage
    cssCamel(s.back, { display: layout === 'back' ? 'block' : 'none', background: 'linear-gradient(180deg, rgba(10,8,6,0.55) 0%, rgba(10,8,6,0.35) 45%, rgba(10,8,6,0.7) 100%)' });
    // the cells: stills pushed in slowly
    const stills = parseStills(p.cells).slice(0, L.n), cellKey = String(stills.length);
    if (s.cellKey !== cellKey) { s.cellKey = cellKey; s.cellsEl.replaceChildren(); s.cells = stills.map(() => windowEl(s.cellsEl)); }
    stills.forEach((st, i) => {
      const r = L.cells[i], w = s.cells[i];
      cssCamel(w.box, { left: `${r[0]}px`, top: `${r[1]}px` });
      showStill(ctx.media, w, st.source ? { ...st, crop: cellCrop(st, i, t, p.drift) } : null, r[2], r[3]);
    });
    // head band (feature, list): the masthead, the issue lines, No. and page, the page squares; the foot
    const band = layout === 'feature' || layout === 'list', mpx0 = band ? 84 * k : L.mast, mw0 = measure(p.title, `italic 900 ${mpx0}px ${disp}`) || mastEm(p.title) * mpx0;
    const mpx = mw0 > L.mastW ? mpx0 * L.mastW / mw0 : mpx0, mastW = Math.min(mw0, L.mastW);
    s.mast.textContent = p.title;
    const mastY = band ? L.headTop : L.ty;
    cssCamel(s.mast, { display: layout === 'back' ? 'none' : 'block', left: `${band || L.tall ? L.tx - 6 * k : L.tx - 6 * k}px`, top: `${mastY - mpx * 0.12}px`, fontFamily: disp, fontSize: `${mpx}px`, color: p.ink, letterSpacing: `${-0.01 * mpx}px` });
    s.issue.textContent = p.issue; s.issueSub.textContent = p.issueSub;
    if (band) {
      const ix = L.tx + mastW + 18 * k;
      cssCamel(s.issue, { display: p.issue ? 'block' : 'none', left: `${ix}px`, top: `${mastY + 12 * k}px`, textAlign: 'left', transform: 'none', width: 'auto', whiteSpace: 'pre', lineHeight: '1', fontFamily: disp, fontSize: `${24 * k}px`, color: p.accent });
      cssCamel(s.issueSub, { display: p.issueSub ? 'block' : 'none', left: `${ix}px`, top: `${mastY + 46 * k}px`, textAlign: 'left', transform: 'none', fontFamily: ser, fontSize: `${28 * k}px`, color: p.ink });
    } else if (layout === 'cover') {
      const rx = L.tall ? W - L.tx : L.tx, al = L.tall ? 'right' : 'left', iy = L.tall ? L.ty + 8 * k : L.ty + mpx * 0.95;
      const tr = L.tall ? 'translateX(-100%)' : 'none';
      cssCamel(s.issue, { display: p.issue ? 'block' : 'none', left: `${rx}px`, top: `${iy}px`, textAlign: al, transform: tr, fontFamily: disp, fontSize: `${30 * k}px`, color: p.accent, whiteSpace: 'pre-wrap', width: L.tall ? `${W * 0.3 - 10 * k}px` : `${W * 0.36 - 2 * L.tx}px`, lineHeight: '1.2' });
      cssCamel(s.issueSub, { display: p.issueSub ? 'block' : 'none', left: `${rx}px`, top: `${iy + 46 * k}px`, textAlign: al, transform: tr, fontFamily: ser, fontSize: `${34 * k}px`, color: p.ink });
    } else { cssCamel(s.issue, { display: 'none' }); cssCamel(s.issueSub, { display: 'none' }); }
    s.no.textContent = p.page > 0 ? `${p.no} · P.${pad2(p.page)}` : p.no;
    cssCamel(s.no, { display: band && (p.no || p.page > 0) ? 'block' : 'none', left: `${W - L.tx}px`, top: `${mastY + 8 * k}px`, transform: 'translateX(-100%)', fontFamily: disp, fontSize: `${34 * k}px`, color: p.ink });
    const nsq = band ? Math.max(0, Math.min(12, Math.round(p.pages))) : 0;
    if (s.squares.childElementCount !== nsq) { s.squares.replaceChildren(); for (let i = 0; i < nsq; i++) abs(s.squares); }
    [...s.squares.children].forEach((e, i) => cssCamel(e as HTMLElement, { left: `${W - L.tx - (nsq - i) * 30 * k + 8 * k}px`, top: `${mastY + 54 * k}px`, width: `${22 * k}px`, height: `${22 * k}px`, background: i < p.page ? p.accent : withAlpha(p.ink, 0.18) }));
    const footTxt = p.foot || [p.title, p.issue].filter(Boolean).join(' · ');
    s.foot.textContent = footTxt; s.folio.textContent = p.page > 0 ? `— ${pad2(p.page)} —` : '';
    for (const [e, x, tr] of [[s.foot, L.tx, 'none'], [s.folio, W - L.tx, 'translateX(-100%)']] as const)
      cssCamel(e, { display: band ? 'block' : 'none', left: `${x}px`, top: `${L.fy + 8 * k}px`, transform: tr, fontFamily: disp, fontSize: `${20 * k}px`, color: withAlpha(p.ink, 0.72), letterSpacing: `${1 * k}px` });
    drawHeadline(ctx, s, L, disp, ser);
    drawTags(ctx, s, L, disp, ser);
    drawQuote(ctx, s, L, disp, ser);
    drawRows(ctx, s, L, disp, ser);
    // cover: the red banner sliding in across the window's foot, the cover lines on the cells
    const cover = layout === 'cover', bp = cover ? eOut3(prog(t, p.bannerAt, p.bannerAt + 0.28)) : 0;
    const bh = 200 * k, by = L.tall ? (L.cells.length ? L.cells[0][1] - bh * 0.62 : win[1] + win[3] - bh - 40 * k) : H * 0.62 - bh / 2, bx0 = L.tall ? 0 : win[0], bw = W - bx0;
    cssCamel(s.banner, { display: cover && p.banner && bp > 0 ? 'block' : 'none', left: `${lerp(bx0 - bw, bx0, bp)}px`, top: `${by}px`, width: `${bw}px`, height: `${bh}px`, background: p.accent, boxShadow: `0 ${8 * k}px ${24 * k}px rgba(0,0,0,0.4)` });
    const bpx = Math.min(116 * k, (bw - 80 * k) / Math.max(1, textEm(p.banner))), sc = lerp(1.3, 1, eBack(clamp((t - p.bannerAt - 0.1) / 0.35), 1.6));
    s.bannerTxt.textContent = p.banner;
    cssCamel(s.bannerTxt, { display: cover && p.banner && bp > 0 ? 'block' : 'none', left: `${lerp(bx0 - bw, bx0, bp) + bw / 2}px`, top: `${by + bh * 0.42}px`, transform: `translate(-50%, -50%) scale(${sc.toFixed(4)})`, fontFamily: ser, fontSize: `${bpx}px` });
    s.bannerEn.textContent = p.bannerEn;
    cssCamel(s.bannerEn, { display: cover && p.bannerEn && bp > 0 ? 'block' : 'none', left: `${bx0 + bw / 2}px`, top: `${by + bh - 44 * k}px`, transform: 'translateX(-50%)', fontFamily: disp, fontSize: `${30 * k}px`, opacity: String(eOut3(prog(t, p.bannerAt + 0.4, p.bannerAt + 0.8))) });
    const covs = cover ? nl(p.lines).split('\n').map(breakLines).filter((x) => x.length).slice(0, Math.max(1, L.cells.length)) : [];
    const covKey = JSON.stringify(covs);
    if (s.covKey !== covKey) { s.covKey = covKey; s.covEl.replaceChildren(); s.cov = covs.map(() => abs(s.covEl, { whiteSpace: 'pre', lineHeight: '1.18', fontWeight: '900' })); }
    covs.forEach((ls, i) => {
      const e = s.cov[i], r = L.cells[i] ?? [L.column[0], L.column[1] + L.column[3] * 0.5, L.column[2], L.column[3] * 0.5], right = i % 2 === 1 && L.tall, q = eOut3(prog(t, p.linesAt + i * 0.5, p.linesAt + i * 0.5 + 0.4));
      const x = right ? Math.min(r[0] + r[2] - 30 * k, W - L.tx) : Math.max(r[0] + 30 * k, L.tx), room = right ? x - r[0] - 20 * k : r[0] + r[2] - x - 20 * k;
      const px = Math.min(56 * k, room / Math.max(1, ...ls.map(textEm)));
      e.textContent = ls.join('\n');
      cssCamel(e, { left: `${x}px`, top: `${r[1] + (L.cells[i] && L.tall ? 120 : 50) * k}px`, textAlign: right ? 'right' : 'left', fontFamily: ser, fontSize: `${px}px`, color: L.cells[i] ? white : p.ink,
        textShadow: L.cells[i] ? SHADOW(k, 0.75) : 'none', opacity: String(q), transform: `${right ? 'translateX(-100%) ' : ''}translateX(${(1 - q) * (right ? 30 : -30) * k}px)` });
    });
    // the barcode's number
    const bc = barcodeBox(L, W, H), coded = p.barcode && (cover || layout === 'back');
    s.code.textContent = '9 771234 567003';
    cssCamel(s.code, { display: coded ? 'block' : 'none', left: `${bc[0] + bc[2] / 2}px`, top: `${bc[1] + bc[3] + 8 * k}px`, transform: 'translateX(-50%)', fontFamily: disp, fontSize: `${18 * (bc[2] / 170)}px`, color: p.ink });
    // back cover: the button with a play mark
    const back = layout === 'back', cp = back && p.cta ? eOut3(prog(t, p.ctaAt, p.ctaAt + 0.45)) : 0, cs = lerp(0.9, 1, eBack(clamp((t - p.ctaAt) / 0.5), 1.6));
    const cpx = 80 * k, cw = Math.min(W - 2 * L.tx, textEm(p.cta) * cpx + 220 * k), chh = 150 * k, cy = backLines(L, H).cta;
    cssCamel(s.cta, { display: cp > 0 ? 'block' : 'none', left: `${L.tx}px`, top: `${cy}px`, width: `${cw}px`, height: `${chh}px`, background: p.accent, opacity: String(cp), transform: `scale(${cs.toFixed(4)})`, transformOrigin: '50% 50%',
      boxShadow: `0 ${8 * k}px ${26 * k}px rgba(0,0,0,0.45)`, clipPath: 'none' });
    s.ctaTxt.textContent = p.cta;
    cssCamel(s.ctaTxt, { display: cp > 0 ? 'block' : 'none', left: `${L.tx + 140 * k}px`, top: `${cy + chh / 2}px`, transform: `translateY(-50%) scale(${cs.toFixed(4)})`, transformOrigin: `${-140 * k + cw / 2}px 50%`, fontFamily: ser, fontSize: `${Math.min(cpx, (cw - 180 * k) / Math.max(1, textEm(p.cta)))}px`, opacity: String(cp) });
    if (cp > 0 && !s.cta.firstChild) { const tri = abs(s.cta); cssCamel(tri, { background: '#ffffff', clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }); }
    if (s.cta.firstChild) cssCamel(s.cta.firstChild as HTMLElement, { left: `${50 * k}px`, top: `${42 * k}px`, width: `${54 * k}px`, height: `${chh - 84 * k}px` });
  },
  hide(s) { s.bg.width = 1; s.bg.height = 1; s.bgKey = ''; },
};

/** where the barcode goes: the cover's last cell (or the column) at the lower right, the back cover's right side */
function barcodeBox(L: ReturnType<typeof magazineLayout>, W: number, H: number): Rect {
  const { k } = L, w = 170 * k, hh = 80 * k;
  if (L.layout === 'back') return [W - L.tx - w, Math.min(H * 0.68, 0.95 * H - 160 * k), w, hh];
  if (!L.tall) return [L.column[0] + L.column[2] - w - 10 * k, H * 0.6 - hh - 70 * k, w, hh];
  return [W - L.tx - w, Math.min(H - 170 * k, 0.95 * H - 130 * k), w, hh];
}
/** the back cover's lines: masthead, issue rule, big line, second line, button (y in px) */
function backLines(L: ReturnType<typeof magazineLayout>, H: number) {
  const { k, ty } = L, y0 = L.tall ? Math.max(ty, H * 0.16) : ty + 10 * k;
  return { mast: y0, issue: y0 + 130 * k, rule: y0 + 176 * k, big: y0 + (L.tall ? 260 : 220) * k, second: y0 + (L.tall ? 470 : 410) * k, cta: y0 + (L.tall ? 580 : 510) * k };
}

/** the kicker chip and the headline: over the window's top left (feature: white, big then settling small), on the paper (list), at
 *  the top of the back cover (white, big); the deck under it */
function drawHeadline(ctx: Parameters<typeof magazine.draw>[0], s: S, L: ReturnType<typeof magazineLayout>, disp: string, ser: string) {
  const p = ctx.params, t = ctx.local, { k, win, layout } = L, lines = nlLines(p.headline);
  const show = layout !== 'cover', onPhoto = layout === 'feature' || layout === 'back', back = layout === 'back';
  const a = eOut3(prog(t, 0.35, 0.75));
  let x = win[0] + 28 * k, y = Math.max(win[1] + 26 * k, L.ty + 20 * k);
  if (layout === 'list') { x = L.column[0]; y = L.column[1]; }
  if (back) { const b = backLines(L, ctx.H); x = L.tx; y = b.big; }
  const kick = p.kicker ? (p.page > 0 && !back ? `P.${pad2(p.page)}  ${p.kicker}` : p.kicker) : '';
  s.kicker.textContent = kick;
  cssCamel(s.kicker, { display: show && kick && !back ? 'block' : 'none', left: `${x}px`, top: `${y}px`, fontFamily: disp, fontSize: `${30 * k}px`, background: p.accent, padding: `${10 * k}px ${15 * k}px`, opacity: String(a) });
  const big = p.settleAt >= 0 && layout === 'feature' ? 1 - eIO3(prog(t, p.settleAt, p.settleAt + 0.6)) : 1;
  const maxW = (layout === 'list' ? L.column[2] : back ? ctx.W - 2 * L.tx : win[2] - 56 * k), em = Math.max(1, ...lines.map(textEm));
  const px = back ? Math.min(150 * k, maxW / em) : layout === 'list' ? Math.min(84 * k, maxW / em) : Math.min(lerp(56, 76, big) * k, maxW / em);
  const key = JSON.stringify(lines);
  if (s.headKey !== key) { s.headKey = key; s.head.replaceChildren(); s.headLines = lines.map(() => line(s.head, { fontWeight: '900' })); }
  const top = y + (kick && !back ? 50 * k + 16 * k : 0);
  s.headLines.forEach((e, i) => {
    const q = eOut3(prog(t, (back ? 0.5 : 0.55) + i * 0.12, (back ? 1 : 1) + i * 0.12));
    e.textContent = lines[i];
    cssCamel(e, { left: `${x}px`, top: `${top + px * 1.14 * i + (1 - q) * 20 * k}px`, fontFamily: ser, fontSize: `${px}px`, color: onPhoto ? '#ffffff' : p.ink, textShadow: onPhoto ? SHADOW(k, 0.7) : 'none', opacity: String(show ? a * q : 0) });
  });
  const deckY = top + px * 1.14 * lines.length + 18 * k, dq = eOut3(prog(t, back ? 1.0 : 0.9, back ? 1.45 : 1.3));
  s.deck.textContent = p.deck;
  cssCamel(s.deck, { display: show && p.deck ? 'block' : 'none', left: `${x}px`, top: `${back ? backLines(L, ctx.H).second : deckY}px`, fontFamily: ser, fontSize: `${(back ? 76 : layout === 'list' ? 36 : 34) * k}px`,
    color: onPhoto ? '#ffffff' : withAlpha(p.ink, 0.75), textShadow: onPhoto ? SHADOW(k, 0.6) : 'none', opacity: String(dq) });
  // the back cover's masthead and issue line (white, on the footage)
  if (back) {
    const b = backLines(L, ctx.H), mp = Math.min(120 * k, (ctx.W - 2 * L.tx) / mastEm(p.title));
    s.mast.textContent = p.title;
    cssCamel(s.mast, { display: 'block', left: `${L.tx}px`, top: `${b.mast}px`, fontFamily: disp, fontSize: `${mp}px`, color: '#ffffff', letterSpacing: '0' });
    s.issue.textContent = [p.issue, p.no].filter(Boolean).join(' · ');
    cssCamel(s.issue, { display: s.issue.textContent ? 'block' : 'none', left: `${L.tx}px`, top: `${b.issue}px`, transform: 'none', textAlign: 'left', fontFamily: disp, fontSize: `${30 * k}px`, color: '#ffffff', width: 'auto', whiteSpace: 'pre' });
    cssCamel(s.squares, { display: 'none' });
    if (!s.back.firstChild) abs(s.back);
    cssCamel(s.back.firstChild as HTMLElement, { left: `${L.tx}px`, top: `${b.rule}px`, width: `${ctx.W - 2 * L.tx}px`, height: `${3 * k}px`, background: '#ffffff' });
  } else cssCamel(s.squares, { display: 'block' });
}

/** tags on the cells: a dark gradient up from the cell's foot, a red chip with the English words, the big serif line */
function drawTags(ctx: Parameters<typeof magazine.draw>[0], s: S, L: ReturnType<typeof magazineLayout>, disp: string, ser: string) {
  const p = ctx.params, t = ctx.local, k = L.k, tags = L.layout === 'feature' ? parseTags(p.tags).filter((x) => L.cells[x.cell]) : [], key = String(tags.length);
  if (s.tagKey !== key) {
    s.tagKey = key; s.tagsEl.replaceChildren();
    s.tags = tags.map(() => { const box = abs(s.tagsEl, { overflow: 'hidden' }); return { box, wash: abs(box), en: line(box, { fontStyle: 'italic', fontWeight: '900', color: '#ffffff' }), zh: line(box, { fontWeight: '900', color: '#ffffff' }) }; });
  }
  tags.forEach((g, i) => {
    const e = s.tags[i], r = L.cells[g.cell], a = eOut3(prog(t, g.at, g.at + 0.4)) * (g.until !== undefined ? 1 - eOut3(prog(t, g.until, g.until + 0.3)) : 1), sl = (1 - eOut3(prog(t, g.at, g.at + 0.5))) * 30 * k;
    cssCamel(e.box, { display: a > 0 ? 'block' : 'none', left: `${r[0]}px`, top: `${r[1]}px`, width: `${r[2]}px`, height: `${r[3]}px`, opacity: String(a) });
    const gh = Math.min(250 * k, r[3]);
    cssCamel(e.wash, { left: '0', right: '0', bottom: '0', height: `${gh}px`, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 100%)' });
    const zpx = Math.min(72 * k, (r[2] - 60 * k) / Math.max(1, textEm(g.zh))), x = Math.max(30 * k, L.tx - r[0]);
    e.en.textContent = g.en; e.zh.textContent = g.zh;
    cssCamel(e.en, { display: g.en ? 'block' : 'none', left: `${x - sl}px`, bottom: `${36 * k + zpx * 1.15 + 14 * k}px`, fontFamily: disp, fontSize: `${30 * k}px`, background: p.accent, padding: `${7 * k}px ${13 * k}px` });
    cssCamel(e.zh, { display: g.zh ? 'block' : 'none', left: `${x + sl}px`, bottom: `${36 * k}px`, fontFamily: ser, fontSize: `${zpx}px`, textShadow: SHADOW(k, 0.7) });
  });
}

/** the pull quote over a cell (or the window): a dark wash, the red quote mark, the English line, the lines rising one by one (or
 *  slamming down from 1.35× after a white flash), a red rule and who said it */
function drawQuote(ctx: Parameters<typeof magazine.draw>[0], s: S, L: ReturnType<typeof magazineLayout>, disp: string, ser: string) {
  const p = ctx.params, t = ctx.local, k = L.k, q = s.q, lines = quoteLines(p.quote).map((w) => w.join(' ')).filter(Boolean);
  const on = (L.layout === 'feature' || L.layout === 'list') && p.quoteAt >= 0 && lines.length > 0;
  const r = (p.quoteCell >= 0 && L.cells[p.quoteCell]) || L.win, end = p.quoteEnd >= 0 ? p.quoteEnd : 1e9;
  const a = on ? eOut3(prog(t, p.quoteAt, p.quoteAt + (p.slam ? 0.12 : 0.35))) * (1 - eOut3(prog(t, end, end + 0.35))) : 0;
  cssCamel(q.wrap, { display: a > 0 ? 'block' : 'none', left: `${r[0]}px`, top: `${r[1]}px`, width: `${r[2]}px`, height: `${r[3]}px`, opacity: String(a) });
  if (a <= 0) return;
  const fl = p.slam ? 1 - clamp((t - p.quoteAt) / 0.25) : 0;
  cssCamel(q.wash, { background: `rgba(14,10,8,${p.slam ? 0.55 : 0.5})`, boxShadow: fl > 0 ? `inset 0 0 0 ${r[2]}px rgba(255,255,255,${(fl * 0.55).toFixed(3)})` : 'none' });
  const x = Math.max(52 * k, L.tx - r[0]), em = Math.max(1, ...lines.map(textEm)), avail = r[3] - 150 * k - (p.quoteEn ? 40 * k : 0) - (p.quoteBy ? 90 * k : 0);
  const px = Math.min(p.slam ? 230 * k : 124 * k, (r[2] - x - 40 * k) / em, avail / Math.max(1, lines.length * 1.18));
  q.mark.textContent = '“';
  cssCamel(q.mark, { left: `${x - 26 * k}px`, top: `${-20 * k}px`, fontFamily: disp, fontWeight: '900', fontSize: `${220 * k}px`, color: p.accent });
  let y = Math.min(110 * k, r[3] * 0.16);
  q.en.textContent = p.quoteEn;
  cssCamel(q.en, { display: p.quoteEn ? 'block' : 'none', left: `${x + 120 * k}px`, top: `${y - 30 * k}px`, fontFamily: disp, fontSize: `${36 * k}px`, color: 'rgba(255,255,255,0.9)' });
  if (p.quoteEn) y += 30 * k;
  const key = JSON.stringify(lines);
  if (q.key !== key) { q.key = key; q.body.replaceChildren(); q.lines = lines.map(() => line(q.body, { fontWeight: '900', color: '#ffffff', transformOrigin: '0 100%' })); }
  q.lines.forEach((e, i) => {
    const ti = p.quoteAt + (p.slam ? 0 : 0.18) * i, pp = p.slam ? eBack(clamp((t - ti) / 0.3), 1.6) : eOut3(prog(t, ti, ti + 0.45));
    const sc = p.slam ? lerp(1.35, 1, clamp(pp)) : 1, op = p.slam ? clamp((t - ti) / 0.08) : pp;
    e.textContent = lines[i];
    cssCamel(e, { left: `${x}px`, top: `${y + px * 1.18 * i + px * 0.1}px`, fontFamily: ser, fontSize: `${px}px`, textShadow: SHADOW(k, 0.6), opacity: String(op),
      transform: `translateY(${p.slam ? 0 : (1 - pp) * 30 * k}px) scale(${sc.toFixed(4)})` });
  });
  y += px * 1.18 * lines.length + px * 0.1;
  const rp = eIO3(prog(t, p.quoteAt + 0.35, p.quoteAt + 0.75));
  cssCamel(q.rule, { display: p.slam ? 'block' : 'none', left: `${x}px`, top: `${y + 24 * k}px`, height: `${12 * k}px`, width: `${(r[2] - 2 * x) * rp}px`, background: p.accent });
  if (p.slam) y += 46 * k;
  q.by.textContent = p.quoteBy;
  cssCamel(q.by, { display: p.quoteBy ? 'block' : 'none', left: `${x}px`, top: `${y + 34 * k}px`, fontFamily: ser, fontSize: `${46 * k}px`, color: 'rgba(255,255,255,0.92)', opacity: String(eOut3(prog(t, p.quoteAt + 0.5, p.quoteAt + 0.9))) });
}

/** the list layout's rows: a big red italic number, the serif title and a note, a hairline under each, sliding in one by one */
function drawRows(ctx: Parameters<typeof magazine.draw>[0], s: S, L: ReturnType<typeof magazineLayout>, disp: string, ser: string) {
  const p = ctx.params, t = ctx.local, k = L.k, items = L.layout === 'list' ? parseItems(p.items) : [], key = String(items.length);
  if (s.rowKey !== key) {
    s.rowKey = key; s.rowsEl.replaceChildren();
    s.rows = items.map(() => { const box = abs(s.rowsEl); return { box, no: line(box, { fontStyle: 'italic', fontWeight: '900' }), title: line(box, { fontWeight: '900' }), note: line(box, { fontWeight: '500' }), rule: abs(box) }; });
  }
  if (!items.length) return;
  const [cx, cy, cw, ch] = L.column, lines = nlLines(p.headline).length, hpx = Math.min(84 * k, cw / Math.max(1, ...nlLines(p.headline).map(textEm)));
  const y0 = cy + (p.kicker ? 66 * k : 0) + hpx * 1.14 * lines + (p.deck ? 70 * k : 20 * k) + 20 * k, rh = Math.min(150 * k, (cy + ch - y0) / items.length);
  items.forEach((it, i) => {
    const e = s.rows[i], q = eOut3(prog(t, it.at, it.at + 0.45)), y = y0 + i * rh, npx = Math.min(96 * k, rh * 0.8), tx = npx * 1.5;
    cssCamel(e.box, { left: `${cx}px`, top: `${y}px`, width: `${cw}px`, height: `${rh}px`, opacity: String(q), transform: `translateX(${(1 - q) * -40 * k}px)` });
    e.no.textContent = pad2(i + 1); e.title.textContent = it.title; e.note.textContent = it.note;
    const tpx = Math.min(54 * k, rh * 0.36, (cw - tx) / Math.max(1, textEm(it.title)));
    cssCamel(e.no, { left: '0', top: `${(rh - npx) / 2 - npx * 0.05}px`, fontFamily: disp, fontSize: `${npx}px`, color: p.accent });
    cssCamel(e.title, { left: `${tx}px`, top: `${it.note ? rh * 0.2 : (rh - tpx) / 2}px`, fontFamily: ser, fontSize: `${tpx}px`, color: p.ink });
    cssCamel(e.note, { display: it.note ? 'block' : 'none', left: `${tx}px`, top: `${rh * 0.2 + tpx * 1.25}px`, fontFamily: ser, fontSize: `${Math.min(32 * k, rh * 0.22)}px`, color: withAlpha(p.ink, 0.62) });
    cssCamel(e.rule, { left: '0', right: '0', bottom: '0', height: `${1.5 * k}px`, background: withAlpha(p.ink, 0.35) });
  });
}
