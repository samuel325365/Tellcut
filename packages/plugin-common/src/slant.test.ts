// common.slant's bands.
import { polyBox, slantPolys } from './slant.ts';

const tan8 = Math.tan((8 * Math.PI) / 180);

test('two bands on 9:16, edges at 8°', () => {
  const [a, b] = slantPolys(2, 8, 1080, 1920), d = 540 * tan8;
  expect(a[0]).toEqual([0, 0]); expect(a[1]).toEqual([1080, 0]);
  expect(a[2][1]).toBeCloseTo(960 - d, 6); expect(a[3][1]).toBeCloseTo(960 + d, 6);
  expect(b[0]).toEqual(a[3]); expect(b[1]).toEqual(a[2]); expect(b[2]).toEqual([1080, 1920]); expect(b[3]).toEqual([0, 1920]);
});
test('three bands side by side on 16:9', () => {
  const p = slantPolys(3, 8, 1920, 1080), d = 540 * tan8;
  expect(p.length).toBe(3);
  expect(p[0][0]).toEqual([0, 0]);
  expect(p[0][1][0]).toBeCloseTo(640 + d, 6);   // the first boundary's top end
  expect(p[0][2][0]).toBeCloseTo(640 - d, 6);   // its bottom end
  expect(p[2][1]).toEqual([1920, 0]);
});
test('count is held to 2..3', () => {
  expect(slantPolys(9, 8, 1080, 1920).length).toBe(3);
  expect(slantPolys(1, 8, 1080, 1920).length).toBe(2);
});
test('polyBox', () => { expect(polyBox([[0, 0], [1080, 0], [1080, 884], [0, 1036]])).toEqual([0, 0, 1080, 1036]); });
