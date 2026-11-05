// common.heading's layouts as the caption it draws with understands them (position, alignment, its lower edge), and the size
// a title is set at: as given, or (layout full) grown until its longest line fills the safe area's width.
import { textEm } from '@tellcut/engine';
import { charKinds } from '../markup.ts';

export const TITLE_LAYOUTS = ['center', 'top', 'bottom', 'lower', 'left', 'corner', 'full'] as const;
export type TitleLayout = typeof TITLE_LAYOUTS[number];

export interface TitlePlace {
  position: 'center' | 'top' | 'bottom';
  align: 'center' | 'left';
  /** the caption's lower edge as a share of the frame height; −1: as `position` says */
  y: number;
  /** set at the safe area's right edge (corner): the heading moves the block there once it knows its width */
  right: boolean;
  /** × the size: a corner title is a small one */
  scale: number;
}

/** where a layout puts the title. lower sits a little above the bottom safe margin, like a big lower third. */
export function titlePlace(layout: string, safe: { top: number; bottom: number; side: number }): TitlePlace {
  switch (layout) {
    case 'top': return { position: 'top', align: 'center', y: -1, right: false, scale: 1 };
    case 'bottom': return { position: 'bottom', align: 'center', y: -1, right: false, scale: 1 };
    case 'lower': return { position: 'bottom', align: 'left', y: 1 - safe.bottom - 0.06, right: false, scale: 1 };
    case 'left': return { position: 'center', align: 'left', y: -1, right: false, scale: 1 };
    case 'corner': return { position: 'top', align: 'left', y: -1, right: true, scale: 0.45 };
    default: return { position: 'center', align: 'center', y: -1, right: false, scale: 1 };
  }
}

/** the size (% of the frame height) a title is set at: `size`, or with `full` the size at which its longest line (markup taken
 *  out) fills the safe width — bigger or smaller than `size` (four characters at a fixed size broke in two, acceptance film
 *  ttl-acc-morocco), at least 4 %, at most 0.4 of the frame's short side (one character at 30 % of a 9:16 frame pushed its kicker and
 *  sub to the frame's edges). `scale`: the look's own size scale (giant draws 1.35×), taken out so the line still fits. `room`: the
 *  look's room for words drawn `px` px (its box's padding and border out, CaptionLook.room), when it has one: the line fills that
 *  instead of the whole width (sign's board at the safe width broke 「羅馬」 in two) */
export function fitTitleSize(text: string, size: number, W: number, H: number, side: number, full: boolean, scale = 1, room?: (px: number) => number): number {
  if (!full) return size;
  const lines = String(text ?? '').split('\n').map((l) => charKinds(l).map((c) => c.c).join('').trim()).filter(Boolean);
  const em = Math.max(1, ...lines.map(textEm));
  let px = (W * (1 - 2 * side)) / (em * 1.04 * scale);
  if (room) {
    // a look's room is a share of the width (letter spacing) less what grows with the words (padding in em): taken as a − b·px from
    // two sizes (exact for every look's), the words drawn P px fill it when em·1.04·P = a − b·P
    const P = px * scale, a = room(0), b = Math.max(0, (a - room(P)) / P);
    px = a / (em * 1.04 + b) / scale;
  }
  return Math.min((40 * Math.min(W, H)) / H, Math.max(4, (px / H) * 100));
}
