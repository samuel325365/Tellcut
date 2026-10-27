// `assets map` (spec 2026-10-22-external-sources §4.4, §5 maps): places or a route → the layer that has them (Taiwan: NLSC; elsewhere:
// Carto streets or EOX satellite) → the tiles of the picture → one stitched JPEG with the route, the pins and the credit → a photo
// source of the project, recorded and credited like any other download.
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { importAsset } from '../project.ts';
import { SourceError } from '../http.ts';
import { contextFor, markBroken, sourceStatuses, usableSource, type Sources } from '../registry.ts';
import type { AssetRecord, TileLayer } from '../types.ts';
import { composeMap } from './compose.ts';
import { geocode, parsePlace, route } from './index.ts';
import { fitZoom, tilesFor, toPixels, unwrap, type LonLat } from './mercator.ts';
import { fetchTiles } from './tiles.ts';

export type MapStyle = 'street' | 'satellite' | 'light' | 'dark';
export interface MapOptions { at?: string; from?: string; to?: string; via?: string[]; style?: MapStyle; zoom?: number; size?: [number, number]; mode?: 'driving' | 'straight'; color?: string; name?: string;
  /** false: no pin at the place or at the ends of the route (a plain map to push into, or one under a pin drawn by fx) */
  pins?: boolean }
export interface MapResult {
  record: AssetRecord; usage: string; layer: string; label: string; size: [number, number]; zoom: number;
  /** the middle of the picture */ center: LonLat; tiles: number; downloaded: number; used: number; notes: string[]; distance?: { meters: number; seconds?: number };
}

/** a single place is shown at street level at most; a route as a whole */
const PLACE_MAX_ZOOM = 16, ROUTE_MAX_ZOOM = 17, PLACE_DEFAULT_ZOOM = 15;
const inside = ([lon, lat]: LonLat, boxes: Array<[number, number, number, number]>) => boxes.some(([w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n);

/** metres along the great circle */
function haversine(points: LonLat[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1].map((v) => (v * Math.PI) / 180), [lon2, lat2] = points[i].map((v) => (v * Math.PI) / 180);
    const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
    m += 2 * 6_371_000 * Math.asin(Math.sqrt(a));
  }
  return m;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const hash = (s: string, n: number) => createHash('sha1').update(s).digest('hex').slice(0, n);
/** ASCII text as a slug; anything else (Chinese) by its hash — a slug of 台北101 would be "101", of a Chinese name only dashes */
const slugOf = (text: string) => (/^[\x20-\x7e]+$/.test(text) ? text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '') || `map-${hash(text, 8)}`;

/** The map's name: --name as given (slugged), else the place(s) and the style, plus a short hash of any other setting — two maps
 *  of one place at other zooms (the space-to-street sequence) must not overwrite each other. */
function mapName(o: MapOptions, style: MapStyle): string {
  if (o.name) return slugOf(o.name);
  const settings = { zoom: o.zoom, size: o.size, via: o.via?.length ? o.via : undefined, mode: o.mode === 'straight' ? 'straight' : undefined, color: o.color, pins: o.pins === false ? false : undefined };
  const set = Object.values(settings).some((v) => v !== undefined) ? `-${hash(JSON.stringify(settings), 6)}` : '';
  return `${slugOf(o.at ?? `${o.from}-${o.to}`)}-${style}${set}`;
}

export async function makeMap(s: Sources, dir: string, o: MapOptions): Promise<MapResult> {
  if (!o.at && !(o.from && o.to)) throw new Error('要 --at <地名>，或 --from <地名> --to <地名>（地名也可以是「緯度,經度」）');
  const style = o.style ?? 'street', notes: string[] = [];
  usableSource(s, 'maps');
  const mapsCtx = contextFor(s, 'maps', join(dir, 'cache', 'maps'));

  // places: coordinates as they are, names through Photon (saying which one was taken when there are several)
  const extents = new Map<string, [number, number, number, number]>();
  const place = async (text: string): Promise<LonLat> => {
    const at = parsePlace(text);
    if (at) return at;
    const { best, others } = await geocode(mapsCtx, text);
    if (best.extent) extents.set(text, best.extent);
    if (others.length) notes.push(`「${text}」用了 ${best.name}${best.detail ? `（${best.detail}）` : ''}（也可能是：${others.slice(0, 3).map((p) => `${p.name}${p.detail ? `（${p.detail}）` : ''}`).join('、')}）`);
    return best.at;
  };
  const texts = o.at ? [o.at] : [o.from!, ...(o.via ?? []), o.to!], points: LonLat[] = [];
  for (const t of texts) points.push(await place(t));

  let line: LonLat[] | undefined, distance: MapResult['distance'];
  if (!o.at) {
    if ((o.mode ?? 'driving') === 'driving') { const r = await route(mapsCtx, points); line = r.line; distance = { meters: r.meters, seconds: r.seconds }; }
    else { line = unwrap(points); distance = { meters: Math.round(haversine(points)) }; }
  }

  // the layer: NLSC when everything is in Taiwan, otherwise Carto streets or EOX satellite; light/dark are Carto's
  const nlsc = s.adapters.maps.tileLayers!.find((l) => l.id === 'emap')!.regions!;
  const inTaiwan = points.every((p) => inside(p, nlsc)) && (line ?? []).every(([lon, lat]) => inside([((lon + 540) % 360) - 180, lat], nlsc));
  const [sourceId, layerId] = style === 'satellite' ? ['maps', inTaiwan ? 'photo' : 'satellite'] : style === 'street' ? (inTaiwan ? ['maps', 'emap'] : ['carto', 'voyager']) : ['carto', style];
  if (sourceId === 'carto') {
    const st = sourceStatuses(s).find((x) => x.id === 'carto');
    if (!st?.available) {
      const why = (st?.why ?? '還沒有轉接程式').replace(/^缺 key（(.+)）$/, '缺 key：$1');
      throw new Error(style === 'street' ? `台灣以外的街道圖要 Carto（${why}）；或改 --style satellite` : `--style ${style} 要 Carto（${why}）；或改 --style street／satellite`);
    }
  }
  const layer: TileLayer = s.adapters[sourceId].tileLayers!.find((l) => l.id === layerId)!;
  const ctx = sourceId === 'maps' ? mapsCtx : contextFor(s, sourceId, join(dir, 'cache', 'maps'));

  // the view
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')) as { meta: { width: number; height: number } };
  const [width, height] = o.size ?? [project.meta.width, project.meta.height];
  let fit: { center: LonLat; zoom: number };
  if (line) fit = fitZoom(line, width, height, { maxZoom: ROUTE_MAX_ZOOM });
  else {
    const e = extents.get(o.at!);
    // Photon gives [west, north, east, south]; across the date line west > east
    // the whole place in view: centred on its extent (a city's point can sit near one edge of it), unless a closer --zoom asks for
    // less than the extent — then on the point, which would otherwise fall out of the picture
    const whole = e ? fitZoom([[e[0], e[1]], [e[2] < e[0] ? e[2] + 360 : e[2], e[3]]], width, height, { maxZoom: PLACE_MAX_ZOOM }) : undefined;
    fit = whole ? { ...whole, center: o.zoom !== undefined && o.zoom > whole.zoom ? points[0] : whole.center } : { center: points[0], zoom: PLACE_DEFAULT_ZOOM };
  }
  const zoom = Math.max(2, Math.min(20, o.zoom ?? fit.zoom)), view = { center: fit.center, zoom, width, height };
  const need = tilesFor(view, layer);
  if (need.upscaled) notes.push(`⚠ ${layer.label} 最細到 z${layer.maxZoom}，放大會糊`);

  let got: Awaited<ReturnType<typeof fetchTiles>>;
  try { got = await fetchTiles({ http: ctx.http, source: sourceId, layer, key: ctx.key, tiles: need.tiles, cacheRoot: join(dirname(s.cacheDir), 'tiles'), projectDir: dir }); }
  catch (e) { if (e instanceof SourceError && e.kind === 'broken') await markBroken(s, sourceId, e.message); throw e; }
  const attribution = `${layer.attribution}${line && o.mode !== 'straight' ? ' · Route © OpenStreetMap contributors (OSRM)' : ''}`;
  const name = mapName(o, style), out = join(dir, 'cache', 'maps', `${name}.jpg`);
  const width0 = Math.max(6, Math.round(Math.min(width, height) / 120));
  await composeMap({ out, width, height, background: style === 'dark' ? '#1b1d22' : '#c9d6df', tiles: got.files,
    ...(line ? { route: { points: toPixels(line, view), color: o.color ?? '#e5484d', width: width0 } } : {}),
    pins: o.pins === false ? [] : toPixels(o.at ? points : [line![0], line![line!.length - 1]], view), attribution });

  const label = o.at ?? `${o.from} → ${o.to}`;
  try {
    const geo = { projection: 'mercator' as const, center: [round6(view.center[0]), round6(view.center[1])] as [number, number], zoom, size: [width, height] as [number, number] };
    const { record } = await importAsset(dir, { file: out, kind: 'image', map: geo, meta: { source: sourceId, id: name, title: `地圖：${label}（${style}）`, author: attribution, page: layer.page,
      license: layer.license, ...(layer.licenseUrl ? { licenseUrl: layer.licenseUrl } : {}), quality: 'original' } }, { adapters: s.adapters });
    return { record, usage: `c.photo('${record.sourceId}', { len: 4, zoom: [1, 1.08] })`, layer: `${sourceId}:${layer.id}`, label: layer.label, size: [width, height],
      zoom: Math.round(zoom * 100) / 100, center: view.center, tiles: need.tiles.length, downloaded: got.downloaded, used: got.used, notes, ...(distance ? { distance } : {}) };
  } finally { rmSync(out, { force: true }); }
}
