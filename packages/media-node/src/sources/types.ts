// What every source adapter is (spec 2026-10-22-external-sources §4.2): search, get, a capability card, a health check, a credit line.
import type { Http } from './http.ts';
import type { RateLimit } from './rate.ts';
import type { SourceCategory } from '@tellcut/protocol';
/** the groups of the chat's API menu (spec 2026-10-24-api-picker §3) */
export { SOURCE_CATEGORIES, type SourceCategory } from '@tellcut/protocol';

/** audio = a sound effect; music = background music */
export type AssetKind = 'video' | 'image' | 'audio' | 'music';

export interface SearchQuery {
  text: string; kind?: AssetKind; ratio?: string; minSec?: number; maxSec?: number;
  /** conditions only this source has (--opt k=v) */
  opts: Record<string, string>;
  limit: number;
}

export interface AssetHit {
  /** "<source>:<id>", what `assets get` takes */
  ref: string; source: string; id: string; kind: AssetKind; title: string;
  duration?: number; width?: number; height?: number;
  /** where the source keeps a small picture of it (searchAll downloads it) */
  thumbUrl?: string;
  /** that picture downloaded, a local file Claude can Read */
  thumb?: string;
  author?: string; tags?: string[]; detail?: string; bpm?: number;
}

/** where an asset came from and under what licence (copyright is recorded, not a gate) */
export interface AssetMeta { source: string; id: string; title: string; author: string; page: string; license: string; licenseUrl?: string; quality: 'preview' | 'original' }

/** Where a stitched map picture lies on the earth (`assets map`): Web Mercator with the world 256·2^zoom px wide, the picture's
 *  middle at `center`, `size` px — so any longitude/latitude is a pixel of it (common.mapcam reads it from project.json). */
export interface MapGeo { projection: 'mercator'; center: [number, number]; zoom: number; size: [number, number] }

/** an asset an adapter downloaded: its file sits in ctx.tmpDir until it is brought into the project */
export interface Fetched { file: string; kind: AssetKind; meta: AssetMeta; bpm?: number; /** a stitched map: where it lies */ map?: MapGeo }

/** one line of media/assets.json */
export interface AssetRecord extends AssetMeta {
  /** relative to the project */
  path: string; downloaded: string; from?: number; len?: number; bpm?: number; mediaId?: string; peak?: number;
  /** the --opt it was downloaded with */
  opts?: Record<string, string>;
  /** a picture's id in project.json `sources` */
  sourceId?: string;
  /** a stitched map: where it lies (also written to its project.json source as `map`, with the attribution as its credit) */
  map?: MapGeo;
}

export interface SourceCtx {
  http: Http; key?: string; options: Record<string, unknown>; tmpDir: string;
  /** another service of this source with its own rate limit (state in .cache/sources/rate/<source>-<name>.json) */
  sub(name: string, limits: RateLimit[]): Http;
}

/** A layer of map tiles a source serves (spec §5 maps): stitched by `assets map`. */
export interface TileLayer {
  id: string; label: string;
  url(z: number, x: number, y: number, key?: string): string;
  ext: '.png' | '.jpg'; tileSize: 256 | 512; maxZoom: number;
  /** lon/lat boxes [west, south, east, north] where it has data; absent: the world */
  regions?: Array<[number, number, number, number]>;
  /** printed on the map and written to the credits */
  attribution: string; license: string; licenseUrl?: string; page: string;
  /** a tile older than this is fetched again and the old one removed (a source's terms); absent: kept */
  cacheDays?: number;
}


export interface SourceAdapter {
  /** category: its group in the chat's API menu */
  id: string; label: string; category: SourceCategory; kinds: AssetKind[]; needsKey: boolean; unofficial?: boolean; limits: RateLimit[];
  /** the map tile layers it serves (assets map) */
  tileLayers?: TileLayer[];
  /** the limits when no contact is configured, for a source that gives anonymous callers less */
  limitsWithoutContact?: RateLimit[];
  /** one line for `assets sources` */
  summary: string;
  /** the query `npm run sources -- --live` tries */
  sample: string;
  /** the full capability card (markdown): how to search, conditions, examples, pitfalls */
  card(): string;
  search(q: SearchQuery, ctx: SourceCtx): Promise<AssetHit[]>;
  get(id: string, ctx: SourceCtx): Promise<Fetched>;
  /** the cheapest request that proves the source works; throws a SourceError; returns a detail line */
  check(ctx: SourceCtx): Promise<string>;
  /** the credits line for one downloaded asset */
  credit(r: AssetRecord): string;
  /** a data source's answer to a question, as text for Claude (`assets data <id> <query>`; conditions in ctx.options) */
  data?(query: string, ctx: SourceCtx): Promise<string>;
}
