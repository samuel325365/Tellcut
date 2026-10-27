import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSourcesConfig, SOURCES_FILE } from '../config.ts';
import { openSources, sourceStatuses } from '../registry.ts';
import { carto } from './index.ts';

const layer = (id: string) => carto.tileLayers!.find((l) => l.id === id)!;

test('carto urls carry the key and ask for @2x tiles, z/x/y', () => {
  expect(layer('dark').url(12, 2286, 1388, 'K')).toBe('https://basemaps.cartocdn.com/rastertiles/dark_all/12/2286/1388@2x.png?key=K');
  expect(layer('light').url(3, 1, 2, 'K')).toBe('https://basemaps.cartocdn.com/rastertiles/light_all/3/1/2@2x.png?key=K');
  expect(layer('voyager').url(3, 1, 2, 'K')).toBe('https://basemaps.cartocdn.com/rastertiles/voyager/3/1/2@2x.png?key=K');
});

test('carto needs a key, serves 512 px tiles to z20, keeps them at most 30 days and is credited to OSM and CARTO', () => {
  expect([carto.needsKey, carto.kinds]).toEqual([true, []]);
  for (const l of carto.tileLayers!) expect(l).toMatchObject({ tileSize: 512, maxZoom: 20, cacheDays: 30, attribution: '© OpenStreetMap contributors, © CARTO', ext: '.png' });
});

test('without CARTO_API_KEY carto is not available', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tiles-'));
  try {
    const config = loadSourcesConfig({ file: SOURCES_FILE, localFile: join(dir, 'none.json') });
    expect(config.sources.carto).toMatchObject({ enabled: true, keyEnv: 'CARTO_API_KEY' });
    const s = openSources({ root: dir, config, adapters: { carto }, env: {} });
    expect(sourceStatuses(s).find((x) => x.id === 'carto')).toMatchObject({ available: false, why: '缺 key（CARTO_API_KEY）' });
    expect(sourceStatuses(openSources({ root: dir, config, adapters: { carto }, env: { CARTO_API_KEY: 'k' } })).find((x) => x.id === 'carto')!.available).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the card says how to get a key and what the terms allow', () => {
  for (const must of ['carto.com/basemaps', 'CARTO_API_KEY', '30 days', 'credit', 'non-commercial', 'API KEY REQUIRED']) expect(carto.card()).toContain(must);
});

test('check says the key is wrong when Carto answers with its 256 px "API KEY REQUIRED" picture', async () => {
  const { PNG } = await import('pngjs');
  const { createHttp } = await import('../http.ts');
  const dir = mkdtempSync(join(tmpdir(), 'tiles-'));
  try {
    const p = new PNG({ width: 256, height: 256 }); p.data.fill(240);
    const fetch = (async () => new Response(new Uint8Array(PNG.sync.write(p)), { headers: { 'content-type': 'image/png' } })) as unknown as typeof globalThis.fetch;
    const http = createHttp({ source: 'carto', cacheDir: dir, limits: carto.limits, fetch });
    await expect(carto.check({ http, sub: () => http, key: 'bogus', options: {}, tmpDir: dir })).rejects.toMatchObject({ kind: 'broken', message: expect.stringContaining('key 不對') });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
