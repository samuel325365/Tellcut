// A Dopamine Colors kit, promoted 2026-11-06 from the Dopamine Colors pilot film's fx.popcard / fx.sticker (after the user's own
// Dopamine Colors style film). This file holds the springy pop its blocks share:
//   common.popcard  (popcard.ts) a tilted white photo card with a black line and an offset colour shadow that pops in and plays its own
//                   shots (each with an item pill on a corner), or holds a still
//   common.sticker  (sticker.ts) a flat sticker (heart, bolt, star, smiley) with a thick ink line and a hard shadow, popping in and
//                   wobbling
// The page is common.backdrop's pattern words (with bits), the section wipe common.wipe's mode stripes, the titles common.heading's
// look pop (templates pop, pop-no), "No.1" common.badge's shape box, the captions the template pop-box. Pure functions of time.

/** a springy pop: 0 before `at`, then 0→1 with a little overshoot (an underdamped spring of about `dur` s) */
export function springPopAt(local: number, at: number, dur = 0.42): number {
  const t = local - at;
  if (t <= 0) return 0;
  const w = (2 * Math.PI) / dur, z = 0.38;
  return 1 - Math.exp(-z * w * t) * Math.cos(w * Math.sqrt(1 - z * z) * t);
}
