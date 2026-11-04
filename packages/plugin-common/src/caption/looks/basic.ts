// Clear looks: outline (the default caption), plain, box, bubble and auto.
import { eOut3, lerp, prog } from '@tellcut/engine';
import type { CaptionLook } from '../types.ts';

/** a box's 0.6 em of padding each side comes out of the room the words have */
export const padded = (e: { px: number }, width: number) => width - 1.2 * e.px;

/** the words in the caption colour with an outline in the ink colour */
export const outline: CaptionLook = { id: 'outline', stroke: (e) => e.theme.stroke * e.k };

/** the words alone */
export const plain: CaptionLook = { id: 'plain' };

/** the words on a dark rounded box (boxBg) */
export const box: CaptionLook = {
  id: 'box', room: padded,
  box: (e) => ({ background: e.p.boxBg, padding: '0.18em 0.6em', borderRadius: `${e.theme.radius * e.k}px` }),
};

/** ink words on a cream speech bubble with a thick ink border; highlighted words in the accent colour */
export const bubble: CaptionLook = {
  id: 'bubble', paper: true,
  room: (e, width) => width - 1.2 * e.px - 2 * e.theme.stroke * e.k,
  hl: (e) => e.theme.palette.accent,
  color: (e) => e.p.outline,
  box: (e) => ({ background: e.p.bubbleBg, padding: '0.18em 0.6em', borderRadius: `${e.theme.radius * e.k}px`, border: `${e.theme.stroke * e.k}px solid ${e.p.outline}` }),
};

/** a social app's automatic caption: white words on a dark rounded box, popping in from 0.88× */
export const auto: CaptionLook = {
  id: 'auto', weight: '700', origin: '50% 50%',
  room: (e, width) => width - 0.96 * e.px,
  box: (e) => ({ background: e.p.boxBg, padding: '0.17em 0.48em 0.21em', borderRadius: `${20 * e.k}px` }),
  popScale: (local) => lerp(0.88, 1, eOut3(prog(local, 0, 0.14))),
};
