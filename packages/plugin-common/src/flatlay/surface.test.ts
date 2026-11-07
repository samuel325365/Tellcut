import { surfaceRecipe, type Surface } from './surface.ts';

const KINDS: Surface[] = ['linen', 'marble', 'concrete', 'velvet'];

test('surfaceRecipe is the same for the same seed and differs for another', () => {
  for (const k of KINDS) {
    expect(surfaceRecipe(k, 7)).toEqual(surfaceRecipe(k, 7));
    expect(surfaceRecipe(k, 7)).not.toEqual(surfaceRecipe(k, 8));
  }
});

test('linen weaves both ways', () => {
  // the spike's first linen had slubs one way only and read as brushed metal
  const r = surfaceRecipe('linen', 7);
  const ratio = r.rows.length / r.cols.length;
  expect(ratio).toBeGreaterThanOrEqual(0.8);
  expect(ratio).toBeLessThanOrEqual(1.25);
  const h = r.slubs.filter((s) => s.dir === 'h').length, v = r.slubs.filter((s) => s.dir === 'v').length;
  expect(h).toBeGreaterThan(0);
  expect(v).toBeGreaterThan(0);
  expect(h).toBeLessThanOrEqual(40);
  expect(v).toBeLessThanOrEqual(40);
});

test('marble has grey veins, not just fog', () => {
  const r = surfaceRecipe('marble', 7);
  expect(r.veins.length).toBeGreaterThanOrEqual(6);
  for (const v of r.veins) {
    expect(v.pts.length).toBeGreaterThanOrEqual(8);
    expect(v.rgb[0]).toBe(v.rgb[1]);
    expect(v.rgb[1]).toBe(v.rgb[2]);
  }
});

test('concrete has pits', () => {
  const r = surfaceRecipe('concrete', 7);
  expect(r.pits.length).toBeGreaterThanOrEqual(200);
  for (const p of r.pits) expect(p.r).toBeLessThan(0.004);
});

test('velvet has a pile direction', () => {
  const r = surfaceRecipe('velvet', 7);
  expect(r.pile).not.toBeNull();
  expect(Math.hypot(...r.pile!)).toBeCloseTo(1, 6);
  expect(r.strands.length).toBeGreaterThan(1000);
});
