// common.panel — the frame around a video that was shrunk into a rectangle (VideoItem.frame): a heavy rounded border drawn just outside
// the picture, an optional hard shadow, and two strips of tape. Give it the same x, y, w, h (and radius) as the clip's frame.
// look 'print' is a photo print instead (from the baking-steps recipe card): a white paper margin, a soft shadow, two washi tapes.
// look 'bezel' (the food-receipt short's video window) is a dark ring with a deep soft shadow; look 'hole' (the food-deep short's queue
// board) paints the whole frame outside the window — a dark colour, a soft light and faint stripes — and rings the window in `ring`.
// look 'offset' (the podcast-quote short's fx.stage) has no frame at all: a solid block in `block` sits behind the window, offset down and
// right by `shadow`, and slides out from under it when the item starts (a misregistered print), with a deep soft shadow.
// look 'drawn' is a frame drawn by hand round the window (fd-tangyuan's crayon tyWin, fd-quotes' marker frame, fd-gacha's crayon
// edge, fishing1's pencil): `pen` crayon / marker / pencil / ballpoint, drawn on over `drawIn`, boiling `boil` times a second,
// a thinner second line in `ring` just outside it, and washi tape on the `corners` given.
import { cssCamel, eOut3, h, prog, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { tape } from './hand.ts';
import { grainBegin, grainEnd, inkStroke, rectSides, rng, rrectPts, type GrainLayer, type PenStyle, type Pt } from './sketch.ts';
import { mixHex, withAlpha } from './color.ts';

interface P {
  look: 'panel' | 'print' | 'bezel' | 'hole' | 'offset' | 'drawn'; block: string; fill: string; ring: string; x: number; y: number; w: number; h: number; radius: number; border: string; shadow: number;
  tape: boolean; tapeColor: string; margin: number; print: string; tapeColor2: string; pen: PenStyle; drawIn: number; boil: number; double: boolean; corners: string;
}
interface S { box: HTMLElement; tapes: HTMLElement[]; cv: HTMLCanvasElement; key: string; layer: GrainLayer }

/** the panel layout's default rectangle (x, y, w, h as screen fractions) and corner radius: Cut.panel() and npm run check use the same */
export const PANEL_FRAME: [number, number, number, number] = [0.04, 0.18, 0.92, 0.56];
export const PANEL_RADIUS = 28;
/** the default rectangle for a film of this shape: the tall layout on 9:16; on 16:9 a 16:9 picture with the backdrop round it
 *  (captions sit over its lower edge); on 1:1 and 4:5 a wide panel in the middle */
export function panelFrame(width: number, height: number): [number, number, number, number] {
  const r = height / width;
  return r >= 1.5 ? [...PANEL_FRAME] : r >= 0.9 ? [0.05, 0.12, 0.9, 0.62] : [0.1, 0.06, 0.8, 0.8];
}

export const panel: ItemType<P, S> = {
  type: 'common.panel', label: '影片面板外框', category: 'frame', kind: 'overlay',
  doc: '縮成矩形的影片外面的粗框（圓角、硬陰影、斜貼膠帶）；look: print 改成白色相紙邊＋柔和陰影＋上緣兩條紙膠帶（手帳、食譜）；bezel 是深色窄框加很深的柔和陰影（嵌在機器、看板裡的螢幕）；hole 把框外整個畫面塗滿深色底（淡光、細斜紋）、框邊一圈 ring 色線（看板版面、叫號機）；offset 沒有框，影片窗後面一塊錯位的色塊（block，往右下錯開 shadow）開場時從窗後滑出來，像印刷錯版（金句海報、訪談）；drawn 是手畫的框：pen 選蠟筆 crayon／麥克筆 marker／鉛筆 pencil／原子筆 ballpoint，開頭在 drawIn 秒內一筆一筆畫出來、線條每秒抖 boil 次，外面再一道 ring 色細線（double），corners 的角貼紙膠帶（繪本、筆記本、塗鴉風）；x,y,w,h 要等於影片的 frame、radius 要等於影片的圓角，放在影片軌之上',
  params: [
    { key: 'look', label: '樣式（panel 粗框、print 白色相紙邊、bezel 深色窄框、hole 框外整片底色、offset 窗後錯位色塊、drawn 手畫的框）', type: 'enum', options: ['panel', 'print', 'bezel', 'hole', 'offset', 'drawn'], default: 'panel' },
    { key: 'x', label: 'x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: PANEL_FRAME[0] },
    { key: 'y', label: 'y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: PANEL_FRAME[1] },
    { key: 'w', label: '寬（畫面寬比例）', type: 'number', min: 0.05, max: 1, step: 0.005, default: PANEL_FRAME[2] },
    { key: 'h', label: '高（畫面高比例）', type: 'number', min: 0.05, max: 1, step: 0.005, default: PANEL_FRAME[3] },
    { key: 'radius', label: '圓角（px，等於影片的 radius）', type: 'number', min: 0, max: 200, step: 1, default: PANEL_RADIUS, theme: 'radius' },
    { key: 'border', label: '框的顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'shadow', label: '硬陰影偏移（以 1080 短邊計的 px，0＝無）', type: 'number', min: 0, max: 60, step: 1, default: 12 },
    { key: 'tape', label: '斜貼膠帶', type: 'bool', default: true },
    { key: 'tapeColor', label: '膠帶顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'margin', label: '相紙邊寬（print；以 1080 短邊計的 px）', type: 'number', min: 0, max: 80, step: 1, default: 18 },
    { key: 'print', label: '相紙顏色（print）', type: 'color', default: '#fdfbf6' },
    { key: 'tapeColor2', label: '第二條膠帶顏色（print）', type: 'color', default: '#2ec4b6', theme: 'palette.accent2' },
    { key: 'fill', label: '框外的底色（hole）', type: 'color', default: '#17110d' },
    { key: 'ring', label: '框邊的線（hole）／外面那道細線（drawn）', type: 'color', default: '#e6a93a', theme: 'palette.hl' },
    { key: 'block', label: '錯位色塊的顏色（offset；錯開多少用 shadow）', type: 'color', default: '#ff4f2a', theme: 'palette.accent' },
    { key: 'pen', label: '筆（drawn：crayon 蠟筆、marker 麥克筆、pencil 鉛筆、ballpoint 原子筆）', type: 'enum', options: ['crayon', 'marker', 'pencil', 'ballpoint'], default: 'crayon' },
    { key: 'drawIn', label: '框畫出來的時間（drawn；秒，0＝一開始就在）', type: 'number', min: 0, max: 3, step: 0.05, default: 0.5 },
    { key: 'boil', label: '線條每秒重新抖幾次（drawn；0＝不抖）', type: 'number', min: 0, max: 24, step: 1, default: 8 },
    { key: 'double', label: '外面再一道細線（drawn，ring 色）', type: 'bool', default: true },
    { key: 'corners', label: '貼膠帶的角（drawn；tl 左上、tr 右上、bl 左下、br 右下，逗號分隔；tape 關掉就不貼）', type: 'string', default: 'tl,tr' },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute', boxSizing: 'border-box', pointerEvents: 'none' });
    const tapes = [0, 1].map(() => { const t = h('div', null, null, ctx.root); cssCamel(t, { position: 'absolute', pointerEvents: 'none' }); return t; });
    const cv = h('canvas', null, null, ctx.root);
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none' });
    ctx.root.insertBefore(cv, box);
    return { box, tapes, cv, key: '', layer: {} };
  },
  hide(s) { freeCanvas(s.cv); s.layer.cv = undefined; s.key = ''; },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, stroke = theme.stroke * k;
    const x = p.x * W, y = p.y * H, w = p.w * W, hh = p.h * H;
    cssCamel(s.cv, { display: p.look === 'hole' || p.look === 'drawn' ? 'block' : 'none' });
    if (p.look === 'drawn') { drawDrawn(p, s, x, y, w, hh, k, W, H, ctx.local); return; }
    if (p.look === 'print') { drawPrint(p, s, x, y, w, hh, k); return; }
    if (p.look === 'bezel' || p.look === 'hole') { drawBezel(p, s, x, y, w, hh, k, W, H); return; }
    if (p.look === 'offset') { drawOffset(p, s, x, y, w, hh, k, ctx.local); return; }
    cssCamel(s.box, {
      left: `${x - stroke}px`, top: `${y - stroke}px`, width: `${w + 2 * stroke}px`, height: `${hh + 2 * stroke}px`,
      border: `${stroke}px solid ${p.border}`, borderRadius: `${p.radius + stroke}px`,
      boxShadow: p.shadow ? `${p.shadow * k}px ${p.shadow * k}px 0 ${p.border}` : 'none',
    });
    const tw = Math.min(W, H) * 0.13, th = Math.min(W, H) * 0.04;
    s.tapes.forEach((t, i) => {
      const left = i === 0, cx = left ? x + w * 0.04 : x + w * 0.96, cy = left ? y : y + hh;
      cssCamel(t, {
        display: p.tape ? 'block' : 'none', width: `${tw}px`, height: `${th}px`, left: `${cx - tw / 2}px`, top: `${cy - th / 2}px`,
        background: p.tapeColor, opacity: '0.9', border: `${2 * k}px solid ${p.border}`, boxSizing: 'border-box', transform: `rotate(${left ? -35 : -35}deg)`, clipPath: 'none',
      });
    });
  },
};

/** look 'print': a white paper margin round the picture (the inside stays clear), a soft shadow, a washi tape across each top corner */
function drawPrint(p: P, s: S, x: number, y: number, w: number, hh: number, k: number) {
  const m = p.margin * k;
  cssCamel(s.box, { left: `${x - m}px`, top: `${y - m}px`, width: `${w + 2 * m}px`, height: `${hh + 2 * m}px`, border: `${m}px solid ${p.print}`, borderRadius: `${2 * k}px`,
    boxShadow: `0 ${12 * k}px ${30 * k}px rgba(50,30,15,0.35), inset 0 0 0 ${1.5 * k}px rgba(120,100,80,0.18)` });
  const tw = 170 * k, th = 46 * k;
  s.tapes.forEach((t, i) => {
    const left = i === 0, cx = left ? x + 40 * k : x + w - 40 * k, cy = y - 4 * k, teeth = 'polygon(0 0, 100% 0, 97% 20%, 100% 40%, 97% 60%, 100% 80%, 97% 100%, 0 100%, 3% 80%, 0 60%, 3% 40%, 0 20%, 3% 0)';
    cssCamel(t, { display: p.tape ? 'block' : 'none', width: `${tw}px`, height: `${th}px`, left: `${cx - tw / 2}px`, top: `${cy - th / 2}px`, border: '0', opacity: '0.8',
      background: `repeating-linear-gradient(70deg, rgba(255,255,255,0.22) 0 ${3 * k}px, transparent ${3 * k}px ${22 * k}px), ${left ? p.tapeColor : p.tapeColor2}`,
      clipPath: teeth, transform: `rotate(${left ? -35 : 34}deg)` });
  });
}

/** look 'offset': a block of colour behind the window, offset by `shadow` (sliding out from under it over 0.35 s), and a deep soft shadow;
 *  both are box shadows of a clear box the size of the window, so nothing is drawn over the picture */
function drawOffset(p: P, s: S, x: number, y: number, w: number, hh: number, k: number, local: number) {
  for (const t of s.tapes) cssCamel(t, { display: 'none' });
  const o = p.shadow * k * eOut3(prog(local, 0, 0.35));
  cssCamel(s.box, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px`, border: '0', borderRadius: `${p.radius * k}px`,
    boxShadow: `${o.toFixed(2)}px ${o.toFixed(2)}px 0 ${p.block}, 0 ${18 * k}px ${50 * k}px rgba(0,0,0,0.55)` });
}

/** look 'bezel': a 12-unit dark ring with a deep soft shadow; look 'hole': the frame outside the window painted (a canvas, redrawn only
 *  when the place or colours change) and the window rung in `ring` */
function drawBezel(p: P, s: S, x: number, y: number, w: number, hh: number, k: number, W: number, H: number) {
  for (const t of s.tapes) cssCamel(t, { display: 'none' });
  const hole = p.look === 'hole', b = (hole ? 4 : 12) * k, r = p.radius * k;
  cssCamel(s.box, { left: `${x - b}px`, top: `${y - b}px`, width: `${w + 2 * b}px`, height: `${hh + 2 * b}px`, borderRadius: `${r + b}px`,
    border: `${b}px solid ${hole ? p.ring : p.border}`,
    boxShadow: hole ? `0 ${3 * k}px 0 rgba(0,0,0,0.5)` : `0 ${14 * k}px ${34 * k}px rgba(0,0,0,0.6), 0 0 0 ${1.5 * k}px rgba(255,255,255,0.09)` });
  if (!hole) return;
  const key = JSON.stringify([x, y, w, hh, r, p.fill, W, H]);
  if (s.key === key) return;
  s.key = key;
  const g = canvasAt(s.cv, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, Math.max(W, H) * 0.75);
  glow.addColorStop(0, '#2a1d15'); glow.addColorStop(1, p.fill);
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  // faint stripes at 35°
  g.save(); g.strokeStyle = 'rgba(255,255,255,0.018)'; g.lineWidth = 14 * k;
  g.translate(W / 2, H / 2); g.rotate((35 * Math.PI) / 180);
  const D = Math.hypot(W, H);
  for (let d = -D; d < D; d += 28 * k) { g.beginPath(); g.moveTo(d, -D); g.lineTo(d, D); g.stroke(); }
  g.restore();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.roundRect(x, y, w, hh, r); g.fill();
  g.globalCompositeOperation = 'source-over';
}

/** the corners named in "tl,tr,bl,br" (anything else left out) */
export const tapeCorners = (s: string) => String(s ?? '').split(/[,，\s]+/).map((c) => c.trim().toLowerCase()).filter((c) => ['tl', 'tr', 'bl', 'br'].includes(c));

/** look 'drawn': the window's frame drawn by hand on the canvas (redrawn every frame: it is drawn on and it boils) */
function drawDrawn(p: P, s: S, x: number, y: number, w: number, hh: number, k: number, W: number, H: number, local: number) {
  cssCamel(s.box, { left: '0', top: '0', width: '0', height: '0', border: '0', boxShadow: 'none' });
  for (const t of s.tapes) cssCamel(t, { display: 'none' });
  s.key = '';
  const main = canvasAt(s.cv, W, H), pen = p.pen ?? 'crayon', crayon = pen === 'crayon', g = crayon ? grainBegin(s.layer, W, H) : main;
  const pr = p.drawIn > 0 ? eOut3(prog(local, 0, p.drawIn)) : 1, r = p.radius * k;
  const lw = (pen === 'marker' ? 11 : pen === 'crayon' ? 12 : pen === 'pencil' ? 5 : 6) * k, o = { u: k, boil: p.boil, t: local, overshoot: true };
  // the frame: one loop for a rounded window, else four sides one after another, each running past its corners
  const frame = (off: number, width: number, color: string, seed: number, q: number, alpha = 1) => {
    if (q <= 0) return;
    if (r > 1) { inkStroke(g, rrectPts(x - off, y - off, w + 2 * off, hh + 2 * off, r + off, 0.05), pen, { ...o, w: width, color, seed, prog: q, alpha }); return; }
    rectSides(x - off, y - off, w + 2 * off, hh + 2 * off, 14 * k).forEach((side: Pt[], i) => inkStroke(g, side, pen, { ...o, w: width, color, seed: seed + i, prog: Math.min(1, Math.max(0, q * 4 - i)), alpha }));
  };
  frame(5 * k, lw, p.border, 3, pr);
  // the second line; a pencil one is graphite too (ring leaned halfway to the border's colour, a little wider), else a pale ring
  // in a thin grainy pencil line all but vanishes on the paper
  const pencil = pen === 'pencil';
  if (p.double) frame(15 * k, lw * (pencil ? 0.6 : 0.5), pencil ? mixHex(p.ring, p.border, 0.5) : p.ring, 40, Math.min(1, Math.max(0, pr * 1.3 - 0.3)), pencil ? 0.8 : 0.85);
  if (crayon) grainEnd(s.layer, main, 0.5, k);
  if (!p.tape) return;
  // washi tape across the chosen corners, put on as the frame closes
  tapeCorners(p.corners).forEach((c, i) => {
    const a = p.drawIn > 0 ? prog(local, p.drawIn * 0.6, p.drawIn * 0.6 + 0.2) : 1;
    if (a <= 0) return;
    const cx = c[1] === 'l' ? x + 10 * k : x + w - 10 * k, cy = c[0] === 't' ? y - 4 * k : y + hh + 4 * k, R = rng(i * 7 + 3);
    const rot = (c === 'tl' || c === 'br' ? -0.62 : 0.62) + (R() - 0.5) * 0.2;
    main.save(); main.globalAlpha = a;
    tape(main, cx, cy, 170 * k, 48 * k, rot, withAlpha(p.tapeColor, 0.78), i * 5 + 2);
    main.restore();
  });
}
