// common.strike — "it was A … no, it's B": a soft line fades in, at `at` a red marker strikes it out with two strokes, and a red stamp
// with the new line slams down under it. Promoted from the baking-sin short's fx.sinNote (原片：慢活・療癒・溫柔 → 本片：來算帳。);
// corrections, expectation vs reality, myth busting.
import { clamp, cssCamel, eOut3 as eOut, h, prog, textEm, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';

interface P { label: string; before: string; after: string; at: number; y: number; gap: number; size: number; color: string; accent: string; paper: string; softFont: string; font: string }
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

export const strike: ItemType<P, S> = {
  type: 'common.strike', label: '劃掉改寫', category: 'text', kind: 'overlay',
  doc: '先浮出一行柔和的細字（上面一行小標），到 at 秒被紅色麥克筆兩筆劃掉，下面蓋上一個紅底大字章；「原本是 A，其實是 B」、期待與現實、破解迷思、反轉',
  params: [
    { key: 'label', label: '上面的小標（空＝不顯示）', type: 'string', default: '原片：' },
    { key: 'before', label: '被劃掉的那行', type: 'string', default: '慢活・療癒・溫柔' },
    { key: 'after', label: '蓋上去的章', type: 'string', default: '本片：來算帳。' },
    { key: 'at', label: '劃掉的時間（秒）', type: 'number', min: 0, max: 600, step: 0.05, default: 1.0 },
    { key: 'y', label: '被劃掉那行的高度（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.3 },
    { key: 'gap', label: '章在下面多遠（畫面短邊的比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.22 },
    { key: 'size', label: '字級（倍）', type: 'number', min: 0.3, max: 3, step: 0.05, default: 1 },
    { key: 'color', label: '細字顏色', type: 'color', default: '#ffffff' },
    { key: 'accent', label: '麥克筆與章的顏色', type: 'color', default: '#e63a2e', theme: 'palette.accent' },
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
    cssCamel(s.label, { display: p.label ? 'block' : 'none', left: `${cx}px`, top: `${y - 100 * k}px`, fontSize: `${40 * k}px`, fontWeight: '500', fontFamily: soft, color: p.color, opacity: String(0.9 * a * out), textShadow: shadow });
    cssCamel(s.before, { left: `${cx}px`, top: `${y - 26 * k}px`, fontSize: `${76 * k}px`, fontWeight: '500', fontFamily: soft, color: p.color, opacity: String(0.9 * a * out), textShadow: shadow });
    // the marker: two strokes across the line, the second slanting
    const g = canvasAt(s.cv, W, H), half = (textEm(p.before) * 76 * k) / 2 + 40 * k;
    g.globalAlpha = out; markerStrokes(g, cx, half, y, k, p.accent, t, p.at);
    // the stamp
    const hp = prog(t, p.at + 0.18, p.at + 0.32);
    s.after.textContent = p.after;
    cssCamel(s.stamp, { display: hp > 0 ? 'block' : 'none', left: `${cx}px`, top: `${p.y * H + p.gap * Math.min(W, H)}px`, padding: `${14 * k}px ${35 * k}px`, borderRadius: `${16 * k}px`,
      background: p.accent, boxShadow: `inset 0 0 0 ${10 * k}px ${p.accent}, inset 0 0 0 ${15 * k}px ${p.paper}`, opacity: String(clamp(hp * 2) * out),
      transform: `translate(-50%, -50%) rotate(-4deg) scale(${2.2 - 1.2 * eOut(hp)})` });
    cssCamel(s.after, { fontSize: `${96 * k}px`, fontWeight: '900', lineHeight: '1.2', color: p.paper, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, whiteSpace: 'pre' });
  },
};
