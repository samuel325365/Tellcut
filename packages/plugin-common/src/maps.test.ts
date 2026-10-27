// Group D (2026-10-23): common.mapcam's pictures and camera, common.worldmap's camera and regions, the shared geo helpers.
import { defaultSafe } from '@tellcut/engine';
import { cutLine, keysAt, merc, orthographic, parseCities, placeOf, placesOf, radiusOfZoom, rowsOf, spanOf, unmerc, zoomOfRadius } from './geo.ts';
import { autoCam, coverZoom, irisAt, mapPictures, miniCircle, parseCam, pictureAlphas, routeAt } from './mapcam.ts';
import { globeShare, legShare, parseGlobeCam, regionRing } from './worldmap.ts';
import { WORLD_LAND } from './world110.ts';

const PLACES = parseCities('科托爾|Kotor|18.771|42.425, 佩拉斯特|Perast|18.699|42.486');

test('geo: places by name (Chinese or English, any case) or lon,lat; lines and spans', () => {
  expect(placeOf('科托爾', PLACES)).toEqual([18.771, 42.425]);
  expect(placeOf('perast', PLACES)).toEqual([18.699, 42.486]);
  expect(placeOf('18.5, 42.1', PLACES)).toEqual([18.5, 42.1]);
  expect(placeOf('nowhere', PLACES)).toBeNull();
  expect(placesOf('科托爾>18.7,42.45>nowhere>Perast', PLACES)).toEqual([[18.771, 42.425], [18.7, 42.45], [18.699, 42.486]]);
  expect(rowsOf('0|a|1\\n\n 2|b ')).toEqual([['0', 'a', '1'], ['2', 'b']]);
  expect(spanOf('1.2-3.4')).toEqual([1.2, 3.4]);
  expect(spanOf('2')).toEqual([2, Infinity]);
  expect(spanOf('-')).toEqual([-Infinity, Infinity]);
  expect(spanOf('')).toEqual([-Infinity, Infinity]);
});

test('geo: Mercator round trip; the globe radius and the map zoom meet; keyframes ease and hold', () => {
  const [x, y] = merc(18.771, 42.425), [lon, lat] = unmerc(x, y);
  expect(lon).toBeCloseTo(18.771, 9); expect(lat).toBeCloseTo(42.425, 9);
  expect(merc(0, 0)).toEqual([128, 128]);
  expect(zoomOfRadius(radiusOfZoom(13.2, 42), 42)).toBeCloseTo(13.2, 9);
  // a degree of longitude is as long on the globe as on the map at that zoom
  const z = 12, R = radiusOfZoom(z, 42), mapPx = ((merc(19, 42)[0] - merc(18, 42)[0]) * 2 ** z) / Math.cos((42 * Math.PI) / 180);
  expect(R * (Math.PI / 180)).toBeCloseTo(mapPx, 6);
  expect(keysAt([[0, 0], [2, 10]], -1)).toEqual([0]);
  expect(keysAt([[0, 0], [2, 10]], 1)![0]).toBeCloseTo(5, 9);
  expect(keysAt([[0, 0], [2, 10]], 5)).toEqual([10]);
  expect(keysAt([], 1)).toBeNull();
});

test('geo: orthographic puts the centre in the middle and tells the far side; a line cut half way', () => {
  const P = orthographic(10, 45, 500, 0, 540, 960);
  expect(P(10, 45)).toEqual([540, 960, 1]);
  expect(P(-170, -45)[2]).toBe(0);
  const back = P(-170, -45);
  expect(Math.hypot(back[0] - 540, back[1] - 960)).toBeCloseTo(500, 6);   // pinned to the rim
  const c = cutLine([[0, 0], [10, 0], [10, 10]], 0.75);
  expect(c.head).toEqual([10, 5]);
  expect(c.ang).toBeCloseTo(Math.PI / 2, 9);
  expect(cutLine([[0, 0], [10, 0]], 1).pts).toEqual([[0, 0], [10, 0]]);
});

test('world110: Natural Earth land rings, closed, inside the world', () => {
  expect(WORLD_LAND.length).toBe(125);
  for (const r of WORLD_LAND) {
    expect(r.length % 2).toBe(0);
    expect([r[0], r[1]]).toEqual([r[r.length - 2], r[r.length - 1]]);
    for (let i = 0; i < r.length; i += 2) { expect(Math.abs(r[i])).toBeLessThanOrEqual(180); expect(Math.abs(r[i + 1])).toBeLessThanOrEqual(90); }
  }
});

const PROJECT = { sources: {
  boka: { path: 'media/maps/boka.jpg', duration: 1, width: 2160, height: 3840, kind: 'image' as const, map: { center: [18.77, 42.42] as [number, number], zoom: 12.45, credit: 'EOX' } },
  eu: { path: 'media/carto/eu.jpg', duration: 1, width: 1080, height: 1920, kind: 'image' as const, map: { center: [18.77, 42.42] as [number, number], zoom: 6.5 } },
  old: { path: 'media/maps/old.jpg', duration: 1, width: 1080, height: 1920, kind: 'image' as const },
} };

test('mapcam: pictures placed by their record, by coordinates given with them, lowest zoom first; unplaced ones left out', () => {
  const pics = mapPictures(PROJECT, 'boka', 'eu\nold@18.7,42.5,14\nmissing');
  expect(pics.map((m) => [m.id, m.zoom])).toEqual([['eu', 6.5], ['boka', 12.45], ['old', 14]]);
  expect(pics[1]).toMatchObject({ center: [18.77, 42.42], w: 2160, h: 3840, credit: 'EOX', path: 'media/maps/boka.jpg' });
  expect(mapPictures(PROJECT, 'old', '')).toEqual([]);   // an old download without a record or `at`
  expect(mapPictures(PROJECT, 'old', '', '18.7,42.5', 13)[0]).toMatchObject({ center: [18.7, 42.5], zoom: 13 });
  expect(mapPictures(PROJECT, 'old', '', '18.7,42.5,11')[0]).toMatchObject({ zoom: 11 });
  expect(mapPictures(PROJECT, 'boka', '', '18,42,10')[0]).toMatchObject({ center: [18, 42], zoom: 10 });   // `at` wins over the record
  expect(mapPictures(PROJECT, '', 'eu, boka').map((m) => m.id)).toEqual(['eu', 'boka']);
});

test('mapcam: a closer picture fades in once it covers the frame (t2-map-assets fade by hand: 7.45–7.75 for a 2160×3840 at z8.5)', () => {
  const ba = { id: 'ba', path: '', center: [0, 0] as [number, number], zoom: 8.5, w: 2160, h: 3840, credit: '' }, eu = { ...ba, id: 'eu', zoom: 6.5, w: 1080, h: 1920 };
  expect(coverZoom(ba, 1080, 1920, 1)).toBeCloseTo(7.5, 9);
  expect(coverZoom(ba, 1920, 1080, 1)).toBeCloseTo(8.5 + Math.log2(1920 / 2160 / 1) , 9);
  expect(pictureAlphas([eu, ba], 7.4, 1080, 1920, 1)).toEqual([1, 0]);
  expect(pictureAlphas([eu, ba], 7.6, 1080, 1920, 1)[1]).toBeCloseTo(0.5, 9);
  expect(pictureAlphas([eu, ba], 8, 1080, 1920, 1)).toEqual([1, 1]);
});

test('mapcam: camera keys by place or coordinate; without keys a push into the picture or the places framed', () => {
  const keys = parseCam('1|佩拉斯特|13\n0|18.7,42.4|12\nbad|x|1', PLACES);
  expect(keys.map((k) => k[0])).toEqual([0, 1]);
  expect(keys[1].slice(1, 3)).toEqual(merc(18.699, 42.486));
  const pic = mapPictures(PROJECT, 'boka', '')[0], a = autoCam(pic, PLACES, 3, 1080, 1920, 1);
  expect(a[0][3]).toBeCloseTo(11.47, 9);   // where the 2160×3840 picture covers the frame, a little closer
  expect(a[1][3]).toBeGreaterThan(a[0][3]);
  const f = autoCam(undefined, parseCities('巴黎|Paris|2.35|48.86, 塔林|Tallinn|24.75|59.44'), 3, 1080, 1920, 1);
  expect(f[0][3]).toBeGreaterThan(4.5); expect(f[0][3]).toBeLessThan(6);
});

test('mapcam: the small map sits inside the safe area in each corner on 9:16 and 16:9; iris and routes over time', () => {
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) {
    const safe = defaultSafe(W, H);
    for (const corner of ['tl', 'tr', 'bl', 'br'] as const) {
      const c = miniCircle(W, H, safe, corner, 0.11);
      expect(c.r).toBeCloseTo(0.11 * Math.min(W, H), 9);
      expect(c.x - c.r).toBeGreaterThanOrEqual(safe.side * W - 1e-6); expect(c.x + c.r).toBeLessThanOrEqual(W * (1 - safe.side) + 1e-6);
      expect(c.y - c.r).toBeGreaterThanOrEqual(safe.top * H - 1e-6); expect(c.y + c.r).toBeLessThanOrEqual(H * (1 - safe.bottom) + 1e-6);
    }
  }
  expect(miniCircle(1080, 1920, defaultSafe(1080, 1920), 'tl', 0.11)).toMatchObject({ x: expect.closeTo(248.4, 1), y: expect.closeTo(339.6, 1) });   // the source's 262, 362
  expect(irisAt(0, '0-0.6', '')).toBe(0);
  expect(irisAt(0.6, '0-0.6', '')).toBe(1);
  expect(irisAt(3, '0-0.6', '2.4-3')).toBe(0);
  expect(irisAt(1, '', '')).toBe(1);
  expect(routeAt([-Infinity, Infinity], 0)).toBe(1);
  expect(routeAt([1, 2], 1.5)).toBeCloseTo(0.5, 9);
  expect(routeAt([1, Infinity], 2.2)).toBe(1);
});

test('worldmap: camera keys turn the short way round the date line; the globe gives way to the chart; boxes and legs', () => {
  const k = parseGlobeCam('0|170,10|2.6\n2|-170,10|2.6|5', []);
  expect(k[1][1]).toBe(190);
  expect(k[1][4]).toBe(5);
  expect(globeShare(2.8)).toBe(1);
  expect(globeShare(3.5)).toBe(0);
  const box = regionRing('5,45>8,47', []);
  expect(box.length).toBe(3 + 2 + 3 + 2);
  expect(box[0]).toEqual([5, 45]);
  expect(regionRing('科托爾>佩拉斯特>18,42', PLACES)).toHaveLength(3);
  expect(legShare(0.5, 2, 0)).toBe(1);
  expect(legShare(0.5, 2, 1)).toBe(0);
  expect(legShare(0.75, 2, 1)).toBeCloseTo(0.5, 9);
});
