// How far down the frame an item at the top reaches, from its params alone (no page): for the cut script's avoidBurned fallback,
// which moves our captions off the footage's own caption row to the top of the frame and, when something already sits up there,
// puts them under it if it is a thin bar or a one-line header rather than leaving them on the row. Only the blocks and looks whose
// place is a formula are answered; anything else is null (the caller then treats the whole top as taken). The answers are a little
// generous (line heights, a wrapped title), never short.
import { textEm } from '@tellcut/engine';
import { topLane } from './progress/shared.ts';
import { headerTop } from './header.ts';

/** a line of type `px` tall takes about this much of the frame with its leading (Noto Sans TC's line box is about 1.45 em) */
const LINE = 1.5;

/**
 * The lower edge (a fraction of the frame height) of what `type` drawn with params `p` (its defaults filled in) takes when it sits
 * at the top of a W × H frame with the theme's `safe` margins; null when it is not one of the blocks answered here, or not at the
 * top in a way this can tell.
 */
export function topRoom(type: string, p: Record<string, unknown>, W: number, H: number, safe: { top: number; side: number }): number | null {
  const k = Math.min(W, H) / 1080, num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  if (type === 'common.progress') {
    // on the top safe margin: y left at -1 and position top
    if (num(p.y, -1) >= 0 || p.position === 'bottom') return null;
    const th = num(p.thickness, 12) * k;
    if (p.mode === 'bar' || p.mode === 'segments') return safe.top + th / H;
    // a dot is up to 1.8 thicknesses, the current one 1.35 times that, centred on the bar's middle (dotRow); icons are larger
    if (p.mode === 'dots' && !String(p.icons ?? '').trim()) return safe.top + (th / 2 + (th * 1.8 * 1.35) / 2) / H;
    if (p.mode === 'paws') return safe.top + topLane(W, H);
    return null;
  }
  if (type === 'common.header') {
    if (p.look !== 'chip' && p.look !== 'kicker') return null;
    const px = (num(p.size, 3) / 100) * H, top = headerTop(num(p.y, -1), safe.top, W, H) * H, room = W * (1 - 2 * safe.side);
    if (p.look === 'chip') {
      // the chip and the title on one row; a title too long for the room beside the chip wraps (header.ts: the label's maxWidth)
      const chipW = (textEm(String(p.no ?? '')) * 1.1 + 0.9 + 0.5) * px, lines = Math.max(1, Math.ceil((textEm(String(p.text ?? '')) * px) / Math.max(px, room - chipW)));
      return (top + lines * LINE * px) / H;
    }
    // kicker: the small line (kickerSize, or 0.44 of the title) over the title, which wraps in the room
    const small = num(p.kickerSize, 0) > 0 ? (num(p.kickerSize, 0) / 100) * H : 0.44 * px;
    const lines = Math.max(1, Math.ceil((textEm(String(p.text ?? '')) * px) / room));
    return (top + LINE * small + lines * LINE * px) / H;
  }
  return null;
}
