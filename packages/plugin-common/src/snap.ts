// common.snap — a photo snapping in: a white flash, a white print border closing in from outside the frame, and an orange
// camera date imprint ('22 5 26) in the corner, glowing like the old film cameras printed it. Put one over each photo of a burst.
// Promoted from the uk-beat short's fx.snap. `window` [x, y, w, h] (fractions, like a clip's `frame`) puts the border round a photo
// window instead (a 4:5 photo in a 9:16 frame): outside the window, so none of the photo is covered, and the date stamp in its corner.
import { abs, clamp, cssCamel, eOut3 as eOut, type ItemType, prog } from '@tellcut/engine';
import { withAlpha } from './color.ts';

interface P { date: string; flash: number; border: number; corner: 'br' | 'bl' | 'tr' | 'tl'; size: number; mono: string; color: string; frameColor: string; window: unknown }
interface S { flash: HTMLElement; frame: HTMLElement; stamp: HTMLElement }

/** `window` as [x, y, w, h] fractions of the frame, or null (the whole frame) when it is not four numbers with a size */
export function snapWindow(v: unknown): [number, number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [x, y, w, hh] = v as number[];
  return w > 0 && hh > 0 ? [x, y, w, hh] : null;
}
export const snap: ItemType<P, S> = {
  type: 'common.snap', label: '照片閃入', category: 'frame', kind: 'overlay',
  doc: '照片一進來白光閃一下、白色相框從畫面外收進來，角落一個橘色發光的相機日期戳（\'22 5 26）；預設框住整個畫面，window [x, y, w, h]（畫面比例，跟主軌片段的 frame 一樣，例如 4:5 照片窗）改成框在那個窗外圍、日期戳放進窗的角落；照片連發、回憶、底片相機感',
  params: [
    { key: 'date', label: '日期戳（空＝不顯示）', type: 'string', default: "'22 5 26" },
    { key: 'flash', label: '閃白強度（0＝不閃）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.9 },
    { key: 'border', label: '白框粗細（px，以 1080 寬計；0＝沒有）', type: 'number', min: 0, max: 80, step: 1, default: 26 },
    { key: 'corner', label: '日期戳的角落', type: 'enum', options: ['br', 'bl', 'tr', 'tl'], default: 'br' },
    { key: 'size', label: '日期戳字級（畫面短邊 %）', type: 'number', min: 1, max: 10, step: 0.1, default: 5.2 },
    { key: 'mono', label: '日期戳字型', type: 'string', default: 'JetBrains Mono', theme: 'fonts.mono', themeIfSet: true },
    { key: 'color', label: '日期戳顏色', type: 'color', default: '#ff8a1f' },
    { key: 'frameColor', label: '閃光與相框顏色', type: 'color', default: '#ffffff' },
    { key: 'window', label: '相框圍住的窗 [x, y, w, h]（畫面比例，跟主軌片段的 frame 一樣；框在窗外圍；空＝整個畫面）', type: 'json', default: [] },
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
    // the frame: the whole picture, or round the window (left/top/size, not inset: cssCamel skips a value it already set)
    const win = snapWindow(p.window), bw = p.border * k, grow = `scale(${(1.08 - 0.08 * eOut(prog(local, 0, 0.1))).toFixed(4)})`;
    cssCamel(s.frame, { display: p.border > 0 ? 'block' : 'none', border: `${bw}px solid ${p.frameColor}`, transform: grow, opacity: String(out),
      ...(win ? { left: `${win[0] * W - bw}px`, top: `${win[1] * H - bw}px`, width: `${win[2] * W + 2 * bw}px`, height: `${win[3] * H + 2 * bw}px` }
        : { left: '0px', top: '0px', width: '100%', height: '100%' }) });
    const right = p.corner === 'br' || p.corner === 'tr', bottom = p.corner === 'br' || p.corner === 'bl';
    // the stamp: inside the safe area's corner, or inside the window's
    const sx = win ? (right ? W - (win[0] + win[2]) * W : win[0] * W) + 20 * k : theme.safe.side * W + 20 * k;
    const top = win ? (bottom ? (win[1] + win[3]) * H - px * 1.4 : win[1] * H + px * 0.4) : bottom ? (1 - theme.safe.bottom) * H - px * 1.4 : theme.safe.top * H + px * 0.4;
    s.stamp.textContent = p.date;
    cssCamel(s.stamp, { display: p.date ? 'block' : 'none', left: right ? '' : `${sx}px`, right: right ? `${sx}px` : '', top: `${top}px`, fontSize: `${px}px`,
      fontFamily: `'${p.mono}', 'JetBrains Mono', monospace`, color: p.color, letterSpacing: `${4 * k}px`, opacity: String(out),
      textShadow: `0 0 ${8 * k}px ${withAlpha(p.color, 0.9)}, 0 0 ${2 * k}px rgba(255,200,120,.9)` });
  },
};
