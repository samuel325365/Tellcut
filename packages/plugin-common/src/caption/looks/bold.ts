// Bold looks: big (a social app's big sticker words).
import { eBack, lerp, prog } from '@tellcut/engine';
import type { CaptionLook } from '../types.ts';

/** big's words: `bigColor`, else the speaker's colour when one is set (speaker > 0, tint on), else the highlight colour */
export const bigColorOf = (p: { bigColor?: string; hl: string }, speakerInk?: string) => p.bigColor || speakerInk || p.hl;

/** handwriting in the highlight colour (or bigColor, or the speaker's), a thick ink outline, 1.25× the size, popping in from 0.6×
 *  with an overshoot; a gloss keeps the outline, thinned with its size */
export const big: CaptionLook = {
  id: 'big', weight: '700', font: 'LXGW WenKai TC', sizeScale: 1.25, origin: '50% 50%',
  hl: (e) => e.p.color,
  color: (e) => bigColorOf(e.p, (e.p.speaker ?? 0) > 0 && e.p.tint !== false ? e.who : undefined),
  stroke: (e) => 0.14 * e.px,
  box: (e) => ({ textShadow: `0 ${6 * e.k}px ${18 * e.k}px rgba(0,0,0,0.45)` }),
  popScale: (local) => lerp(0.6, 1, eBack(prog(local, 0, 0.14), 1.7)),
  gloss: (_s, e) => ({ webkitTextStroke: `${(0.14 * e.px * (e.p.glossSize ?? 0.52)).toFixed(2)}px ${e.p.outline}` }),
};
