import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { RateLimit } from '../rate.ts';
import type { SourceCtx } from '../types.ts';
import { geocode, maps, parsePlace, route } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
const PHOTON: Record<string, string> = { '台北101': 'photon-taipei101', '中山': 'photon-zhongshan' };
let dir: string, ctx: SourceCtx, asked: URL[];
const fakeFetch = (async (url: string | URL) => {
  const u = new URL(String(url));
  asked.push(u);
  const json = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json' } });
  if (u.hostname === 'photon.komoot.io') return json(fx(PHOTON[u.searchParams.get('q')!] ?? 'photon-none'));
  if (u.hostname === 'router.project-osrm.org') return u.pathname.includes('-157.8583') ? json(fx('osrm-noroute'), 400) : json(fx('osrm-ok'));
  return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } });
}) as typeof fetch;
const http = (source: string, limits: RateLimit[]) => createHttp({ source, cacheDir: dir, limits, fetch: fakeFetch });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tiles-')); asked = [];
  ctx = { http: http('maps', maps.limits), sub: (name, limits) => http(`maps-${name}`, limits), options: {}, tmpDir: dir };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const layer = (id: string) => maps.tileLayers!.find((l) => l.id === id)!;

test('geocode reads Photon: name, place, coordinates and extent; the rest are others', async () => {
  const g = await geocode(ctx, '台北101');
  expect(asked[0].searchParams.get('q')).toBe('台北101');
  expect(g.best).toMatchObject({ name: '台北101', at: [121.5644995, 25.0338352], extent: [121.5638583, 25.0346102, 121.5652356, 25.0332803] });
  expect(g.best.detail).toBe('台北市、臺灣');
  const z = await geocode(ctx, '中山');
  expect(z.best.detail).toBe('横浜市、日本');
  expect(z.others.map((p) => p.detail)).toContain('台北市、臺灣');
});

test('an unknown place is a sentence; coordinates skip the lookup', async () => {
  await expect(geocode(ctx, 'zzqqxx')).rejects.toThrow('找不到地名「zzqqxx」；換個寫法，或直接給座標（緯度,經度）');
  expect(parsePlace('25.033, 121.565')).toEqual([121.565, 25.033]);
  expect(parsePlace('-33.86,151.21')).toEqual([151.21, -33.86]);
  expect(parsePlace('台北101')).toBeNull();
  expect(parsePlace('95,10')).toBeNull();   // no latitude past a pole
});

test('a Chinese name of a place abroad that Photon does not know says to use its own or English name', async () => {
  await expect(geocode(ctx, '克拉科夫')).rejects.toThrow('找不到地名「克拉科夫」；台灣以外的地方用英文或當地寫法（例如 Kraków、Budva），或直接給座標（緯度,經度）');
});

test('route asks OSRM for driving with lon,lat pairs and returns the line, metres and seconds', async () => {
  const r = await route(ctx, [[121.5645, 25.0339], [121.517, 25.0478]]);
  expect(asked[0].pathname).toBe('/route/v1/driving/121.5645,25.0339;121.517,25.0478');
  expect([asked[0].searchParams.get('overview'), asked[0].searchParams.get('geometries')]).toEqual(['full', 'geojson']);
  expect(r).toMatchObject({ meters: 6057.5, seconds: 512.2 });
  expect(r.line.length).toBe(170);
});

test('no route is a sentence that suggests a straight line', async () => {
  await expect(route(ctx, [[121.5645, 25.0339], [-157.8583, 21.3069]])).rejects.toThrow('排不出路線（NoRoute）；隔海或飛行用 --mode straight');
});

test('data lists places with lat,lon and the next command', async () => {
  const out = await maps.data!('中山', ctx);
  expect(out.split('\n')[0]).toMatch(/^中山（横浜市、日本）  35\.\d+,139\.\d+$/);
  expect(out).toMatch(/中山（台北市、臺灣）  25\.\d+,121\.\d+/);
  expect(out.split('\n').pop()).toMatch(/^放進地圖：npm run tellcut -- assets map <專案> --at "35\.\d+,139\.\d+"$/);
});

test('the tile urls follow WMTS z/y/x', () => {
  expect(layer('emap').url(12, 3431, 1753)).toBe('https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/12/1753/3431');
  expect(layer('photo').url(12, 3431, 1753)).toBe('https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/12/1753/3431');
  expect(layer('satellite').url(12, 3431, 1753)).toBe('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/12/1753/3431.jpg');
  expect(layer('emap').regions).toHaveLength(3);
  expect([layer('satellite').regions, layer('satellite').maxZoom]).toEqual([undefined, 16]);
});

test('maps never takes part in a search, and its check fetches one NLSC and one EOX tile', async () => {
  expect(maps.kinds).toEqual([]);
  expect(await maps.check(ctx)).toBe('NLSC、EOX 圖磚可下載');
  expect(asked.map((u) => u.hostname)).toEqual(['wmts.nlsc.gov.tw', 'tiles.maps.eox.at']);
});
