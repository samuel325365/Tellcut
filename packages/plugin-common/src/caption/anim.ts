// A caption's entrance and exit. The first ones (fade, rise, slide, typewriter; pop pops the characters) are the engine's
// animState, kept as they were; the rest are drawn here as a transform, a filter and a clip of the whole caption, or (drop,
// scatter) word by word (wordfx.ts). Everything is a function of the caption's own time.
import { clamp, eBack, eOut3, lerp, prog } from '@tellcut/engine';

export const ANIM_IN = ['none', 'fade', 'rise', 'slide', 'typewriter', 'pop', 'bounce', 'blur', 'drop', 'zoom', 'wipe', 'scatter', 'flip', 'stretch', 'glitch', 'roll'] as const;
export const ANIM_OUT = ['none', 'fade', 'rise', 'slide', 'blur', 'shrink', 'drop', 'wipe'] as const;
/** the engine's own: animState draws them */
export const ENGINE_IN = new Set(['none', 'fade', 'rise', 'slide', 'typewriter', 'pop']), ENGINE_OUT = new Set(['none', 'fade', 'rise', 'slide']);
/** entrances that move the words one by one */
export const WORD_IN = new Set(['drop', 'scatter']);

export interface LineAnim { opacity: number; transform: string; filter: string; clip: string }

/** a number from 0 to 1 that jumps about with `i` (the same every time: draw(t) is a pure function of t) */
export const jitter = (i: number) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/**
 * The whole caption's part of an entrance or exit the engine does not draw, at `local` of `dur` seconds, each taking `animDur`
 * (at most half the caption); `fs` is the caption's font size in px (blur and offsets are in it). Neutral for the engine's own.
 */
export function lineAnim(animIn: string, animOut: string, local: number, dur: number, animDur: number, fs: number): LineAnim {
  const d = Math.max(0.05, Math.min(animDur, dur / 2)), q = prog(local, 0, d), b = prog(dur - local, 0, d);
  let opacity = 1, filter = '', clip = '';
  const tf: string[] = [];
  const blurPx = (k: number) => `blur(${(k * 0.3 * fs).toFixed(2)}px)`;
  // the entrance
  if (q < 1) {
    switch (animIn) {
      case 'bounce': { const p = prog(local, 0, Math.max(d, 0.22)); opacity = clamp(p * 4); tf.push(`scale(${(0.6 + 0.4 * eBack(p, 1.9)).toFixed(4)})`); break; }
      case 'blur': opacity = eOut3(q); filter = blurPx(1 - eOut3(q)); break;
      case 'zoom': opacity = clamp(q * 2); tf.push(`scale(${lerp(1.6, 1, eOut3(q)).toFixed(4)})`); break;
      case 'wipe': clip = `inset(-0.5em ${((1 - eOut3(q)) * 100).toFixed(2)}% -0.5em -0.5em)`; break;
      case 'flip': opacity = clamp(q * 3); tf.push(`perspective(${(8 * fs).toFixed(0)}px) rotateX(${(-(1 - eBack(q, 1.4)) * 90).toFixed(2)}deg)`); break;
      case 'stretch': opacity = clamp(q * 3); tf.push(`scale(${lerp(1.5, 1, eBack(q, 2)).toFixed(4)}, ${lerp(0.5, 1, eBack(q, 2)).toFixed(4)})`); break;
      case 'roll': opacity = clamp(q * 2); tf.push(`perspective(${(8 * fs).toFixed(0)}px) translateY(${((1 - eOut3(q)) * 0.9 * fs).toFixed(2)}px) rotateX(${((1 - eOut3(q)) * 70).toFixed(2)}deg)`); break;
      case 'glitch': {
        // a few frames of the line jumping sideways and flickering, a red and a cyan copy pulling apart, settling as it ends
        const step = Math.floor(local * 30), r = 1 - q;
        tf.push(`translateX(${((jitter(step) - 0.5) * 0.5 * fs * r).toFixed(2)}px)`);
        opacity = jitter(step + 7) > 0.25 ? 1 : 0.35;
        filter = `drop-shadow(${(0.07 * fs * r).toFixed(2)}px 0 0 rgba(255,0,80,0.85)) drop-shadow(${(-0.07 * fs * r).toFixed(2)}px 0 0 rgba(0,220,255,0.85))`;
        break;
      }
      case 'drop': case 'scatter': break;   // word by word (wordfx.ts)
    }
  }
  // the exit
  if (b < 1) {
    switch (animOut) {
      case 'blur': opacity *= eOut3(b); filter = [filter, blurPx(1 - eOut3(b))].filter(Boolean).join(' '); break;
      case 'shrink': opacity *= b; tf.push(`scale(${lerp(0.6, 1, eOut3(b)).toFixed(4)})`); break;
      case 'drop': opacity *= clamp(b * 1.5); tf.push(`translateY(${((1 - b) ** 2 * 1.2 * fs).toFixed(2)}px) rotate(${((1 - b) * 6).toFixed(2)}deg)`); break;
      case 'wipe': clip = `inset(-0.5em -0.5em -0.5em ${((1 - eOut3(b)) * 100).toFixed(2)}%)`; break;
    }
  }
  return { opacity: Math.round(opacity * 1000) / 1000, transform: tf.length ? ` ${tf.join(' ')}` : '', filter, clip };
}

/** a word's part of drop or scatter: word `i` of `n` at `local`, `fs` the font size in px */
export function wordIn(animIn: string, i: number, n: number, local: number, fs: number): { opacity: number; x: number; y: number; rot: number } {
  if (animIn === 'drop') {
    const step = Math.min(0.06, 0.5 / Math.max(1, n)), p = prog(local, i * step, i * step + 0.34);
    return { opacity: clamp(p * 3), x: 0, y: -(1 - eBack(p, 1.6)) * 0.9 * fs, rot: 0 };
  }
  if (animIn === 'scatter') {
    const p = eOut3(prog(local, 0, 0.45)), a = jitter(i) * Math.PI * 2, r = (0.6 + jitter(i + 31)) * fs;
    return { opacity: p, x: Math.cos(a) * r * (1 - p), y: Math.sin(a) * r * (1 - p), rot: (jitter(i + 57) - 0.5) * 40 * (1 - p) };
  }
  return { opacity: 1, x: 0, y: 0, rot: 0 };
}
