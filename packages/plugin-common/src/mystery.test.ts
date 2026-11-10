// common.mystery's tapes: their words never run out at either end, however long the item lasts.
import { expect, test } from 'vitest';
import { tapeShift } from './mystery.ts';

const u = 1, unit = 392, start = -200 * u, drift = (t: number) => t * 90 * u;

test('both tapes stay within one repeat left of their start for any length', () => {
  for (let t = 0; t <= 60; t += 0.37) {
    for (const dir of [1, -1] as const) {
      const x = tapeShift(drift(t), start, unit, dir);
      expect(x).toBeLessThanOrEqual(start);
      expect(x).toBeGreaterThan(start - unit);
    }
  }
});

test('the leftward tape is exactly as before for its first repeat; the rightward one a whole repeat (the same picture) left', () => {
  for (const t of [0, 0.2, 1.5, 4]) {
    expect(tapeShift(drift(t), start, unit, -1)).toBe(-1 * t * 90 * u - 200 * u);
    const r = tapeShift(drift(t), start, unit, 1), before = t * 90 * u - 200 * u;
    expect(t === 0 ? r : r + unit).toBeCloseTo(before, 9);
  }
  // moving smoothly: one frame on is 3 px on, across a wrap too
  const a = tapeShift(drift(4.35), start, unit, 1), b = tapeShift(drift(4.35 + 1 / 30), start, unit, 1);
  expect(((b - a) % unit + unit) % unit).toBeCloseTo(3, 9);
});

test('not measured (no layout): the drift as it always was', () => {
  expect(tapeShift(drift(10), start, 0, 1)).toBe(10 * 90 * u - 200 * u);
  expect(tapeShift(drift(10), start, 0, -1)).toBe(-10 * 90 * u - 200 * u);
});
