// A scrapbook, promoted 2026-11-05 from the Collage pilot film's fx.prints / fx.scraps (after the user's own Collage style film):
//   common.prints  a page of prints: stills of the footage with deckled white borders and a soft shadow, each dropping from a little
//                  big and turned into place at its own second; washi tape over one, a paperclip on another
//   common.scraps  the bits pasted round them: torn paper scraps, halftone-dotted tape, translucent tape, round pins, paperclips, and
//                  a grid of thin seams over the whole frame (after common.wipe's mode tiles)
// The title card is the title template scrapbook-card, the coloured chips the caption template scrap-chip. Pure functions of time.
import { clamp, rng, type ItemCtx, type ItemType, type SceneItem } from '@tellcut/engine';
import { canvasIn } from './desktop.ts';
import { imagesReady } from './window.ts';

export interface Print { at: number; t: number; x: number; y: number; w: number; tilt: number; ratio: number; tape: string | null; clip: boolean; fx: number; fy: number }
/** "seconds|source seconds|x,y,width|tilt|width:height|options" a line; options (spaces or ;): tape, tape=#colour, clip, focus=x,y */
/** a typed number, or `d` when the piece is missing, empty or not a number */
const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v.trim() !== '' && Number.isFinite(n) ? n : d; };
export function parsePrints(text: unknown): Print[] {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [at, t, box = '0.5,0.5,0.5', tilt, ratio, opts = ''] = l.split('|').map((s) => s.trim());
    // a number that does not read (a typo, a word) falls back to its default rather than placing the print at NaN
    const [x, y, w] = [0, 1, 2].map((i) => num(box.split(',')[i], 0.5)), [rw, rh] = String(ratio || '4:3').split(':').map(Number);
    const o: Record<string, string | true> = {};
    for (const kv of opts.split(/[\s;]+/).filter(Boolean)) { const [k, v] = kv.split('='); o[k] = v ?? true; }
    const [fx, fy] = [0, 1].map((i) => num(String(o.focus ?? '').split(',')[i], 0.5));
    return { at: Number(at) || 0, t: Number(t) || 0, x, y, w, tilt: Number(tilt) || 0, ratio: rw > 0 && rh > 0 ? rw / rh : 4 / 3,
      tape: o.tape === undefined ? null : o.tape === true ? 'rgba(236,226,190,0.82)' : o.tape, clip: !!o.clip, fx, fy };
  });
}
/** a deckled edge as a CSS clip-path polygon (percent of the box), `n` steps a side nudged in by up to `amp` percent */
export function deckle(r: () => number, n = 14, amp = 0.7): string {
  const pts: Array<[number, number]> = [], j = () => Math.abs((r() - 0.5) * 2 * amp);
  for (let i = 0; i < n; i++) pts.push([(i / n) * 100, j()]);
  for (let i = 0; i < n; i++) pts.push([100 - j(), (i / n) * 100]);
  for (let i = 0; i < n; i++) pts.push([100 - (i / n) * 100, 100 - j()]);
  for (let i = 0; i < n; i++) pts.push([j(), 100 - (i / n) * 100]);
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`;
}

interface PP { source: string; prints: string; border: number; paper: string; seed: number }
interface PS { list: Array<{ p: Print; wrap: HTMLDivElement; img: HTMLImageElement }>; key: string }
const stillOf = (source: string, t: number) => ({ source, t, w: 720 });

export const prints: ItemType<PP, PS> = {
  type: 'common.prints', label: '剪貼簿相片', category: 'frame', kind: 'overlay',
  doc: '剪貼簿的一頁相片：prints 一行一張「秒|素材秒|x,y,寬|傾斜|寬:高|選項」，相片是素材那一刻的靜止畫面（source），白色毛邊、柔和陰影，從稍大、轉一點的地方落下擺正；選項 tape 貼紙膠帶（tape=#色）、clip 夾迴紋針、focus=x,y 對焦（避開原片燒的字）；一頁一個項目，可以疊在滿版影片上或紙底（common.paper）上，後面那張大的會蓋住前面；配 common.scraps 紙片、字幕範本 scrap-chip 紙條、標題範本 scrapbook-card、common.wipe 的 tiles 格子轉場；旅行、家庭、寵物的剪貼簿、回憶相簿',
  params: [
    { key: 'source', label: '素材', type: 'source-ref', default: '' },
    { key: 'prints', label: '相片（一行一張：秒|素材秒|x,y,寬|傾斜|寬:高|選項 tape、clip、focus=x,y）', type: 'text', default: '0|0|0.32,0.4,0.5|-3|4:3|tape\n0.4|0|0.68,0.55,0.5|3|3:4|clip' },
    { key: 'border', label: '白邊（相片寬的比例）', type: 'number', min: 0, max: 0.2, step: 0.005, default: 0.035 },
    { key: 'paper', label: '相片紙色', type: 'color', default: '#fbf8f1' },
    { key: 'seed', label: '毛邊亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 3 },
  ],
  media(item: SceneItem) {
    const p = item.params as unknown as PP;
    return { videos: [], stills: p.source ? parsePrints(p.prints).map((q) => stillOf(p.source, q.t)) : [] };
  },
  build(ctx) { const s: PS = { list: [], key: '' }; makePrints(ctx, s); return s; },
  ready(s) { return imagesReady(s.list.map((it) => it.img)); },
  draw(ctx, s) {
    const { local, dur, W, H, params: p, motion } = ctx;
    makePrints(ctx, s);
    const out = clamp((dur - local) / 0.25), spring = motion.spring({ duration: 0.42, bounce: 0.3 });
    for (const { p: q, wrap, img } of s.list) {
      const t = local - q.at;
      if (t < 0) { wrap.style.display = 'none'; continue; }
      const k = spring(t), w = q.w * Math.min(W, H), h = w / q.ratio, b = p.border * w, sc = 1.18 - 0.18 * k, rot = q.tilt + (1 - k) * 7, dy = (1 - k) * -0.03 * H;
      Object.assign(wrap.style, { display: 'block', left: `${((q.x * W - w / 2) / W) * 100}%`, top: `${((q.y * H - h / 2 + dy) / H) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / H) * 100}%`,
        opacity: String(clamp(t / 0.12) * out), transform: `rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})` });
      Object.assign(img.style, { left: `${(b / w) * 100}%`, top: `${(b / h) * 100}%`, width: `${((w - 2 * b) / w) * 100}%`, height: `${((h - 2 * b) / h) * 100}%` });
    }
  },
};

/** the prints' elements, (re)made when what they show changes */
function makePrints(ctx: ItemCtx<PP>, s: PS) {
    const { params: p, media, root } = ctx, k = Math.min(ctx.W, ctx.H) / 1080;
    const key = `${p.source}|${p.prints}|${p.seed}|${p.paper}|${k}`;
    if (s.key !== key) {   // (re)build the prints when what they show changes
      for (const it of s.list) it.wrap.remove();
      const r = rng(p.seed);
      s.list = parsePrints(p.prints).map((q) => {
        const wrap = document.createElement('div'), card = document.createElement('div'), img = document.createElement('img');
        wrap.style.cssText = `position:absolute;left:0;top:0;filter:drop-shadow(0 ${6 * k}px ${10 * k}px rgba(40,25,10,0.38));transform-origin:50% 50%`;
        card.style.cssText = `position:absolute;inset:0;background:${p.paper};clip-path:${deckle(r)}`;
        if (p.source) img.src = media.stillUrl(stillOf(p.source, q.t));
        img.style.cssText = `position:absolute;object-fit:cover;object-position:${q.fx * 100}% ${q.fy * 100}%`;
        card.appendChild(img); wrap.appendChild(card);
        if (q.tape) {
          const tape = document.createElement('div');
          tape.style.cssText = `position:absolute;left:33%;top:-5%;width:34%;height:11%;background:${q.tape};opacity:0.85;transform:rotate(${((r() - 0.5) * 8).toFixed(1)}deg);clip-path:${deckle(r, 6, 3)}`;
          wrap.appendChild(tape);
        }
        if (q.clip) {
          const clip = document.createElement('div');
          clip.innerHTML = '<svg viewBox="0 0 20 52" width="100%" height="100%"><path d="M6 44 V10 a4 4 0 0 1 8 0 V40 a6 6 0 0 1 -12 0 V8 a8 8 0 0 1 16 0 V44" fill="none" stroke="#9aa3ab" stroke-width="2.4" stroke-linecap="round"/></svg>';
          clip.style.cssText = 'position:absolute;left:12%;top:-9%;width:7%;height:24%';
          wrap.appendChild(clip);
        }
        root.appendChild(wrap);
        return { p: q, wrap, img };
      });
      s.key = key;
    }
}

export interface Scrap { at: number; kind: 'paper' | 'dots' | 'tape' | 'pin' | 'clip' | 'grid'; x: number; y: number; w: number; h: number; tilt: number; color: string }
const KINDS = ['paper', 'dots', 'tape', 'pin', 'clip', 'grid'];
/** "seconds|kind|x,y,w,h|tilt|colour" a line (w, h fractions of the frame's short side; grid: "cols,rows" in place of the box); a line
 *  with no colour keeps it empty, and scrapColor gives that kind's own */
export function parseScraps(text: unknown): Scrap[] {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [at, kind = 'paper', box = '0.5,0.5,0.3,0.1', tilt, color] = l.split('|').map((s) => s.trim());
    const [x = 0.5, y = 0.5, w = 0.3, h] = box.split(',').map(Number);
    return { at: Number(at) || 0, kind: (KINDS.includes(kind) ? kind : 'paper') as Scrap['kind'], x, y, w, h: h ?? w, tilt: Number(tilt) || 0, color: color || '' };
  });
}
/** the colour a scrap is drawn in: its own, else its kind's (a grey paperclip, white seams, lavender paper). The parser used to fill
 *  in lavender and the clip turned lavender grey, so a clip asked for in lavender came out grey */
export const scrapColor = (sc: Pick<Scrap, 'kind' | 'color'>) => sc.color || (sc.kind === 'clip' ? '#9aa3ab' : sc.kind === 'grid' ? '#ffffff' : '#c3b1f5');
/** a torn-edged rectangle centred on (0, 0): every side broken into short steps nudged in and out by up to `rough` px */
export function tornRect(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, rough: number) {
  const pts: Array<[number, number]> = [], step = Math.max(6, Math.min(w, h) / 14);
  const side = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) { const q = i / n, j = (r() - 0.5) * 2 * rough; pts.push([x0 + (x1 - x0) * q + nx * j, y0 + (y1 - y0) * q + ny * j]); }
  };
  side(-w / 2, -h / 2, w / 2, -h / 2, 0, 1); side(w / 2, -h / 2, w / 2, h / 2, 1, 0); side(w / 2, h / 2, -w / 2, h / 2, 0, 1); side(-w / 2, h / 2, -w / 2, -h / 2, 1, 0);
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
}

interface SP { scraps: string; seed: number }
interface SS { c: HTMLCanvasElement }
export const scraps: ItemType<SP, SS> = {
  type: 'common.scraps', label: '紙片和膠帶', category: 'mark', kind: 'overlay',
  doc: '剪貼簿上貼的東西，scraps 一行一個「秒|種類|x,y,寬,高|傾斜|顏色」（x,y 是畫面比例，寬高是畫面短邊的比例），每個在自己的秒彈出貼上：paper 撕邊紙片、dots 網點紙膠帶、tape 半透明紙膠帶、pin 圓圖釘（寬＝直徑）、clip 迴紋針、grid 整個畫面的白色細縫（位置寫「欄,列」，換頁用 common.wipe 的 tiles 之後留著格縫）；配 common.prints、字幕範本 scrap-chip、標題範本 scrapbook-card',
  params: [
    { key: 'scraps', label: '紙片（一行一個：秒|paper／dots／tape／pin／clip／grid|x,y,寬,高|傾斜|顏色）', type: 'text', default: '0|dots|0.78,0.1,0.34,0.07|-3|#c3b1f5\n0.3|paper|0.25,0.8,0.3,0.1|4|#e8763a\n0.6|pin|0.5,0.45,0.04,0.04|0|#e0552f' },
    { key: 'seed', label: '撕邊亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 7 },
  ],
  build(ctx) { return { c: canvasIn(ctx.root) }; },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    const { local, dur, W, H, params: p, motion } = ctx, m = Math.min(W, H), u = m / 1080;
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const out = clamp((dur - local) / 0.25), spring = motion.spring({ duration: 0.35, bounce: 0.4 });
    parseScraps(p.scraps).forEach((sc, i) => {
      const t = local - sc.at, color = scrapColor(sc);
      if (t < 0) return;
      if (sc.kind === 'grid') {   // seams over the whole frame: x, y are the columns and rows
        const cols = Math.max(2, Math.round(sc.x)), rows = Math.max(2, Math.round(sc.y)), seam = 4 * u;
        g.globalAlpha = clamp(t / 0.2) * out; g.fillStyle = color;
        for (let c = 1; c < cols; c++) g.fillRect((c * W) / cols - seam / 2, 0, seam, H);
        for (let r = 1; r < rows; r++) g.fillRect(0, (r * H) / rows - seam / 2, W, seam);
        g.globalAlpha = 1;
        return;
      }
      const k = spring(t), r = rng(p.seed * 97 + i * 13), w = sc.w * m, h = sc.h * m;
      g.save(); g.globalAlpha = clamp(t / 0.1) * out; g.translate(sc.x * W, sc.y * H); g.rotate((sc.tilt * Math.PI) / 180); g.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
      if (sc.kind === 'pin') {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(4 * u, 6 * u, w / 2, 0, Math.PI * 2); g.fill();
        g.fillStyle = color; g.beginPath(); g.arc(0, 0, w / 2, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(-w * 0.15, -w * 0.15, w * 0.15, 0, Math.PI * 2); g.fill();
      } else if (sc.kind === 'clip') {
        const a = w / 2;
        g.strokeStyle = color; g.lineWidth = 4 * u; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-a * 0.4, h / 2 - a * 0.3); g.lineTo(-a * 0.4, -h / 2 + a * 0.4); g.arc(0, -h / 2 + a * 0.4, a * 0.4, Math.PI, 0); g.lineTo(a * 0.4, h / 2 - a * 0.6); g.arc(0, h / 2 - a * 0.6, a * 0.4, 0, Math.PI); g.stroke();
      } else {
        g.shadowColor = 'rgba(40,25,10,0.28)'; g.shadowBlur = 8 * u; g.shadowOffsetY = 4 * u;
        tornRect(g, w, h, r, (sc.kind === 'tape' ? 2 : 3.5) * u);
        g.globalAlpha *= sc.kind === 'tape' ? 0.8 : 1; g.fillStyle = color; g.fill(); g.shadowColor = 'transparent';
        if (sc.kind === 'dots') {
          g.save(); g.clip(); g.fillStyle = 'rgba(255,255,255,0.35)';
          const st = 14 * u;
          for (let yy = -h / 2, row = 0; yy < h / 2; yy += st, row++) for (let xx = -w / 2 + (row % 2 ? st / 2 : 0); xx < w / 2; xx += st) { g.beginPath(); g.arc(xx, yy, 2.6 * u, 0, Math.PI * 2); g.fill(); }
          g.restore();
        }
      }
      g.restore();
    });
  },
};
