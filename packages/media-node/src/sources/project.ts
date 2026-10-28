// A downloaded asset into a project (spec 2026-10-22-external-sources §4.5), in the shapes the rest of Tellcut already reads: a
// sound effect in media/sfx/ for c.sfxFile(), music in media/music/ registered in project.json `media` for c.music(), a picture in
// media/<source>/ registered in `sources` for c.photo(), footage there too for c.clip() (spec 2026-10-24-api-picker §5). Every asset is
// recorded in media/assets.json (where it came from, by whom, under what licence) and media/CREDITS.md is written from those records.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { ffmpeg, probeDuration } from '../ffmpeg.ts';
import { renameRetry } from '../fsutil.ts';
import { kindOf, probeMedia } from '../probe.ts';
import { updateProjectFile } from '../projectfile.ts';
import { SourceError } from './http.ts';
import { limitPeaks } from './peaks.ts';
import { withFileLock } from './rate.ts';
import { ADAPTERS, contextFor, markBroken, usableSource, type Sources } from './registry.ts';
import type { AssetKind, AssetRecord, Fetched, MapGeo, SourceAdapter } from './types.ts';

export const ASSET_MANIFEST = 'media/assets.json';
/** a segment shorter than this at the end of the file is no segment (ffmpeg would write an empty file) */
const MIN_SEGMENT = 0.05;
const BEGIN = '<!-- tellcut assets: begin -->', END = '<!-- tellcut assets: end -->';

export function readAssetRecords(dir: string): AssetRecord[] {
  try { return (JSON.parse(readFileSync(join(dir, ASSET_MANIFEST), 'utf8')) as { items: AssetRecord[] }).items ?? []; } catch { return []; }
}
function writeAssetRecords(dir: string, items: AssetRecord[]) {
  const file = join(dir, ASSET_MANIFEST), tmp = `${file}.${process.pid}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(tmp, JSON.stringify({ version: 1, items }, null, 1) + '\n');
  renameRetry(tmp, file);
}

/** the picture formats the player and probeMedia read */
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
/** the footage formats taken as they are; a segment (--from/--len) is always written as MP4 */
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm']);

/** where an asset goes in the project (and its media id, for music; its source id, for a picture); a segment gets its own file */
export function assetFile(f: { kind: AssetKind; meta: { source: string; id: string }; file?: string }, o: { from?: number; len?: number } = {}): { path: string; mediaId?: string; sourceId?: string } {
  const name = `${f.meta.source}-${f.meta.id}`.replace(/[^A-Za-z0-9_-]/g, '-') + (o.from !== undefined || o.len !== undefined ? `-${o.from ?? 0}s${o.len !== undefined ? `-${o.len}s` : ''}` : '');
  if (f.kind === 'audio') return { path: `media/sfx/${name}.wav` };
  if (f.kind === 'music') return { path: `media/music/${name}.wav`, mediaId: name };
  if (f.kind === 'image') {
    const ext = extname(f.file ?? '').toLowerCase();
    if (!IMAGE_EXT.has(ext)) throw new Error(`圖片格式 ${ext || '（沒有副檔名）'} 不能用（要 ${[...IMAGE_EXT].join(' ')}）`);
    return { path: `media/${f.meta.source.replace(/[^A-Za-z0-9_-]/g, '-')}/${name}${ext}`, sourceId: name };
  }
  if (f.kind === 'video') {
    const cut = o.from !== undefined || o.len !== undefined, ext = cut ? '.mp4' : extname(f.file ?? '').toLowerCase();
    if (!VIDEO_EXT.has(ext)) throw new Error(`影片格式 ${ext || '（沒有副檔名）'} 不能用（要 ${[...VIDEO_EXT].join(' ')}）`);
    return { path: `media/${f.meta.source.replace(/[^A-Za-z0-9_-]/g, '-')}/${name}${ext}`, sourceId: name };
  }
  throw new Error(`還不支援 ${f.kind}`);
}

const usageOf = (r: AssetRecord) => (r.sourceId && kindOf(r.path) === 'video' ? `c.clip('${r.sourceId}', { from: 秒, len: 秒 })（先跑 npm run inspect -- <專案> 分析這支影片，再挑段落）`
  : r.sourceId ? `c.photo('${r.sourceId}', { len: 3 })` : r.mediaId ? `c.music('${r.mediaId}')` : `c.sfxFile('${r.path}', { at: 秒 })`);

/** the --opt a download was made with, for its record (none: nothing written) */
const optsField = (opts?: Record<string, string>) => (opts && Object.keys(opts).length ? { opts } : {});
const sameOpts = (a?: Record<string, string>, b?: Record<string, string>) => {
  const k = (x?: Record<string, string>) => JSON.stringify(Object.entries(x ?? {}).sort(([p], [q]) => (p < q ? -1 : 1)));
  return k(a) === k(b);
};

type ImportOpts = { from?: number; len?: number; opts?: Record<string, string>; now?: () => Date; adapters?: Record<string, SourceAdapter> };

/** a map picture's place on the earth as its project.json source keeps it (common.mapcam turns longitude/latitude into its pixels) */
const sourceMap = (m: MapGeo | undefined, credit: string) => (m ? { map: { center: m.center, zoom: m.zoom, ...(credit ? { credit } : {}) } } : {});

/** A picture copied into its place and registered as a photo source, the way createProject registers one. */
async function importImage(dir: string, f: Fetched, o: ImportOpts): Promise<{ record: AssetRecord; usage: string }> {
  if (o.from !== undefined || o.len !== undefined) throw new Error('圖片沒有 --from／--len');
  const { path, sourceId } = assetFile(f), out = join(dir, path);
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(f.file, out);
  const info = await probeMedia(out);
  const record: AssetRecord = { ...f.meta, path, downloaded: (o.now ?? (() => new Date()))().toISOString(), sourceId, ...optsField(o.opts), ...(f.map ? { map: f.map } : {}) };
  await withFileLock(join(dir, 'media', '.assets.lock'), () => {
    updateProjectFile(dir, (p) => { p.sources[sourceId!] = { path, duration: info.duration, width: info.width, height: info.height, kind: 'image', ...sourceMap(f.map, f.meta.author) }; }, 'assets');
    writeAssetRecords(dir, [...readAssetRecords(dir).filter((r) => r.path !== path), record]);
    writeCredits(dir, o.adapters);
  });
  return { record, usage: usageOf(record) };
}

/** project.json's entry for a footage file, the way createProject registers one */
const videoSource = async (dir: string, path: string) => {
  const info = await probeMedia(join(dir, path));
  return { path, duration: Math.round(info.duration * 1000) / 1000, width: info.width, height: info.height, kind: 'video' as const, audio: info.audio };
};

/** Footage copied into its place (a segment cut out and written as H.264/AAC MP4) and registered as a video source; the server
 *  analyses it when the agent runs inspect, as it does the user's own footage. */
async function importVideo(dir: string, f: Fetched, o: ImportOpts): Promise<{ record: AssetRecord; usage: string }> {
  const cut = o.from !== undefined || o.len !== undefined;
  if (o.len !== undefined && !(o.len > 0)) throw new Error('--len 要大於 0');
  if (cut) {
    const dur = await probeDuration(f.file);
    if (o.from !== undefined && (o.from < 0 || dur - o.from < MIN_SEGMENT)) throw new Error(`--from ${o.from} 秒超過影片長度（${dur.toFixed(1)} 秒）`);
  }
  const { path, sourceId } = assetFile(f, o), out = join(dir, path);
  mkdirSync(dirname(out), { recursive: true });
  if (cut) await ffmpeg([...(o.from ? ['-ss', String(o.from)] : []), '-i', f.file, ...(o.len !== undefined ? ['-t', String(o.len)] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  else copyFileSync(f.file, out);
  const entry = await videoSource(dir, path);
  const record: AssetRecord = { ...f.meta, path, downloaded: (o.now ?? (() => new Date()))().toISOString(), sourceId,
    ...(o.from !== undefined ? { from: o.from } : {}), ...(o.len !== undefined ? { len: o.len } : {}), ...optsField(o.opts) };
  await withFileLock(join(dir, 'media', '.assets.lock'), () => {
    updateProjectFile(dir, (p) => { p.sources[sourceId!] = entry; }, 'assets');
    writeAssetRecords(dir, [...readAssetRecords(dir).filter((r) => r.path !== path), record]);
    writeCredits(dir, o.adapters);
  });
  return { record, usage: usageOf(record) };
}

/** The downloaded file into its place — sound peak-limited, music, pictures and footage registered — and the record and the credits written. */
export async function importAsset(dir: string, f: Fetched, o: ImportOpts = {}): Promise<{ record: AssetRecord; usage: string }> {
  if (f.kind === 'image') return importImage(dir, f, o);
  if (f.kind === 'video') return importVideo(dir, f, o);
  const dur = await probeDuration(f.file);
  if (o.len !== undefined && !(o.len > 0)) throw new Error('--len 要大於 0');
  if (o.from !== undefined && (o.from < 0 || dur - o.from < MIN_SEGMENT)) throw new Error(`--from ${o.from} 秒超過素材長度（${dur.toFixed(1)} 秒）`);
  const { path, mediaId } = assetFile(f, o), out = join(dir, path);
  mkdirSync(dirname(out), { recursive: true });
  const lim = await limitPeaks(f.file, out, { from: o.from, len: o.len });
  const duration = Math.round(lim.duration * 1000) / 1000;
  const record: AssetRecord = { ...f.meta, path, downloaded: (o.now ?? (() => new Date()))().toISOString(),
    ...(o.from !== undefined ? { from: o.from } : {}), ...(o.len !== undefined ? { len: o.len } : {}), ...(f.bpm ? { bpm: f.bpm } : {}), ...(mediaId ? { mediaId } : {}),
    ...(Number.isFinite(lim.peak) ? { peak: Math.round(lim.peak * 10) / 10 } : {}), ...optsField(o.opts) };
  // two gets in one project at once (an agent's parallel commands): one writes the records and the credits at a time
  await withFileLock(join(dir, 'media', '.assets.lock'), () => {
    if (mediaId) updateProjectFile(dir, (p) => { p.media[mediaId] = { path, duration }; }, 'assets');
    writeAssetRecords(dir, [...readAssetRecords(dir).filter((r) => r.path !== path), record]);
    writeCredits(dir, o.adapters);
  });
  return { record, usage: usageOf(record) };
}

/** A kept download whose entry in project.json is gone (the music or the photo taken out in the editor, review M-2) is entered
 *  again from its file, so the usage printed for it works. */
async function registerAgain(dir: string, r: AssetRecord): Promise<void> {
  const p = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')) as { media?: Record<string, unknown>; sources?: Record<string, unknown> };
  const file = join(dir, r.path);
  if (r.mediaId && !p.media?.[r.mediaId]) {
    const duration = Math.round((await probeDuration(file)) * 1000) / 1000;
    updateProjectFile(dir, (q) => { q.media[r.mediaId!] = { path: r.path, duration }; }, 'assets');
  } else if (r.sourceId && !p.sources?.[r.sourceId] && kindOf(r.path) === 'video') {
    const entry = await videoSource(dir, r.path);
    updateProjectFile(dir, (q) => { q.sources[r.sourceId!] = entry; }, 'assets');
  } else if (r.sourceId && !p.sources?.[r.sourceId]) {
    const info = await probeMedia(file);
    updateProjectFile(dir, (q) => { q.sources[r.sourceId!] = { path: r.path, duration: info.duration, width: info.width, height: info.height, kind: 'image', ...sourceMap(r.map, r.author) }; }, 'assets');
  }
}

/** the project's frame as frame=WxH for the adapters (a footage source picks the copy that fills it without upscaling) */
function frameOf(dir: string): { frame?: string } {
  try { const m = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).meta; return m?.width && m?.height ? { frame: `${m.width}x${m.height}` } : {}; } catch { return {}; }
}

/** `ref` ("<source>:<id>") downloaded into the project, or the copy already there; per-source options (--opt) over the configured ones */
export async function getAsset(s: Sources, dir: string, ref: string, o: { from?: number; len?: number; opts?: Record<string, string> } = {}): Promise<{ record: AssetRecord; usage: string; reused: boolean }> {
  const i = ref.indexOf(':');
  if (i <= 0 || i === ref.length - 1) throw new Error(`編號要像 bbc-sfx:07043376（來源:編號），收到「${ref}」`);
  const src = ref.slice(0, i), id = ref.slice(i + 1), adapter = usableSource(s, src);
  // what can be told wrong without the file is told before downloading it (review M-11)
  if (o.len !== undefined && !(o.len > 0)) throw new Error('--len 要大於 0');
  if (o.from !== undefined && !(o.from >= 0)) throw new Error('--from 不能是負的');
  if ((o.from !== undefined || o.len !== undefined) && adapter.kinds.every((k) => k === 'image')) throw new Error('圖片沒有 --from／--len');
  // the same asset, segment and options (BBC's --opt format=wav is another file than its mp3)
  const old = readAssetRecords(dir).find((r) => r.source === src && r.id === id && r.from === o.from && r.len === o.len && sameOpts(r.opts, o.opts) && existsSync(join(dir, r.path)));
  if (old) {
    await registerAgain(dir, old);
    return { record: old, usage: usageOf(old), reused: true };
  }
  const tmp = join(dir, 'cache', 'sources');
  mkdirSync(tmp, { recursive: true });
  const ctx = contextFor(s, src, tmp);
  ctx.options = { ...frameOf(dir), ...ctx.options, ...o.opts };
  let f: Fetched;
  try { f = await adapter.get(id, ctx); } catch (e) {
    if (e instanceof SourceError && e.kind === 'broken') await markBroken(s, src, e.message);
    throw e;
  }
  try { return { ...(await importAsset(dir, f, { from: o.from, len: o.len, opts: o.opts, adapters: s.adapters })), reused: false }; }
  finally { rmSync(f.file, { force: true }); }
}

/** One line per asset: music, then pictures, then sound effects, each in download order; a line already written (two segments of
 *  one sound, the one map layer under several maps) is written once. */
export function formatCredits(records: AssetRecord[], adapters: Record<string, SourceAdapter>): string[] {
  const line = (r: AssetRecord) => adapters[r.source]?.credit(r) ?? `- "${r.title}" by ${r.author} (${r.page}), ${r.license}`;
  return [...new Set([...records.filter((r) => r.mediaId), ...records.filter((r) => r.sourceId), ...records.filter((r) => !r.mediaId && !r.sourceId)].map(line))];
}

/** every string on the project's tracks: an item's source or media id, a sound file's path, an fx parameter naming a picture; a
 *  comma list (an fx parameter of pictures "id@2.5, id") also adds each of its ids */
function trackStrings(dir: string, project?: { tracks?: unknown }): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      out.add(v.replace(/\\/g, '/').replace(/^(\.\/)+/, ''));
      if (v.includes(',')) for (const part of v.split(',')) out.add(part.trim().replace(/@[\d.]+$/, ''));
    }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  try { walk((project ?? (JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')) as { tracks?: unknown })).tracks); } catch { /* no project: nothing is used */ }
  return out;
}

/** whether the film uses the asset: its picture, its music or its sound file is somewhere on a track */
export const assetUsed = (r: AssetRecord, onTracks: Set<string>) => [r.sourceId, r.mediaId, r.path].some((x) => x !== undefined && onTracks.has(x));

export const UNUSED_HEADING = '下載了但片裡沒用到（不必署名）：';

/** media/CREDITS.md with the assets' lines between the markers: what the film uses, then under UNUSED_HEADING what it does not
 *  (a line the film needs is not repeated there). Lines written by hand around the markers stay. `project`: the film as it is being
 *  exported, when that is not project.json. Returns the file. */
export function writeCredits(dir: string, adapters: Record<string, SourceAdapter> = ADAPTERS, project?: { tracks?: unknown }): string {
  const file = join(dir, 'media', 'CREDITS.md'), records = readAssetRecords(dir), onTracks = trackStrings(dir, project);
  const used = formatCredits(records.filter((r) => assetUsed(r, onTracks)), adapters);
  const unused = formatCredits(records.filter((r) => !assetUsed(r, onTracks)), adapters).filter((l) => !used.includes(l));
  const lines = [...used, ...(unused.length ? [...(used.length ? [''] : []), UNUSED_HEADING, ...unused] : [])];
  const block = `${BEGIN}\n${lines.map((l) => `${l}\n`).join('')}${END}`;
  let md = existsSync(file) ? readFileSync(file, 'utf8') : `# ${basename(dir)} credits\n\n`;
  const a = md.indexOf(BEGIN), b = md.indexOf(END);
  md = a >= 0 && b > a ? md.slice(0, a) + block + md.slice(b + END.length) : `${md.replace(/\n*$/, '\n\n')}${block}\n`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, md);
  return file;
}

/** the credits written again for the film as it is now (after a cut, an export); null when the project downloaded nothing */
export const refreshCredits = (dir: string, o: { adapters?: Record<string, SourceAdapter>; project?: { tracks?: unknown } } = {}): string | null =>
  (existsSync(join(dir, ASSET_MANIFEST)) ? writeCredits(dir, o.adapters, o.project) : null);
