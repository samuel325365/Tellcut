import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { createProject } from '../../ingest.ts';
import { probeMedia } from '../../probe.ts';
import type { SourcesConfig } from '../config.ts';
import { openSources } from '../registry.ts';
import { carto } from '../carto/index.ts';
import { maps } from './index.ts';
import { makeMap } from './make.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
const PHOTON: Record<string, string> = { '台北101': 'photon-taipei101', '中山': 'photon-zhongshan' };
const square = (n: number) => { const p = new PNG({ width: n, height: n }); p.data.fill(230); return PNG.sync.write(p); };
const tile = square(256), tile2x = square(512);
let root: string, dir: string, hosts: string[];
const fakeFetch = (async (url: string | URL) => {
  const u = new URL(String(url));
  hosts.push(u.hostname);
  const json = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json' } });
  if (u.hostname === 'photon.komoot.io') return json(fx(PHOTON[u.searchParams.get('q')!] ?? 'photon-none'));
  if (u.hostname === 'router.project-osrm.org') return json(fx('osrm-ok'));
  return new Response(new Uint8Array(u.hostname === 'basemaps.cartocdn.com' ? tile2x : tile), { headers: { 'content-type': 'image/png' } });
}) as typeof fetch;
const config: SourcesConfig = { contact: 'me@example.org', keys: {}, sources: { maps: { enabled: true, options: {} }, carto: { enabled: true, keyEnv: 'CARTO_API_KEY', options: {} } } };
const sources = (env: NodeJS.ProcessEnv = {}) => openSources({ root, config, adapters: { maps, carto }, env, fetch: fakeFetch });
const readProject = () => JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));

// each test its own root: the tiles and the rate state (600 tiles a minute) are per test, as they are per machine
afterEach(() => rmSync(root, { recursive: true, force: true }));
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'tiles-'));
  const projectsDir = mkdtempSync(join(root, 'p-'));
  dir = join(projectsDir, 'm1'); hosts = [];
  await createProject({ id: 'm1', inputs: [], projectsDir, blank: true, size: [1080, 1920] });
});

test('a Taiwan place becomes a 9:16 street map registered as a photo, with its attribution', async () => {
  const r = await makeMap(sources(), dir, { at: '台北101' });
  expect(r.record).toMatchObject({ source: 'maps', license: '政府資料開放授權條款-第1版' });
  expect(r.record.sourceId).toMatch(/^maps-map-[0-9a-f]{8}-street$/);   // a Chinese name has no slug: hash-named
  expect(readProject().sources[r.record.sourceId!]).toMatchObject({ width: 1080, height: 1920, kind: 'image' });
  expect(await probeMedia(join(dir, r.record.path))).toMatchObject({ width: 1080, height: 1920 });
  expect([r.layer, r.label]).toEqual(['maps:emap', '臺灣通用電子地圖']);
  expect(r.zoom).toBeLessThanOrEqual(16);
  expect(r.tiles).toBeGreaterThan(20);
  expect(r.usage).toBe(`c.photo('${r.record.sourceId}', { len: 4, zoom: [1, 1.08] })`);
  expect(readFileSync(join(dir, 'media', 'CREDITS.md'), 'utf8')).toContain('- Map: © 內政部國土測繪中心');
});

test('satellite in Taiwan is the NLSC photo, abroad EOX', async () => {
  expect((await makeMap(sources(), dir, { at: '台北101', style: 'satellite', zoom: 14 })).layer).toBe('maps:photo');
  const abroad = await makeMap(sources(), dir, { at: '50.061,19.937', style: 'satellite', zoom: 13 });
  expect(abroad.layer).toBe('maps:satellite');
  expect(abroad.record.sourceId).toMatch(/^maps-50-061-19-937-satellite-[0-9a-f]{6}$/);   // a --zoom of its own: its own name
  expect(abroad.record.author).toContain('EOxCloudless 2024');
});

test('street outside Taiwan without Carto says how to get one; with a key it is the Carto map', async () => {
  await expect(makeMap(sources(), dir, { at: '50.061,19.937' })).rejects.toThrow('台灣以外的街道圖要 Carto（缺 key：CARTO_API_KEY）；或改 --style satellite');
  const r = await makeMap(sources({ CARTO_API_KEY: 'k' }), dir, { at: '50.061,19.937', zoom: 14 });
  expect([r.layer, r.record.source]).toEqual(['carto:voyager', 'carto']);
  expect(r.record.author).toBe('© OpenStreetMap contributors, © CARTO');
});

test('a route is drawn between from and to, fitted with padding, and its distance told', async () => {
  const r = await makeMap(sources(), dir, { from: '台北101', to: '25.0478,121.517' });
  expect(hosts).toContain('router.project-osrm.org');
  expect(r.distance).toEqual({ meters: 6057.5, seconds: 512.2 });
  expect(r.record.author).toBe('© 內政部國土測繪中心 · Route © OpenStreetMap contributors (OSRM)');
  expect(r.zoom).toBeGreaterThan(12);
  expect(r.zoom).toBeLessThan(16);
});

test('--mode straight joins the points without asking OSRM', async () => {
  const r = await makeMap(sources(), dir, { from: '25.0339,121.5645', to: '50.061,19.937', mode: 'straight', style: 'satellite' });
  expect(hosts).not.toContain('router.project-osrm.org');
  expect(r.distance!.meters).toBeGreaterThan(8_000_000);
  expect(r.distance!.seconds).toBeUndefined();
  expect(r.zoom).toBeLessThan(5);
});

test('a place with several matches says which one was used', async () => {
  const r = await makeMap(sources(), dir, { at: '中山', style: 'satellite', zoom: 12 });
  expect(r.notes.join('\n')).toMatch(/「中山」用了 中山（横浜市、日本）（也可能是：.*中山（台北市、臺灣）/);
});

test('a view closer than the satellite goes says it will be blurry', async () => {
  const r = await makeMap(sources(), dir, { at: '50.061,19.937', style: 'satellite', zoom: 18 });
  expect(r.notes).toContain('⚠ EOX 衛星圖 最細到 z16，放大會糊');
});

test('without --at or --from/--to it says how to ask', async () => {
  await expect(makeMap(sources(), dir, { from: '台北101' })).rejects.toThrow('要 --at <地名>，或 --from <地名> --to <地名>');
});

test('Taiwan means Taiwan, Penghu, Kinmen and Matsu — not Xiamen across the strait', async () => {
  expect((await makeMap(sources(), dir, { at: '24.44,118.32', zoom: 13 })).layer).toBe('maps:emap');   // Kinmen
  await expect(makeMap(sources(), dir, { at: '24.48,118.09', zoom: 13 })).rejects.toThrow('台灣以外的街道圖要 Carto');   // Xiamen
});

test('maps of the same place with other settings get their own names; a Chinese --name is hashed, not dashed', async () => {
  const far = await makeMap(sources(), dir, { at: '台北101', zoom: 5, style: 'satellite' }), near = await makeMap(sources(), dir, { at: '台北101', zoom: 16, style: 'satellite' });
  expect(far.record.sourceId).not.toBe(near.record.sourceId);
  const a = await makeMap(sources(), dir, { at: '台北101', zoom: 14, name: '台北夜景' }), b = await makeMap(sources(), dir, { at: '台北101', zoom: 14, name: '台北白天' });
  expect(a.record.sourceId).toMatch(/^maps-map-[0-9a-f]{8}$/);
  expect(a.record.sourceId).not.toBe(b.record.sourceId);
  expect((await makeMap(sources(), dir, { at: '台北101', zoom: 14, name: 'xinyi' })).record.sourceId).toBe('maps-xinyi');
});

test('a straight line across the date line goes over the Pacific', async () => {
  const r = await makeMap(sources(), dir, { from: '25.0339,121.5645', to: '21.3069,-157.8583', mode: 'straight', style: 'satellite' });
  expect(r.zoom).toBeGreaterThanOrEqual(2.5);
  expect(r.distance!.meters).toBeGreaterThan(8_000_000);
  expect(r.distance!.meters).toBeLessThan(8_500_000);
});

test('the credits line names the licence', async () => {
  await makeMap(sources(), dir, { at: '50.061,19.937', style: 'satellite', zoom: 10 });
  expect(readFileSync(join(dir, 'media', 'CREDITS.md'), 'utf8')).toContain('(Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/)');
});

test('pins: false leaves the pin off and is a map of its own name', async () => {
  const pinned = await makeMap(sources(), dir, { at: '25.0339,121.5645', zoom: 15 });
  const plain = await makeMap(sources(), dir, { at: '25.0339,121.5645', zoom: 15, pins: false });
  expect(plain.record.sourceId).not.toBe(pinned.record.sourceId);
  // the tiles are one flat grey: without the white-ringed dot the JPEG has less in it
  const bytes = (r: typeof plain) => readFileSync(join(dir, r.record.path)).length;
  expect(bytes(plain)).toBeLessThan(bytes(pinned));
});

test('a place with an extent is centred on the extent; a closer --zoom on the place itself', async () => {
  // 台北101's Photon extent is [121.5638583, 25.0346102, 121.5652356, 25.0332803]; its point is 121.5644995, 25.0338352
  const whole = await makeMap(sources(), dir, { at: '台北101' });
  expect(whole.center[0]).toBeCloseTo((121.5638583 + 121.5652356) / 2, 6);
  const close = await makeMap(sources(), dir, { at: '台北101', zoom: 18 });
  expect(close.center).toEqual([121.5644995, 25.0338352]);
});

test('the map keeps where it lies: centre, zoom and size in its record, centre, zoom and credit in its project.json source', async () => {
  const r = await makeMap(sources(), dir, { at: '50.061,19.937', style: 'satellite', zoom: 13.5, size: [720, 1280], pins: false });
  expect(r.record.map).toEqual({ projection: 'mercator', center: [19.937, 50.061], zoom: 13.5, size: [720, 1280] });
  const src = readProject().sources[r.record.sourceId!];
  expect(src.map).toMatchObject({ center: [19.937, 50.061], zoom: 13.5 });
  expect(src.map.credit).toContain('EOxCloudless');
  const rec = JSON.parse(readFileSync(join(dir, 'media', 'assets.json'), 'utf8')).items.find((x: { sourceId?: string }) => x.sourceId === r.record.sourceId);
  expect(rec.map.zoom).toBe(13.5);
});
