import { cachedTimes, eIn3Clamped, eOut3Clamped, numOr } from './block-helpers.ts';
import { eIn3, eOut3 } from './util.ts';

test('the clamped easings hold their ends outside 0..1 and match the plain ones inside', () => {
  expect(eOut3Clamped(-0.5)).toBe(0);
  expect(eOut3Clamped(1.5)).toBe(1);
  expect(eIn3Clamped(-0.5)).toBe(0);
  expect(eIn3Clamped(1.5)).toBe(1);
  for (const p of [0, 0.25, 0.5, 0.9, 1]) {
    expect(eOut3Clamped(p)).toBe(eOut3(p));
    expect(eIn3Clamped(p)).toBe(eIn3(p));
  }
});

test('numOr reads numbers and numeric strings, else the fallback', () => {
  expect(numOr(3, 1)).toBe(3);
  expect(numOr('2.5', 1)).toBe(2.5);
  expect(numOr(0, 1)).toBe(0);
  for (const v of ['', null, undefined, 'abc', NaN, Infinity, {}]) expect(numOr(v, 7)).toBe(7);
});

test('cachedTimes works the times out once per project object', () => {
  const p = { tracks: [{ items: [{ id: 'a', start: 1, end: 3 }, { id: 'b', start: 0.5, end: 1, parent: 'a' }] }] } as any;
  const t = cachedTimes(p);
  expect(t.get('b')).toEqual({ start: 1.5, end: 2 });
  expect(cachedTimes(p)).toBe(t);
  expect(cachedTimes({ tracks: p.tracks })).not.toBe(t);
});
