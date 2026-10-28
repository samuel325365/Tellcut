// Motion curves for blocks and fx (ctx.motion): thin wrappers over Motion's pure functions (motion-dom / motion-utils, motion.dev).
// Every one is a function of time alone, so it fits draw(t); times are always in seconds (Motion's spring generator counts in ms).
// Motion's animate() is deliberately not used: it runs on the frame loop, so a seek shows one rAF later.
import { calcGeneratorDuration, interpolate as mInterpolate, mix as mMix, spring as mSpring, stagger as mStagger, type StaggerOrigin } from 'motion-dom';
import { anticipate, backIn, backInOut, backOut, circIn, circInOut, circOut, cubicBezier, easeIn, easeInOut, easeOut, steps as mSteps } from 'motion-utils';

export type EaseFn = (p: number) => number;
/** `duration` (s) is when the spring first looks settled (Motion's visualDuration); `bounce` 0 = no overshoot, 0.3 a soft one, 0.6 lively.
 *  Give `stiffness` / `damping` / `mass` instead for the physical form (then `duration` and `bounce` are ignored). */
export interface SpringOpts { duration?: number; bounce?: number; stiffness?: number; damping?: number; mass?: number }
/** 0 → 1 over seconds (past 1 and back while it bounces; 0 before t = 0); `settle` is the second it comes to rest. */
export type Spring = ((t: number) => number) & { settle: number };

const springs = new Map<string, Spring>();
/** A spring curve. The same options give the same cached curve, so calling it inside draw costs nothing. */
export function spring(o: SpringOpts = {}): Spring {
  const physical = o.stiffness !== undefined || o.damping !== undefined || o.mass !== undefined;
  const opts = physical ? { stiffness: o.stiffness ?? 100, damping: o.damping ?? 10, mass: o.mass ?? 1 } : { visualDuration: o.duration ?? 0.5, bounce: o.bounce ?? 0.25 };
  const key = JSON.stringify(opts);
  const hit = springs.get(key);
  if (hit) return hit;
  const gen = mSpring({ keyframes: [0, 1], ...opts });
  const settle = calcGeneratorDuration(gen) / 1000;
  const f = Object.assign((t: number) => (t <= 0 ? 0 : t >= settle ? 1 : gen.next(t * 1000).value), { settle });
  if (springs.size >= 256) springs.clear();
  springs.set(key, f);
  return f;
}

/** CSS-style cubic-bezier easing over 0…1 (`bezier(0.22, 1, 0.36, 1)` is a strong ease-out). */
export const bezier = (x1: number, y1: number, x2: number, y2: number): EaseFn => cubicBezier(x1, y1, x2, y2);
/** Named easings over 0…1. */
export const ease: Record<'in' | 'out' | 'inOut' | 'backIn' | 'backOut' | 'backInOut' | 'circIn' | 'circOut' | 'circInOut' | 'anticipate', EaseFn> = {
  in: easeIn, out: easeOut, inOut: easeInOut, backIn, backOut, backInOut, circIn, circOut, circInOut, anticipate,
};
/** n hard steps over 0…1 (a ticking clock, a stop-motion feel). */
export const steps = (n: number, direction: 'start' | 'end' = 'end'): EaseFn => mSteps(n, direction);

/** Start offsets for a group: `stagger(0.1)(i, n)` is item i's delay in seconds; `from` 'first' | 'last' | 'center' | an index. */
export function stagger(gap: number, o: { from?: StaggerOrigin; ease?: EaseFn } = {}): (i: number, n: number) => number {
  return mStagger(gap, o);
}

/** Maps a value through matching input / output stops (numbers, or colours like '#f00' / 'rgba(…)'); clamped at both ends unless `clamp: false`. */
export function interpolate<T extends number | string>(input: number[], output: T[], o: { clamp?: boolean; ease?: EaseFn | EaseFn[] } = {}): (v: number) => T {
  return mInterpolate(input, output, o) as (v: number) => T;
}
/** a → b at p; numbers or colours. */
export function mix(a: number, b: number, p: number): number;
export function mix(a: string, b: string, p: number): string;
export function mix(a: number | string, b: number | string, p: number): number | string {
  return typeof a === 'number' ? mMix(a, b as number, p) : mMix(a, b as string)(p);
}

/** everything above as one object, handed to every item as ctx.motion */
export const motion = { spring, bezier, ease, steps, stagger, interpolate, mix };
export type MotionKit = typeof motion;
