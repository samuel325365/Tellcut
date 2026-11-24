// common.strike — "it was A … no, it's B": a soft line fades in, at `at` a red marker strikes it out with two strokes, and a red stamp
// with the new line slams down under it. Promoted from the baking-sin short's fx.sinNote (原片：慢活・療癒・溫柔 → 本片：來算帳。);
// corrections, expectation vs reality, myth busting.
// 2026-11-24: `look` picks how the line is struck: the two marker strokes (marker), a tight scribble (scribble), a big hand-drawn X
// (cross) or a solid bar wiped across it like a redaction (bar); the stamp is the same for all.
import { clamp, cssCamel, eOut3 as eOut, h, prog, rng, textEm, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { fitPx } from './text.ts';

export type StrikeLook = 'marker' | 'scribble' | 'cross' | 'bar';
interface P { label: string; before: string; after: string; at: number; look: StrikeLook; y: number; gap: number; size: number; color: string; accent: string; paper: string; softFont: string; font: string }
interface S { cv: HTMLCanvasElement; label: HTMLElement; before: HTMLElement; stamp: HTMLElement; after: HTMLElement }

/** how far the two marker strokes are drawn at t (they take 0.14 s and 0.12 s, the second starting 0.08 s after the first) */
export const strokesAt = (t: number, at: number) => [prog(t, at, at + 0.14), prog(t, at + 0.08, at + 0.2)];

/** the two red marker strokes across a line centred at cx, half wide, y below its middle (common.casefile strikes its quote with them) */
export function markerStrokes(g: CanvasRenderingContext2D, cx: number, half: number, y: number, k: number, color: string, t: number, at: number) {
  const [s1, s2] = strokesAt(t, at);
  g.strokeStyle = color; g.lineWidth = 16 * k; g.lineCap = 'round';
  if (s1 > 0) { g.beginPath(); g.moveTo(cx - half, y - 22 * k); g.lineTo(cx - half + 2 * half * s1, y - 30 * k + Math.sin(s1 * 7) * 6 * k); g.stroke(); }
  if (s2 > 0) { g.beginPath(); g.moveTo(cx - half + 20 * k, y - 50 * k); g.lineTo(cx - half + 20 * k + (2 * half - 40 * k) * s2, y + 4 * k); g.stroke(); }
}

/** What the scribble, cross and bar looks lay over the line at t: strokes (polylines `w` px wide, already cut to how far they are
 *  drawn) and filled rectangles. The line is centred at (cx, cy), `half` wide each side, `fs` its font size; a pure function of
 *  its arguments (the scribble's loose hand comes from a fixed seed, not from the time). */
export type Mark = { pts: Array<[number, number]>; w: number } | { rect: [number, number, number, number] };
export function strikeMarks(look: Exclude<StrikeLook, 'marker'>, t: number, at: number, cx: number, cy: number, half: number, fs: number, k: number): Mark[] {
  if (look === 'bar') {   // a solid bar over the words, wiped open from the left in a quarter second
    const q = eOut(prog(t, at, at + 0.26)), x0 = cx - half + 18 * k, w = (2 * half - 36 * k) * q;
    return q > 0 ? [{ rect: [x0, cy - 0.6 * fs, w, 1.16 * fs] }] : [];
  }
  if (look === 'cross') {   // two strokes from corner to corner, a little wobble along each, the second starting as the first ends
    const leg = (x0: number, y0: number, x1: number, y1: number, q: number, phase: number) => {
      const n = 24, pts: Array<[number, number]> = [], len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      for (let i = 0; i <= n * q; i++) {
        const u = i / n, bow = Math.sin(u * Math.PI) * 10 * k + Math.sin(u * Math.PI * 5 + phase) * 3.5 * k;
        pts.push([x0 + (x1 - x0) * u + nx * bow, y0 + (y1 - y0) * u + ny * bow]);
      }
      return pts;
    };
    const tall = 0.95 * fs, q1 = eOut(prog(t, at, at + 0.16)), q2 = eOut(prog(t, at + 0.2, at + 0.36));
    return [
      ...(q1 > 0 ? [{ pts: leg(cx - half, cy - tall, cx + half, cy + tall, q1, 0.4), w: 15 * k }] : []),
      ...(q2 > 0 ? [{ pts: leg(cx + half - 12 * k, cy - tall * 1.05, cx - half + 8 * k, cy + tall * 0.9, q2, 2.1), w: 15 * k }] : []),
    ];
  }
  // scribble: a tight zigzag, top to bottom and back, a turn every ~0.3 em along the line, drawn left to right over 0.3 s
  // there and back again, the way back half a turn out of step, so the strokes cross and leave little of the words
  const r = rng(9173); r();
  const n = Math.max(10, Math.round((2 * half) / (0.13 * fs))), q = prog(t, at, at + 0.3), pts: Array<[number, number]> = [];
  const pass = (back: boolean) => Array.from({ length: n + 1 }, (_, j) => {
    const i = back ? n - j : j, u = Math.min(1, Math.max(0, (i + (back ? 0.5 : 0)) / n));
    return [cx - half + 2 * half * u + (r() - 0.5) * 0.08 * fs, cy + (j % 2 ? 1 : -1) * (0.3 + 0.18 * r()) * fs + (back ? 0.06 : -0.04) * fs] as [number, number];
  });
  const turns = [...pass(false), ...pass(true).slice(1)], upto = q * (turns.length - 1);
  for (let i = 0; i <= Math.floor(upto); i++) pts.push(turns[i]);
  if (upto < turns.length - 1 && q > 0) { const a = turns[Math.floor(upto)], b = turns[Math.floor(upto) + 1], f = upto - Math.floor(upto); pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
  return q > 0 ? [{ pts, w: 7 * k }] : [];
}

function drawMarks(g: CanvasRenderingContext2D, marks: Mark[], color: string) {
  g.strokeStyle = color; g.fillStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const m of marks) {
    if ('rect' in m) { g.fillRect(...m.rect); continue; }
    if (m.pts.length < 2) continue;
    g.lineWidth = m.w; g.beginPath(); g.moveTo(...m.pts[0]);
    for (const p of m.pts.slice(1)) g.lineTo(...p);
    g.stroke();
  }
}

export const strike: ItemType<P, S> = {
  type: 'common.strike', label: '劃掉改寫', category: 'text', kind: 'overlay',
  doc: '先浮出一行柔和的細字（上面一行小標），到 at 秒被 accent 色劃掉（look 選怎麼劃），下面蓋上一個 accent 底的大字章；「原本是 A，其實是 B」、期待與現實、破解迷思、反轉',
  variants: { param: 'look', list: [
    { value: 'marker', label: '麥克筆兩筆', doc: '兩筆粗粗的麥克筆線從左斜斜劃過那行字（第二筆比較斜）；什麼「其實不是」都搭' },
    { value: 'scribble', label: '塗鴉亂劃', doc: '一道來回很密的鋸齒亂線在約 0.3 秒內從左塗滿整行；氣到塗掉、說錯話、收回前言' },
    { value: 'cross', label: '大叉', doc: '兩筆有點抖的手寫大叉從角到角打在整行上；錯誤、NG、千萬別這樣做' },
    { value: 'bar', label: '塗黑', doc: '一條 accent 色的實心色條從左刷過、把整行蓋掉，像機密文件的塗黑；不能說的事、審查、取消的計畫' },
  ] },
  params: [
    { key: 'label', label: '上面的小標（空＝不顯示）', type: 'string', default: '原片：' },
    { key: 'before', label: '被劃掉的那行', type: 'string', default: '慢活・療癒・溫柔' },
    { key: 'after', label: '蓋上去的章', type: 'string', default: '本片：來算帳。' },
    { key: 'at', label: '劃掉的時間（秒）', type: 'number', min: 0, max: 600, step: 0.05, default: 1.0 },
    { key: 'look', label: '劃法', type: 'enum', options: ['marker', 'scribble', 'cross', 'bar'], default: 'marker' },
    { key: 'y', label: '被劃掉那行的高度（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.3 },
    { key: 'gap', label: '章在下面多遠（畫面短邊的比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.22 },
    { key: 'size', label: '字級（倍）', type: 'number', min: 0.3, max: 3, step: 0.05, default: 1 },
    { key: 'color', label: '細字顏色', type: 'color', default: '#ffffff' },
    { key: 'accent', label: '劃線與章的顏色', type: 'color', default: '#e63a2e', theme: 'palette.accent' },
    { key: 'paper', label: '章上的字色', type: 'color', default: '#f6ead8', theme: 'palette.paper' },
    { key: 'softFont', label: '細字字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'font', label: '章的字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root), mk = (parent: HTMLElement) => { const d = h('div', null, null, parent); cssCamel(d, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', transform: 'translate(-50%, -50%)' }); return d; };
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    const label = mk(ctx.root), before = mk(ctx.root), stamp = mk(ctx.root), after = h('div', null, null, stamp);
    return { cv, label, before, stamp, after };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local: t, dur } = ctx, k = (Math.min(W, H) / 1080) * p.size, out = 1 - prog(t, dur - 0.1, dur);
    const a = eOut(prog(t, 0.05, 0.6)), y = p.y * H - a * 12 * k, cx = W / 2, soft = `'${p.softFont}', 'Noto Serif TC', serif`;
    s.label.textContent = p.label; s.before.textContent = p.before;
    const shadow = `0 0 ${16 * k}px rgba(0,0,0,0.5)`;
    // lines too long for the safe width shrink (the stamp also leaves room for its padding); the marker spans the line as drawn
    const room = W * (1 - 2 * ctx.theme.safe.side), bf = fitPx(p.before, 76 * k, room);
    cssCamel(s.label, { display: p.label ? 'block' : 'none', left: `${cx}px`, top: `${y - 100 * k}px`, fontSize: `${fitPx(p.label, 40 * k, room)}px`, fontWeight: '500', fontFamily: soft, color: p.color, opacity: String(0.9 * a * out), textShadow: shadow });
    cssCamel(s.before, { left: `${cx}px`, top: `${y - 26 * k}px`, fontSize: `${bf}px`, fontWeight: '500', fontFamily: soft, color: p.color, opacity: String(0.9 * a * out), textShadow: shadow });
    // the marker: two strokes across the line, the second slanting, under the words; the other looks are drawn over them
    const g = canvasAt(s.cv, W, H), half = (textEm(p.before) * bf) / 2 + 40 * k, look = p.look ?? 'marker', over = look !== 'marker';
    g.globalAlpha = out;
    if (over) drawMarks(g, strikeMarks(look, t, p.at, cx, y - 26 * k, half, bf, k), p.accent);
    else markerStrokes(g, cx, half, y, k, p.accent, t, p.at);
    cssCamel(s.cv, { zIndex: over ? '1' : '' });
    // the stamp
    const hp = prog(t, p.at + 0.18, p.at + 0.32);
    s.after.textContent = p.after;
    cssCamel(s.stamp, { zIndex: over ? '2' : '', display: hp > 0 ? 'block' : 'none', left: `${cx}px`, top: `${p.y * H + p.gap * Math.min(W, H)}px`, padding: `${14 * k}px ${35 * k}px`, borderRadius: `${16 * k}px`,
      background: p.accent, boxShadow: `inset 0 0 0 ${10 * k}px ${p.accent}, inset 0 0 0 ${15 * k}px ${p.paper}`, opacity: String(clamp(hp * 2) * out),
      transform: `translate(-50%, -50%) rotate(-4deg) scale(${2.2 - 1.2 * eOut(hp)})` });
    cssCamel(s.after, { fontSize: `${fitPx(p.after, 96 * k, room - 70 * k)}px`, fontWeight: '900', lineHeight: '1.2', color: p.paper, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, whiteSpace: 'pre' });
  },
};
