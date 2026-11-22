import { chromaRotate, COLOUR_SIZE, colourDistance, colourPrintOf, colourSquare, edgePrint, greySquare, meanAbsDiff, printOf, sampleDistance, tintBy, type Rgba } from './likeness.ts';

/** a w×h picture: `fill(x, y)` gives each pixel's [r, g, b] */
function pic(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fill(x, y), i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { width: w, height: h, data };
}
/** a disc of `color` at (cx, cy) on a grey ground */
const disc = (cx: number, cy: number, color: [number, number, number] = [250, 150, 60]) =>
  pic(128, 128, (x, y) => (Math.hypot(x - cx, y - cy) < 24 ? color : [80, 88, 100]));

test('greySquare: the mean grey of each cell, any picture size', () => {
  const g = greySquare(pic(10, 20, (x) => (x < 5 ? [0, 0, 0] : [255, 255, 255])), 2);
  expect(Array.from(g).map(Math.round)).toEqual([0, 255, 0, 255]);
  expect(greySquare(pic(300, 200, () => [100, 100, 100])).length).toBe(64 * 64);
});

test('the print keeps where the edges are and drops how bright and how contrasty the picture is', () => {
  const a = disc(40, 40), dimmer = disc(40, 40, [140, 90, 40]), moved = disc(88, 80);
  expect(meanAbsDiff(printOf(a), printOf(a))).toBe(0);
  expect(meanAbsDiff(printOf(a), printOf(dimmer))).toBeLessThan(0.05);
  expect(meanAbsDiff(printOf(a), printOf(moved))).toBeGreaterThan(0.3);
  // a flat picture stays flat (no noise blown up)
  expect(Array.from(edgePrint(new Float32Array(16).fill(7))).every((v) => v === 0)).toBe(true);
});

test('chromaRotate keeps each pixel\'s grey; tintBy keeps the strongest channel\'s level', () => {
  const a = disc(40, 40), r = chromaRotate(a, 120);
  const [ga, gr] = [greySquare(a), greySquare(r)];
  expect(meanAbsDiff(ga, gr)).toBeLessThan(1.5);
  expect([...r.data.slice(0, 3)]).not.toEqual([...a.data.slice(0, 3)].map(Number));
  const t = tintBy(pic(1, 1, () => [200, 100, 50]), [1, 0.5, 0.5]);
  expect([...t.data]).toEqual([200, 50, 25, 255]);
});

test('sampleDistance: each time against the other\'s nearest time; the farthest of those', () => {
  const p = (v: number) => Float32Array.from({ length: 4 }, () => v);
  const own = [{ t: 0.5, print: p(0) }, { t: 1.5, print: p(1) }], other = [{ t: 0.4, print: p(0) }, { t: 2, print: p(0.5) }, { t: 1.4, print: p(1) }];
  // 0.5 → 0.4 (same: 0), 1.5 → 1.4 (same: 0)
  expect(sampleDistance(own, other)).toBe(0);
  expect(sampleDistance([{ t: 2, print: p(0) }], other)).toBe(0.5);
  // two at the same distance: the nearer picture
  expect(sampleDistance([{ t: 1, print: p(0.9) }], [{ t: 0.5, print: p(0) }, { t: 1.5, print: p(1) }])).toBeCloseTo(0.1);
  expect(() => sampleDistance([], other)).toThrow();
});

test('colourSquare: each cell\'s mean colour in CIELAB (L*, a*, b*), averaged in linear light, alpha as coverage over black', () => {
  const [L, a, b] = colourSquare(pic(4, 4, () => [255, 255, 255]), 1);
  expect(L).toBeCloseTo(100, 2); expect(Math.abs(a) + Math.abs(b)).toBeLessThan(0.01);
  expect(colourSquare(pic(4, 4, () => [0, 0, 0]), 1)[0]).toBeCloseTo(0, 3);
  // half white and half black averages to the mid of linear light (L* about 76), not to 50
  expect(colourSquare(pic(2, 1, (x) => (x ? [255, 255, 255] : [0, 0, 0])), 1)[0]).toBeCloseTo(76.07, 1);
  const clear: Rgba = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 0]) };
  expect(colourSquare(clear, 1)[0]).toBeCloseTo(0, 3);
  expect(colourSquare(pic(300, 200, () => [100, 100, 100])).length).toBe(COLOUR_SIZE * COLOUR_SIZE * 3);
});

test('colourDistance: the mean ΔE of the cells; it sees what the edge print drops', () => {
  const white = colourPrintOf(pic(32, 32, () => [255, 255, 255])), black = colourPrintOf(pic(32, 32, () => [0, 0, 0]));
  expect(colourDistance(white, white)).toBe(0);
  expect(colourDistance(white, black)).toBeCloseTo(100, 0);
  // a grey and a red of about its lightness differ in a*, not L*
  const grey = colourPrintOf(pic(32, 32, () => [128, 128, 128])), red = colourPrintOf(pic(32, 32, () => [200, 90, 90]));
  expect(Math.abs(grey[0] - red[0])).toBeLessThan(5);
  expect(colourDistance(grey, red)).toBeGreaterThan(30);
  // a recoloured disc: the edges alike, the colours far apart
  const a = disc(40, 40), turned = chromaRotate(a, 180);
  expect(meanAbsDiff(printOf(a), printOf(turned))).toBeLessThan(0.05);
  expect(colourDistance(colourPrintOf(a), colourPrintOf(turned))).toBeGreaterThan(5);
  // a wide picture and a tall one compare (both squeezed into the square)
  expect(() => colourDistance(colourPrintOf(pic(48, 27, () => [9, 9, 9])), colourPrintOf(pic(27, 48, () => [9, 9, 9])))).not.toThrow();
  expect(() => colourDistance(new Float32Array(3), new Float32Array(6))).toThrow();
});

test('sampleDistance takes the measure to compare with, the times paired as before', () => {
  const w = colourPrintOf(pic(16, 16, () => [255, 255, 255])), k = colourPrintOf(pic(16, 16, () => [0, 0, 0]));
  expect(sampleDistance([{ t: 1, print: w }], [{ t: 0.9, print: w }, { t: 2, print: k }], colourDistance)).toBe(0);
  expect(sampleDistance([{ t: 2, print: w }], [{ t: 0.9, print: w }, { t: 2, print: k }], colourDistance)).toBeCloseTo(100, 0);
});
