// common.progress paws (spec 2026-11-22, progress characters): which prints are down, how far in, which is the newest; their pose.
import { travel } from './shared.ts';
import { pawPose, pawSince, pawStates } from './paws.ts';

test('pawStates: the prints down only ever grow with progress; all fully in at 1; one newest whenever any is down', () => {
  let before = 0;
  for (let k = 0; k <= 20; k++) {
    const p = k * 0.05, st = pawStates(12, p, () => 1), down = st.filter((s) => s.in > 0).length;
    expect(st).toHaveLength(12);
    expect(down).toBeGreaterThanOrEqual(before);
    before = down;
    expect(st.filter((s) => s.newest).length).toBe(down ? 1 : 0);
    if (down) expect(st.findIndex((s) => s.newest)).toBe(down - 1);
  }
  expect(pawStates(12, 1, () => 1).every((s) => s.in === 1)).toBe(true);
  expect(pawStates(5, 0, () => 1).every((s) => s.in === 0 && !s.newest)).toBe(true);
});

test('pawStates: a print takes 0.2 s to land, and is down from (i + 0.5) / n on', () => {
  const st = pawStates(4, 0.5, (i) => [1, 0.1, 0, 0][i]);
  expect(st.map((s) => s.in)).toEqual([1, 0.5, 0, 0]);
  expect(pawStates(4, 0.124, () => 1)[0].in).toBe(0);
  expect(pawStates(4, 0.125, () => 1)[0].in).toBe(1);
  // a landing time that makes no sense counts as long since
  expect(pawStates(2, 1, () => NaN).map((s) => s.in)).toEqual([1, 1]);
});

test('pawPose: left and right alternate, each tilted a little, fixed by i', () => {
  expect(pawPose(0).side).not.toBe(pawPose(1).side);
  expect(pawPose(2).side).toBe(pawPose(0).side);
  expect(pawPose(3)).toEqual(pawPose(3));
  for (let i = 0; i < 12; i++) expect(Math.abs(pawPose(i).tilt)).toBeLessThanOrEqual(15);
});

test('pawSince: seconds since travel reached the print, as a function of time alone', () => {
  // step −1 over 4 s (tail 1): print 0 of 4 at travel 0.125, reached at 0.375 s
  expect(pawSince(-1, 4, 0, 1, 4)).toBeCloseTo(0.625);
  expect(pawSince(-1, 4, 0, 0.375, 4)).toBeCloseTo(0);
  expect(travel(-1, 4, 0.375, 4)).toBeCloseTo(0.125);
  // a chapter: prints before it were down before the item began
  expect(pawSince(2, 4, 0, 0, 4)).toBe(Infinity);
  expect(pawSince(2, 4, 2, 1.5, 4)).toBeCloseTo(0);
  // a 0 s item: everything is there from the start
  expect(pawSince(-1, 4, 3, 0, 0)).toBe(Infinity);
});
