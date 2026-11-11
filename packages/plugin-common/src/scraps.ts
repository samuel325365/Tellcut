// A scrapbook, promoted 2026-11-05 from the Collage pilot film's fx.prints / fx.scraps (after the user's own Collage style film):
//   common.scraps  the bits pasted round common.prints' prints (prints.ts): torn paper scraps, halftone-dotted tape, translucent tape,
//                  round pins, paperclips, and a grid of thin seams over the whole frame (after common.wipe's mode tiles)
// The title card is the title template scrapbook-card, the coloured chips the caption template scrap-chip. A pure function of time.
import { clamp, rng, type ItemType } from '@tellcut/engine';
import { canvasIn } from './desk-kit.ts';

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
