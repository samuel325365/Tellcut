// A new project from folders, files and URLs (spec 2026-10-14 §4): every usable video, photo and music file, with what
// each is (size, length, sound, when and where it was taken); HEIC photos and downloads go to <project>/media/.
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
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

function walk(dir: string): string[] {
  // code-point order: the same on every machine whatever its locale (source ids are given in this order)
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}
function freeName(file: string): string {
  if (!existsSync(file)) return file;
  for (let n = 2; ; n++) { const f = file.replace(/(\.\w+)$/, `-${n}$1`); if (!existsSync(f)) return f; }
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
    const p = resolve(input);
    if (!existsSync(p)) { skipped.push(`${input}: not found`); continue; }
    files.push(...(statSync(p).isDirectory() ? walk(p) : [p]));
  }
  const sources: Record<string, unknown> = {}, music: Record<string, { path: string }> = {}, used = new Set<string>();
  const rel = (f: string) => relative(dir, f).split(sep).join('/');
  for (const f of files) {
    if (!kindOf(f)) { skipped.push(`${f}: not a video, photo or audio file`); continue; }
    try {
      let path = f;
      if (/\.(heic|heif)$/i.test(f)) { mkdirSync(media, { recursive: true }); path = freeName(join(media, basename(f).replace(/\.\w+$/, '.jpg'))); await heicToJpg(f, path); }
      const info = await probeMedia(path), id = sourceId(f, used);
      if (info.kind === 'audio') { music[id] = { path: rel(path) }; log(`音樂 ${id}`); continue; }
      sources[id] = { path: rel(path), duration: Math.round(info.duration * 1000) / 1000, width: info.width, height: info.height, kind: info.kind,
        ...(info.taken ? { taken: info.taken } : {}), ...(info.takenOffset ? { takenOffset: info.takenOffset } : {}), ...(info.takenGuess ? { takenGuess: true } : {}), ...(info.gps ? { gps: info.gps } : {}),
        ...(info.kind === 'video' ? { audio: info.audio } : {}) };
      log(`${info.kind === 'image' ? '照片' : '影片'} ${id}`);
    } catch (e) { skipped.push(`${f}: ${(e as Error).message}`); }
  }
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
