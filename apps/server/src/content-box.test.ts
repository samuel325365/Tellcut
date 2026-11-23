import { contentBoxes, cropAround, MIN_SIDE } from './content-box.ts';

/** a W × H picture of one colour, opaque */
function plain(W: number, H: number, rgb: [number, number, number] = [60, 68, 85]) {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; }
  return { width: W, height: H, data };
}
/** paints a rectangle of the picture (pixels) */
function paint(p: ReturnType<typeof plain>, x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = (yy * p.width + xx) * 4;
    p.data[i] = rgb[0]; p.data[i + 1] = rgb[1]; p.data[i + 2] = rgb[2]; p.data[i + 3] = 255;
  }
  return p;
}
const W = 270, H = 480;

test('a thin bar along the bottom is cropped to the bottom of the frame, the full width, square in pixels', () => {
  const pics = [paint(plain(W, H), 20, 450, 230, 6, [255, 80, 80]), paint(plain(W, H), 120, 30, 30, 30, [240, 200, 40]), paint(plain(W, H), 10, 200, 40, 40, [40, 200, 180])];
  const [bar, corner, side] = contentBoxes(pics);
  expect(bar).toBeDefined();
  const [x, y, w, h] = bar!;
  expect(w).toBeGreaterThan(0.95);                   // the whole width (grown to a square of the frame's width)
  expect(w * W).toBeCloseTo(h * H, 0);               // square in pixels
  expect(y + h).toBeCloseTo(1, 4);                   // moved inside the frame: down to its bottom edge
  expect(x).toBeGreaterThanOrEqual(0);
  // the others: each around its own mark
  expect(corner![1]).toBeLessThan(0.1);
  expect(side![0]).toBe(0);
});

test('the looks most of a group draw in one place (each its own colour) do not count against the one that leaves it alone', () => {
  const ring = paint(plain(W, H), 200, 20, 40, 40, [250, 210, 60]);
  const bottoms = ([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]] as [number, number, number][]).map((c) => paint(plain(W, H), 10, 400, 250, 20, c));
  const [r] = contentBoxes([ring, ...bottoms]);
  expect(r).toBeDefined();
  expect(r![1] + r![3]).toBeLessThan(0.3);           // the ring's corner, not down to the bars
});

test('a look that changes the whole frame keeps the whole picture', () => {
  const pics = [plain(W, H, [200, 80, 40]), paint(plain(W, H), 10, 10, 20, 20, [255, 255, 255]), plain(W, H), plain(W, H)];
  expect(contentBoxes(pics)[0]).toBeUndefined();
});

test('a look that changes the whole frame faintly and one place strongly (scan lines and a burst) keeps the whole picture', () => {
  const scan = paint(plain(W, H), 100, 100, 30, 30, [255, 255, 255]);
  for (let i = 0; i < scan.data.length; i += 4) if (Math.floor(i / 4 / W) % 2) scan.data[i] -= 30;   // every other row darker
  const pics = [scan, plain(W, H), plain(W, H), paint(plain(W, H), 10, 10, 20, 20, [255, 255, 255])];
  expect(contentBoxes(pics)[0]).toBeUndefined();
  expect(contentBoxes(pics)[3]).toBeDefined();
});

test('a group of two has no consensus: no crop', () => {
  expect(contentBoxes([paint(plain(W, H), 20, 450, 230, 6, [255, 80, 80]), plain(W, H)])).toEqual([undefined, undefined]);
});

test('differences below the threshold (antialiasing, PNG noise) are no content', () => {
  const noisy = plain(W, H);
  for (let i = 0; i < noisy.data.length; i += 4) noisy.data[i] += (i / 4) % 7;   // up to 6 levels of red here and there
  const pics = [noisy, plain(W, H), plain(W, H), paint(plain(W, H), 100, 100, 20, 20, [255, 255, 255])];
  const boxes = contentBoxes(pics);
  expect(boxes[0]).toBeUndefined();
  expect(boxes[1]).toBeUndefined();
  expect(boxes[3]).toBeDefined();
});

test('pictures of different sizes are refused', () => {
  expect(() => contentBoxes([plain(W, H), plain(W, H), plain(H, W)])).toThrow();
});

test('cropAround pads, keeps a least size, grows to a square and stays inside the frame', () => {
  // a 10 px dot in the middle: the least side (a quarter of the short side), square, centred
  const [x, y, w, h] = cropAround([130 / W, 235 / H, 10 / W, 10 / H], W, H)!;
  expect(w * W).toBeCloseTo(MIN_SIDE * W, 1);
  expect(h * H).toBeCloseTo(MIN_SIDE * W, 1);
  expect((x + w / 2) * W).toBeCloseTo(135, 0);
  expect((y + h / 2) * H).toBeCloseTo(240, 0);
  // a 100 px box: padded by 15 px each side
  expect(cropAround([50 / W, 100 / H, 100 / W, 100 / H], W, H)![2] * W).toBeCloseTo(130, 0);
  // a mark in the top-left corner: moved inside the frame
  const c = cropAround([0, 0, 10 / W, 10 / H], W, H)!;
  expect([c[0], c[1]]).toEqual([0, 0]);
  // a tall mark taller than the frame is wide: as wide as the frame, as tall as it needs
  const t = cropAround([0.4, 0.1, 0.2, 0.6], W, H)!;
  expect(t[2]).toBe(1);
  expect(t[3]).toBeGreaterThan(0.6);
  // a box that grows to the whole frame is no crop
  expect(cropAround([0, 0, 0.95, 0.95], W, H)).toBeUndefined();
});
