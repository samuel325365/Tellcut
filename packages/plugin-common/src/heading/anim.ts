// common.heading's own entrances and exits, on the whole title block (the caption's are drawn by the caption): letters closing up
// from wide spacing, a mask rising, the block opening from its middle, focusing in from a blur, or the rules drawn first; out,
// the letters spreading apart, or the mask sinking. A pure function of time.
import { clamp, eOut3, lerp, prog } from '@tellcut/engine';

export const TITLE_IN = ['track', 'mask', 'open', 'focus', 'rule'] as const;
export const TITLE_OUT = ['spread', 'sink'] as const;
const IN = new Set<string>(TITLE_IN), OUT = new Set<string>(TITLE_OUT);
export const isTitleIn = (a: string) => IN.has(a);
export const isTitleOut = (a: string) => OUT.has(a);

export interface TitleAnim {
  opacity: number; transform: string; clip: string; filter: string; letterSpacing: string;
  /** how far the rules (backing rules) are drawn, 0–1 */
  ruleP: number;
  /** the words' own fade under `rule` (the lines come first) */
  textOpacity: number;
}

/** the title's own animation at `local` of `dur`, each part taking `animDur` (at most half the title); neutral for any other name */
export function titleAnim(animIn: string, animOut: string, local: number, dur: number, animDur: number): TitleAnim {
  const d = Math.max(0.05, Math.min(animDur, dur / 2)), q = prog(local, 0, d), b = prog(dur - local, 0, d), e = eOut3(q);
  let opacity = 1, clip = '', filter = '', spacing = 0, ruleP = 1, textOpacity = 1;
  const tf: string[] = [];
  if (q < 1) {
    switch (animIn) {
      case 'track': opacity = clamp(q * 2.5); spacing = lerp(0.6, 0, e); break;
      case 'mask': clip = `inset(${((1 - e) * 100).toFixed(2)}% -0.5em -0.5em -0.5em)`; tf.push(`translateY(${((1 - e) * 0.25).toFixed(4)}em)`); break;
      case 'open': clip = `inset(-0.5em ${((1 - e) * 50).toFixed(2)}% -0.5em ${((1 - e) * 50).toFixed(2)}%)`; break;
      case 'focus': opacity = clamp(q * 2); filter = `blur(${((1 - e) * 0.25).toFixed(4)}em)`; tf.push(`scale(${lerp(1.18, 1, e).toFixed(4)})`); break;
      case 'rule': ruleP = eOut3(clamp(q / 0.4)); textOpacity = eOut3(clamp((q - 0.4) / 0.6)); break;
    }
  }
  if (b < 1) {
    switch (animOut) {
      case 'spread': opacity *= eOut3(b); spacing += lerp(0.5, 0, eOut3(b)); break;
      case 'sink': clip = `inset(-0.5em -0.5em ${((1 - eOut3(b)) * 100).toFixed(2)}% -0.5em)`; tf.push(`translateY(${((1 - eOut3(b)) * 0.25).toFixed(4)}em)`); break;
    }
  }
  return { opacity: Math.round(opacity * 1000) / 1000, transform: tf.join(' '), clip, filter, letterSpacing: spacing ? `${spacing.toFixed(4)}em` : '', ruleP, textOpacity };
}
