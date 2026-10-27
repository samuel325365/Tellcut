// common.mystery — a cliffhanger cover: the picture darkens toward the edges, a big red seal with a question mark spins in,
// a line above it (第 5 家是…), an optional hint below, and two tapes stuck across on the slant with words scrolling along.
// Promoted from the zhongli-food short's fx.mystery; for teasers that hold something back (下一家、結果、答案 → 原片揭曉).
import { abs, clamp, cssCamel, eBack, eOut3 as eOut, type ItemType, prog } from '@tellcut/engine';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  label: string; hint: string; tape: string; mark: string; x: number; y: number; size: number; beat: number; dim: number;
  font: string; markFont: string; paper: string; ink: string; accent: string; hl: string;
}
interface Tape { t: HTMLElement; inner: HTMLElement }
interface S { dim: HTMLElement; tapes: Tape[]; seal: HTMLElement; mark: HTMLElement; label: HTMLElement; hint: HTMLElement }

/** the tape's words repeated along it */
export const tapeText = (word: string, times = 14) => (word ? Array(times).fill(word).join('　・　') : '');

export const mystery: ItemType<P, S> = {
  type: 'common.mystery', label: '問號懸念', category: 'moment', kind: 'overlay',
  doc: '懸念封面：畫面四周壓暗，中央主色大圓章裡一個問號轉著彈進來，上方一句（第 5 家是…）、下方可加提示，兩條斜貼的紙膠帶上的字緩緩捲動；預告裡賣關子、答案留到原片',
  params: [
    { key: 'label', label: '上方一句', type: 'string', default: '第 5 家是…' },
    { key: 'hint', label: '下方提示（空＝不顯示）', type: 'string', default: '' },
    { key: 'tape', label: '膠帶上的字（空＝不貼膠帶）', type: 'string', default: '原片揭曉' },
    { key: 'mark', label: '圓章裡的字', type: 'string', default: '?' },
    { key: 'x', label: '圓章中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.46 },
    { key: 'y', label: '圓章中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.4 },
    { key: 'size', label: '圓章直徑（畫面短邊的比例）', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.43 },
    { key: 'beat', label: '一拍（秒；圓章跟著晃）', type: 'number', min: 0.1, max: 2, step: 0.01, default: 0.56 },
    { key: 'dim', label: '四周壓暗', type: 'number', min: 0, max: 1, step: 0.05, default: 0.7 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'markFont', label: '圓章字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'paper', label: '紙色（膠帶、圓章框）', type: 'color', default: '#f4ebdd', theme: 'palette.paper' },
    { key: 'ink', label: '墨色', type: 'color', default: '#1e1712', theme: 'palette.ink' },
    { key: 'accent', label: '圓章顏色', type: 'color', default: '#d9442b', theme: 'palette.accent' },
    { key: 'hl', label: '第二條膠帶顏色', type: 'color', default: '#f0b429', theme: 'palette.hl' },
  ],
  build(ctx) {
    const dim = abs(ctx.root);
    cssCamel(dim, { inset: '0' });
    const tapes = [0, 1].map(() => { const t = abs(ctx.root), inner = abs(t); cssCamel(t, { overflow: 'hidden', whiteSpace: 'nowrap' }); cssCamel(inner, { left: '0', top: '0', whiteSpace: 'pre', fontWeight: '900' }); return { t, inner }; });
    const seal = abs(ctx.root), mark = abs(seal), label = abs(ctx.root), hint = abs(ctx.root);
    cssCamel(seal, { borderRadius: '50%', boxSizing: 'border-box' });
    cssCamel(mark, { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', whiteSpace: 'pre', lineHeight: '1', fontWeight: '900' });
    for (const el of [label, hint]) cssCamel(el, { whiteSpace: 'pre', lineHeight: '1.2', fontWeight: '900', paintOrder: 'stroke fill', color: '#ffffff' });
    return { dim, tapes, seal, mark, label, hint };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, u = (Math.min(W, H) / 1080) * (p.size / 0.426), cx = p.x * W, cy = p.y * H, d = 460 * u;
    const font = `'${p.font}', 'Noto Sans TC', sans-serif`, out = 1 - prog(local, dur - 0.15, dur), room = W * (1 - 2 * theme.safe.side);
    cssCamel(s.dim, { background: `radial-gradient(ellipse at ${p.x * 100}% ${p.y * 100 + 2}%, ${withAlpha(p.ink, 0.36 * clamp(p.dim))} 0%, ${withAlpha(p.ink, clamp(p.dim))} 70%)`, opacity: String(prog(local, 0, 0.25) * out) });
    // the tapes unroll left to right, their words drifting opposite ways
    s.tapes.forEach(({ t, inner }, i) => {
      const q = eOut(prog(local, 0.15 + i * 0.12, 0.45 + i * 0.12)), text = tapeText(p.tape);
      if (inner.textContent !== text) inner.textContent = text;
      cssCamel(t, { display: text ? 'block' : 'none', left: `${-0.2 * W}px`, top: `${cy + (i ? 134 : -134) * u - 46 * u}px`, width: `${1.4 * W}px`, height: `${92 * u}px`,
        background: i ? p.hl : p.paper, transform: `rotate(${i ? 9 : -14}deg)`, boxShadow: `0 ${6 * u}px ${14 * u}px rgba(0,0,0,0.35)`, opacity: String(q * out), clipPath: `inset(0 ${(1 - q) * 100}% 0 0)` });
      cssCamel(inner, { fontFamily: font, fontSize: `${50 * u}px`, lineHeight: `${92 * u}px`, letterSpacing: `${6 * u}px`, color: p.ink, transform: `translateX(${(i ? 1 : -1) * local * 90 * u - 200 * u}px)` });
    });
    // the seal spins in and then sways on the beat
    const ps = prog(local, 0.05, 0.4), sway = Math.sin((local * Math.PI * 2) / (p.beat * 2)) * 3;
    s.mark.textContent = p.mark;
    cssCamel(s.seal, { left: `${cx - d / 2}px`, top: `${cy - d / 2}px`, width: `${d}px`, height: `${d}px`, background: p.accent, border: `${10 * u}px solid ${p.paper}`,
      boxShadow: `0 0 0 ${6 * u}px ${p.ink}, ${12 * u}px ${16 * u}px 0 rgba(0,0,0,0.45)`, opacity: String(clamp(ps * 3) * out),
      transform: `scale(${Math.max(0.01, 0.3 + 0.7 * eBack(ps, 1.9))}) rotate(${(1 - eOut(ps)) * 40 - 6 + sway}deg)` });
    cssCamel(s.mark, { fontFamily: `'${p.markFont}', 'Noto Serif TC', serif`, fontSize: `${fitPx(p.mark, 300 * u, d * 0.8)}px`, color: p.paper, marginTop: `${-10 * u}px` });
    // the line above and the hint below, white with an ink outline
    const pl = prog(local, 0.25, 0.5), ph = prog(local, 0.55, 0.85);
    s.label.textContent = p.label; s.hint.textContent = p.hint;
    cssCamel(s.label, { display: p.label ? 'block' : 'none', left: `${cx}px`, top: `${cy - 360 * u}px`, fontFamily: font, fontSize: `${fitPx(p.label, 76 * u, room)}px`, webkitTextStroke: `${12 * u}px ${p.ink}`,
      opacity: String(pl * out), transform: `translateX(-50%) translateY(${(1 - eOut(pl)) * -40 * u}px)` });
    cssCamel(s.hint, { display: p.hint ? 'block' : 'none', left: `${cx}px`, top: `${cy + 270 * u}px`, fontFamily: font, fontSize: `${fitPx(p.hint, 58 * u, room)}px`, webkitTextStroke: `${10 * u}px ${p.ink}`,
      opacity: String(ph * out), transform: `translateX(-50%) translateY(${(1 - eOut(ph)) * 30 * u}px)` });
  },
};
