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

test('a point outside the clip gets a handle just inside the nearer edge, flagged, on the drawn line there (not at its own height)', () => {
  // the line: 34.571 at the head (the ramp from -40 dB at -2 s to 0 dB at 5 s), 6 at 50 px, 10.286 at the tail
  const pts = envelopePoints([[-2, -40], [5, 0], [12, -6]], 10, 10, 46);
  const line = envelopeLine(pts, 100);
  expect(line).toEqual([{ x: 0, y: 34.571 }, { x: 50, y: 6 }, { x: 100, y: 10.286 }]);
  // each ring sits on that line 4 px in from its edge: 34.571 → 6 over 50 px, 4 px in; 6 → 10.286 over 50 px, 46 px in
  expect(envelopeHandles(pts, 100, 4)).toEqual([{ x: 4, y: 32.285, out: true }, { x: 50, y: 6, out: false }, { x: 96, y: 9.943, out: true }]);
  // points on the edges are inside
  expect(envelopeHandles(envelopePoints([[0, 0], [10, 0]], 10, 10, 46), 100, 4).map((p) => p.out)).toEqual([false, false]);
});

test('several points out on one side each keep a handle, stacked on the line at that edge', () => {
  const pts = envelopePoints([[-3, 0], [-1, -10], [4, -6], [11, -40], [14, 0]], 10, 10, 46);
  const hs = envelopeHandles(pts, 100, 4);
  expect(hs.map((p) => p.out)).toEqual([true, true, false, true, true]);
  // the two head rings share one spot, on the ramp from -1 s to 4 s; the two tail rings on the one from 4 s to 11 s
  expect(hs[0]).toEqual(hs[1]);
  expect(hs[3]).toEqual(hs[4]);
  const at = (x: number) => { const [a, b] = x < 40 ? [pts[1], pts[2]] : [pts[2], pts[3]]; return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); };
  expect(hs[0].x).toBe(4);
  expect(hs[0].y).toBeCloseTo(at(4), 2);
  expect(hs[3].x).toBe(96);
  expect(hs[3].y).toBeCloseTo(at(96), 2);
  // a clip narrower than two rings (4 px, the ramp crossing it from 26 to 18): both rings in the middle, still on the line
  expect(envelopeHandles(envelopePoints([[-1, -40], [1, 0]], 0.4, 10, 46), 4, 4)).toEqual([{ x: 2, y: 22, out: true }, { x: 2, y: 22, out: true }]);
});

test('with the line\'s height, an outside ring stays `pad` inside its top and bottom and names the line\'s own level', () => {
  // the line is at 40.9 (near the bottom of 46) 10 px in from the head and at 0 (the top) 10 px in from the tail
  const pts = envelopePoints([[-0.05, -40], [2, -30], [8, 6], [10.05, 6]], 10, 10, 46);
  const hs = envelopeHandles(pts, 100, 10, 46, 7);
  expect(hs[0]).toMatchObject({ x: 10, y: 39, out: true });
  expect(hs[0].lineY).toBeGreaterThan(39);
  expect(hs[3]).toMatchObject({ x: 90, y: 7, lineY: 0, out: true });
  expect(hs[1]).toEqual({ ...pts[1], out: false });
  // a ring already clear of both keeps its place on the line, with no lineY
  expect(envelopeHandles(envelopePoints([[-2, -40], [5, 0], [12, -6]], 10, 10, 46), 100, 4, 46, 7)[0]).toEqual({ x: 4, y: 32.285, out: true });
  // a line too short for the pad: the middle
  expect(envelopeHandles(envelopePoints([[-1, -40], [5, 0]], 10, 10, 10), 100, 10, 10, 7)[0]).toMatchObject({ y: 5, lineY: expect.any(Number) });
});
