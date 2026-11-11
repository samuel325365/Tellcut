import { dbToY, envelopeHandles, envelopeLine, envelopePoints, yToDb } from './envelope.ts';

test('dB maps to height with 0 dB near the top and clamps outside the display range', () => {
  expect(dbToY(6, 46)).toBe(0);
  expect(dbToY(-40, 46)).toBe(46);
  expect(dbToY(0, 46)).toBe(6);
  expect(dbToY(-100, 46)).toBe(46);
  expect(yToDb(6, 46)).toBeCloseTo(0);
  expect(yToDb(46, 46)).toBe(-40);
});

test('envelope points become pixel points; no envelope is a flat 0 dB line', () => {
  expect(envelopePoints([[0, 0], [5, -6]], 10, 10, 46)).toEqual([{ x: 0, y: 6 }, { x: 50, y: 12 }]);
  expect(envelopePoints(undefined, 10, 10, 46)).toEqual([{ x: 0, y: 6 }, { x: 100, y: 6 }]);
});

test('the line enters the clip on the ramp of a point a trim left before the head, with no mark at the edge', () => {
  // [-2 s, -40 dB] -> [2 s, 0 dB] at 10 px/s, 46 px high: the ramp crosses the head at -20 dB
  const pts = envelopePoints([[-2, -40], [2, 0], [8, 0]], 10, 10, 46);
  expect(envelopeLine(pts, 100)).toEqual([{ x: 0, y: dbToY(-20, 46) }, { x: 20, y: 6 }, { x: 80, y: 6 }, { x: 100, y: 6 }]);
  // every drawn x is inside the clip and in order
  const xs = envelopeLine(envelopePoints([[-3, 0], [-1, -10], [4, -6], [12, -40]], 10, 10, 46), 100).map((p) => p.x);
  expect(xs).toEqual([0, 40, 100]);
});

test('the line holds flat outside the points and takes the level that plays inside at a step on an edge', () => {
  expect(envelopeLine(envelopePoints([[3, -6]], 10, 10, 46), 100)).toEqual([{ x: 0, y: 12 }, { x: 30, y: 12 }, { x: 100, y: 12 }]);
  expect(envelopeLine(envelopePoints(undefined, 10, 10, 46), 100)).toEqual([{ x: 0, y: 6 }, { x: 100, y: 6 }]);
  // a step at the head plays its second level; one at the tail its first
  expect(envelopeLine(envelopePoints([[0, -40], [0, 0], [10, 0], [10, -40]], 10, 10, 46), 100)).toEqual([{ x: 0, y: 6 }, { x: 100, y: 6 }]);
  // all points before the head (or past the tail): flat at the nearer one
  expect(envelopeLine(envelopePoints([[-4, -6], [-1, 0]], 10, 10, 46), 100)).toEqual([{ x: 0, y: 6 }, { x: 100, y: 6 }]);
  expect(envelopeLine(envelopePoints([[11, -6], [14, 0]], 10, 10, 46), 100)).toEqual([{ x: 0, y: 12 }, { x: 100, y: 12 }]);
});

test('a point outside the clip gets a handle just inside the nearer edge, flagged, at its own height', () => {
  const pts = envelopePoints([[-2, -40], [5, 0], [12, -6]], 10, 10, 46);
  expect(envelopeHandles(pts, 100, 4)).toEqual([{ x: 4, y: 46, out: true }, { x: 50, y: 6, out: false }, { x: 96, y: 12, out: true }]);
  // points on the edges are inside
  expect(envelopeHandles(envelopePoints([[0, 0], [10, 0]], 10, 10, 46), 100, 4).map((p) => p.out)).toEqual([false, false]);
});
