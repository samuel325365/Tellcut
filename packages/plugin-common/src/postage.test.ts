// common.postage's stamp and window.
import { postageBox, postageFoot } from './postage.ts';

test('postageBox: body and window', () => {
  const b = postageBox({ x: 0.5, y: 0.45, w: 0.6, aspect: 0.8 }, 1080, 1920);
  expect(b.win[2]).toBeCloseTo(648, 6); expect(b.win[3]).toBeCloseTo(810, 6);
  expect(b.sw).toBeCloseTo(738.72, 6); expect(b.sh).toBeCloseTo(997.92, 6);
  expect(b.x0).toBeCloseTo(170.64, 6); expect(b.y0).toBeCloseTo(365.04, 6);
  expect(b.win[0]).toBeCloseTo(216, 6); expect(b.win[1]).toBeCloseTo(410.4, 6);
});
test('a wide frame sizes by its short side', () => {
  expect(postageBox({ x: 0.5, y: 0.5, w: 0.3, aspect: 0.8 }, 1920, 1080).win[2]).toBeCloseTo(324, 6);
});
test('the stamp shrinks to fit in 0.9 of the frame', () => {
  const wide = postageBox({ x: 0.5, y: 0.5, w: 0.6, aspect: 0.8 }, 1920, 1080);
  expect(wide.sh).toBeCloseTo(972, 6); expect(wide.win[3] / wide.win[2]).toBeCloseTo(1.25, 6);
  const flat = postageBox({ x: 0.5, y: 0.5, w: 1, aspect: 3 }, 1080, 1920);
  expect(flat.sw).toBeCloseTo(972, 6);
});
test('the value and the line shrink alike to fit side by side under the picture', () => {
  const w = (text: string, size: number) => text.length * size * 0.6;
  expect(postageFoot('NT$ 15', 'TAIWAN', 40, 600, w)).toEqual({ value: 40, line: 40 * 0.62 });
  const long = postageFoot('NT$ 1,500,000', 'REPUBLIC OF CHINA (TAIWAN)', 40, 600, w);
  expect(long.value).toBeLessThan(40); expect(long.line / long.value).toBeCloseTo(0.62, 6);
  const used = w('NT$ 1,500,000', long.value) + w('REPUBLIC OF CHINA (TAIWAN)', long.line) + 26 * 0.12 * long.line + long.value * 0.5;
  expect(used).toBeCloseTo(600, 6);
  expect(postageFoot('', 'TAIWAN', 40, 600, w)).toEqual({ value: 40, line: 40 * 0.62 });
});
