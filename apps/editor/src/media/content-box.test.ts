import { contentBox, cropStyle } from './content-box.ts';

/** a w×h picture of one colour with a block of another at [x0, x1) × [y0, y1) */
function picture(w: number, h: number, block?: [number, number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, on = block && x >= block[0] && x < block[1] && y >= block[2] && y < block[3];
    px.set(on ? [240, 240, 240, 255] : [10, 10, 10, 255], i);
  }
  return px;
}

test('contentBox: the part that is not the background (the corner colour), as fractions', () => {
  expect(contentBox(picture(10, 10, [4, 7, 3, 6]), 10, 10)).toEqual({ x: 0.4, y: 0.3, w: 0.3, h: 0.3 });
  expect(contentBox(picture(10, 10), 10, 10)).toBeNull();
});

test('cropStyle: that part, with a margin, widened to the card shape, filling the card at the picture proportions', () => {
  // a square picture, a 3:4 card; the part 0.4–0.7 × 0.3–0.6 with an 8 % margin is 0.32–0.78 × 0.22–0.68 (0.46 square),
  // made 3:4 by growing its height to 0.46 / 0.75 about its middle (0.45)
  const st = cropStyle({ x: 0.4, y: 0.3, w: 0.3, h: 0.3 }, '/a.png', 1, 0.75)!;
  const bh = 0.46 / 0.75, y = 0.45 - bh / 2;
  expect(st.backgroundImage).toBe('url(/a.png)');
  expect(st.backgroundSize).toBe(`${(100 / 0.46).toFixed(2)}% auto`);
  expect(st.backgroundPosition).toBe(`${((0.32 / (1 - 0.46)) * 100).toFixed(2)}% ${((y / (1 - bh)) * 100).toFixed(2)}%`);
  // nearly the whole picture, or nothing found: the picture as it is
  expect(cropStyle({ x: 0.02, y: 0.03, w: 0.95, h: 0.9 }, '/a.png', 1, 0.75)).toBeNull();
  expect(cropStyle(null, '/a.png', 1, 0.75)).toBeNull();
});
