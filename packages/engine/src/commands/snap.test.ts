import { resolveTimes } from '../time.ts';
import { beatTimes, snapCandidates, snapDelta, snapTime } from './snap.ts';
import { fixture } from './test-fixture.ts';

test('beat times follow each grid until its end', () => {
  expect(beatTimes(fixture())).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
});

test("candidates are 0, the end, playhead, markers, beats and other items' edges", () => {
  const p = fixture();
  const c = snapCandidates(p, resolveTimes(p), { playhead: 9.1, exclude: new Set(['c2']) });
  for (const t of [0, 20, 9.1, 7.3, 1.5, 4]) expect(c).toContain(t);
  expect(c).not.toContain(8);
  expect(snapCandidates(p, resolveTimes(p), { beats: false })).not.toContain(1.5);
  expect([...c].sort((x, y) => x - y)).toEqual(c);
});

test('snapDelta moves the closest edge onto a candidate within the threshold', () => {
  expect(snapDelta([2, 5], 0.93, [3, 6], 0.1)).toBeCloseTo(1);
  expect(snapDelta([2], 0.5, [3], 0.1)).toBe(0.5);
  expect(snapTime(4.96, [5, 4], 0.1)).toEqual({ t: 5, to: 5 });
  expect(snapTime(4.5, [5], 0.1)).toEqual({ t: 4.5, to: null });
});
