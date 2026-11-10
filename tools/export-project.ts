// A project as one zip, and back (review3 R3-H1: projects/ is not in git, and there was no way to hand a film over or back it up).
//   npm run export-project -- <id> [--media | --trim] [--public] [--out <file.zip>]     → tellcut/backups/<id>-<date>-<time>.zip
//   npm run import-project -- <file.zip> [--as <new id>]            → projects/<id>/
// The zip holds one folder, <id>/: project.json, cut.ts, narration.json, storyboard.md, brand.md (a brand film's brand card), CREDITS.md (the footage's licences), fx/,
// score/ and .history/ (versions, proposals, the chat). --media adds media/ and the footage that lives outside the project (D:\Trips…, tellcut/sources/…), copied
// into media/linked/ with project.json pointing there, so the zip stands on its own. cache/ is made again; exports/ are the films
// themselves (copy them as they are). --public (an example project for GitHub, spec 2026-10-30-showcase-films part 2) writes this
// computer's tellcut folder as <tellcut> in every text file of the zip, and refuses footage left outside the zip or another absolute
// path of this computer (its home included) left in them. It also says nowhere where and when the footage was shot: the sources
// lose gps / taken in project.json and .history/, and each photo and video packed is a copy without them in the file (EXIF, tags).
// --trim (implies --media; CC source films are hundreds of MB each) packs, instead of each video source as it is, a copy of the same
// length where everything the project does not use (prepare's clips, stills and sound pieces, plus TRIM_MARGIN on each side) is
// black and silent. A copy of the same length, not the used pieces alone: every source time (the items' in/out, cut.ts, the
// history, the storyboard) stays true, and black frames cost almost nothing in H.264. What was blacked out is gone in the import.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Project, Registry } from '@tellcut/engine';
import { ffmpeg, kindOf, mediaRefs, probeDuration, probeHasAudio, probeSize, PROJECT_ID, pyJson, TELLCUT_ROOT } from '@tellcut/media-node';
import { projectArgOrExit } from './project-arg.ts';
import { parseArgsOrExit } from './args.ts';

type Raw = { sources?: Record<string, { path: string; [k: string]: unknown }>; media?: Record<string, { path: string }>; [k: string]: unknown };
export interface ExportPlan { files: Array<{ from: string; to: string }>; project: Raw; outside: string[] }

// cache/cut-state.json is the one cache file kept: what the last cut wrote, so a cut after the import still notices the
// editor's edits (without it, it wrote over them without asking)
const OWN = ['cut.ts', 'narration.json', 'storyboard.md', 'brand.md', 'CREDITS.md', 'cache/cut-state.json'], OWN_DIRS = ['fx', 'score', '.history'];
/** every file under `dir`/`sub`, as paths relative to `dir` with / */
const walk = (dir: string, sub: string): string[] => {
  const at = join(dir, sub);
  if (!existsSync(at)) return [];
  return readdirSync(at, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(dir, `${sub}/${e.name}`) : e.isFile() ? [`${sub}/${e.name}`] : []);
};
/** the hash cut-state.json keeps (tools/cut/cut.ts) */
export const sha1Of = (s: string) => createHash('sha1').update(s).digest('hex');
const sha1 = sha1Of;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `text` with `root` (the tellcut folder) as <tellcut>, however a path is written: with \, with / or as JSON writes \, or as Git
 *  Bash writes it (/c/Users/…). Only the folder itself (tellcut-old beside it stays); the home and other folders are left for
 *  leftoverPaths to refuse, never hidden behind ~ */
export function scrubText(text: string, o: { root: string }): string {
  const back = o.root.replace(/[\\/]+$/, '').replace(/\//g, '\\'), slash = back.replace(/\\/g, '/');
  const bash = /^[A-Za-z]:\//.test(slash) ? `/${slash[0]}${slash.slice(2)}` : null;
  for (const form of [back.replace(/\\/g, '\\\\'), back, slash, ...(bash ? [bash] : [])]) text = text.replace(new RegExp(`${escape(form)}(?=[\\\\/"'\\s]|$)`, 'gim'), '<tellcut>');
  return text;
}
/** the absolute paths in a text (a drive letter, /Users/…, /home/…), in order */
export const leftoverPaths = (text: string) => [...text.matchAll(/\b[A-Za-z]:[\\/][^\s"'<>|,;]*|\/(?:Users|home)\/[^\s"'<>|,;]*/g)].map((m) => m[0]);
const TEXT = /\.(json|jsonl|md|ts|js|mjs|cjs|txt|srt|vtt|csv|svg|html|css|xml|log|yml|yaml)$/i;
/** what a source says about where and when it was shot (read from a photo's EXIF or a video's tags when it came in) */
const PLACE_AND_TIME = ['gps', 'taken', 'takenOffset', 'takenGuess'];
/** Takes the place and time off every source list in `value` (a project, a version of one in .history/, a proposal holding
 *  one), in place; true when there was any. All of them are optional in the schema, so the project still parses. */
export function dropPlaceAndTime(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  let found = false;
  for (const [k, v] of Object.entries(value)) {
    if (k === 'sources' && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const s of Object.values(v)) {
        if (!s || typeof s !== 'object' || typeof (s as { path?: unknown }).path !== 'string') continue;
        for (const key of PLACE_AND_TIME) if (key in s) { delete (s as Record<string, unknown>)[key]; found = true; }
      }
    } else if (dropPlaceAndTime(v)) found = true;
  }
  return found;
}
const insideOf = (dir: string, f: string) => { const r = relative(dir, resolve(dir, f)); return !!r && !r.startsWith('..') && !isAbsolute(r); };

/** what goes into the zip (relative to its <id>/ folder) and the project.json it gets */
export function exportPlan(dir: string, project: Raw, o: { media: boolean }): ExportPlan {
  // a lock or a half-written file of work running as it is zipped (a chat turn's) is not part of the project
  const files = [...OWN.filter((f) => existsSync(join(dir, f))), ...OWN_DIRS.flatMap((d) => walk(dir, d)).filter((f) => !/\.lock$|\.tmp(\.|$)/.test(f))].map((to) => ({ from: join(dir, to), to }));
  const p: Raw = structuredClone(project);
  const refs = [...Object.entries(p.sources ?? {}), ...Object.entries(p.media ?? {})];
  const outside = refs.filter(([, s]) => !insideOf(dir, s.path)).map(([id]) => id);
  if (o.media) {
    const have = new Set<string>();
    for (const to of walk(dir, 'media')) { files.push({ from: join(dir, to), to }); have.add(to); }
    for (const [id, s] of refs) {
      if (insideOf(dir, s.path)) {
        // footage kept in the project but not under media/
        const to = relative(dir, resolve(dir, s.path)).split('\\').join('/');
        if (!have.has(to) && existsSync(join(dir, to))) { files.push({ from: join(dir, to), to }); have.add(to); }
        continue;
      }
      const from = resolve(dir, s.path), to = `media/linked/${id}-${basename(from)}`;
      if (!existsSync(from)) continue;   // offline here too: the path stays as it was
      files.push({ from, to });
      s.path = to;
    }
  }
  return { files, project: p, outside: o.media ? outside.filter((id) => { const s = p.sources?.[id] ?? p.media?.[id]; return !!s && !insideOf(dir, s.path); }) : outside };
}

const TAR = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
function tar(args: string[]) {
  const r = spawnSync(TAR, args, { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`tar 失敗：${(r.stderr || r.error?.message || '').trim().split(/\r?\n/).slice(-2).join(' ／ ')}`);
}
const stamp = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

/** seconds kept on each side of a used piece: room to slide a cut a little in the imported project */
export const TRIM_MARGIN = 2;
/** a source whose used parts, with their margins, cover this much of it is packed whole: blacking out the rest saves little */
const TRIM_WORTH = 0.8;

/** The parts of each video source the project uses, in source seconds: what prepareProject cuts (mediaRefs), each widened by
 *  `margin`, merged and kept within the source. A source a block reads the sound levels of is used whole (it may show any of
 *  them); a source nothing uses gets no part at all. Photos are not listed: they are packed as they are. */
export function usedRanges(p: Project, registry: Registry, margin = TRIM_MARGIN): Map<string, Array<[number, number]>> {
  const refs = mediaRefs(p, registry), parts = new Map<string, Array<[number, number]>>();
  for (const [id, s] of Object.entries(p.sources)) if (s.kind !== 'image') parts.set(id, []);
  const add = (id: string, a: number, b: number) => parts.get(id)?.push([a, b]);
  for (const r of refs.videos.values()) add(r.source, r.in, r.out + 0.2);   // the cut reads 0.2 s past out (cutLength)
  for (const r of refs.audio.values()) add(r.source, r.in, r.out);
  for (const r of refs.stills.values()) add(r.source, r.t, r.t + (r.strip?.dur ?? 0));
  for (const id of refs.peaks) add(id, 0, p.sources[id].duration);
  for (const [id, list] of parts) {
    const d = p.sources[id].duration, merged: Array<[number, number]> = [];
    for (const [a, b] of list.map(([a, b]): [number, number] => [Math.max(0, a - margin), Math.min(d, b + margin)]).sort((x, y) => x[0] - y[0])) {
      const last = merged.at(-1);
      if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]);
    }
    parts.set(id, merged);
  }
  return parts;
}

const r3 = (n: number) => n.toFixed(3);
/** `src` again at `out` (H.264 + AAC in MP4, the same length and size), black and silent outside `keep` */
export async function blackOutside(src: string, out: string, keep: Array<[number, number]>, o: { signal?: AbortSignal } = {}) {
  // t from the first frame, as -ss counts an item's in; the expression is quoted in the filter, so its commas stay in it
  const off = keep.length ? `not(${keep.map(([a, b]) => `between(t,${r3(a)},${r3(b)})`).join('+')})` : '1';
  const sound = await probeHasAudio(src);
  await ffmpeg(['-i', src, '-map', '0:v:0', ...(sound ? ['-map', '0:a:0'] : []), '-map_metadata', '-1',
    '-vf', `setpts=PTS-STARTPTS,drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='${off}',format=yuv420p`,
    ...(sound ? ['-af', `asetpts=PTS-STARTPTS,volume=0:enable='${off}'`, '-c:a', 'aac', '-b:a', '192k'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-fps_mode', 'passthrough', '-movflags', '+faststart', out], o);
}

/** --trim: the plan with each video source that is worth it replaced by its blacked-out copy (made in `work`), pointed at as
 *  media/linked/<id>-<name>.mp4. A source whose copy fails or comes out another length or size is packed whole, and said so. */
export async function trimPlan(dir: string, plan: ExportPlan, work: string, o: { log?: (s: string) => void; registry?: Registry } = {}): Promise<ExportPlan> {
  const log = o.log ?? (() => {});
  const { parseProject } = await import('@tellcut/engine');
  const p = parseProject(structuredClone(plan.project));
  const loaded = o.registry ? { registry: o.registry, errors: [] } : await (async () => {
    const [{ projectRegistry }, { plugins }] = await Promise.all([import('@tellcut/media-node'), import('@tellcut/plugins')]);
    const r = await projectRegistry(dir, plugins, p);
    return { registry: r.registry, errors: r.fx.errors };
  })();
  // an effect that does not load could read any part of any source, and usedRanges cannot see which: black out nothing
  if (loaded.errors.length) {
    for (const e of loaded.errors) log(`  ! 效果載入失敗：${e.path}：${e.message}`);
    log('  素材整個帶走（不知道載入失敗的效果用到哪些部分）');
    return plan;
  }
  const registry = loaded.registry;
  const norm = (path: string) => relative(dir, resolve(dir, path)).split('\\').join('/');
  const files = [...plan.files], project = structuredClone(plan.project);
  const gone = new Set<{ from: string; to: string }>();
  for (const [id, keep] of usedRanges(p, registry)) {
    const s = p.sources[id], at = norm(s.path), file = files.find((f) => f.to === at);
    if (!file) continue;   // offline: nothing to pack
    const kept = keep.reduce((n, [a, b]) => n + b - a, 0);
    if (kept >= TRIM_WORTH * s.duration) { log(`  ${id}：用到 ${Math.round((100 * kept) / s.duration)}%，整個帶走`); continue; }
    const stem = basename(file.from, extname(file.from)), out = join(work, `${id}.mp4`);
    let to = `media/linked/${id}-${stem}.mp4`;
    // another source (or music) on the same file keeps the whole one under its name
    const shared = [...Object.entries(p.sources).filter(([k]) => k !== id), ...Object.entries(p.media)].some(([, x]) => norm(x.path) === at);
    for (let n = 2; files.some((f) => f.to === to && (f !== file || shared)); n++) to = `media/linked/${id}-${stem}-${n}.mp4`;
    try {
      await blackOutside(file.from, out, keep);
      const [size, d] = await Promise.all([probeSize(out), probeDuration(out)]);
      if (size.width !== s.width || size.height !== s.height || Math.abs(d - s.duration) > 0.1) throw new Error(`裁好的是 ${size.width}×${size.height}、${d.toFixed(2)} 秒，專案記的是 ${s.width}×${s.height}、${s.duration.toFixed(2)} 秒`);
    } catch (e) { rmSync(out, { force: true }); log(`  ! ${id}：沒辦法只留用到的部分（${(e as Error).message.split('\n')[0]}），整個帶走`); continue; }
    log(`  ${id}：留下用到的 ${kept.toFixed(1)} 秒（共 ${s.duration.toFixed(1)} 秒），${(statSync(file.from).size / 1e6).toFixed(1)} MB → ${(statSync(out).size / 1e6).toFixed(1)} MB`);
    project.sources![id].path = to;
    if (to === file.to) files[files.indexOf(file)] = { from: out, to };   // the name it had already (an .mp4 from outside)
    else { files.push({ from: out, to }); gone.add(file); }
  }
  // the original goes when nothing else in project.json still points at it (another source on the same file, packed whole)
  const still = new Set([...Object.values(project.sources ?? {}), ...Object.values(project.media ?? {})].map((x) => norm(x.path)));
  return { ...plan, project, files: files.filter((f) => !gone.has(f) || still.has(f.to)) };
}

/** a copy of one photo or video at `out` without what its file says about where and when it was shot and with what */
export type Stripper = (from: string, out: string, kind: 'image' | 'video') => Promise<void>;
const stripFile: Stripper = async (from, out, kind) => {
  if (kind === 'image') { await pyJson('meta.py', ['strip', from, out]); return; }
  // the streams as they are (no new encode), without the file's and the streams' tags (place, creation time, device) or a
  // phone's timed metadata tracks; the rotation is the stream's side data and stays
  await ffmpeg(['-i', from, '-map', '0:v', '-map', '0:a?', '-c', 'copy', '-map_metadata', '-1', '-map_chapters', '-1', out]);
  const [a, b, da, db] = await Promise.all([probeSize(from), probeSize(out), probeDuration(from), probeDuration(out)]);
  if (a.width !== b.width || a.height !== b.height || Math.abs(da - db) > 0.1) throw new Error(`重新封裝後是 ${b.width}×${b.height}、${db.toFixed(2)} 秒，原本是 ${a.width}×${a.height}、${da.toFixed(2)} 秒`);
};

/** --public with the footage: each photo and video in the zip is a copy (made in `work`) with no place, time or camera in its
 *  file, as project.json no longer has them. One that cannot be cleaned stops the export: shipping it as it is would leak them. */
export async function strippedPlan(plan: ExportPlan, work: string, o: { log?: (s: string) => void; strip?: Stripper } = {}): Promise<ExportPlan> {
  const strip = o.strip ?? stripFile, own = (to: string) => OWN.includes(to) || OWN_DIRS.some((d) => to.startsWith(`${d}/`));
  let n = 0, photos = 0, videos = 0;
  const files = [];
  for (const f of plan.files) {
    const kind = own(f.to) ? null : kindOf(f.to);
    if (kind !== 'image' && kind !== 'video') { files.push(f); continue; }
    const out = join(work, `.strip-${n++}${extname(f.to)}`);   // never a trimmed copy's name (<source id>.mp4)
    try { await strip(f.from, out, kind); } catch (e) { throw new Error(`沒辦法拿掉 ${f.to} 檔案裡的拍攝地點和時間（${(e as Error).message.split('\n')[0]}），--public 不能帶它`); }
    files.push({ from: out, to: f.to });
    if (kind === 'image') photos++; else videos++;
  }
  if (photos + videos) o.log?.(`拿掉了 ${photos} 張照片、${videos} 支影片檔案裡的拍攝地點和時間`);
  return { ...plan, files };
}

/** writes the zip; returns its path. --public with the footage goes through exportProjectAsync: its photos and videos are
 *  cleaned first */
export function exportProject(dir: string, o: { media: boolean; out?: string; /** clean this computer's paths out (default: the real tellcut folder) */ public?: boolean | { root: string } }): string {
  if (o.public && o.media) throw new Error('--public 加 --media 要先拿掉照片和影片檔案裡的拍攝地點和時間：用 exportProjectAsync');
  const before = readFileSync(join(dir, 'project.json'), 'utf8');
  return writeZip(dir, before, exportPlan(dir, JSON.parse(before), o), o);
}

/** every kind of export: --trim (implies --media) packs each video source only as far as the project uses it; --public with the
 *  footage cleans each photo and video of its place and time */
export async function exportProjectAsync(dir: string, o: { media: boolean; trim?: boolean; out?: string; public?: boolean | { root: string }; log?: (s: string) => void; registry?: Registry; strip?: Stripper }): Promise<string> {
  const media = o.media || !!o.trim;
  if (!o.trim && !(o.public && media)) return exportProject(dir, { ...o, media });
  const before = readFileSync(join(dir, 'project.json'), 'utf8'), out = zipPath(dir, o.out);
  mkdirSync(dirname(out), { recursive: true });
  const work = mkdtempSync(join(dirname(out), '.trim-'));   // beside the zip: the copies are hard-linked into the stage
  try {
    let plan = exportPlan(dir, JSON.parse(before), { media });
    if (o.public) refuseOutside(plan);   // before the slow part
    if (o.trim) plan = await trimPlan(dir, plan, work, o);
    if (o.public) plan = await strippedPlan(plan, work, o);
    return writeZip(dir, before, plan, { ...o, out });
  } finally { rmSync(work, { recursive: true, force: true }); }
}

/** exportProject with --trim: --media, and each video source only as far as the project uses it */
export const exportProjectTrimmed = (dir: string, o: { out?: string; public?: boolean | { root: string }; log?: (s: string) => void; registry?: Registry; strip?: Stripper }): Promise<string> =>
  exportProjectAsync(dir, { ...o, media: true, trim: true });

// a shared project carries its footage: one left outside the zip (another folder without --media, or offline) is a dead link there
function refuseOutside(plan: ExportPlan) {
  if (plan.outside.length) throw new Error(`素材不在打包裡（--public 不能留）：${plan.outside.join('、')}。在專案外面的加 --media；找不到的先接回來。`);
}

const zipPath = (dir: string, out?: string) => resolve(out ?? join(TELLCUT_ROOT, 'backups', `${basename(dir)}-${stamp()}.zip`));

function writeZip(dir: string, before: string, plan: ExportPlan, o: { out?: string; public?: boolean | { root: string } }): string {
  const id = basename(dir), out = zipPath(dir, o.out);
  // as writeProjectFile writes it; the paths --media rewrote make it a different text from the one the last cut hashed
  const scrub = o.public === true ? { root: TELLCUT_ROOT } : o.public || null;
  if (scrub) refuseOutside(plan);
  // a public project tells nobody where and when its footage was shot (the files themselves: strippedPlan)
  const project = scrub ? structuredClone(plan.project) : plan.project;
  if (scrub) dropPlaceAndTime(project);
  const text = ((t: string) => (scrub ? scrubText(t, scrub) : t))(JSON.stringify(project, null, 2) + '\n');
  mkdirSync(dirname(out), { recursive: true });
  // a folder laid out as the zip, next to it (the same drive: files are hard-linked where they can be, not copied)
  const stage = mkdtempSync(join(dirname(out), '.stage-')), top = join(stage, id);
  try {
    for (const f of plan.files) {
      const to = join(top, f.to);
      mkdirSync(dirname(to), { recursive: true });
      try { linkSync(f.from, to); } catch { copyFileSync(f.from, to); }
    }
    mkdirSync(top, { recursive: true });
    writeFileSync(join(top, 'project.json'), text);
    if (scrub) {
      const left = leftoverPaths(text).map((p) => `project.json：${p}`);
      for (const f of plan.files.filter((x) => TEXT.test(x.to))) {
        const at = join(top, f.to), was = readFileSync(at, 'utf8');
        let now = scrubText(was, scrub);
        // the project's earlier versions and proposals hold its sources too
        if (/^\.history\/.*\.json$/i.test(f.to)) {
          try { const v = JSON.parse(now); if (dropPlaceAndTime(v)) now = JSON.stringify(v, null, 2) + '\n'; } catch { /* not JSON after all: its paths are scrubbed all the same */ }
        }
        if (now !== was) { rmSync(at); writeFileSync(at, now); }   // a hard link to the project's own file: written anew, not through it
        left.push(...leftoverPaths(now).map((p) => `${f.to}：${p}`));
      }
      if (left.length) throw new Error(`還有這台電腦上的路徑，沒有打包（--public 不能留）：\n${left.slice(0, 20).join('\n')}${left.length > 20 ? `\n…共 ${left.length} 個` : ''}\n素材在專案外面就加 --media；聊天紀錄或文字檔裡的，改掉再匯出。`);
    }
    // unedited since the last cut: the zip's cut-state names the text in the zip, or the import's next cut refused for nothing.
    // Edited: the old hash stays, and still differs
    const state = join(top, 'cache', 'cut-state.json');
    const kept = (() => { try { return JSON.parse(readFileSync(state, 'utf8')).hash; } catch { return undefined; } })();
    if (kept === sha1(before)) {
      rmSync(state);   // a hard link to the project's own file: written anew, not through it
      writeFileSync(state, JSON.stringify({ hash: sha1(text) }));
    }
    rmSync(out, { force: true });
    // names in UTF-8 with the zip's UTF-8 flag: Windows' bsdtar otherwise writes them in the system code page (CP950 here), and
    // a Mac, or a Windows in another language, unpacked 影片.mp4 as garbage and the footage went offline. A Mac's bsdtar takes it too.
    tar(['-a', '-c', ...(/\.zip$/i.test(out) ? ['--options', 'zip:hdrcharset=UTF-8'] : []), '-f', out, '-C', stage, id]);
  } finally { rmSync(stage, { recursive: true, force: true }); }
  return out;
}

/** Why a zip could not be imported: `code` says what (`npm run examples`, which prints English, words it from that), the message is
 *  import-project's own Chinese. */
export class ImportError extends Error {
  constructor(message: string, readonly code: 'badName' | 'unpack' | 'notExport' | 'exists', /** the zip or the project name it is about */ readonly subject: string) { super(message); }
}

/** Everything under `dir` (itself left out) that is neither a plain file nor a plain folder, as paths relative to it with /:
 *  symbolic links (a junction on Windows too), devices, pipes. Read with lstat, so a link is never followed, nor walked into. */
export function oddEntries(dir: string, sub = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, sub))) {
    const rel = sub ? `${sub}/${name}` : name, s = lstatSync(join(dir, rel));
    if (s.isDirectory()) out.push(...oddEntries(dir, rel));
    else if (!s.isFile()) out.push(rel);
  }
  return out;
}

/** unpacks a zip from exportProject into projectsDir/<its id or `as`>; never over an existing project. Returns the folder. */
export function importProject(zip: string, projectsDir: string, as?: string): string {
  if (as !== undefined && !PROJECT_ID.test(as)) throw new ImportError(`「${as}」不能當專案名稱：英文字母、數字、_ 和 -，不能用 _ 或 - 開頭`, 'badName', as);
  mkdirSync(projectsDir, { recursive: true });
  const tmp = mkdtempSync(join(projectsDir, '.import-'));
  try {
    try { tar(['-x', '-f', resolve(zip), '-C', tmp]); } catch (e) { throw new ImportError((e as Error).message, 'unpack', basename(zip)); }
    // a Mac's bsdtar unpacks a zip's symbolic links as links (Windows' fails on them): the project's history, cache and the
    // server's static files would be written and served through them, outside the project folder. An export never has one.
    const odd = oddEntries(tmp);
    if (odd.length) throw new ImportError(`${basename(zip)} 裡有連結或特殊檔案，不匯入（它們會連到專案資料夾外面）：${odd.slice(0, 10).join('、')}${odd.length > 10 ? `…共 ${odd.length} 個` : ''}`, 'unpack', basename(zip));
    const tops = readdirSync(tmp).filter((n) => existsSync(join(tmp, n, 'project.json')) && statSync(join(tmp, n)).isDirectory());
    if (tops.length !== 1) throw new ImportError(`${basename(zip)} 不是 export-project 做的檔案（裡面要有一個資料夾，放著 project.json）`, 'notExport', basename(zip));
    const id = as ?? tops[0];
    if (!PROJECT_ID.test(id)) throw new ImportError(`「${id}」不能當專案名稱：用 --as 另取一個`, 'badName', id);
    const target = join(projectsDir, id);
    if (existsSync(target)) throw new ImportError(`專案「${id}」已經有了，沒有覆蓋：用 --as <新名稱> 匯入成另一個專案`, 'exists', id);
    renameSync(join(tmp, tops[0]), target);
    return target;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

async function main(argv: string[]) {
  if (process.env.npm_lifecycle_event === 'import-project') {
    const usage = '用法：npm run import-project -- <檔案.zip> [--as <新名稱>]', a = parseArgsOrExit(argv, { '--as': 'value' }, usage, { maxWords: 1 }), [zip] = a.words;
    if (!zip) { console.error(usage); process.exit(2); }
    const at = importProject(resolve(process.env.INIT_CWD ?? process.cwd(), zip), join(TELLCUT_ROOT, 'projects'), a.get('--as'));
    console.log(`匯入了：${at}\n素材分析會在打開專案或跑 npm run inspect 時重做。`);
    return;
  }
  const usage = '用法：npm run export-project -- <專案> [--media | --trim] [--public] [--out <檔案.zip>]';
  const a = parseArgsOrExit(argv, { '--media': 'switch', '--trim': 'switch', '--public': 'switch', '--out': 'value' }, usage, { maxWords: 1 });
  const dir = projectArgOrExit(a.words[0], usage);
  const trim = a.has('--trim'), media = trim || a.has('--media'), arg = a.get('--out'), out = arg && resolve(process.env.INIT_CWD ?? process.cwd(), arg);
  if (trim) console.log('只帶用到的素材：每個影片留下用到的部分（前後多 2 秒），其餘變成黑畫面、沒有聲音');
  const zip = await exportProjectAsync(dir, { media, trim, public: a.has('--public'), out, log: console.log });
  const plan = exportPlan(dir, JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')), { media });
  console.log(`打包好了：${zip}（${(statSync(zip).size / 1e6).toFixed(1)} MB）`);
  if (!media && plan.outside.length) console.log(`沒有包進素材：${plan.outside.length} 個檔案在專案外面（${plan.outside.slice(0, 6).join('、')}）。要整包帶走就加 --media。`);
  else if (!media) console.log('沒有包進 media/（匯入的素材、旁白、配樂）：要整包帶走就加 --media。');
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e: Error) => { console.error(e.message); process.exitCode = 1; });
}
