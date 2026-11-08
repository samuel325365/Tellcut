// common.postage's stamp and window.
import { postage, postageBox, postageFoot } from './postage.ts';

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
test('the settled stamp, tilted, stays wholly in a wide or square frame at the default y', () => {
  for (const [W, H] of [[1920, 1080], [1080, 1080], [1080, 1920]]) {
    const p = { x: 0.5, y: 0.45, w: 0.6, aspect: 0.8, tilt: -3 }, b = postageBox(p, W, H), r = (3 * Math.PI) / 180;
    const cx = b.x0 + b.sw / 2, cy = b.y0 + b.sh / 2;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const dx = (sx * b.sw) / 2, dy = (sy * b.sh) / 2;
      return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
    });
    for (const [x, y] of corners) {
      expect(x).toBeGreaterThanOrEqual(-1e-6); expect(x).toBeLessThanOrEqual(W + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6); expect(y).toBeLessThanOrEqual(H + 1e-6);
    }
  }
  // a stamp with room to spare keeps its centre where it was written
  const tall = postageBox({ x: 0.5, y: 0.45, w: 0.6, aspect: 0.8, tilt: -3 }, 1080, 1920);
  expect(tall.y0 + tall.sh / 2).toBeCloseTo(0.45 * 1920, 6);
});
test('an item of 0.05 s or less asks for no piece of its shot', () => {
  const item = (len: number, still: boolean) => ({ id: 'a', type: 'common.postage', start: 0, end: len, params: { source: 'pic', from: 2, still } }) as never;
  expect(postage.media!(item(0.05, false), {} as never)).toEqual({ videos: [], stills: [] });
  expect(postage.media!(item(0.05, true), {} as never)).toEqual({ videos: [], stills: [] });
  expect(postage.media!(item(2, false), {} as never).videos).toEqual([{ source: 'pic', in: 2, out: 4, speed: 1, interp: 'none' }]);
  expect(postage.media!(item(2, true), {} as never).stills).toEqual([{ source: 'pic', t: 2, w: 1080 }]);
});
