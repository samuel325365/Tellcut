// Maps without a key (spec 2026-10-22-external-sources §5 maps): tiles of NLSC (Taiwan's official street map and orthophotos, to z19)
// and EOX Sentinel-2 cloudless (the world from above, to about z16), places from Photon and driving routes from the OSRM demo.
// Tiles are stitched by `assets map`; `assets data maps <地名>` answers where a place is. OSM's own tile server forbids offline use
// and is not used; OpenFreeMap's vector tiles would need maplibre-gl-native (not this round).
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceAdapter, SourceCtx, TileLayer } from '../types.ts';
import type { LonLat } from './mercator.ts';

// Taiwan with Penghu and Orchid Island, Kinmen, Matsu — boxes tight enough to leave out Xiamen and Fuzhou across the strait
const TAIWAN: Array<[number, number, number, number]> = [[119.3, 21.8, 122.1, 25.4], [118.2, 24.37, 118.5, 24.55], [119.85, 25.9, 120.55, 26.4]];
const NLSC = { tileSize: 256 as const, maxZoom: 19, regions: TAIWAN, attribution: '© 內政部國土測繪中心',
  license: '政府資料開放授權條款-第1版', licenseUrl: 'https://data.gov.tw/license', page: 'https://maps.nlsc.gov.tw/' };
const nlsc = (layer: string) => (z: number, x: number, y: number) => `https://wmts.nlsc.gov.tw/wmts/${layer}/default/GoogleMapsCompatible/${z}/${y}/${x}`;
const EOX_YEAR = 2024;

export const MAP_LAYERS: TileLayer[] = [
  { id: 'emap', label: '臺灣通用電子地圖', url: nlsc('EMAP'), ext: '.jpg', ...NLSC },
  { id: 'photo', label: '國土測繪中心正射影像', url: nlsc('PHOTO2'), ext: '.jpg', ...NLSC },
  { id: 'satellite', label: 'EOX 衛星圖', url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${EOX_YEAR}_3857/default/g/${z}/${y}/${x}.jpg`,
    ext: '.jpg', tileSize: 256, maxZoom: 16,
    attribution: `EOxCloudless ${EOX_YEAR} https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data ${EOX_YEAR})`,
    license: 'CC BY-NC-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', page: 'https://cloudless.eox.at' },
];

/** the map's credit and its licence (CC BY-NC-SA and the government licence ask for it to be named) */
export const mapCredit = (r: { author: string; license?: string; licenseUrl?: string }) => `- Map: ${r.author}${r.license ? `, ${r.license}${r.licenseUrl ? ` (${r.licenseUrl})` : ''}` : ''}`;

export interface Place { name: string; detail: string; at: LonLat; extent?: [number, number, number, number] }

/** "25.033,121.565" (latitude, longitude) as [lon, lat]; null when the text is not coordinates */
export function parsePlace(text: string): LonLat | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lon, lat] : null;
}

interface PhotonFeature { properties: { name?: string; city?: string; district?: string; county?: string; state?: string; country?: string; extent?: [number, number, number, number] }; geometry: { coordinates: LonLat } }

/** Places by name from Photon (Chinese names answer in Chinese): the first, and the other different ones */
export async function geocode(ctx: SourceCtx, query: string): Promise<{ best: Place; others: Place[] }> {
  const r = await ctx.sub('photon', [{ n: 30, per: 60 }]).json<{ features?: PhotonFeature[] }>(`https://photon.komoot.io/api/?${new URLSearchParams({ q: query, limit: '5' })}`, { ttl: 30 * 86400 });
  const seen = new Set<string>(), places: Place[] = [];
  for (const f of r?.features ?? []) {
    const p = f.properties, detail = [p.city ?? p.district ?? p.county ?? p.state, p.country].filter(Boolean).join('、');
    const place: Place = { name: p.name ?? query, detail, at: f.geometry.coordinates, ...(p.extent ? { extent: p.extent } : {}) };
    if (seen.has(`${place.name}|${detail}`)) continue;
    seen.add(`${place.name}|${detail}`);
    places.push(place);
  }
  // Photon knows places by their own names (and English, German, French): a Chinese name works in Taiwan, not for 克拉科夫. Other
  // geocoders were tried for those and placed 布達瓦 in Luxembourg — a wrong place is worse than none, so the agent is told instead.
  if (!places.length) throw new Error(/[㐀-鿿]/.test(query)
    ? `找不到地名「${query}」；台灣以外的地方用英文或當地寫法（例如 Kraków、Budva），或直接給座標（緯度,經度）`
    : `找不到地名「${query}」；換個寫法，或直接給座標（緯度,經度）`);
  return { best: places[0], others: places.slice(1) };
}

/** A driving route through `points` from the OSRM demo (it routes cars only: its foot profile answers at car speed) */
export async function route(ctx: SourceCtx, points: LonLat[]): Promise<{ line: LonLat[]; meters: number; seconds: number }> {
  const path = points.map(([lon, lat]) => `${lon},${lat}`).join(';');
  const r = await ctx.sub('osrm', [{ n: 1, per: 1 }]).json<{ code: string; routes?: Array<{ distance: number; duration: number; geometry: { coordinates: LonLat[] } }> }>(
    `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`, { ttl: 30 * 86400, acceptStatus: [400], cacheIf: (b) => b?.code === 'Ok' });
  const best = r?.code === 'Ok' ? r.routes?.[0] : undefined;
  if (!best) throw new Error(`排不出路線（${r?.code ?? '沒有回應'}）；隔海或飛行用 --mode straight`);
  return { line: best.geometry.coordinates, meters: best.distance, seconds: best.duration };
}

const latLon = ([lon, lat]: LonLat) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

export const maps: SourceAdapter = {
  id: 'maps', label: '地圖', category: 'map', kinds: [], needsKey: false,
  limits: [{ n: 600, per: 60 }],
  tileLayers: MAP_LAYERS,
  summary: '地圖：台灣電子地圖和正射影像（國土測繪中心）、全球衛星圖（EOX），可疊路線；用 assets map 產生，assets data maps 查地名座標',
  sample: '台北101',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),
  search: async () => [],
  get: async () => { throw new Error('地圖用 npm run tellcut -- assets map <專案> --at <地名>'); },

  async check(ctx) {
    for (const layer of [MAP_LAYERS[0], MAP_LAYERS[2]]) {
      const file = join(ctx.tmpDir, `check-${layer.id}${layer.ext}`);
      try { await ctx.http.download(layer.url(12, 3430, 1755), file, { maxBytes: 2e6 }); } finally { rmSync(file, { force: true }); }
    }
    return 'NLSC、EOX 圖磚可下載';
  },

  credit: mapCredit,

  async data(query, ctx) {
    const { best, others } = await geocode(ctx, query);
    return [...[best, ...others].map((p) => `${p.name}${p.detail ? `（${p.detail}）` : ''}  ${latLon(p.at)}`), `放進地圖：npm run tellcut -- assets map <專案> --at "${latLon(best.at)}"`].join('\n');
  },
};
