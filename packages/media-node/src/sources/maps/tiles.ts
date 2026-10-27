// Map tiles for `assets map` (spec 2026-10-22-external-sources §4.3.3, §4.3.5): one cache for every film in .cache/tiles/<source>/<layer>/,
// at most 3000 downloaded per film (OpenFreeMap's written rule, used for every source) and 4 at a time. A layer whose terms limit
// how long tiles may be kept (Carto: 30 days) has its old tiles fetched again.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLimiter } from '../../limit.ts';
import { SourceError, type Http } from '../http.ts';
import { withFileLock } from '../rate.ts';
import type { TileLayer } from '../types.ts';
import type { TileNeed } from './mercator.ts';

export type { TileLayer };
export const TILE_BUDGET = 3000, TILE_CONCURRENCY = 4;

export const tileFile = (cacheRoot: string, source: string, layer: TileLayer, z: number, x: number, y: number) =>
  join(cacheRoot, source, layer.id, String(z), String(x), `${y}${layer.ext}`);

/** A downloaded tile is a picture of the layer's size, or it is removed and an error: text or XML from a server is not kept
 *  (it would break every map that uses it), and a PNG of the wrong width is Carto's "API KEY REQUIRED" picture (256 px where an
 *  @2x tile is 512) — a key that is wrong or missing, which must not sit in the cache for 30 days. */
export function checkTile(file: string, source: string, layer: TileLayer): void {
  const b = readFileSync(file);
  const png = b.length > 24 && b.readUInt32BE(0) === 0x89504e47, jpeg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
  if (!png && !jpeg) { rmSync(file, { force: true }); throw new SourceError(source, 'temporary', `${layer.label} 回的不是圖片`); }
  const width = png ? b.readUInt32BE(16) : layer.tileSize;
  if (width !== layer.tileSize) {
    rmSync(file, { force: true });
    throw new SourceError(source, 'broken', `${layer.label} 回的圖磚是 ${width} px，應該是 ${layer.tileSize} px（多半是 key 不對或沒填）`);
  }
}

/** every tile of the layer older than its cacheDays, wherever it is (a source's terms limit how long tiles may be kept) */
function prune(dir: string, maxAge: number, now: number) {
  let names: string[];
  try { names = readdirSync(dir); } catch { return; }
  for (const n of names) {
    const p = join(dir, n);
    try { const st = statSync(p); if (st.isDirectory()) prune(p, maxAge, now); else if (now - st.mtimeMs > maxAge) rmSync(p, { force: true }); } catch { /* gone meanwhile */ }
  }
}

/** The tiles of a view, from the cache or downloaded. What a film may still download is checked (and booked) before the first
 *  download, so a view over the budget fetches nothing. A tile the server does not have (the sea, outside its region) is `file: null`. */
export async function fetchTiles(o: { http: Http; source: string; layer: TileLayer; key?: string; tiles: TileNeed[]; cacheRoot: string; projectDir: string; now?: () => number }):
  Promise<{ files: Array<TileNeed & { file: string | null }>; downloaded: number; used: number }> {
  const now = o.now ?? Date.now, files = o.tiles.map((t) => ({ ...t, file: tileFile(o.cacheRoot, o.source, o.layer, t.z, t.x, t.y) as string | null }));
  if (o.layer.cacheDays !== undefined) prune(join(o.cacheRoot, o.source, o.layer.id), o.layer.cacheDays * 86400_000, now());
  const need = [...new Map(files.filter((t) => !existsSync(t.file!)).map((t) => [t.file!, t])).values()];
  const book = join(o.projectDir, 'cache', 'maps', 'tiles.json');
  mkdirSync(join(o.projectDir, 'cache', 'maps'), { recursive: true });
  const used = await withFileLock(`${book}.lock`, () => {
    let done = 0;
    try { done = (JSON.parse(readFileSync(book, 'utf8')) as { downloaded: number }).downloaded ?? 0; } catch { /* none yet */ }
    if (done + need.length > TILE_BUDGET) throw new Error(`這支片的地圖圖磚已下載 ${done} 張，這張圖還要 ${need.length} 張，超過每支片 ${TILE_BUDGET} 張的上限（${o.layer.label}）`);
    writeFileSync(book, JSON.stringify({ downloaded: done + need.length }));
    return done + need.length;
  });
  const gone = new Set<string>(), limiter = createLimiter(TILE_CONCURRENCY);
  // the first failure stops the tiles still waiting; every one asked for counts (a tile the server lacks too)
  let asked = 0, failed: unknown;
  const results = await Promise.allSettled(need.map((t) => limiter.run(async () => {
    if (failed !== undefined) return;
    asked++;
    try { await o.http.download(o.layer.url(t.z, t.x, t.y, o.key), t.file!, { maxBytes: 2e6 }); checkTile(t.file!, o.source, o.layer); }
    catch (e) { if (e instanceof SourceError && e.kind === 'missing') { gone.add(t.file!); return; } failed ??= e; throw e; }
  })));
  if (failed !== undefined || results.some((r) => r.status === 'rejected')) {
    // a map that failed halfway gives back the booking it never used — before, every retry of a failing map spent all of it again
    const unused = need.length - asked;
    if (unused > 0) await withFileLock(`${book}.lock`, () => {
      let done = 0;
      try { done = (JSON.parse(readFileSync(book, 'utf8')) as { downloaded: number }).downloaded ?? 0; } catch { /* none */ }
      writeFileSync(book, JSON.stringify({ downloaded: Math.max(0, done - unused) }));
    });
    throw failed ?? (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason;
  }
  return { files: files.map((t) => (gone.has(t.file!) ? { ...t, file: null } : t)), downloaded: need.length, used };
}
