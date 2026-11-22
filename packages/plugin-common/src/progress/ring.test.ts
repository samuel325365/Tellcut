// common.progress ring (spec 2026-11-22, progress more modes): the arc's sweep, the percentage, the pop and the ripple when full.
import { ringState } from './ring.ts';

test('ringState: nothing swept at 0, half a turn at 0.5, never 100 until full', () => {
  const z = ringState(0, -1);
  expect(z.sweep).toBe(0);
  expect(z.percent).toBe(0);
  expect(z.full).toBe(false);
  expect(z.scale).toBe(1);
  expect(z.ripple).toBeNull();
  const half = ringState(0.5, -1);
  expect(half.sweep).toBeCloseTo(Math.PI, 9);
  expect(half.percent).toBe(50);
  expect(ringState(0.999, -1).percent).toBe(99);
  expect(ringState(0.999, -1).full).toBe(false);
  // out of range or not a number: clamped, no NaN
  expect(ringState(-1, -1).sweep).toBe(0);
  expect(ringState(2, -1).sweep).toBeCloseTo(2 * Math.PI, 9);
  expect(ringState(NaN, -1).sweep).toBe(0);
});

test('ringState: full pops up to 1.12 and back within 0.4 s, the ripple spreads out to 1.25 ring radii within 0.6 s', () => {
  const a = ringState(1, 0.2);
  expect(a.full).toBe(true);
  expect(a.percent).toBe(100);
  expect(a.sweep).toBeCloseTo(2 * Math.PI, 9);
  expect(a.scale).toBeCloseTo(1.12, 6);
  expect(a.ripple).not.toBeNull();
  expect(a.ripple!.r).toBeLessThanOrEqual(1.25);
  const b = ringState(1, 0.7);
  expect(b.scale).toBe(1);
  expect(b.ripple).toBeNull();
  // full but not (yet) arrived, e.g. a chapter's own time: no pop
  expect(ringState(1, -1).scale).toBe(1);
  expect(ringState(1, -1).ripple).toBeNull();
  let last = 0;
  for (let s = 0; s < 0.6; s += 0.02) {
    const st = ringState(1, s);
    expect(st.scale).toBeGreaterThanOrEqual(1);
    expect(st.scale).toBeLessThanOrEqual(1.12 + 1e-9);
    expect(st.ripple!.r).toBeLessThanOrEqual(1.25);
    expect(st.ripple!.r).toBeGreaterThanOrEqual(last);
    expect(st.ripple!.alpha).toBeGreaterThanOrEqual(0);
    expect(st.ripple!.alpha).toBeLessThanOrEqual(1);
    last = st.ripple!.r;
  }
  expect(ringState(1, 0.6).ripple).toBeNull();
});
