import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { createHttp } from '../http.ts';
import { fetchTiles, tileFile, TILE_BUDGET, type TileLayer } from './tiles.ts';
import type { TileNeed } from './mercator.ts';

const png = (() => { const p = new PNG({ width: 256, height: 256 }); p.data.fill(200); return PNG.sync.write(p); })();
let root: string, cacheRoot: string, projectDir: string, calls: number, active: number, peak: number;
const fakeFetch = (async (url: string | URL) => {
  calls++; active++; peak = Math.max(peak, active);
  await new Promise((r) => setTimeout(r, 15));
  active--;
  if (String(url).includes('/text/')) return new Response('<?xml version="1.0"?><error/>', { headers: { 'content-type': 'image/png' } });
  return String(url).includes('/404/') ? new Response('no', { status: 404 }) : new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
}) as typeof fetch;
const layer: TileLayer = { id: 'emap', label: '電子地圖', url: (z, x, y) => `https://tiles.example/${z}/${y}/${x}.png`, ext: '.png', tileSize: 256, maxZoom: 19,
  attribution: '© test', license: 'L', page: 'https://tiles.example' };
const grid = (n: number, z = 15, x0 = 27360, y0 = 13800): TileNeed[] => Array.from({ length: n }, (_, i) => ({ z, x: x0 + (i % 3), y: y0 + Math.floor(i / 3), left: 0, top: 0, size: 256 }));
const opts = () => ({ http: createHttp({ source: 'maps', cacheDir: join(root, 'cache'), limits: [{ n: 1000, per: 60 }], fetch: fakeFetch }), source: 'maps', layer, cacheRoot, projectDir });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tiles-')); cacheRoot = join(root, 'tiles'); projectDir = join(root, 'p1');
  mkdirSync(projectDir, { recursive: true }); calls = 0; active = 0; peak = 0;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test('tiles come from the cache the second time, and only downloads count against the film', async () => {
  const a = await fetchTiles({ ...opts(), tiles: grid(9) });
  expect([a.downloaded, a.used]).toEqual([9, 9]);
  const b = await fetchTiles({ ...opts(), tiles: grid(9) });
  expect([b.downloaded, b.used, calls]).toEqual([0, 9, 9]);
  expect(b.files[0].file).toBe(tileFile(cacheRoot, 'maps', layer, 15, 27360, 13800));
  expect(existsSync(b.files[0].file!)).toBe(true);
  expect(tileFile(cacheRoot, 'maps', layer, 15, 27360, 13800)).toBe(join(cacheRoot, 'maps', 'emap', '15', '27360', '13800.png'));
});

test('at most 4 tiles are downloaded at once', async () => {
  await fetchTiles({ ...opts(), tiles: grid(40) });
  expect(peak).toBe(4);
});

test("a view that would pass the film's budget is refused before any download", async () => {
  mkdirSync(join(projectDir, 'cache', 'maps'), { recursive: true });
  writeFileSync(join(projectDir, 'cache', 'maps', 'tiles.json'), JSON.stringify({ downloaded: TILE_BUDGET - 5 }));
  await expect(fetchTiles({ ...opts(), tiles: grid(9) })).rejects.toThrow('這支片的地圖圖磚已下載 2995 張，這張圖還要 9 張，超過每支片 3000 張的上限（電子地圖）');
  expect(calls).toBe(0);
});

test('a map that fails halfway gives back the booking of the tiles it never asked for', async () => {
  const book = () => JSON.parse(readFileSync(join(projectDir, 'cache', 'maps', 'tiles.json'), 'utf8')).downloaded;
  const failing: TileLayer = { ...layer, url: (z, x, y) => `https://tiles.example/${x === 27360 && y === 13800 ? 'text/' : ''}${z}/${y}/${x}.png` };
  await expect(fetchTiles({ ...opts(), layer: failing, tiles: grid(30) })).rejects.toThrow('回的不是圖片');
  // the first one failed with at most 3 others already on their way: only those count
  expect(calls).toBeLessThanOrEqual(4);
  expect(book()).toBe(calls);
});

test('a tile the server does not have is an empty square, not an error', async () => {
  const missing: TileLayer = { ...layer, url: (z, x, y) => (x === 27361 ? `https://tiles.example/404/${z}/${y}/${x}.png` : `https://tiles.example/${z}/${y}/${x}.png`) };
  const r = await fetchTiles({ ...opts(), layer: missing, tiles: grid(3) });
  expect(r.files.map((f) => f.file === null)).toEqual([false, true, false]);
});

test('tiles older than cacheDays are fetched again', async () => {
  const kept: TileLayer = { ...layer, cacheDays: 30 };
  await fetchTiles({ ...opts(), layer: kept, tiles: grid(2) });
  const old = tileFile(cacheRoot, 'maps', kept, 15, 27360, 13800), when = new Date(Date.now() - 31 * 86400_000);
  utimesSync(old, when, when);
  const r = await fetchTiles({ ...opts(), layer: kept, tiles: grid(2) });
  expect(r.downloaded).toBe(1);
});

test('the same tile twice in one view (the world wrapping) is downloaded once', async () => {
  const r = await fetchTiles({ ...opts(), tiles: [...grid(1), { ...grid(1)[0], left: 1024 }] });
  expect([r.downloaded, calls, r.files.length]).toEqual([1, 1, 2]);
});

test('a tile of the wrong size (Carto without a valid key: a 256 px "API KEY REQUIRED" picture for an @2x request) is broken and not kept', async () => {
  const at2x: TileLayer = { ...layer, id: 'voyager', tileSize: 512, label: 'Carto 彩色街道圖' };
  await expect(fetchTiles({ ...opts(), layer: at2x, tiles: grid(1) })).rejects.toMatchObject({ kind: 'broken', message: expect.stringContaining('Carto 彩色街道圖 回的圖磚是 256 px，應該是 512 px') });
  expect(existsSync(tileFile(cacheRoot, 'maps', at2x, 15, 27360, 13800))).toBe(false);
});

test('an answer that is not a picture is not kept', async () => {
  const text: TileLayer = { ...layer, url: (z, x, y) => `https://tiles.example/text/${z}/${y}/${x}.png` };
  await expect(fetchTiles({ ...opts(), layer: text, tiles: grid(1) })).rejects.toMatchObject({ kind: 'temporary', message: expect.stringContaining('不是圖片') });
  expect(existsSync(tileFile(cacheRoot, 'maps', text, 15, 27360, 13800))).toBe(false);
});

test('with cacheDays every old tile of the layer goes, not only the ones this view uses', async () => {
  const kept: TileLayer = { ...layer, cacheDays: 30 };
  await fetchTiles({ ...opts(), layer: kept, tiles: grid(1, 15, 100, 100) });
  const elsewhere = tileFile(cacheRoot, 'maps', kept, 15, 100, 100), when = new Date(Date.now() - 31 * 86400_000);
  utimesSync(elsewhere, when, when);
  await fetchTiles({ ...opts(), layer: kept, tiles: grid(1) });
  expect(existsSync(elsewhere)).toBe(false);
});
