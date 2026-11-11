// A one-colour beat kit, promoted 2026-11-06 from the Single Color pilot film's fx.grade / fx.deepen / fx.hud / fx.echo / fx.page /
// fx.tape (after the user's own Single Color style film):
//   common.grade       the footage under it in black-and-white, in one colour, or as it is, switched on the beat (a flat fill blended
//                      'color': grey takes the colour out, a colour gives every pixel its hue at the pixel's own lightness)
//   common.wash        a light colour multiplied over the same steps: with grade's one colour alone a bright sky stays nearly white
//   common.viewfinder  corner brackets, a title and chapter line, a route and a shot counter, a tick ruler with a needle walking down
//   common.echo        a heavy slanted word with outlined copies stacked above and below it, a small number over its left end
//   common.poster      a one-colour page: a slanted word over and under a bracketed photo card with a hard shadow, a faint giant word
//                      behind, a line of side text, a barcode
//   common.band        a diagonal band of repeated words, scrolling
// The 3-2-1 is common.countdown's look slant, the caption the template color-boxes (look boxes). Pure functions of time.
import { clamp, eOut3, type ItemType, type SceneItem } from '@tellcut/engine';
import { canvasIn } from './desktop.ts';
import { coverImage } from './editorial.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { imagesReady } from './window.ts';

const DISPLAY = 'Anton', SANS = 'Inter', TC = 'Noto Sans TC';
const disp = (px: number) => `400 ${px}px "${DISPLAY}", "${TC}", sans-serif`;
const sans = (px: number, w = 700) => `${w} ${px}px "${SANS}", "${TC}", sans-serif`;
/** the faux italic of the display words (Anton has no italic) */
export const SLANT = -0.2;
const eOut = (q: number) => eOut3(clamp(q));
type G = CanvasRenderingContext2D;

// a face that fails to load draws with the fallback, as in the other blocks, rather than failing the item's ready
const fontsReady = (text: string) => Promise.all([document.fonts.load(`400 80px "${DISPLAY}"`, text || 'AZ09'), document.fonts.load(`700 30px "${SANS}"`, 'AZ09'),
  document.fonts.load(`600 30px "${SANS}"`, 'AZ09'), document.fonts.load(`900 50px "${TC}"`, text || '字')].map((l) => l.catch(() => []))).then(() => undefined);
const spaced = (g: G, px: number) => { try { (g as unknown as { letterSpacing: string }).letterSpacing = `${px.toFixed(1)}px`; } catch { /* older canvases */ } };

/** "seconds|value" lines, in time order */
export function parseSteps(text: string): Array<{ t: number; v: string }> {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { const [a, ...b] = l.split('|'); return { t: Number(a) || 0, v: b.join('|').trim() }; }).sort((a, b) => a.t - b.t);
}
/** a steps param parsed once per value and kept on the item's state: draw runs every frame */
export interface StepsMemo { text?: string; list: Array<{ t: number; v: string }> }
export function stepsOf(m: StepsMemo, text: string): Array<{ t: number; v: string }> {
  if (m.text !== text) { m.text = text; m.list = parseSteps(text); }
  return m.list;
}
const noSteps = (): StepsMemo => ({ list: [] });
/** the step's value in force at `t` (`dflt` before the first) */
export function stepAt(steps: Array<{ t: number; v: string }>, t: number, dflt = 'none'): string {
  let v = dflt;
  for (const s of steps) if (s.t <= t + 1e-6) v = s.v;
  return v;
}
/** grade's fill for a step: bw grey, mono the item's colour, a #colour itself, anything else none */
export function gradeFill(v: string, color: string): string {
  return v === 'bw' ? '#808080' : v === 'mono' ? color : /^#[0-9a-f]{3,8}$/i.test(v) ? v : 'transparent';
}
/** "source|t|fx,fy" lines */
export function parsePhotos(text: string): Array<{ source: string; t: number; fx: number; fy: number }> {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [source, t, f] = l.split('|'), [fx, fy] = String(f || '0.5,0.5').split(',').map(Number);
    return { source: source.trim(), t: Number(t) || 0, fx: Number.isFinite(fx) ? fx : 0.5, fy: Number.isFinite(fy) ? fy : 0.5 };
  });
}
/** which of `n` photos shows at `local`, a new one every `every` seconds, round and round */
export const photoIndex = (local: number, every: number, n: number) => (n ? Math.floor(Math.max(0, local) / Math.max(0.01, every)) % n : -1);
/** the shot counter: how many of the cut times have come by `local` (at least 1) */
export function shotNo(cuts: string, local: number): { n: number; total: number } {
  const list = String(cuts).split(',').map((s) => s.trim()).filter(Boolean).map(Number).filter((v) => Number.isFinite(v));
  return { n: Math.max(1, list.filter((c) => c <= local + 1e-6).length), total: Math.max(1, list.length) };
}

/** an L at each corner of the box */
function brackets(g: G, x: number, y: number, w: number, h: number, arm: number, lw: number, color: string) {
  g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'butt';
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    g.beginPath(); g.moveTo(cx + dx * arm, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + dy * arm); g.stroke();
  }
}
/** a slanted display word centred on (x, y): filled and/or outlined */
function slanted(g: G, text: string, x: number, y: number, px: number, fill: string | null, stroke?: string, lw = 0) {
  g.save(); g.translate(x, y); g.transform(1, 0, SLANT, 1, 0, 0);
  g.font = disp(px); g.textAlign = 'center'; g.textBaseline = 'middle';
  if (fill) { g.fillStyle = fill; g.fillText(text, 0, 0); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.strokeText(text, 0, 0); }
  g.restore();
}
/** the slanted word reported to check with the font and alignment it was drawn with */
function said(ctx: { reportText: (g: G, text: string, x: number, y: number) => void }, g: G, text: string, x: number, y: number, px: number) {
  g.save(); g.font = disp(px); g.textAlign = 'center'; g.textBaseline = 'middle'; ctx.reportText(g, text, x, y); g.restore();
}
/** the size that keeps `text` within `share` of the width */
function fitted(g: G, text: string, px: number, maxW: number) {
  g.font = disp(px);
  return Math.min(px, (px * maxW) / Math.max(1, g.measureText(text).width));
}

// ── common.grade / common.wash
interface GP { steps: string; color: string }
interface WP { steps: string; tone: string }
interface FS { d: HTMLElement; steps: StepsMemo }
const fill = (root: HTMLElement): FS => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0;pointer-events:none'; root.appendChild(d); return { d, steps: noSteps() }; };
/** grade's steps out of the box: wash's default is the same, as its doc says */
const GRADE_STEPS = '0|bw\n0.4|mono\n0.8|none';

export const grade: ItemType<GP, FS> = {
  type: 'common.grade', label: '單色調色', category: 'look', kind: 'overlay', blend: 'color',
  doc: '照拍子換調色：疊在影片上（整支片一個項目），steps「秒|bw／mono／none」（項目內秒數，一行一個）把下面的畫面換成黑白、color 色的單色、或原色（#顏色＝那個顏色的單色）；單色要更濃（亮的天空也染色）再疊一個 common.wash 用同一份 steps；字幕、文字積木要放在它之後才不會被染色；運動、單車、旅行的快剪，配 common.viewfinder、common.echo、common.poster',
  params: [
    { key: 'steps', label: '換色（秒|bw／mono／none，一行一個）', type: 'text', default: GRADE_STEPS },
    { key: 'color', label: '單色（mono）', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
  ],
  build: (ctx) => fill(ctx.root),
  draw(ctx, s) { s.d.style.background = gradeFill(stepAt(stepsOf(s.steps, ctx.params.steps), ctx.local), ctx.params.color); },
};

export const wash: ItemType<WP, FS> = {
  type: 'common.wash', label: '色彩加深', category: 'look', kind: 'overlay', blend: 'multiply',
  doc: '在 steps 的 mono 那幾段把一層淺色乘上去（multiply），亮的地方也染上顏色；疊在 common.grade 之後、用同一份 steps（bw、none 那幾段不動）',
  params: [
    { key: 'steps', label: '換色（跟 common.grade 同一份）', type: 'text', default: GRADE_STEPS },
    { key: 'tone', label: '乘上的顏色', type: 'color', default: '#ffa070' },
  ],
  build: (ctx) => fill(ctx.root),
  draw(ctx, s) { s.d.style.background = stepAt(stepsOf(s.steps, ctx.params.steps), ctx.local) === 'mono' ? ctx.params.tone : 'transparent'; },
};

// ── common.viewfinder
interface VP { title: string; chapters: string; route: string; cuts: string; color: string; ink: string }
interface CS { c: HTMLCanvasElement }
export const viewfinder: ItemType<VP, CS & { steps: StepsMemo }> = {
  type: 'common.viewfinder', label: '取景框', category: 'frame', kind: 'overlay',
  doc: '整支片的取景框：四角 color 色的 L 角（開場長出來）、左上片名（title）和一行章節（chapters「秒|字」，項目內秒數，到點換字）、右上路線（route）和鏡頭計數（cuts 每次換鏡頭的秒數，逗號分隔，顯示「05 / 16」）、左邊一排刻度和一根跟著片子往下走的指針；小字是裝飾，不算字幕；配 common.grade、common.echo',
  params: [
    { key: 'title', label: '左上片名', type: 'string', default: 'EUROPE · 3 PLACES' },
    { key: 'chapters', label: '左上第二行（秒|字，一行一個）', type: 'text', default: '0|BY FOOT' },
    { key: 'route', label: '右上路線', type: 'string', default: 'PAR / KRK / EST' },
    { key: 'cuts', label: '換鏡頭的秒數（逗號分隔）', type: 'string', default: '0,1,2' },
    { key: 'color', label: '角和指針的顏色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'ink', label: '小字顏色', type: 'color', default: '#ffffff' },
  ],
  build: (ctx) => ({ c: canvasIn(ctx.root), steps: noSteps() }),
  ready: () => fontsReady(''),
  hide: (s) => freeCanvas(s.c),
  draw(ctx, s) {
    const { local, dur, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    const m = 34 * u;
    brackets(g, m, m, W - 2 * m, H - 2 * m, 54 * u * eOut(local / 0.3), 5 * u, p.color);
    g.fillStyle = p.ink; g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 6 * u; g.textBaseline = 'alphabetic';
    const { n, total } = shotNo(p.cuts, local), pad = (v: number) => String(v).padStart(2, '0');
    const x0 = 72 * u, x1 = W - 72 * u, y0 = 92 * u, y1 = 122 * u;
    g.textAlign = 'left'; g.font = sans(24 * u); spaced(g, 4 * u); g.fillText(p.title, x0, y0);
    g.font = sans(19 * u, 600); spaced(g, 3 * u); g.fillText(stepAt(stepsOf(s.steps, p.chapters), local, ''), x0, y1);
    g.textAlign = 'right'; g.font = sans(24 * u); spaced(g, 4 * u); g.fillText(p.route, x1, y0);
    g.font = sans(19 * u, 600); spaced(g, 3 * u); g.fillText(`${pad(n)} / ${pad(total)}`, x1, y1);
    spaced(g, 0); g.shadowBlur = 0;
    const rx = 40 * u, ry0 = 0.22 * H, ry1 = 0.74 * H, step = 22 * u;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0, y = ry0; y <= ry1; i++, y += step) g.fillRect(rx, y, (i % 5 ? 10 : 20) * u, 2 * u);
    g.fillStyle = p.color; g.fillRect(rx, ry0 + (ry1 - ry0) * clamp(local / dur), 28 * u, 5 * u);
  },
};

// ── common.echo
interface EP { word: string; label: string; color: string; echo: string; echoes: number; size: number; y: number; steps: string; onMono: string }
/** the word's size fitted to the width and its width at that size, measured once per word, size and frame (and again once the fonts are in) */
interface EchoFit { key: string; px: number; ww: number }
export const echo: ItemType<EP, CS & { text: string; steps: StepsMemo; fit?: EchoFit }> = {
  type: 'common.echo', label: '回音大字', category: 'text', kind: 'overlay',
  doc: '畫面上一個粗窄斜體的大字（Anton），上下各疊 echoes 層空心的同一個字、開場從字的位置散開，字先大一點再落定；label 是字左上的小號碼（01、02，地點、章節）；字太寬自動縮到畫面寬 74%；steps 填 common.grade 的同一份（換成這個項目自己的秒數）時，畫面是單色那幾段字和空心字換成 onMono 色（橘色畫面上的橘字會看不見）；運動、旅行快剪的地名、動作字（RIDE、WALK、PARIS）',
  params: [
    { key: 'word', label: '大字', type: 'string', default: 'RIDE' },
    { key: 'label', label: '左上小號碼（空＝沒有）', type: 'string', default: '' },
    { key: 'color', label: '字色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'echo', label: '空心字的顏色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'echoes', label: '上下各幾層空心字', type: 'number', min: 0, max: 4, step: 1, default: 2 },
    { key: 'size', label: '字高（以 1080 短邊計的 px）', type: 'number', min: 60, max: 600, step: 5, default: 250 },
    { key: 'y', label: '中心高度（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.26 },
    { key: 'steps', label: '調色（秒|bw／mono／none，項目內秒數；空＝不換色）', type: 'text', default: '' },
    { key: 'onMono', label: '單色畫面上的字色', type: 'color', default: '#ffffff' },
  ],
  build: (ctx) => ({ c: canvasIn(ctx.root), text: `${ctx.params.word}${ctx.params.label}`, steps: noSteps() }),
  ready: (s) => fontsReady(s.text).then(() => { s.fit = undefined; }),
  hide: (s) => freeCanvas(s.c),
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    const key = `${p.word}|${p.size * u}|${W}`;
    if (s.fit?.key !== key) { const px = fitted(g, p.word, p.size * u, 0.74 * W); g.font = disp(px); s.fit = { key, px, ww: g.measureText(p.word).width }; }
    const { px, ww } = s.fit, mono = stepAt(stepsOf(s.steps, p.steps), local) === 'mono';
    const col = mono ? p.onMono : p.color, ecol = mono ? p.onMono : p.echo;
    const cx = W / 2, cy = p.y * H, k = eOut(local / 0.3), gap = 0.8 * px * k;
    // the copies stay clear of the top's small lines (a viewfinder's) and of the captions' band
    g.save(); g.beginPath(); g.rect(0, 0.115 * H, W, 0.7 * H); g.clip();
    for (let j = Math.round(p.echoes); j >= 1; j--) {
      g.globalAlpha = (0.75 / j) * k;
      for (const d of [-1, 1]) slanted(g, p.word, cx, cy + d * j * gap, px, null, ecol, 3 * u);
    }
    g.restore();
    const big = px * (1 + 0.12 * (1 - eOut(local / 0.18)));
    slanted(g, p.word, cx, cy, big, col);
    said(ctx, g, p.word, cx, cy, big);
    if (p.label) {
      const lpx = 70 * u, lx = Math.max(0.12 * W + 40 * u, cx - ww / 2 + 40 * u), ly = cy - 0.62 * px;
      slanted(g, p.label, lx, ly, lpx, col);
      said(ctx, g, p.label, lx, ly, lpx);
    }
  },
};

// ── common.poster
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
    const k = eOut(local / 0.22), sc = 1.06 - 0.06 * k, ty = L.ty - 30 * u * (1 - k), by = L.by + 30 * u * (1 - k);
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

// ── common.band
interface BP { words: string; angle: number; y: number; color: string; ink: string; speed: number }
export const band: ItemType<BP, CS> = {
  type: 'common.band', label: '斜膠帶字', category: 'text', kind: 'overlay',
  doc: '一條斜過整個畫面的色帶（color），上面重複的粗斜體小字（words，結尾加「 / 」當分隔）一直往左捲，開場從左邊刷進來；angle 角度、y 中心高度；裝飾，不算字幕；KM BY KM、CITY BY CITY 這種節奏字，配 common.whoosh',
  params: [
    { key: 'words', label: '帶子上的字', type: 'string', default: 'KM BY KM / ' },
    { key: 'angle', label: '角度（度）', type: 'number', min: -45, max: 45, step: 1, default: -10 },
    { key: 'y', label: '中心高度（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'color', label: '帶子顏色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'ink', label: '字色', type: 'color', default: '#111111' },
    { key: 'speed', label: '捲動速度（以 1080 短邊計的 px／秒）', type: 'number', min: 0, max: 800, step: 10, default: 140 },
  ],
  build: (ctx) => ({ c: canvasIn(ctx.root) }),
  ready: () => fontsReady(''),
  hide: (s) => freeCanvas(s.c),
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    const L = Math.hypot(W, H), bh = 62 * u;
    g.save(); g.translate(W / 2, p.y * H); g.rotate((p.angle * Math.PI) / 180);
    g.beginPath(); g.rect(-L / 2, -bh / 2, L * eOut(local / 0.22), bh); g.clip();
    g.fillStyle = p.color; g.fillRect(-L / 2, -bh / 2, L, bh);
    g.fillStyle = p.ink; g.font = sans(30 * u); spaced(g, 2 * u); g.textBaseline = 'middle'; g.textAlign = 'left';
    g.transform(1, 0, SLANT * 0.6, 1, 0, 0);
    // blank words: the band alone (an empty one measured 0 and was written at every px along it)
    const tw = Math.max(1, g.measureText(p.words).width);
    if (String(p.words ?? '').trim()) for (let x = -L / 2 - ((local * p.speed * u) % tw); x < L / 2 + tw; x += tw) g.fillText(p.words, x, 2 * u);
    spaced(g, 0); g.restore();
  },
};
