// Which sources exist and which the agents may use right now (spec 2026-10-22-external-sources §4.1): switched on, with the key it
// needs, not marked broken. Those that may not are invisible to the agents (`assets sources`) and told with the reason by
// `npm run sources`. One search asks every available source of the kind at once and keeps what each one could answer.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { photoSheet } from '../extras.ts';
import { createLimiter } from '../limit.ts';
import { TELLCUT_ROOT } from '../paths.ts';
import { contactOf, loadSourcesConfig, sourceKey, SOURCES_CACHE_DIR, SOURCES_HEALTH_FILE, type SourcesConfig } from './config.ts';
import { readHealth, recordHealth, type HealthEntry } from './health.ts';
import { createHttp, SourceError } from './http.ts';
import type { RateLimit } from './rate.ts';
import type { AssetHit, AssetKind, SearchQuery, SourceAdapter, SourceCtx } from './types.ts';
import { bbcSfx } from './bbc/index.ts';
import { incompetech } from './incompetech/index.ts';
import { wikimedia } from './wikimedia/index.ts';
import { maps } from './maps/index.ts';
import { carto } from './carto/index.ts';
import { freesound } from './freesound/index.ts';
import { nasa } from './nasa/index.ts';
import { pixabay } from './pixabay/index.ts';
import { pokeapi } from './pokeapi/index.ts';
import { amiibo } from './amiibo/index.ts';
import { gameWikis } from './game-wikis/index.ts';
import { hpApi } from './hp-api/index.ts';
import { anime } from './anime/index.ts';
import { steam } from './steam/index.ts';
import { countries } from './countries/index.ts';
import { cocktaildb, mealdb } from './mealdb/index.ts';

/** every adapter Tellcut has, by source id, in the order of the chat's API menu (its groups, then within each group) */
export const ADAPTERS: Record<string, SourceAdapter> = {
  wikimedia, nasa, pixabay,
  freesound, 'bbc-sfx': bbcSfx, incompetech,
  maps, carto,
  pokeapi, amiibo, 'game-wikis': gameWikis, 'hp-api': hpApi, anime, steam,
  countries, mealdb, cocktaildb,
};

export interface Sources { config: SourcesConfig; env: NodeJS.ProcessEnv; cacheDir: string; healthFile: string; fetch: typeof fetch; now: () => number; adapters: Record<string, SourceAdapter> }

/** the sources as configured under `root` (default tellcut/); tests pass their own config, adapters and fetch */
export function openSources(o: { root?: string; env?: NodeJS.ProcessEnv; fetch?: typeof fetch; now?: () => number; adapters?: Record<string, SourceAdapter>; config?: SourcesConfig } = {}): Sources {
  const root = o.root;
  return {
    config: o.config ?? (root ? loadSourcesConfig({ file: join(root, 'sources.json'), localFile: join(root, 'sources.local.json') }) : loadSourcesConfig()),
    env: o.env ?? process.env,
    cacheDir: root && root !== TELLCUT_ROOT ? join(root, '.cache', 'sources') : SOURCES_CACHE_DIR,
    healthFile: root && root !== TELLCUT_ROOT ? join(root, '.cache', 'sources-health.json') : SOURCES_HEALTH_FILE,
    fetch: o.fetch ?? globalThis.fetch,
    now: o.now ?? Date.now,
    adapters: o.adapters ?? ADAPTERS,
  };
}

import type { SourceReason } from '@tellcut/protocol';
/** why a source cannot be used, as a code the page translates (`why` says it in Chinese) */
export type { SourceReason };
export interface SourceStatus { id: string; adapter?: SourceAdapter; enabled: boolean; key: 'not-needed' | 'present' | 'missing'; health?: HealthEntry; available: boolean; reason?: SourceReason; why?: string }

/** The sources the user ticked in the chat's API menu (spec 2026-10-24-api-picker §3), which the page chat's runner hands its agent
 *  as TELLCUT_SOURCES (none ticked: an empty list). Undefined when there is no such list: the developers' CLI and batch agents. */
export function pickedSources(env: NodeJS.ProcessEnv): Set<string> | undefined {
  const v = env.TELLCUT_SOURCES;
  return v === undefined ? undefined : new Set(v.split(',').map((x) => x.trim()).filter(Boolean));
}

/** every adapter, then the configured ids that have none yet */
export function sourceStatuses(s: Sources): SourceStatus[] {
  const health = readHealth(s.healthFile), ids = [...new Set([...Object.keys(s.adapters), ...Object.keys(s.config.sources)])], picked = pickedSources(s.env);
  return ids.map((id) => {
    const adapter = s.adapters[id], entry = s.config.sources[id], enabled = !!entry?.enabled, h = health[id];
    const key = !adapter?.needsKey ? 'not-needed' as const : sourceKey(s.config, id, s.env) ? 'present' as const : 'missing' as const;
    const reason: SourceReason | undefined = !adapter ? 'no-adapter' : !enabled ? 'off' : key === 'missing' ? 'key' : h?.status === 'broken' ? 'broken' : picked && !picked.has(id) ? 'unpicked' : undefined;
    const why = reason && { 'no-adapter': '還沒有轉接程式', off: '關閉', key: `缺 key（${entry?.keyEnv ?? `sources.local.json 的 keys.${id}`}）`, broken: `壞掉：${h?.detail}`, unpicked: '這次對話沒有勾選' }[reason];
    return { id, adapter, enabled, key, ...(h ? { health: h } : {}), available: !reason, ...(reason ? { reason, why } : {}) };
  });
}

/** the adapters an agent may use now (of `kind`, when given) */
export function availableSources(s: Sources, kind?: AssetKind): SourceAdapter[] {
  return sourceStatuses(s).filter((x) => x.available && (!kind || x.adapter!.kinds.includes(kind))).map((x) => x.adapter!);
}

/** an adapter's rate limits: the slower ones when no contact is configured and the source gives less to anonymous callers (Wikimedia) */
export function limitsFor(s: Sources, a: SourceAdapter): RateLimit[] {
  return !contactOf(s.config, s.env) && a.limitsWithoutContact ? a.limitsWithoutContact : a.limits;
}

export function contextFor(s: Sources, id: string, tmpDir: string): SourceCtx {
  const adapter = s.adapters[id], key = sourceKey(s.config, id, s.env);
  const http = (source: string, limits: RateLimit[]) => createHttp({ source, contact: contactOf(s.config, s.env), cacheDir: s.cacheDir, limits, hasKey: !!key, fetch: s.fetch, now: s.now });
  return {
    http: http(id, limitsFor(s, adapter)),
    // another service of the same source (the maps' place search and routes): its own rate limit, everything else the same
    sub: (name, limits) => http(`${id}-${name}`, limits),
    key, options: s.config.sources[id]?.options ?? {}, tmpDir,
  };
}

/** the source by id when an agent may use it; otherwise an error that says why */
export function usableSource(s: Sources, id: string): SourceAdapter {
  const st = sourceStatuses(s).find((x) => x.id === id);
  if (!st) throw new Error(`沒有「${id}」這個來源（npm run tellcut -- assets sources 看有哪些）`);
  // the page chat's agent is told what to ask for: the user ticks it in the menu, nobody can switch it on in a terminal
  if (st.reason === 'unpicked') throw new Error(`使用者這次沒有勾選「${id}」：請使用者在對話框的 API 選單勾選`);
  if (!st.available) throw new Error(`來源 ${id} 現在不能用：${st.why}`);
  return st.adapter!;
}

export type SearchProblem = { source: string; kind: SourceError['kind']; message: string };

/** A source that fails is a problem in the answer, not an error: the others' hits still come back, taking turns. */
export async function searchAll(s: Sources, q: SearchQuery & { source?: string }): Promise<{ hits: AssetHit[]; problems: SearchProblem[]; asked: string[] }> {
  const asked = q.source ? [usableSource(s, q.source)] : availableSources(s, q.kind);
  const results = await Promise.allSettled(asked.map((a) => a.search(q, contextFor(s, a.id, join(s.cacheDir, 'thumbs', a.id)))));
  const lists: AssetHit[][] = [], problems: SearchProblem[] = [];
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') { lists.push(r.value); continue; }
    const e = r.reason as Error, id = asked[i].id;
    const kind = e instanceof SourceError ? e.kind : 'temporary';
    if (kind === 'broken') await markBroken(s, id, e.message);
    problems.push({ source: id, kind, message: e.message });
  }
  const hits: AssetHit[] = [];
  for (let k = 0; lists.some((l) => k < l.length); k++) for (const l of lists) if (k < l.length) hits.push(l[k]);
  await fetchThumbs(s, hits);
  return { hits, problems, asked: asked.map((a) => a.id) };
}

/** Each hit's thumbnail downloaded once into .cache/sources/thumbs/<source>/ (4 at a time), so Claude can look before choosing.
 *  One that fails leaves its hit without a picture; the hit still counts. */
async function fetchThumbs(s: Sources, hits: AssetHit[]): Promise<void> {
  const limiter = createLimiter(4), http = new Map<string, SourceCtx['http']>();
  await Promise.all(hits.filter((h) => h.thumbUrl).map((h) => limiter.run(async () => {
    const ext = extname(new URL(h.thumbUrl!).pathname).toLowerCase() || '.jpg';
    const file = join(s.cacheDir, 'thumbs', h.source, `${h.id.replace(/[^A-Za-z0-9_-]/g, '-')}${ext}`);
    try {
      // kept by id, but not forever: a file replaced on Commons keeps its id and would show its old picture
      if (!existsSync(file) || s.now() - statSync(file).mtimeMs > THUMB_DAYS * 86_400_000) {
        if (!http.has(h.source)) http.set(h.source, contextFor(s, h.source, dirname(file)).http);
        await http.get(h.source)!.download(h.thumbUrl!, file, { maxBytes: 5e6 });
      }
      h.thumb = file;
    } catch { /* no picture for this one */ }
  })));
}

const SHEET_CELL_W = 320, MAX_CELL_RATIO = 1.5;
/** a thumbnail older than this is fetched again */
const THUMB_DAYS = 30;

/** One contact sheet of the hits' thumbnails, each labelled with its ref (cached by its pictures); null when none has one. */
export async function searchSheet(hits: AssetHit[], cacheDir: string): Promise<string | null> {
  const cells = hits.filter((h) => h.thumb && existsSync(h.thumb)).map((h) => ({ img: h.thumb!, label: h.ref }));
  if (!cells.length) return null;
  // the cells are as tall as the tallest picture needs, up to 1.5 × their width: one very tall picture (a tower, a scroll) made
  // every row of the sheet tall and the sheet several screens high
  const layout = { cols: 4, cellW: SHEET_CELL_W, maxCellH: Math.round(SHEET_CELL_W * MAX_CELL_RATIO) };
  const out = join(cacheDir, 'sheets', `${createHash('sha1').update(JSON.stringify([cells, layout])).digest('hex')}.jpg`);
  if (!existsSync(out)) {
    mkdirSync(dirname(out), { recursive: true });
    await photoSheet(out, cells, undefined, layout);
  }
  return out;
}

/** best effort: a health file that cannot be written must not cost a search or a download its answer */
export async function markBroken(s: Sources, id: string, detail: string): Promise<void> {
  try { await recordHealth(s.healthFile, id, { status: 'broken', detail }); } catch { /* the next check records it */ }
}
