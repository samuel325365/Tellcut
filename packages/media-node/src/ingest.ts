// A new project from folders, files and URLs (spec 2026-10-14 §4): every usable video, photo and music file, with what
// each is (size, length, sound, when and where it was taken); HEIC photos and downloads go to <project>/media/.
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { parseProject, type Project } from '@tellcut/engine';
import { heicToJpg } from './photo.ts';
import { kindOf, probeMedia } from './probe.ts';
import { writeProjectFile } from './projectfile.ts';
import { PY_PROJECT, runUv } from './py.ts';
import { PROJECT_ID } from './paths.ts';

export const DEFAULT_MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
const ID = PROJECT_ID;

export interface IngestOptions {
  id: string; inputs: string[]; projectsDir: string;
  size?: [number, number]; fps?: number; name?: string; force?: boolean; audioUrls?: boolean;
  /** no footage needed (review3 R3-H4): an animated explainer made of blocks, narration and a score; 1920×1080 unless `size` */
  blank?: boolean;
  download?: (url: string, dir: string, audio: boolean) => Promise<string>;
  log?: (s: string) => void;
}

/** A plain, unique id from a file name (non-Latin names become "src", "src-2", …). */
export function sourceId(file: string, used: Set<string>): string {
  const base = basename(file, extname(file)).normalize('NFKC').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '') || 'src';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

/** Downloads a URL with yt-dlp (repo .venv) into dir; returns the file. */
export async function ytDlp(url: string, dir: string, audio: boolean): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const fmt = audio ? ['-x', '--audio-format', 'm4a'] : ['-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4'];
  const out = await runUv(['run', '--project', PY_PROJECT, '--quiet', 'yt-dlp', ...fmt, '--no-playlist', '-o', join(dir, '%(title).80B-%(id)s.%(ext)s'), '--print', 'after_move:filepath', url]);
  const file = out.trim().split(/\r?\n/).pop();
  if (!file || !existsSync(file)) throw new Error(`yt-dlp did not produce a file for ${url}`);
  return file;
}

/** what a folder walk (and the import browser, server fs.ts) passes over: the system's own folders, dot names (hidden: .git, ._x.jpg
 *  left by a Mac) and node_modules */
const SKIP_NAMES = new Set(['$RECYCLE.BIN', 'System Volume Information', 'node_modules']);
export const skipName = (name: string) => name.startsWith('.') || SKIP_NAMES.has(name);
function freeName(file: string): string {
  if (!existsSync(file)) return file;
  for (let n = 2; ; n++) { const f = file.replace(/(\.\w+)$/, `-${n}$1`); if (!existsSync(f)) return f; }
}

/** a file left out of a project, and why: `code` + `params` for the editor to word it, `message` in English for the CLI */
export interface Skipped { path: string; code: 'import.notFound' | 'import.notMedia' | 'import.failed' | 'import.url' | 'import.unreadable'; params?: Record<string, string>; message: string }
export type ProjectSource = Project['sources'][string];
export interface Ingested { sources: Record<string, ProjectSource>; music: Record<string, { path: string }>; skipped: Skipped[] }

/** the same file named twice (a folder and a file in it, or in another case on Windows) counts once */
export const samePath = (f: string) => (process.platform === 'win32' ? resolve(f).toLowerCase() : resolve(f));

export interface Expanded {
  files: string[]; skipped: Skipped[];
  /** files found in the folders that are no video, photo or sound: counted, not listed (a file named by itself is listed) */
  others: number;
  /** the walk stopped early, past `maxMedia` media files or `maxEntries` names looked at (a whole drive picked by mistake) */
  cut: boolean;
}

/** Folders walked into their files (code-point order), in the order given; paths that are not there are skipped. URLs are the caller's.
 *  Hidden and system names are passed over (skipName), a folder that cannot be read is skipped and reported; async, so a big
 *  tree never holds up the server. */
export async function expandInputs(inputs: string[], lim: { maxMedia?: number; maxEntries?: number } = {}): Promise<Expanded> {
  const files: string[] = [], skipped: Skipped[] = [], seen = new Set<string>();
  let media = 0, entries = 0, others = 0, cut = false;
  const over = () => (cut ||= media > (lim.maxMedia ?? Infinity) || entries > (lim.maxEntries ?? Infinity));
  const add = (f: string, named: boolean) => {
    const k = samePath(f);
    if (seen.has(k)) return;
    seen.add(k);
    if (kindOf(f)) media++;
    else if (!named) { others++; return; }
    files.push(f);
  };
  const unreadable = (dir: string, e: unknown) => skipped.push({ path: dir, code: 'import.unreadable', params: { path: dir },
    message: `${dir}: could not be read (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})` });
  const walk = async (dir: string): Promise<void> => {
    let list;
    try { list = await readdir(dir, { withFileTypes: true }); } catch (e) { unreadable(dir, e); return; }
    // code-point order: the same on every machine whatever its locale (source ids are given in this order)
    list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of list) {
      if (over()) return;
      if (skipName(e.name)) continue;
      entries++;
      if (e.isDirectory()) await walk(join(dir, e.name)); else add(join(dir, e.name), false);
    }
  };
  for (const input of inputs) {
    if (over()) break;
    const p = resolve(input);
    if (!existsSync(p)) { skipped.push({ path: input, code: 'import.notFound', params: { path: input }, message: `${input}: not found` }); continue; }
    let dir;
    try { dir = statSync(p).isDirectory(); } catch (e) { unreadable(p, e); continue; }
    if (dir) await walk(p); else add(p, true);
  }
  over();
  return { files, skipped, others, cut };
}

/** Every usable video, photo and sound among `files`, as project.json entries for the project in `dir` (paths relative to it):
 *  HEIC photos converted into <dir>/media/, ids kept clear of `used` (and added to it). Shared by `new` and the editor's Import. */
export async function ingestFiles(dir: string, files: string[], used: Set<string>, o: { log?: (s: string) => void; onFile?: (done: number, total: number) => void } = {}): Promise<Ingested> {
  const sources: Record<string, ProjectSource> = {}, music: Record<string, { path: string }> = {}, skipped: Skipped[] = [], log = o.log ?? (() => {});
  const rel = (f: string) => relative(dir, f).split(sep).join('/'), media = join(dir, 'media');
  const usable = files.filter((f) => {
    if (kindOf(f)) return true;
    skipped.push({ path: f, code: 'import.notMedia', params: { path: f }, message: `${f}: not a video, photo or audio file` });
    return false;
  });
  for (const [i, f] of usable.entries()) {
    try {
      let path = f;
      if (/\.(heic|heif)$/i.test(f)) { mkdirSync(media, { recursive: true }); path = freeName(join(media, basename(f).replace(/\.\w+$/, '.jpg'))); await heicToJpg(f, path); }
      const info = await probeMedia(path), id = sourceId(f, used);
      if (info.kind === 'audio') { music[id] = { path: rel(path) }; log(`音樂 ${id}`); continue; }
      sources[id] = { path: rel(path), duration: Math.round(info.duration * 1000) / 1000, width: info.width, height: info.height, kind: info.kind,
        ...(info.taken ? { taken: info.taken } : {}), ...(info.takenOffset ? { takenOffset: info.takenOffset } : {}), ...(info.takenGuess ? { takenGuess: true } : {}), ...(info.gps ? { gps: info.gps } : {}),
        ...(info.kind === 'video' ? { audio: info.audio } : {}) } as ProjectSource;
      log(`${info.kind === 'image' ? '照片' : '影片'} ${id}`);
    } catch (e) { skipped.push({ path: f, code: 'import.failed', params: { path: f, why: (e as Error).message }, message: `${f}: ${(e as Error).message}` }); }
    finally { o.onFile?.(i + 1, usable.length); }
  }
  return { sources, music, skipped };
}

export async function createProject(o: IngestOptions): Promise<{ project: Project; file: string; skipped: string[] }> {
  if (!ID.test(o.id)) throw new Error(`Invalid project id "${o.id}" (letters, digits, - and _)`);
  const dir = join(o.projectsDir, o.id), file = join(dir, 'project.json'), media = join(dir, 'media'), log = o.log ?? (() => {});
  if (existsSync(file) && !o.force) throw new Error(`Project "${o.id}" already exists (use --force to replace it; the old one goes to .history/)`);
  const files: string[] = [], skipped: string[] = [];
  for (const input of o.inputs) {
    if (/^https?:\/\//i.test(input)) {
      log(`下載 ${input}（只下載你有權使用的素材）`);
      try { mkdirSync(media, { recursive: true }); files.push(await (o.download ?? ytDlp)(input, media, !!o.audioUrls)); } catch (e) { skipped.push(`${input}: ${(e as Error).message}`); }
      continue;
    }
    const x = await expandInputs([input]);
    files.push(...x.files);
    skipped.push(...x.skipped.map((s) => s.message));
    if (x.others) skipped.push(`${input}: ${x.others} other file${x.others === 1 ? '' : 's'} in it, not video, photo or audio`);
  }
  const seen = new Set<string>(), once = files.filter((f) => !seen.has(samePath(f)) && !!seen.add(samePath(f)));
  const got = await ingestFiles(dir, once, new Set<string>(), { log });
  const { sources, music } = got;
  skipped.push(...got.skipped.map((s) => s.message));
  if (!o.blank && !Object.keys(sources).length && !Object.keys(music).length) throw new Error(`No usable media found${skipped.length ? `:\n  ${skipped.join('\n  ')}` : ''}`);
  const all = Object.values(sources) as Array<{ width: number; height: number }>;
  const [width, height] = o.size ?? (all.filter((s) => s.height > s.width).length > all.length / 2 ? [1080, 1920] : [1920, 1080]);
  const project = parseProject({
    version: 1,
    meta: { name: o.name ?? o.id, width, height, fps: o.fps ?? 30, duration: 60, plugins: [], mix: DEFAULT_MIX },
    sources, media: music, grids: [],
    tracks: [
      { id: 'v1', kind: 'video', name: 'Main', items: [] }, { id: 'text', kind: 'overlay', name: 'Text', items: [] },
      { id: 'music', kind: 'music', name: 'Music', gain: 0, items: [] }, { id: 'orig', kind: 'audio', name: 'Source', gain: 0, items: [] },
    ],
  });
  writeProjectFile(dir, project, 'new');
  return { project, file, skipped };
}
