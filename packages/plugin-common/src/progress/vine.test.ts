// common.progress vine (spec 2026-11-22, progress more modes): the stem's wave, where the leaves sit, how they grow and the flower opens.
import { bloom, leafAngle, leafGrow, settleAt, vineLeaves, vineSize, vineWave } from './vine.ts';

test('vineWave: a slow S within th × 3.2 of the centre line, fixed, one wave every th × 40', () => {
  expect(Number.isFinite(vineWave(0, 12))).toBe(true);
  for (let x = 0; x <= 1000; x += 3.7) {
    expect(Math.abs(vineWave(x, 12))).toBeLessThanOrEqual(12 * 3.2 + 1e-9);
    expect(vineWave(x, 12)).toBe(vineWave(x, 12));
  }
  // it does wave, boldly (bolder than fuse's rope), and repeats every th × 40
  expect(Math.max(...Array.from({ length: 480 }, (_, i) => Math.abs(vineWave(i, 12))))).toBeGreaterThan(12 * 2.8);
  expect(vineWave(40, 12)).toBeCloseTo(vineWave(40 + 12 * 40, 12), 9);
  // no NaN for nonsense
  expect(Number.isFinite(vineWave(NaN, 12))).toBe(true);
  expect(Number.isFinite(vineWave(10, 0))).toBe(true);
});

test('vineLeaves: one every gap, alternating sides, none at the start nor within a flower of the end', () => {
  const leaves = vineLeaves(900, 48, 54);
  expect(leaves.length).toBeGreaterThan(10);
  leaves.forEach((l, i) => {
    expect(l.at).toBeGreaterThan(0);
    expect(l.at).toBeLessThan(1);
    if (i) {
      expect(l.at).toBeGreaterThan(leaves[i - 1].at);
      expect(l.side).toBe(-leaves[i - 1].side);
    }
  });
  expect(leaves[0].side).toBe(-1);
  expect(900 * (1 - leaves[leaves.length - 1].at)).toBeGreaterThanOrEqual(54);
  expect(vineLeaves(0, 48, 54)).toEqual([]);
  expect(vineLeaves(900, 0, 54)).toEqual([]);
  expect(vineLeaves(900, -5, 54)).toEqual([]);
  expect(vineLeaves(NaN, 48, 54)).toEqual([]);
  // a longer stem has the same leaves where they were and more after them (in px)
  const longer = vineLeaves(1200, 48, 54);
  expect(longer.length).toBeGreaterThan(leaves.length);
  expect(longer[3].at * 1200).toBeCloseTo(leaves[3].at * 900, 9);
});

test('leafGrow: 0 before the tip passes, full 0.3 s after, never more', () => {
  expect(leafGrow(-1)).toBe(0);
  expect(leafGrow(0)).toBe(0);
  expect(leafGrow(0.3)).toBe(1);
  expect(leafGrow(9)).toBe(1);
  expect(leafGrow(Infinity)).toBe(1);
  let last = 0;
  for (let s = 0; s <= 0.4; s += 0.01) { const g = leafGrow(s); expect(g).toBeGreaterThanOrEqual(last); expect(g).toBeLessThanOrEqual(1); last = g; }
});

test('bloom: 0 before arrival, open 0.5 s after', () => {
  expect(bloom(-1)).toBe(0);
  expect(bloom(0)).toBe(0);
  expect(bloom(0.25)).toBeGreaterThan(0);
  expect(bloom(0.25)).toBeLessThan(1);
  expect(bloom(0.5)).toBe(1);
  expect(bloom(3)).toBe(1);
});

test('vineSize: grows with the thickness; the band holds the wave with the leaves, and the flower on the centre line', () => {
  const a = vineSize(12), b = vineSize(24);
  expect(b.height).toBeCloseTo(2 * a.height, 6);
  expect(a.height / 2).toBeGreaterThanOrEqual(a.flower / 2);
  expect(a.height / 2).toBeGreaterThan(a.amp + a.leaf * 0.8);
  expect(a.leaf).toBeGreaterThan(a.stem * 5);
  for (const v of Object.values(vineSize(0))) expect(Number.isFinite(v) && v >= 0).toBe(true);
});

test('leafAngle: a leaf turns to its side, at least MIN_OFF off the stem however steep the stem is', () => {
  for (const slope of [-2, -0.6, 0, 0.6, 2]) for (const side of [-1, 1] as const) for (const h of [0, 0.5, 1]) {
    const a = leafAngle(slope, side, h), off = side * (a - Math.atan(slope));
    expect(off).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(off).toBeLessThan(Math.PI / 2);
  }
  // on a flat stem: the plain turn, between 0.45 and 0.77 to its side
  expect(leafAngle(0, -1, 0.5)).toBeCloseTo(-(0.45 + 0.16), 9);
});

test('settleAt: a crest or trough of the wave (its slope 0), near the place asked for and at least `least` before the end', () => {
  const th = 16, L = 900;
  const x = settleAt(L, L - 200, 125, th);
  expect(x).toBeGreaterThan(0);
  expect(x).toBeLessThanOrEqual(L - 125);
  const h = 0.01, slope = (vineWave(x + h, th) - vineWave(x - h, th)) / (2 * h);
  expect(Math.abs(slope)).toBeLessThan(1e-4);
  // the nearest such place: no other crest or trough is nearer the place asked for
  for (let y = 0; y < L - 125; y += 1) {
    const s0 = vineWave(y + 0.5, th) - vineWave(y - 0.5, th), s1 = vineWave(y + 1.5, th) - vineWave(y + 0.5, th);
    if (Math.sign(s0) !== Math.sign(s1)) expect(Math.abs(y + 0.5 - (L - 200))).toBeGreaterThanOrEqual(Math.abs(x - (L - 200)) - 1.5);
  }
  // none to be found: 0 (the whole stem settles), never NaN
  expect(settleAt(10, 0, 125, th)).toBe(0);
  expect(settleAt(NaN, 0, 125, th)).toBe(0);
  expect(settleAt(900, 700, 125, 0)).toBe(0);
});
