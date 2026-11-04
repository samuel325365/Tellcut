// Bold looks: big (a social app's big sticker words), slab (a slanted block of colour a line), hollow (outlined letters only) and
// marker (a highlighter stroke a line).
import { cssCamel, eBack, lerp, prog } from '@tellcut/engine';
import type { CaptionLook } from '../types.ts';
import { padded } from './basic.ts';

/** each line on a slanted block of the accent colour (the second colour when set), alternately tilted a little; white words, the
 *  highlight colour for hot ones */
export const slab: CaptionLook = {
  id: 'slab', room: padded,
  lines: (lines, e) => lines.forEach((line, i) => cssCamel(line, { display: 'table', margin: `${i ? '0.14em' : '0'} ${e.left ? '0' : 'auto'} 0`, padding: '0.04em 0.6em 0.08em',
    background: e.p.accent || e.theme.palette.accent, clipPath: 'polygon(0.35em 0, 100% 0, calc(100% - 0.35em) 100%, 0 100%)', transform: `rotate(${i % 2 ? 1.2 : -1.5}deg)` })),
};

/** letters drawn as an outline only, the picture showing through them; the hot ones filled in the highlight colour */
export const hollow: CaptionLook = {
  id: 'hollow',
  color: () => 'transparent',
  stroke: (e) => 0.07 * e.fs,
  strokeColor: (e) => e.p.color,
  // a dark halo round the outline keeps it readable over a bright picture
  box: (e) => ({ filter: `drop-shadow(0 0 ${(0.05 * e.fs).toFixed(1)}px rgba(0,0,0,0.7)) drop-shadow(0 ${(0.04 * e.fs).toFixed(1)}px ${(0.06 * e.fs).toFixed(1)}px rgba(0,0,0,0.5))` }),
};

/** ink words on a stroke of highlighter a line, slightly tilted, the ends a little uneven */
export const marker: CaptionLook = {
  id: 'marker', paper: true, weight: '700', room: padded,
  color: (e) => e.p.outline,
  hl: (e) => e.theme.palette.accent,
  lines: (lines, e) => lines.forEach((line, i) => cssCamel(line, { display: 'table', margin: `${i ? '0.1em' : '0'} ${e.left ? '0' : 'auto'} 0`, padding: '0 0.32em',
    background: `color-mix(in srgb, ${e.p.hl} 92%, transparent)`, borderRadius: '0.18em 0.6em 0.3em 0.5em', transform: `rotate(${i % 2 ? 0.8 : -1}deg)` })),
};

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

/** heavy black-weight words with a hard dark shadow dropped down and right, like a poster */
export const heavy: CaptionLook = {
  id: 'heavy',
  stroke: (e) => 0.04 * e.fs,
  box: (e) => ({ textShadow: `${(0.07 * e.fs).toFixed(1)}px ${(0.09 * e.fs).toFixed(1)}px 0 rgba(0,0,0,0.85)`, letterSpacing: '0.02em' }),
};

/** words in the highlight colour with a copy in the second colour knocked out of register behind them, like a misprint */
export const offset: CaptionLook = {
  id: 'offset',
  color: (e) => e.p.hl,
  hl: (e) => e.p.color,
  box: (e) => ({ textShadow: `${(-0.06 * e.fs).toFixed(1)}px ${(0.05 * e.fs).toFixed(1)}px 0 ${e.p.accent || e.theme.palette.accent2}, ${(0.05 * e.fs).toFixed(1)}px ${(0.07 * e.fs).toFixed(1)}px ${(0.12 * e.fs).toFixed(1)}px rgba(0,0,0,0.4)` }),
};
