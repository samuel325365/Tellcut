// common.progress fuse: the spark's flicker and the fuse's wave, pure functions of their inputs.
import { fuseWave, sparkRays } from './fuse.ts';

test('sparkRays: the same twice, every ray 0…1, changing with time', () => {
  const a = sparkRays(1.2);
  expect(sparkRays(1.2)).toEqual(a);
  expect(a.length).toBeGreaterThan(4);
  for (let t = 0; t <= 6; t += 0.037) for (const r of sparkRays(t)) { expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(1); }
  expect(sparkRays(1.25)).not.toEqual(a);
  expect(sparkRays(1.2, 7)).toHaveLength(7);
  // the rays are not all alike at one time
  expect(new Set(a.map((r) => r.toFixed(3))).size).toBeGreaterThan(3);
});

test('fuseWave: −1…1, fixed, flat at both ends', () => {
  for (let u = 0; u <= 1; u += 0.01) { expect(Math.abs(fuseWave(u))).toBeLessThanOrEqual(1); expect(fuseWave(u)).toBe(fuseWave(u)); }
  expect(fuseWave(0)).toBeCloseTo(0, 6);
  expect(fuseWave(1)).toBeCloseTo(0, 6);
  // it does wave
  expect(Math.max(...Array.from({ length: 101 }, (_, i) => Math.abs(fuseWave(i / 100))))).toBeGreaterThan(0.3);
});
