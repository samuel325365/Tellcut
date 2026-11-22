// common.progress segments (spec 2026-11-22, progress characters): how full each segment is.
import { segmentFills } from './segments.ts';

const near = (a: number[], b: number[]) => { expect(a).toHaveLength(b.length); a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4)); };

test('segmentFills: step −1 without at shares [0, dur − tail] evenly', () => {
  near(segmentFills(4, -1, '', 0, 8), [0, 0, 0, 0]);
  near(segmentFills(4, -1, '', 7, 8), [1, 1, 1, 1]);
  near(segmentFills(4, -1, '', 8, 8), [1, 1, 1, 1]);
  // 3.5 s of 7 is exactly two segments; a little later the third is under way
  const mid = segmentFills(4, -1, '', 3.5, 8);
  expect(mid.slice(0, 2)).toEqual([1, 1]);
  expect(mid[2]).toBeGreaterThanOrEqual(0);
  expect(mid[2]).toBeLessThan(1);
  expect(mid[3]).toBe(0);
  near(segmentFills(4, -1, '', 4, 8), [1, 1, 2 / 7, 0]);
});

test('segmentFills: step ≥ 0 fills the ones before it, that one over the item, and ignores at', () => {
  near(segmentFills(4, 2, '9,9,9', 3.5, 8), [1, 1, 0.5, 0]);
  near(segmentFills(4, 0, '', 0, 8), [0, 0, 0, 0]);
  near(segmentFills(4, 9, '', 8, 8), [1, 1, 1, 1]);
});

test('segmentFills: step −1 with at: each segment from its start to the next (the extra time ends the last)', () => {
  near(segmentFills(4, -1, '0,1,2,3,4', 2.5, 8), [1, 1, 0.5, 0]);
  near(segmentFills(4, -1, '0,1,2,3,4', 3.5, 8), [1, 1, 1, 0.5]);
  // no extra time: the last fills by dur − tail; a segment without a start never fills
  near(segmentFills(4, -1, '0,1,2,3', 5, 8), [1, 1, 1, 0.5]);
  near(segmentFills(4, -1, '0, 2', 3, 8), [1, 0.2, 0, 0]);
});

test('segmentFills: a 0 s item is all full, never NaN', () => {
  for (const v of segmentFills(3, -1, '', 0, 0)) expect(v).toBe(1);
  for (const v of segmentFills(3, -1, '', 0.2, 0.3)) expect(Number.isFinite(v)).toBe(true);
});
