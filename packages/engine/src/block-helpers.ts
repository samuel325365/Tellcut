// Small helpers several blocks had each written for themselves, kept in one place.
import type { Project } from './schema.ts';
import { resolveTimes, type Times } from './time.ts';
import { clamp, eIn3, eOut3 } from './util.ts';

/** eOut3 with its progress clamped to 0..1 first: safe to feed a raw (t - a) / d */
export const eOut3Clamped = (p: number) => eOut3(clamp(p));
/** eIn3 with its progress clamped to 0..1 first */
export const eIn3Clamped = (p: number) => eIn3(clamp(p));

/** a param read as a number: `d` when it is missing, empty or not a finite number (a numeric string counts) */
export const numOr = (v: unknown, d: number) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));

const timesCache = new WeakMap<object, Times>();
/** the project's film times, worked out once per project object (draw runs every frame; an edit makes a new project).
 *  The map is shared by every caller: read it, never change it. */
export function cachedTimes(p: Pick<Project, 'tracks'>): Times {
  let t = timesCache.get(p);
  if (!t) { t = resolveTimes(p); timesCache.set(p, t); }
  return t;
}
