// common.progress rocket (spec 2026-11-22, progress more modes): the lane up the safe edge, the turn that points 🚀 up, the fireworks.
import { resolveTheme } from '@tellcut/engine';
import { fireworks, rocketLane, uprightTurn } from './rocket.ts';

test('rocketLane, 9:16: against the right safe edge, the goal below the top margin, a run from near the bottom up to the goal', () => {
  const W = 1080, H = 1920, safe = resolveTheme(undefined, { width: W, height: H }).safe, size = 72;
  const l = rocketLane(W, H, safe, size, true);
  expect(l.cx + size / 2).toBeLessThanOrEqual(W - safe.side * W);
  // the sway's room is kept too
  expect(l.cx + size / 2 + 0.06 * size).toBeLessThanOrEqual(W - safe.side * W + 1e-9);
  expect(l.goalTop).toBeGreaterThanOrEqual(safe.top * H);
  expect(l.from).toBeLessThanOrEqual(H * (1 - safe.bottom));
  expect(l.to).toBeLessThan(l.from);
  // at 1 the rocket's top touches the goal's bottom
  expect(l.to - size).toBeCloseTo(l.goalTop + size, 9);
  const left = rocketLane(W, H, safe, size, false);
  expect(left.cx - size / 2 - 0.06 * size).toBeGreaterThanOrEqual(safe.side * W - 1e-9);
  expect(left.from).toBe(l.from);
});

test('rocketLane: no room on a wide frame for a huge rocket stays put, with nothing negative or NaN', () => {
  const W = 1920, H = 1080, safe = resolveTheme(undefined, { width: W, height: H }).safe;
  const l = rocketLane(W, H, safe, 600, true);
  expect(l.to).toBe(l.from);
  for (const v of Object.values(l)) {
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  }
  const z = rocketLane(W, H, safe, 0, true);
  for (const v of Object.values(z)) expect(Number.isFinite(v)).toBe(true);
});

test('uprightTurn: only the rocket emoji is turned', () => {
  expect(uprightTurn('🚀')).toBe(-45);
  expect(uprightTurn('🚀️')).toBe(-45);
  expect(uprightTurn('🎈')).toBe(0);
  expect(uprightTurn('media/a.png')).toBe(0);
});

test('fireworks: ten rays within 0.8 s of arriving, none before or after, inside half a goal', () => {
  expect(fireworks(-1)).toEqual([]);
  expect(fireworks(0.8)).toEqual([]);
  expect(fireworks(5)).toEqual([]);
  const rays = fireworks(0.3);
  expect(rays).toHaveLength(10);
  for (const r of rays) {
    expect(r.r1).toBeLessThanOrEqual(0.5);
    expect(r.r0).toBeGreaterThanOrEqual(0);
    expect(r.r0).toBeLessThanOrEqual(r.r1);
    expect(r.alpha).toBeGreaterThanOrEqual(0);
    expect(r.alpha).toBeLessThanOrEqual(1);
  }
  for (let s = 0; s < 0.8; s += 0.05) for (const r of fireworks(s)) {
    expect(Number.isFinite(r.angle + r.r0 + r.r1 + r.alpha)).toBe(true);
    expect(r.r1).toBeLessThanOrEqual(0.5);
  }
  expect(fireworks(0.3, 6)).toHaveLength(6);
});
