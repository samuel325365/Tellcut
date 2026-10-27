// CARTO's raster basemaps (spec 2026-10-22-external-sources §5 maps): street maps of the whole world in three looks, for places
// outside Taiwan. Read 2026-10-23: since 2026-09-25 a tile without a key is a blank "API KEY REQUIRED" picture (with HTTP 200); a
// free key comes by e-mail. The terms allow static images with a legible credit, forbid bulk downloading and server-side caching,
// and limit caching on the user's device to 30 days — so tiles are kept 30 days and the credit is printed on every map.
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mapCredit } from '../maps/index.ts';
import { checkTile } from '../maps/tiles.ts';
import type { SourceAdapter, TileLayer } from '../types.ts';

const STYLES: Array<[string, string, string]> = [['light', 'light_all', 'Carto 淺色街道圖'], ['dark', 'dark_all', 'Carto 深色街道圖'], ['voyager', 'voyager', 'Carto 彩色街道圖']];
export const CARTO_LAYERS: TileLayer[] = STYLES.map(([id, path, label]) => ({
  id, label, url: (z, x, y, key) => `https://basemaps.cartocdn.com/rastertiles/${path}/${z}/${x}/${y}@2x.png?key=${key ?? ''}`,
  ext: '.png', tileSize: 512, maxZoom: 20, cacheDays: 30,
  attribution: '© OpenStreetMap contributors, © CARTO', license: 'CARTO Basemap Terms', licenseUrl: 'https://carto.com/legal/basemap-terms/', page: 'https://carto.com/attribution/',
}));

export const carto: SourceAdapter = {
  id: 'carto', label: 'Carto 街道圖', category: 'map', kinds: [], needsKey: true,
  limits: [{ n: 600, per: 60 }],
  tileLayers: CARTO_LAYERS,
  summary: 'Carto 街道圖（全球，淺色／深色／彩色三種樣式）：台灣以外的街道地圖，用 assets map；要免費 key',
  sample: 'Kraków',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),
  search: async () => [],
  get: async () => { throw new Error('地圖用 npm run tellcut -- assets map <專案> --at <地名>'); },

  async check(ctx) {
    const file = join(ctx.tmpDir, 'check-carto.png');
    // a wrong key still answers 200 with a picture: only its size (256 px, not 512) tells
    try { await ctx.http.download(CARTO_LAYERS[0].url(2, 2, 1, ctx.key), file, { maxBytes: 2e6 }); checkTile(file, 'carto', CARTO_LAYERS[0]); } finally { rmSync(file, { force: true }); }
    return 'Carto 圖磚可下載，key 有效';
  },

  credit: mapCredit,
};
