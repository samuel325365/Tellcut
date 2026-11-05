// common.heading's own entrances and exits, on the whole title block (the caption's are drawn by the caption): letters closing up
// from wide spacing, a mask rising, the block opening from its middle, focusing in from a blur, or the rules drawn first; out,
// the letters spreading apart, or the mask sinking. A pure function of time and of where the block is.
import { clamp, eOut3, lerp, prog } from '@tellcut/engine';

export const TITLE_IN = ['track', 'mask', 'open', 'focus', 'rule'] as const;
export const TITLE_OUT = ['spread', 'sink'] as const;
const IN = new Set<string>(TITLE_IN), OUT = new Set<string>(TITLE_OUT);
export const isTitleIn = (a: string) => IN.has(a);
export const isTitleOut = (a: string) => OUT.has(a);

/** where the title block is, in the frame's pixels (the layer the animation is set on covers the frame), and its font size */
export interface TitleBlock { x: number; y: number; w: number; h: number; W: number; H: number; fs: number }

export interface TitleAnim {
  opacity: number; transform: string; transformOrigin: string; clip: string; filter: string;
  /** how far the rules (backing rules) are drawn, 0–1 */
  ruleP: number;
  /** the words' own fade under `rule` (the lines come first) */
  textOpacity: number;
}

const span = (animDur: number, dur: number) => Math.max(0.05, Math.min(animDur, dur / 2));

/** the extra letter spacing (em of the title) of `track` and `spread` at `local`: set on the words themselves, as a look's own
 *  spacing would otherwise replace it; 0 for any other name */
export function titleSpacing(animIn: string, animOut: string, local: number, dur: number, animDur: number): number {
  const d = span(animDur, dur), q = prog(local, 0, d), b = prog(dur - local, 0, d);
  let s = 0;
  if (q < 1 && animIn === 'track') s += lerp(0.4, 0, eOut3(q));
  if (b < 1 && animOut === 'spread') s += lerp(0.35, 0, eOut3(b));
  return Math.round(s * 10000) / 10000;
}

/** the title's own animation at `local` of `dur`, each part taking `animDur` (at most half the title), for a block at `g`;
 *  neutral for any other name */
export function titleAnim(animIn: string, animOut: string, local: number, dur: number, animDur: number, g: TitleBlock): TitleAnim {
  const d = span(animDur, dur), q = prog(local, 0, d), b = prog(dur - local, 0, d), e = eOut3(q), eb = eOut3(b);
  const px = (v: number) => `${v.toFixed(2)}px`, pad = 0.6 * g.fs, below = g.H - (g.y + g.h), right = g.W - (g.x + g.w);
  let opacity = 1, clip = '', filter = '', ruleP = 1, textOpacity = 1;
  const tf: string[] = [];
  if (q < 1) {
    switch (animIn) {
      case 'track': opacity = clamp(q * 2.5); break;
      // the words rise out of a window whose bottom edge is the block's: a layer's clip moves with it, so it is moved back by as much
      case 'mask': { const ty = (1 - e) * g.h; clip = `inset(${px(g.y - pad)} ${px(right - pad)} ${px(below + ty)} ${px(g.x - pad)})`; tf.push(`translateY(${px(ty)})`); break; }
      case 'open': clip = `inset(${px(g.y - pad)} ${px(right + ((1 - e) * g.w) / 2)} ${px(below - pad)} ${px(g.x + ((1 - e) * g.w) / 2)})`; break;
      case 'focus': opacity = clamp(q * 2); filter = `blur(${px((1 - e) * 0.2 * g.fs)})`; tf.push(`scale(${lerp(1.18, 1, e).toFixed(4)})`); break;
      case 'rule': ruleP = eOut3(clamp(q / 0.4)); textOpacity = eOut3(clamp((q - 0.4) / 0.6)); break;
    }
  }
  if (b < 1) {
    switch (animOut) {
      case 'spread': opacity *= eb; break;
      // the words sink into the same window
      case 'sink': { const ty = (1 - eb) * g.h; clip = `inset(${px(g.y - pad)} ${px(right - pad)} ${px(below + ty)} ${px(g.x - pad)})`; tf.push(`translateY(${px(ty)})`); break; }
    }
  }
  return { opacity: Math.round(opacity * 1000) / 1000, transform: tf.join(' '), transformOrigin: `${px(g.x + g.w / 2)} ${px(g.y + g.h / 2)}`, clip, filter, ruleP, textOpacity };
}
