// common.doodle — a hand doodle drawn stroke by stroke (marker on a board or paper), from the whiteboard acceptance film's fx.doodle,
// with an optional board eraser that wipes it away. common.pen draws one ready-made mark (a circle, an arrow, a tick) in a box; this
// draws any picture given as a list of strokes, each with its own time, colour and width.
// Strokes come as JSON in `data`: [{ a, b, p: [x0,y0,x1,y1,…], c, w, d, g, k, o }]
//   a/b   seconds (from the item's start) the stroke starts / finishes drawing
//   p     points as fractions of the frame (x of the width, y of the height)
//   c     colour (default `ink`), w width in px on a 1080 short side (default `width`)
//   d     dashed, g jiggle group (the stroke sways with its group by `jig`), k [period, phase, duty] blinks on and off once drawn
//   o     opacity (default 0.94)
// erase: the second the eraser starts; it sweeps the box (ex0..ex1, ey0..ey1) from top to bottom in eraseDur seconds, zig-zagging
// across, and whatever it has passed is gone. The wobble (boil) is a hash of the stroke, the point and the boil frame: draw(t) stays
// a pure function of t.
import { clamp, cssCamel, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';

export interface Stroke { a?: number; b?: number; p?: number[]; c?: string; w?: number; d?: boolean | number; g?: number; k?: [number, number, number]; o?: number }
interface P { data: string; ink: string; width: number; boil: number; wob: number; jig: number; erase: number; eraseDur: number; ex0: number; ex1: number; ey0: number; ey1: number }
interface S { cv: HTMLCanvasElement; key: string | null; strokes: Stroke[] }

/** a fixed −1…1 value for (a, b, c) */
export function hash3(a: number, b: number, c: number) {
  let x = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return ((x >>> 0) % 10000) / 5000 - 1;
}
/** the strokes in `data` (anything that is not a JSON array: none) */
export function parseStrokes(text: string): Stroke[] {
  try { const v = JSON.parse(text || '[]'); return Array.isArray(v) ? v.filter((s) => s && typeof s === 'object') : []; } catch { return []; }
}
/** how much of a stroke drawn from a to b shows at t (0–1): nearly even speed with a soft start and end */
export function strokeProgress(t: number, a: number, b: number) {
  const q = clamp((t - a) / Math.max(0.01, b - a));
  return q < 1 ? q * q * (3 - 2 * q) * 0.35 + q * 0.65 : 1;
}
/** a blinking stroke (k: [period, phase, duty]) once drawn: whether it shows at t */
export function blinkOn(t: number, b: number, k?: [number, number, number]) {
  if (!k || t < b) return true;
  const [per, ph, duty] = k, m = (((t + ph) % per) + per) % per;
  return m / per <= duty;
}
/** the eraser's sweep at t: -1 before it starts, else 0→1 over eraseDur */
export const eraseAt = (t: number, erase: number, dur: number) => (erase >= 0 && t >= erase ? clamp((t - erase) / Math.max(0.05, dur)) : -1);

// the default: a ground line, two peaks, a flag on the summit and a dashed trail up to it
const DEFAULT = JSON.stringify([
  { a: 0, b: 0.4, p: [0.1, 0.62, 0.9, 0.62] },
  { a: 0.4, b: 1.2, p: [0.15, 0.62, 0.38, 0.42, 0.5, 0.52, 0.64, 0.34, 0.85, 0.62] },
  { a: 1.2, b: 1.35, p: [0.64, 0.34, 0.64, 0.26], w: 7 },
  { a: 1.35, b: 1.6, p: [0.64, 0.26, 0.72, 0.285, 0.64, 0.31], c: '#d64032', w: 7 },
  { a: 1.6, b: 2.4, p: [0.3, 0.6, 0.42, 0.555, 0.5, 0.575, 0.57, 0.47, 0.63, 0.37], c: '#d64032', d: 1, w: 6 },
]);

export const doodle: ItemType<P, S> = {
  type: 'common.doodle', label: '手繪塗鴉', category: 'mark', kind: 'overlay',
  doc: '一筆一筆畫出來的手繪塗鴉（麥克筆線條）：data 是筆畫清單 JSON [{a,b,p:[x,y,…],c,w,d,g,k,o}]——a 到 b 秒畫完、p 是畫面比例座標的點、c 顏色、w 筆寬、d 虛線、g 同一組一起晃（jig 幅度）、k [週期,相位,亮的比例] 畫完後一閃一閃、o 透明度；boil 讓線條每秒抖幾次（wob 幅度），erase 秒起一塊板擦在 ex0–ex1、ey0–ey1 的範圍由上往下來回擦掉；白板解說、筆記、示意圖、畫給你看；一個現成的圈、箭頭、打勾用 common.pen，跨剪接點描形狀用 common.pen 的 trace；音效配 common.scribble（畫線、板擦）',
  params: [
    { key: 'data', label: '筆畫（JSON：[{a,b,p:[x,y…],c,w,d,g,k,o}]，點是畫面比例）', type: 'text', default: DEFAULT },
    { key: 'ink', label: '預設墨色', type: 'color', default: '#24324a' },
    { key: 'width', label: '預設筆寬（以 1080 短邊計的 px）', type: 'number', min: 1, max: 40, step: 0.5, default: 9 },
    { key: 'boil', label: '線條每秒抖幾次（0＝不抖）', type: 'number', min: 0, max: 24, step: 1, default: 6 },
    { key: 'wob', label: '抖動幅度（px，以 1080 短邊計）', type: 'number', min: 0, max: 8, step: 0.1, default: 1.4 },
    { key: 'jig', label: '整組晃動幅度（px，有 g 的筆畫）', type: 'number', min: 0, max: 40, step: 0.5, default: 0 },
    { key: 'erase', label: '板擦開始（秒；-1＝不擦）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'eraseDur', label: '板擦擦多久（秒）', type: 'number', min: 0.1, max: 3, step: 0.05, default: 0.5 },
    { key: 'ex0', label: '擦的範圍左（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'ex1', label: '擦的範圍右（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'ey0', label: '擦的範圍上（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'ey1', label: '擦的範圍下（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  build(ctx) {
    const cv = document.createElement('canvas');
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    ctx.root.appendChild(cv);
    return { cv, key: null, strokes: [] };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, st) {
    const { local, params: p, W, H } = ctx, g = canvasAt(st.cv, W, H);
    if (st.key !== p.data) { st.key = p.data; st.strokes = parseStrokes(p.data); }
    const u = Math.min(W, H) / 1080, boil = p.boil || 0, wob = (p.wob || 0) * u, frame = boil > 0 ? Math.floor(local * boil) : 0, jig = (p.jig || 0) * u;

    // the eraser: what it has passed is clipped away from the strokes begun before it (one drawn after it is on the clean board)
    const eraseP = eraseAt(local, p.erase, p.eraseDur);
    const ex0 = p.ex0 * W, ex1 = p.ex1 * W, ey0 = p.ey0 * H, ey1 = p.ey1 * H, eh = 70 * u;
    const lineY = eraseP < 0 ? -1 : ey0 + (ey1 - ey0 + eh) * eraseP - eh * 0.5;
    const wiped = () => { g.beginPath(); g.rect(0, 0, W, H); g.rect(ex0, ey0 - 4 * u, ex1 - ex0, Math.max(0, lineY - ey0 + 4 * u)); g.clip('evenodd'); };
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';

    st.strokes.forEach((s, si) => {
      const a = Number(s.a) || 0, b = Math.max(a + 0.01, Number(s.b) || a + 0.5);
      if (local < a || !blinkOn(local, b, s.k)) return;
      const pts = Array.isArray(s.p) ? s.p : [], n = Math.floor(pts.length / 2);
      if (n < 2) return;
      let dx = 0, dy = 0;
      if (s.g != null && jig > 0) {
        const gi = Number(s.g) || 0;
        dx = jig * Math.sin(2 * Math.PI * 1.35 * local + gi * 1.7);
        dy = jig * 0.8 * Math.sin(2 * Math.PI * 1.05 * local + gi * 2.3 + 1);
      }
      const xs: number[] = [], ys: number[] = [];
      for (let i = 0; i < n; i++) {
        xs.push(pts[2 * i] * W + dx + (wob ? hash3(si, i, frame) * wob : 0));
        ys.push(pts[2 * i + 1] * H + dy + (wob ? hash3(si + 977, i, frame) * wob : 0));
      }
      const seg: number[] = [];
      let total = 0;
      for (let i = 1; i < n; i++) { const l = Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); seg.push(l); total += l; }
      let left = total * strokeProgress(local, a, b);
      const lw = (Number(s.w) || p.width || 9) * u;
      g.strokeStyle = s.c || p.ink;
      g.globalAlpha = s.o != null ? Number(s.o) : 0.94;
      g.lineWidth = lw;
      g.setLineDash(s.d ? [lw * 2.2, lw * 1.9] : []);
      const erased = eraseP >= 0 && a < p.erase;
      if (erased) { g.save(); wiped(); }
      g.beginPath(); g.moveTo(xs[0], ys[0]);
      for (let i = 1; i < n && left > 0; i++) {
        const l = seg[i - 1];
        if (left >= l) { g.lineTo(xs[i], ys[i]); left -= l; }
        else { const f = left / l; g.lineTo(xs[i - 1] + (xs[i] - xs[i - 1]) * f, ys[i - 1] + (ys[i] - ys[i - 1]) * f); left = 0; }
      }
      g.stroke();
      if (erased) g.restore();
    });
    g.restore();

    // the eraser itself (wood back, grey felt), zig-zagging across the box while it moves down
    if (eraseP >= 0 && eraseP < 1) {
      const ew = 170 * u, sway = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * eraseP - Math.PI / 2);
      g.save();
      g.translate(ex0 + ew * 0.5 + (ex1 - ex0 - ew) * sway, lineY);
      g.rotate(-0.12 + 0.24 * sway);
      g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(-ew / 2 + 6 * u, -eh / 2 + 8 * u, ew, eh);
      g.fillStyle = '#c4874a'; g.fillRect(-ew / 2, -eh / 2, ew, eh * 0.62);
      g.fillStyle = '#4c4f5c'; g.fillRect(-ew / 2, -eh / 2 + eh * 0.62, ew, eh * 0.38);
      g.strokeStyle = '#2b2b30'; g.lineWidth = 3 * u; g.setLineDash([]);
      g.strokeRect(-ew / 2, -eh / 2, ew, eh);
      g.restore();
    }
  },
};
