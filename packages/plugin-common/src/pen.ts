// common.pen — a hand-drawn mark that draws itself on: a loop around something, an arrow pointing at it, or a wavy underline.
// `style` picks the pen (sketch.ts): smooth is the original clean SVG line; ballpoint, marker, crayon and pencil draw on a canvas
// with their own wobble, boiling `boil` times a second. The canvas pens also draw the doodles the shorts drew for themselves:
// check, cross, heart, star, stars (a burst of little stars and hearts), burst (a spiky ring), rays (surprise lines), steam,
// clock (hands spinning), house, snow, diamond, qmark and thumb (fd-tangyuan's tyDoodle, fd-ice's doodles, fd-quotes' fx.doodle,
// fishing1's check). Their fills are hatched in crayon and pencil and flat in the other pens.
// kind trace (uk-transit's fx.shapeTrace, a match cut): a line traces a shape (`from`, points as frame fractions) on the shot before
// the cut, carries over the cut at `cut` seconds, morphs onto the same shape in the next shot (`to`) over `morph` and flashes as it locks.
import { clamp, cssCamel, eIO3, eOut3, lerp, prog, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { backOut } from './hand.ts';
import {
  arrowHead, ellipsePts, flatFill, grainBegin, grainEnd, hatchFill, heartPts, inkStroke, loopPts, pathLen, place, quadPts, rectSides, starPts, wavePts,
  type GrainLayer, type PenStyle, type Pt,
} from './sketch.ts';

export const PEN_KINDS = ['circle', 'arrow', 'underline', 'check', 'cross', 'heart', 'star', 'stars', 'burst', 'rays', 'steam', 'clock', 'house', 'snow', 'diamond', 'qmark', 'thumb'] as const;
type Doodle = (typeof PEN_KINDS)[number];
type Kind = Doodle | 'trace';
const SVG_KINDS: Kind[] = ['circle', 'arrow', 'underline'];

/** "0.2,0.8 0.5,0.2 0.8,0.8" → points (frame fractions); pieces that are not two numbers are left out */
export const parsePts = (s: string): Pt[] => String(s ?? '').trim().split(/\s+/).filter(Boolean).map((p) => p.split(',').map(Number) as Pt).filter((p) => p.length === 2 && p.every(Number.isFinite));
/** `pts` as n points evenly spaced along their length */
export function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length < 2) return Array.from({ length: n }, () => pts[0] ?? [0.5, 0.5]);
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[L.length - 1] || 1, out: Pt[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const d = (tot * k) / (n - 1);
    while (j < pts.length - 1 && L[j] < d) j++;
    const q = (d - L[j - 1]) / (L[j] - L[j - 1] || 1);
    out.push([lerp(pts[j - 1][0], pts[j][0], q), lerp(pts[j - 1][1], pts[j][1], q)]);
  }
  return out;
}
/** kind trace at `local`: the line (120 frame-fraction points between the two shapes), how much of it is drawn and the lock flash (0–1).
 *  Drawing starts drawDur + 0.12 s before the cut (or at 0), the morph starts at the cut. */
export function tracePose(local: number, from: Pt[], to: Pt[], cut: number, drawDur: number, morph: number): { pts: Pt[]; drawn: number; flash: number } {
  const a = resample(from, 120), b = resample(to.length ? to : from, 120), start = Math.max(0, cut - drawDur - 0.12);
  const drawn = drawDur > 0 ? eOut3(clamp((local - start) / drawDur)) : 1, m = morph > 0 ? eIO3(clamp((local - cut) / morph)) : local >= cut ? 1 : 0, lock = local - cut - morph;
  return { pts: a.map((p, i) => [lerp(p[0], b[i][0], m), lerp(p[1], b[i][1], m)] as Pt), drawn: local < start ? 0 : drawn, flash: lock > 0 ? Math.exp(-lock * 7) : 0 };
}

interface P { from: string; to: string; cut: number; morph: number; kind: Kind; x: number; y: number; w: number; h: number; color: string; width: number; drawDur: number; angle: number; style: PenStyle; boil: number; filled: boolean; fill: string }
interface S { svg: SVGSVGElement; path: SVGPathElement; key: string; cv: HTMLCanvasElement; layer: GrainLayer }
const NS = 'http://www.w3.org/2000/svg';

/** The shape in a 0–100 box as absolute path commands (numbers in pairs), scaled to w×h pixels. */
function shape(kind: Kind, w: number, h: number): string {
  const sc = (d: string) => { let i = 0; return d.replace(/-?\d+(\.\d+)?/g, (n) => String(+(parseFloat(n) * (i++ % 2 === 0 ? w : h) / 100).toFixed(2))); };
  if (kind === 'circle') return sc('M 50 4 C 82 0 99 24 96 52 C 93 82 68 99 40 96 C 12 93 1 68 5 40 C 9 14 36 3 66 9');
  if (kind === 'arrow') return sc('M 4 82 C 28 96 62 74 90 28 M 90 28 L 70 34 M 90 28 L 93 50');
  let d = 'M 2 50';
  for (let i = 0; i < 8; i++) d += ` Q ${2 + i * 12 + 6} ${i % 2 ? 78 : 22} ${2 + (i + 1) * 12} 50`;
  return sc(d);
}

/** One line of a doodle: its points, an optional fill ('fill' the fill colour, 'line' the pen's colour), its own progress `p`
 *  (else it is drawn in turn with the others), alpha, a width factor, and `dot` for a filled round dot of radius w × that */
export interface Mark { pts: Pt[]; fill?: 'fill' | 'line'; p?: number; alpha?: number; w?: number; dot?: number }

/** The doodle's lines in a box bw × bh centred on 0,0, at `local` with the first fraction `drawn` of it drawn on (a pure function). */
export function doodleMarks(kind: Doodle, bw: number, bh: number, local: number, drawn: number, seed = 1): Mark[] {
  const S = Math.min(bw, bh) / 100, U = (pts: Pt[], rot = 0) => place(pts, 0, 0, S, rot);
  switch (kind) {
    case 'circle': return [{ pts: loopPts(0, 0, bw * 0.46, bh * 0.44, 1, seed) }];
    case 'arrow': {
      const pts = quadPts([-bw * 0.46, bh * 0.32], [bw * 0.05, bh * 0.42], [bw * 0.4, -bh * 0.22], 28);
      return [{ pts }, { pts: arrowHead(pts, Math.min(bw, bh) * 0.22) }];
    }
    case 'underline': return [{ pts: wavePts(-bw * 0.48, 0, bw * 0.48, 0, bh * 0.28, 4, 48) }];
    case 'check': return [{ pts: U([[-34, 2], [-10, 28], [36, -30]]) }];
    case 'cross': return [{ pts: U([[-30, -30], [30, 30]]) }, { pts: U([[30, -30], [-30, 30]]) }];
    case 'heart': return [{ pts: U(heartPts(0, -6, 2.7, 60)), fill: 'line' }];
    case 'star': return [{ pts: U(starPts(0, 4, 48)), fill: 'fill' }];
    case 'stars': {
      const out: Mark[] = [];
      for (let i = 0; i < 8; i++) {
        const f = clamp((local - i * 0.06) / 0.45);
        if (f <= 0) continue;
        const a = (i / 8) * Math.PI * 2 + 0.3, ex = Math.cos(a) * 40 * eOut3(f), ey = Math.sin(a) * 36 * eOut3(f);
        const sz = 9 * backOut(f) * (1 + 0.08 * Math.sin(local * 6 + i)), rot = Math.sin(local * 2 + i) * 0.25;
        out.push({ pts: U(i % 2 ? heartPts(ex, ey, sz / 14, 40) : starPts(ex, ey, sz, rot)), fill: i % 2 ? 'line' : 'fill', p: 1, w: 0.6 });
      }
      return out;
    }
    case 'burst': {
      const k = 0.8 + 0.2 * eOut3(drawn), pts: Pt[] = [];
      for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2, r = (i % 2 ? 38 : 48) * k; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      return [{ pts: U(pts) }];
    }
    case 'rays': return [-150, -115, -90, -65, -30].map((d) => { const a = (d * Math.PI) / 180; return { pts: U([[Math.cos(a) * 22, 14 + Math.sin(a) * 22], [Math.cos(a) * 48, 14 + Math.sin(a) * 48]]) }; });
    case 'steam': {
      const out: Mark[] = [];
      for (let i = 0; i < 3; i++) {
        const f = (local * 0.62 + i * 0.33) % 1, pts: Pt[] = [];
        for (let j = 0; j <= 16; j++) { const q = j / 16; pts.push([(i - 1) * 22 + Math.sin(q * 5 + i * 2 + local * 1.5) * 8, 42 - f * 22 - q * 66]); }
        out.push({ pts: U(pts), p: 1, alpha: Math.sin(f * Math.PI) * clamp(drawn * 1.5) });
      }
      return out;
    }
    case 'clock': {
      const out: Mark[] = [
        { pts: U(ellipsePts(0, 4, 40, 40, { turns: 1.04 })), fill: 'fill' },
        ...[-1, 1].map((sx) => ({ pts: U(ellipsePts(sx * 30, -36, 10, 10)), fill: 'line' as const, w: 0.7 })),
      ];
      for (let i = 0; i < 12; i += 3) { const a = (i / 12) * Math.PI * 2; out.push({ pts: U([[Math.cos(a) * 31, 4 + Math.sin(a) * 31], [Math.cos(a) * 36, 4 + Math.sin(a) * 36]]), w: 0.6 }); }
      const hands = clamp(drawn * 2 - 1), am = -Math.PI / 2 + local * 2.6, ah = -Math.PI / 2 + local * 0.22 + 1;
      out.push({ pts: U([[0, 4], [Math.cos(am) * 27, 4 + Math.sin(am) * 27]]), p: hands, w: 0.8 }, { pts: U([[0, 4], [Math.cos(ah) * 17, 4 + Math.sin(ah) * 17]]), p: hands });
      return out;
    }
    case 'house': {
      const out: Mark[] = [
        { pts: U([[-44, -4], [0, -44], [44, -4]]), fill: 'line' },
        ...rectSides(-32, -4, 64, 48, 3).map((pts) => ({ pts: U(pts) })),
        { pts: U([[18, -20], [18, -40], [28, -40], [28, -12]]), w: 0.8 },
        ...rectSides(-8, 18, 16, 26, 1).slice(0, 3).map((pts) => ({ pts: U(pts), w: 0.7 })),
        { pts: U([[-24, 6], [-10, 6], [-10, 18], [-24, 18]]), fill: 'fill', w: 0.6 },
      ];
      if (drawn >= 1) { const f = (local * 0.5) % 1; out.push({ pts: U(heartPts(23 + Math.sin(f * 7) * 4, -50 - f * 30, 0.5 * (0.7 + 0.5 * f), 40)), fill: 'line', p: 1, alpha: Math.sin(f * Math.PI), w: 0.5 }); }
      return out;
    }
    case 'snow': {
      const out: Mark[] = [], rot = local * 0.4;
      for (let k = 0; k < 6; k++) {
        const a = rot + (k * Math.PI) / 3, P = (d: number, o: number): Pt => [Math.cos(a) * d - Math.sin(a) * o, Math.sin(a) * d + Math.cos(a) * o];
        out.push({ pts: U([P(0, 0), P(46, 0)]) }, { pts: U([P(24, 0), P(36, 11)]), w: 0.75 }, { pts: U([P(24, 0), P(36, -11)]), w: 0.75 });
      }
      return out;
    }
    case 'diamond': {
      const P: Pt[] = [[-40, -12], [-22, -36], [22, -36], [40, -12], [0, 40]];
      const out: Mark[] = [{ pts: U([...P, P[0]]), fill: 'fill' }, { pts: U([[-40, -12], [40, -12]]), w: 0.6 }, { pts: U([[-22, -36], [-11, -12], [0, 40], [11, -12], [22, -36]]), w: 0.5 }];
      for (const [x, y, ph] of [[44, -40, 0], [-46, 18, 1.7]]) {
        const tw = Math.max(0, Math.sin(local * 6 + ph)) * clamp(drawn * 2 - 1), L = 12 * tw;
        if (tw > 0.05) out.push({ pts: U([[x - L, y], [x + L, y]]), p: 1, w: 0.6 }, { pts: U([[x, y - L], [x, y + L]]), p: 1, w: 0.6 });
      }
      return out;
    }
    case 'qmark': {
      const hook: Pt[] = [];
      for (let i = 0; i <= 24; i++) { const a = Math.PI * 1.12 + (i / 24) * Math.PI * 1.3; hook.push([Math.cos(a) * 22, -20 + Math.sin(a) * 20]); }
      return [{ pts: U([...hook, ...quadPts(hook[hook.length - 1], [0, 2], [0, 14], 8).slice(1), [0, 20]]) }, { pts: U([[0, 38], [0.5, 38.5]]), dot: 0.75 }];
    }
    case 'thumb': {
      const T: Pt[] = [[-60, 10], [-60, 95], [40, 95], [62, 80], [70, 55], [62, 35], [70, 15], [58, -5], [20, -5], [30, -45], [24, -80], [6, -88], [-8, -70], [-20, -30], [-40, 0], [-60, 10]];
      return [{ pts: U(place(T, -5, -4, 0.5)), fill: 'fill' }, { pts: U(place([[-60, 40], [10, 40]], -5, -4, 0.5)), w: 0.7 }];
    }
  }
}

export const pen: ItemType<P, S> = {
  type: 'common.pen', label: '手繪標記', category: 'mark', kind: 'overlay',
  doc: '像用筆畫上去的標記，邊畫邊出現：圈起來、箭頭、波浪底線，trace 是跨剪接點的形狀描線：在前一個鏡頭描出形狀（from，畫面比例座標的點），到 cut 那一秒跨過剪接點、在 morph 秒內變形到下一個鏡頭的同一個形狀（to），對上時閃一下（match cut、形狀接力），還有打勾、叉叉、愛心、星星、一圈小星星和愛心炸開（stars）、尖刺光圈（burst）、驚訝線（rays）、冒煙（steam）、時鐘（指針會轉）、小房子、雪花、鑽石、問號、讚；style 換筆：smooth 乾淨的線（預設）、ballpoint 原子筆、marker 麥克筆、crayon 蠟筆（塗色是斜線、有紙紋）、pencil 鉛筆，boil 讓線條每秒重新抖幾次（手繪動畫感）；指出畫面裡的重點、商品、細節，繪本、筆記本、教學',
  params: [
    { key: 'kind', label: '種類（trace 跨剪接點的形狀描線）', type: 'enum', options: [...PEN_KINDS, 'trace'], default: 'circle' },
    { key: 'style', label: '筆（smooth 乾淨的線、ballpoint 原子筆、marker 麥克筆、crayon 蠟筆、pencil 鉛筆）', type: 'enum', options: ['smooth', 'ballpoint', 'marker', 'crayon', 'pencil'], default: 'smooth' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'w', label: '寬（畫面寬比例）', type: 'number', min: 0.02, max: 1, step: 0.01, default: 0.4 },
    { key: 'h', label: '高（畫面高比例）', type: 'number', min: 0.02, max: 1, step: 0.01, default: 0.2 },
    { key: 'color', label: '顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'width', label: '筆寬（以 1080 短邊計的 px）', type: 'number', min: 1, max: 40, step: 0.5, default: 10 },
    { key: 'drawDur', label: '畫出來的時間 (s)', type: 'number', min: 0.05, max: 3, step: 0.05, default: 0.5 },
    { key: 'angle', label: '傾斜（度）', type: 'number', min: -90, max: 90, step: 1, default: 0 },
    { key: 'boil', label: '線條每秒重新抖幾次（0＝不抖；smooth 不抖）', type: 'number', min: 0, max: 24, step: 1, default: 8 },
    { key: 'filled', label: '塗色（愛心、星星、房子、時鐘、鑽石、讚）', type: 'bool', default: true },
    { key: 'fill', label: '塗色的顏色', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
    { key: 'from', label: '剪接點前的形狀（trace；x,y 畫面比例，點之間空白分隔）', type: 'string', default: '0.2,0.8 0.5,0.2 0.8,0.8' },
    { key: 'to', label: '剪接點後的形狀（trace；點數可以不同）', type: 'string', default: '0.3,0.8 0.5,0.3 0.7,0.8' },
    { key: 'cut', label: '剪接點（trace；相對項目開始的秒數）', type: 'number', min: 0, max: 60, step: 0.05, default: 0.6 },
    { key: 'morph', label: '變形時間（trace，秒）', type: 'number', min: 0, max: 3, step: 0.05, default: 0.3 },
  ],
  build(ctx) {
    const svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
    path.setAttribute('pathLength', '1');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    ctx.root.appendChild(svg);
    cssCamel(svg as unknown as HTMLElement, { position: 'absolute', overflow: 'visible' });
    const cv = document.createElement('canvas');
    ctx.root.appendChild(cv);
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none' });
    return { svg, path, key: '', cv, layer: {} };
  },
  hide(s) { freeCanvas(s.cv); s.layer.cv = undefined; },
  draw(ctx, s) {
    const p = ctx.params, { W, H } = ctx, k = Math.min(W, H) / 1080, w = p.w * W, hh = p.h * H;
    const out = 1 - prog(ctx.local, ctx.dur - 0.2, ctx.dur), drawn = eOut3(clamp(ctx.local / p.drawDur));
    const style = p.style ?? 'smooth', svgOn = style === 'smooth' && SVG_KINDS.includes(p.kind);
    if (p.kind === 'trace') { cssCamel(s.svg as unknown as HTMLElement, { display: 'none' }); cssCamel(s.cv, { display: 'block', opacity: String(out) }); drawTrace(s, p, W, H, k, ctx.local); return; }
    cssCamel(s.svg as unknown as HTMLElement, { display: svgOn ? 'block' : 'none' });
    cssCamel(s.cv, { display: svgOn ? 'none' : 'block', opacity: String(out) });
    if (!svgOn) { drawDoodle(s, p, style, W, H, k, ctx.local, drawn); return; }
    const key = `${p.kind}|${w}|${hh}`;
    if (key !== s.key) { s.key = key; s.path.setAttribute('d', shape(p.kind, w, hh)); s.svg.setAttribute('width', String(w)); s.svg.setAttribute('height', String(hh)); s.svg.setAttribute('viewBox', `0 0 ${w} ${hh}`); }
    s.path.setAttribute('stroke', p.color);
    s.path.setAttribute('stroke-width', String(p.width * k));
    s.path.setAttribute('stroke-dasharray', '1 1');
    s.path.setAttribute('stroke-dashoffset', String(1 - drawn));
    cssCamel(s.svg as unknown as HTMLElement, { left: `${p.x * W - w / 2}px`, top: `${p.y * H - hh / 2}px`, transform: `rotate(${p.angle}deg)`, opacity: String(out) });
  },
};

/** the canvas pens: the doodle's lines drawn in turn over `drawn` (fills under their lines), crayon on a grained layer */
function drawDoodle(s: S, p: P, style: PenStyle, W: number, H: number, k: number, local: number, drawn: number) {
  const main = canvasAt(s.cv, W, H), crayon = style === 'crayon', g = crayon ? grainBegin(s.layer, W, H) : main;
  const marks = doodleMarks(p.kind as Doodle, p.w * W, p.h * H, local, drawn, 7), lw = p.width * k;
  const seq = marks.filter((m) => m.p === undefined), lens = seq.map((m) => pathLen(m.pts)), tot = lens.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  g.save(); g.translate(p.x * W, p.y * H); g.rotate((p.angle * Math.PI) / 180);
  marks.forEach((m, i) => {
    let q = m.p;
    if (q === undefined) { const j = seq.indexOf(m), a = acc / tot, b = (acc + lens[j]) / tot; acc += lens[j]; q = clamp((drawn - a) / (b - a || 1)); }
    if (q <= 0 || (m.alpha ?? 1) <= 0) return;
    g.save(); g.globalAlpha *= m.alpha ?? 1;
    const color = p.color, w = lw * (m.w ?? 1);
    if (m.dot) { g.fillStyle = color; g.beginPath(); g.arc(m.pts[0][0], m.pts[0][1], w * m.dot * clamp(q * 2), 0, Math.PI * 2); g.fill(); g.restore(); return; }
    if (m.fill && p.filled) {
      const fc = m.fill === 'line' ? color : p.fill;
      if (crayon || style === 'pencil') hatchFill(g, m.pts, fc, { u: k, seed: 31 + i, prog: q, alpha: style === 'pencil' ? 0.45 : 0.7, boil: p.boil, t: local });
      else flatFill(g, m.pts, fc, 0.9 * clamp(q * 1.5));
    }
    inkStroke(g, m.pts, style, { w, color, seed: 11 + i * 13, prog: q, u: k, boil: p.boil, t: local, tip: true, overshoot: true });
    g.restore();
  });
  g.restore();
  if (crayon) grainEnd(s.layer, main, 0.45, k);
}

/** kind trace: a dark underline, the line in the pen colour (thicker and white-hot as it locks), a round tip while it is being drawn */
function drawTrace(s: S, p: P, W: number, H: number, k: number, local: number) {
  const g = canvasAt(s.cv, W, H), q = tracePose(local, parsePts(p.from), parsePts(p.to), p.cut, p.drawDur, p.morph);
  if (q.drawn <= 0) return;
  const pts = q.pts.map(([x, y]) => [x * W, y * H] as Pt), m = Math.max(2, Math.round(pts.length * q.drawn)), lw = p.width * k * 1.1;
  const line = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < m; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.globalAlpha = 0.55; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = lw * 2.2; line();
  g.globalAlpha = 1; g.strokeStyle = p.color; g.lineWidth = lw + 8 * k * q.flash; line();
  if (q.flash > 0.02) { g.globalAlpha = q.flash; g.strokeStyle = '#ffffff'; g.lineWidth = lw * 0.9 + 8 * k * q.flash; line(); }
  if (q.drawn < 1) { const [x, y] = pts[m - 1]; g.globalAlpha = 1; g.fillStyle = p.color; g.beginPath(); g.arc(x, y, lw * 1.2, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
}
