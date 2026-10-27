// common.snap — a photo snapping in: a white flash, a white print border closing in from outside the frame, and an orange
// camera date imprint ('22 5 26) in the corner, glowing like the old film cameras printed it. Put one over each photo of a burst.
// Promoted from the uk-beat short's fx.snap.
import { abs, clamp, cssCamel, eOut3 as eOut, type ItemType, prog } from '@tellcut/engine';
import { withAlpha } from './color.ts';

interface P { date: string; flash: number; border: number; corner: 'br' | 'bl' | 'tr' | 'tl'; size: number; mono: string; color: string; frameColor: string }
interface S { flash: HTMLElement; frame: HTMLElement; stamp: HTMLElement }

export const snap: ItemType<P, S> = {
  type: 'common.snap', label: '照片閃入', category: 'frame', kind: 'overlay',
  doc: '照片一進來白光閃一下、白色相框從畫面外收進來，角落一個橘色發光的相機日期戳（\'22 5 26）；照片連發、回憶、底片相機感',
  params: [
    { key: 'date', label: '日期戳（空＝不顯示）', type: 'string', default: "'22 5 26" },
    { key: 'flash', label: '閃白強度（0＝不閃）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.9 },
    { key: 'border', label: '白框粗細（px，以 1080 寬計；0＝沒有）', type: 'number', min: 0, max: 80, step: 1, default: 26 },
    { key: 'corner', label: '日期戳的角落', type: 'enum', options: ['br', 'bl', 'tr', 'tl'], default: 'br' },
    { key: 'size', label: '日期戳字級（畫面短邊 %）', type: 'number', min: 1, max: 10, step: 0.1, default: 5.2 },
    { key: 'mono', label: '日期戳字型', type: 'string', default: 'JetBrains Mono', theme: 'fonts.mono', themeIfSet: true },
    { key: 'color', label: '日期戳顏色', type: 'color', default: '#ff8a1f' },
    { key: 'frameColor', label: '閃光與相框顏色', type: 'color', default: '#ffffff' },
  ],
  build(ctx) {
    const flash = abs(ctx.root), frame = abs(ctx.root), stamp = abs(ctx.root);
    cssCamel(flash, { inset: '0', pointerEvents: 'none' });
    cssCamel(frame, { inset: '0', boxSizing: 'border-box', transformOrigin: '50% 50%' });
    cssCamel(stamp, { whiteSpace: 'pre', lineHeight: '1', fontWeight: '700' });
    return { flash, frame, stamp };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * Math.min(W, H), out = 1 - prog(local, dur - 0.08, dur);
    cssCamel(s.flash, { background: p.frameColor, opacity: String(clamp(p.flash) * (1 - eOut(prog(local, 0, 0.12)))) });
    cssCamel(s.frame, { display: p.border > 0 ? 'block' : 'none', border: `${p.border * k}px solid ${p.frameColor}`, transform: `scale(${(1.08 - 0.08 * eOut(prog(local, 0, 0.1))).toFixed(4)})`, opacity: String(out) });
    const right = p.corner === 'br' || p.corner === 'tr', bottom = p.corner === 'br' || p.corner === 'bl';
    const sx = theme.safe.side * W + 20 * k, top = bottom ? (1 - theme.safe.bottom) * H - px * 1.4 : theme.safe.top * H + px * 0.4;
    s.stamp.textContent = p.date;
    cssCamel(s.stamp, { display: p.date ? 'block' : 'none', left: right ? '' : `${sx}px`, right: right ? `${sx}px` : '', top: `${top}px`, fontSize: `${px}px`,
      fontFamily: `'${p.mono}', 'JetBrains Mono', monospace`, color: p.color, letterSpacing: `${4 * k}px`, opacity: String(out),
      textShadow: `0 0 ${8 * k}px ${withAlpha(p.color, 0.9)}, 0 0 ${2 * k}px rgba(255,200,120,.9)` });
  },
};
