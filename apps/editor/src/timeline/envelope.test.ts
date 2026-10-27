import { dbToY, envelopePoints, yToDb } from './envelope.ts';

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
