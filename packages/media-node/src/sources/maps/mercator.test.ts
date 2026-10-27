import { fitZoom, project, tilesFor, toPixels, unwrap, type LonLat } from './mercator.ts';

const TAIPEI101: LonLat = [121.5654, 25.033], STATION: LonLat = [121.517, 25.0478];

test('project puts Taipei 101 in slippy tile 12/3431/1753 and Taipei Main Station in column 3430', () => {
  const [x, y] = project(TAIPEI101, 12);
  expect([Math.floor(x / 256), Math.floor(y / 256)]).toEqual([3431, 1753]);
  expect(Math.floor(project(STATION, 12)[0] / 256)).toBe(3430);
});

test('fitZoom fits two points with padding; one point gets maxZoom', () => {
  const f = fitZoom([TAIPEI101, STATION], 1080, 1920);
  expect(f.zoom).toBeGreaterThan(13);
  expect(f.zoom).toBeLessThan(15);
  const view = { ...f, width: 1080, height: 1920 };
  for (const [px, py] of toPixels([TAIPEI101, STATION], view)) {
    expect(px).toBeGreaterThanOrEqual(1080 * 0.15 - 1);
    expect(px).toBeLessThanOrEqual(1080 * 0.85 + 1);
    expect(py).toBeGreaterThanOrEqual(0);
    expect(py).toBeLessThanOrEqual(1920);
  }
  expect(fitZoom([[19.937, 50.061]], 1080, 1920, { maxZoom: 16 }).zoom).toBe(16);
});

test('the centre of the view is the middle of the picture', () => {
  const view = { center: TAIPEI101, zoom: 15, width: 1080, height: 1920 };
  const [[x, y]] = toPixels([TAIPEI101], view);
  expect([Math.round(x), Math.round(y)]).toEqual([540, 960]);
});

test('tilesFor covers the whole picture with no gap', () => {
  const r = tilesFor({ center: TAIPEI101, zoom: 15, width: 1080, height: 1920 }, { tileSize: 256, maxZoom: 19 });
  expect(r.tileZoom).toBe(15);
  expect(Math.min(...r.tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
  expect(Math.max(...r.tiles.map((t) => t.left + t.size))).toBeGreaterThanOrEqual(1080);
  expect(Math.min(...r.tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
  expect(Math.max(...r.tiles.map((t) => t.top + t.size))).toBeGreaterThanOrEqual(1920);
  expect(r.tiles.length).toBeLessThanOrEqual(6 * 9);
});

test('a fractional zoom fetches the next level and draws it smaller; @2x tiles one level up', () => {
  const a = tilesFor({ center: [0, 0], zoom: 14.4, width: 1080, height: 1920 }, { tileSize: 256, maxZoom: 19 });
  expect(a).toMatchObject({ tileZoom: 15, upscaled: false });
  expect(a.tiles[0].size).toBeCloseTo(256 * 2 ** -0.6, 3);
  expect(tilesFor({ center: [0, 0], zoom: 14.4, width: 1080, height: 1920 }, { tileSize: 512, maxZoom: 20 }).tileZoom).toBe(14);
});

test("a zoom past the layer's maximum uses its tiles scaled up", () => {
  const r = tilesFor({ center: [19.937, 50.061], zoom: 18, width: 1080, height: 1920 }, { tileSize: 256, maxZoom: 16 });
  expect(r).toMatchObject({ tileZoom: 16, upscaled: true });
  expect(r.tiles[0].size).toBe(1024);
});

test('tiles wrap around the date line and stop at the poles', () => {
  const r = tilesFor({ center: [179.99, 0], zoom: 3, width: 1080, height: 1920 }, { tileSize: 256, maxZoom: 19 });
  for (const t of r.tiles) { expect(t.x).toBeGreaterThanOrEqual(0); expect(t.x).toBeLessThan(8); expect(t.y).toBeGreaterThanOrEqual(0); expect(t.y).toBeLessThan(8); }
});

test('longitudes are unwrapped across the date line, so a Pacific crossing stays short', () => {
  expect(unwrap([[121.56, 25.03], [-157.86, 21.31]])).toEqual([[121.56, 25.03], [202.14, 21.31]]);
  expect(unwrap([[-170, 0], [170, 0], [-175, 1]])).toEqual([[-170, 0], [-190, 0], [-175, 1]]);
  const f = fitZoom(unwrap([[121.56, 25.03], [-157.86, 21.31]]), 1080, 1920);
  expect(f.zoom).toBeGreaterThanOrEqual(2);
  expect(f.center[0]).toBeGreaterThan(150);   // over the Pacific, not the Atlantic
});
