// common.progress stretch (spec 2026-11-22, progress characters): the body's length, the wag, the blink and the front legs' steps.
import { blinkAt, bodyLength, stepAt, wagAt } from './stretch.ts';

test('bodyLength: the shortest body at 0, all the room left by the head and the rear at 1, growing in between', () => {
  expect(bodyLength(0, 900, 60, 80, 40)).toBe(60);
  expect(bodyLength(1, 900, 60, 80, 40)).toBe(780);
  let last = -Infinity;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const l = bodyLength(p, 900, 60, 80, 40);
    expect(l).toBeGreaterThan(last);
    last = l;
  }
  // clamped either side, and never shorter than the shortest body when the room is too small for it
  expect(bodyLength(-1, 900, 60, 80, 40)).toBe(60);
  expect(bodyLength(2, 900, 60, 80, 40)).toBe(780);
  expect(bodyLength(1, 150, 60, 80, 40)).toBe(60);
  expect(bodyLength(NaN, 900, 60, 80, 40)).toBe(60);
});

test('wagAt: within −1…1, and it does wag', () => {
  const seen = new Set<number>();
  for (let t = 0; t <= 5; t += 0.037) {
    const w = wagAt(t);
    expect(w).toBeGreaterThanOrEqual(-1); expect(w).toBeLessThanOrEqual(1);
    seen.add(Math.sign(Math.round(w * 10)));
  }
  expect(seen.has(1) && seen.has(-1)).toBe(true);
  expect(wagAt(1.234)).toBe(wagAt(1.234));
});

test('blinkAt: shut for 0.12 s every 2.4 s', () => {
  expect(blinkAt(2.45)).toBe(true);
  expect(blinkAt(4.85)).toBe(true);
  expect(blinkAt(1)).toBe(false);
  expect(blinkAt(2.6)).toBe(false);
  // not at the very start: an item does not open with its eyes shut
  expect(blinkAt(0)).toBe(false);
  expect(blinkAt(0.05)).toBe(false);
  let shut = 0;
  for (let t = 0; t < 24; t += 0.01) if (blinkAt(t)) shut += 0.01;
  expect(shut).toBeGreaterThan(0.12 * 9 - 0.05);
  expect(shut).toBeLessThan(0.12 * 9 + 0.05);
});

test('stepAt: the forward leg changes every stride, reach goes 0…1 within one', () => {
  expect(stepAt(0, 50)).toEqual({ leg: 0, reach: 0 });
  expect(stepAt(25, 50)).toEqual({ leg: 0, reach: 0.5 });
  expect(stepAt(60, 50).leg).toBe(1);
  expect(stepAt(110, 50).leg).toBe(0);
  expect(stepAt(160, 50).leg).toBe(1);
  for (let d = 0; d <= 300; d += 7) {
    const { leg, reach } = stepAt(d, 50);
    expect(leg).toBe(Math.floor(d / 50) % 2);
    expect(reach).toBeGreaterThanOrEqual(0); expect(reach).toBeLessThan(1);
  }
  // no stride (or nonsense) never steps, never NaN
  expect(stepAt(30, 0)).toEqual({ leg: 0, reach: 0 });
  expect(stepAt(NaN, 50)).toEqual({ leg: 0, reach: 0 });
});
