// Analysis beyond the editor's basics (spec 2026-10-14 §7): contact sheets and speech transcripts per video,
// beats per music file. Each step is optional: a failure here never stops proxies, thumbnails or editing.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { splitAtPauses, type Transcript } from '@tellcut/engine';
import { analysisFiles, analyzeSource, atomic } from './analysis.ts';
import { detectBurned, type Burned } from './burned.ts';
import { ffmpeg, probeDuration, probeHasAudio, probeSize } from './ffmpeg.ts';
import { analysisName } from './hash.ts';
import { background } from './limit.ts';
import { isImagePath } from './probe.ts';
import { runPy } from './py.ts';
import { transcribeProvider } from './providers/index.ts';
import type { TranscribeProvider } from './providers/types.ts';
import { lockHolder, withLock } from './locks.ts';
import { shareFolder, siblingFolders } from './share.ts';
import { replaceFile } from './fsutil.ts';
import { EXTRAS_VERSION } from './extras-version.ts';

export { EXTRAS_VERSION };
export interface Beats { bpm: number; offset: number; beats: number[] }

export function extrasFiles(projectDir: string, srcPath: string) {
  const dir = analysisFiles(projectDir, srcPath).dir;
  return { transcript: join(dir, 'transcript.json'), transcriptBy: join(dir, 'transcript.by'), version: join(dir, 'extras.version'), burned: join(dir, 'burned-v2.json') /* v2: the box re-centred on the text line (phase 5) */, sheets: join(dir, 'sheets.json'), sheet: (n: number) => join(dir, `sheet-${n}.jpg`) };
}
/** A source's transcript as everything reads it: a sentence carried across a long pause split at the pause (splitAtPauses). */
export function readTranscript(projectDir: string, srcPath: string): Transcript | null {
  const f = extrasFiles(projectDir, srcPath).transcript;
  try { return existsSync(f) ? splitAtPauses(JSON.parse(readFileSync(f, 'utf8')) as Transcript) : null; } catch { return null; }
}

/**
 * The burned-caption result of a source: burned-v2.json, or one saved before phase 5 (burned.json, its box at − 0.07 … + 0.05
 * around the text line) moved onto the line the way v2 has it — a project analysed earlier keeps its checks until inspect re-runs.
 */
export function readBurned(projectDir: string, srcPath: string): Burned | null {
  const f = extrasFiles(projectDir, srcPath).burned, old = join(dirname(f), 'burned.json');
  try {
    if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')) as Burned;
    if (!existsSync(old)) return null;
    const b = JSON.parse(readFileSync(old, 'utf8')) as Burned;
    if (b.caption) { const [x, y, w] = b.caption.rect, y2 = +(y + 0.025).toFixed(3); b.caption.rect = [x, y2, w, +Math.min(0.09, 1 - y2).toFixed(3)]; }
    return b;
  } catch { return null; }
}
export function musicFiles(projectDir: string, path: string) {
  const dir = join(projectDir, 'cache', 'analysis', analysisName(projectDir, `music|${EXTRAS_VERSION}`, path));
  return { dir, beats: join(dir, 'beats.json') };
}

/** The scene cuts that start a scene with a frame in its middle: a cut in the last END s (a rendered film's last frame, say) is
 *  none, as the middle of that sliver lies past the last frame and ffmpeg grabs nothing there */
const END = 0.25;
const sceneCuts = (cuts: number[], duration: number) => cuts.filter((c) => c > 0 && c < duration - END);

/** Frame times for a contact sheet: the middle of each short scene, every 3 s in scenes longer than 6 s; at most `max`, spread evenly. */
export function sheetTimes(cuts: number[], duration: number, max = 48): number[] {
  const pts = [0, ...sceneCuts(cuts, duration), duration], out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (b - a > 6) for (let t = a + 1.5; t < b - 0.5; t += 3) out.push(Math.round(t * 100) / 100);
    else out.push(Math.round(((a + b) / 2) * 100) / 100);
  }
  return out.length <= max ? out : Array.from({ length: max }, (_, k) => out[Math.round((k * (out.length - 1)) / (max - 1))]);
}
export const timecode = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
/** m:ss.s — frame labels a cut can be aimed at */
export const timecode1 = (t: number) => { const d = Math.round(t * 10) / 10; return `${Math.floor(d / 60)}:${(d % 60).toFixed(1).padStart(4, '0')}`; };

export interface SheetLayout { cols: number; cellW: number; cellH?: number; maxCellH?: number; rowLabels?: string[]; rowLabelW?: number }
/** A labelled grid of images (default 4 columns, 480 px cells; `img: null` is a blank cell). Resolves with sheet.py's {width, height} JSON. */
export const photoSheet = (out: string, cells: Array<{ img: string | null; label: string }>, signal?: AbortSignal, layout: SheetLayout = { cols: 4, cellW: 480 }) =>
  runPy('sheet.py', [], { input: JSON.stringify({ out, ...layout, cells }), signal });

const PER_PAGE = 24;
async function makeSheets(srcPath: string, label: string, cuts: number[], duration: number, page: (n: number) => string, signal?: AbortSignal): Promise<number> {
  const tmp = mkdtempSync(join(tmpdir(), 'sheet-')), cells: Array<{ img: string | null; label: string }> = [];
  try {
    for (const [i, t] of sheetTimes(cuts, duration).entries()) {
      const img = join(tmp, `${i}.jpg`);
      await ffmpeg(['-ss', String(t), '-i', srcPath, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', img], { signal });
      // ffmpeg ends without a frame past the last one (a video stream shorter than the file, say): a blank cell
      cells.push({ img: existsSync(img) ? img : null, label: `${label} ${timecode(t)}` });
    }
    const pages = Math.max(1, Math.ceil(cells.length / PER_PAGE));
    for (let n = 1; n <= pages; n++) await atomic(page(n), (out) => photoSheet(out, cells.slice((n - 1) * PER_PAGE, n * PER_PAGE), signal));
    return pages;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** someone else transcribing this source now (another live process holds transcript.lock): since when, ms */
export function transcribing(projectDir: string, srcPath: string): { started: number } | null {
  // here, or in another project with the same footage (its transcript is shared once it is done: share.ts)
  const dir = dirname(extrasFiles(projectDir, srcPath).transcript);
  for (const d of [dir, ...siblingFolders(dir)]) { const l = lockHolder(join(d, 'transcript.lock')); if (l) return { started: l.started }; }
  return null;
}

/** who made a transcript: the provider and its model */
const makerOf = (stt: TranscribeProvider) => (stt.model ? `${stt.id}:${stt.model}` : stt.id);

/**
 * Contact sheets, burned-caption detection and the transcript of one video. The transcript is skipped (and `transcribing` says
 * since when) while another process makes it — the server starts it when a project is made, and the page chat's inspect must
 * not run a second one beside it. The basic analysis comes first (spec 2026-10-14 §7).
 */
export async function sourceExtras(projectDir: string, srcPath: string, o: { label: string; transcribe?: boolean; signal?: AbortSignal; onStep?: (step: string, i: number, n: number) => void; /** a test's stand-in (default: tellcut/providers.json's) */ stt?: TranscribeProvider }): Promise<{ transcribing?: { started: number } }> {
  if (isImagePath(srcPath)) return {};
  let busy: { started: number } | null = null;
  const a = await analyzeSource(projectDir, srcPath, { signal: o.signal });
  const f = extrasFiles(projectDir, srcPath);
  // what another project with the same footage made since this one was analysed (its transcript, say): taken over (share.ts)
  const take = () => { if (![f.sheets, f.burned, f.transcript].every((x) => existsSync(x))) shareFolder(dirname(f.transcript)); };
  take();
  // made by an older version of this code: the sheets and the burned check again (a folder from before the record counts as current)
  if (existsSync(f.version) && readFileSync(f.version, 'utf8') !== EXTRAS_VERSION) {
    for (const x of [f.sheets, f.burned]) rmSync(x, { force: true });
    for (let n = 1; existsSync(f.sheet(n)); n++) rmSync(f.sheet(n), { force: true });
  }
  await background.run(async () => {
    // again once this one's turn comes, and before the transcript: projects made at once from the same footage all queue here
    // before any of it exists, and each made it again (a batch of N ran Whisper N times on one file)
    take();
    if (!existsSync(f.sheets)) {
      o.onStep?.('sheets', 0, 2);
      // frames from the 540 px-high proxy when it is at least as wide as a cell (decoding 4K for a 480 px cell is waste);
      // a portrait proxy is narrower than that, so its frames come from the source
      const { width, height } = await probeSize(srcPath), from = width / height >= 480 / 540 && existsSync(a.proxy) ? a.proxy : srcPath;
      const pages = await makeSheets(from, o.label, JSON.parse(readFileSync(a.cuts, 'utf8')), await probeDuration(srcPath), f.sheet, o.signal);
      await atomic(f.sheets, async (tmp) => writeFileSync(tmp, JSON.stringify({ pages })));
    }
    if (!existsSync(f.burned)) {   // captions burned into the picture (toolkit phase 2d); quick, so before the transcript
      o.onStep?.('burned', 1, 3);
      try { await atomic(f.burned, async (tmp) => writeFileSync(tmp, JSON.stringify(await detectBurned(a.proxy, { signal: o.signal })))); }
      catch (err) { if (o.signal?.aborted) throw err; /* optional: the transcript below still runs */ }
    }
    mkdirSync(dirname(f.version), { recursive: true });
    replaceFile(f.version, EXTRAS_VERSION);
    // which speech-to-text tool answers is tellcut/providers.json's business (toolkit phase 3); a transcript another tool or model
    // made is made again (one from before this was recorded has no maker and is kept)
    const stt = o.stt ?? transcribeProvider(), by = makerOf(stt);
    take();
    if (o.transcribe !== false && existsSync(f.transcript) && existsSync(f.transcriptBy) && readFileSync(f.transcriptBy, 'utf8') !== by) rmSync(f.transcript, { force: true });
    if (o.transcribe !== false && !existsSync(f.transcript) && (await probeHasAudio(srcPath))) {
      busy = transcribing(projectDir, srcPath);
      if (busy) return;
      o.onStep?.('transcript', 1, 2);
      await withLock(join(dirname(f.transcript), 'transcript.lock'), () => atomic(f.transcript, (tmp) => stt.transcribe(srcPath, tmp, { signal: o.signal })));
      replaceFile(f.transcriptBy, by);   // shared by a hard link with other projects: never rewritten in place
    }
  });
  return busy ? { transcribing: busy } : {};
}

/** Sheets made and, for a video with sound, the transcript too. */
export async function extrasDone(projectDir: string, srcPath: string, stt?: TranscribeProvider): Promise<boolean> {
  if (isImagePath(srcPath)) return true;
  const f = extrasFiles(projectDir, srcPath);
  // an older version's sheets, or a transcript another tool made, are to be made again (sourceExtras does it)
  if (existsSync(f.version) && readFileSync(f.version, 'utf8') !== EXTRAS_VERSION) return false;
  if (existsSync(f.transcriptBy) && readFileSync(f.transcriptBy, 'utf8') !== makerOf(stt ?? transcribeProvider())) return false;
  return existsSync(f.sheets) && existsSync(f.burned) && (existsSync(f.transcript) || !(await probeHasAudio(srcPath)));
}

/** Detected beats checked against the tempo a catalog lists (Incompetech): a detection at twice the listed tempo keeps every other
 *  beat, one at half fills in the beat between; anything else (a close tempo, 3:2) is left as detected. Within 8 %. */
export function correctBeats(b: Beats, listed: number): Beats {
  const r = b.bpm / listed, near = (x: number) => Math.abs(r / x - 1) <= 0.08, r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  if (near(2)) return { bpm: b.bpm / 2, offset: b.offset, beats: b.beats.filter((_, i) => i % 2 === 0) };
  if (near(0.5)) return { bpm: b.bpm * 2, offset: b.offset, beats: b.beats.flatMap((x, i) => (i + 1 < b.beats.length ? [x, r6((x + b.beats[i + 1]) / 2)] : [x])) };
  return b;
}

/** A music file's beats (cached as detected); `bpm`: the tempo its source lists, which the beats are checked against on every read. */
export async function musicBeats(projectDir: string, path: string, o: { signal?: AbortSignal; bpm?: number } = {}): Promise<Beats> {
  const f = musicFiles(projectDir, path);
  if (!existsSync(f.beats)) shareFolder(f.dir);   // the same music's beats from another project
  if (!existsSync(f.beats)) {
    mkdirSync(f.dir, { recursive: true });
    const raw = join(f.dir, `mono.${process.pid}.f32`);   // inspect and the server may both start on a new song
    try {
      await background.run(async () => {
        await ffmpeg(['-i', path, '-vn', '-ac', '1', '-ar', '11025', '-f', 'f32le', raw], { signal: o.signal });
        await atomic(f.beats, async (tmp) => writeFileSync(tmp, await runPy('beats.py', [raw], { signal: o.signal })));
      });
    } finally { rmSync(raw, { force: true }); }
  }
  const b = JSON.parse(readFileSync(f.beats, 'utf8')) as Beats;
  return o.bpm ? correctBeats(b, o.bpm) : b;
}

/** Overview frame times (toolkit phase 1): the middle of each scene; with fewer scenes than `n` the longest scene is split
 *  until there are `n`, with more they are picked evenly. */
export function overviewTimes(cuts: number[], duration: number, n = 6): number[] {
  const pts = [0, ...sceneCuts(cuts, duration), duration];
  let spans = pts.slice(0, -1).map((a, i) => [a, pts[i + 1]] as [number, number]);
  while (spans.length < n) {
    const k = spans.reduce((best, s, i) => (s[1] - s[0] > spans[best][1] - spans[best][0] ? i : best), 0), [a, b] = spans[k];
    spans = [...spans.slice(0, k), [a, (a + b) / 2], [(a + b) / 2, b], ...spans.slice(k + 1)];
  }
  const mids = spans.map(([a, b]) => Math.round(((a + b) / 2) * 100) / 100);
  return mids.length <= n ? mids : Array.from({ length: n }, (_, k) => mids[Math.round((k * (mids.length - 1)) / (n - 1))]);
}

export const OVERVIEW_VERSION = 'o1';
const OV_FRAMES = 6, OV_ROWS = 8, OV_CELL = 160;

/** One overview page per 8 videos, a row each: 6 small frames in a 160 px box and the video's id and length on the left.
 *  Kept in cache/sheets/overview-N.jpg and redone only when the list of videos or one of the videos changes. */
export async function overviewSheets(projectDir: string, videos: Array<{ id: string; path: string; duration: number }>, o: { signal?: AbortSignal } = {}): Promise<string[]> {
  const dir = join(projectDir, 'cache', 'sheets'), meta = join(dir, 'overview.json');
  const key = createHash('sha1').update(JSON.stringify([OVERVIEW_VERSION, ...videos.map((v) => [v.id, analysisFiles(projectDir, v.path).dir])])).digest('hex');
  const page = (n: number) => join(dir, `overview-${n}.jpg`), pages = Math.ceil(videos.length / OV_ROWS);
  const files = Array.from({ length: pages }, (_, i) => page(i + 1));
  let old: { key: string; pages: number } | null = null;
  try { old = existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')) : null; } catch { /* torn (a write cut short): made again */ }
  if (old?.key === key && files.every((f) => existsSync(f))) return files;
  mkdirSync(dir, { recursive: true });
  const cuts: number[][] = [], proxies: string[] = [];
  for (const v of videos) {
    const a = await analyzeSource(projectDir, v.path, { signal: o.signal });
    cuts.push(JSON.parse(readFileSync(a.cuts, 'utf8')));
    proxies.push(existsSync(a.proxy) ? a.proxy : v.path);   // 160 px cells: the 540 px proxy is plenty, the source is slow to seek
  }
  const tmp = mkdtempSync(join(tmpdir(), 'overview-'));
  try {
    await background.run(async () => {
      const rows: Array<{ label: string; cells: Array<{ img: string | null; label: string }> }> = [];
      for (const [i, v] of videos.entries()) {
        const cells: Array<{ img: string | null; label: string }> = [];
        for (const [k, t] of overviewTimes(cuts[i], v.duration, OV_FRAMES).entries()) {
          const img = join(tmp, `${i}-${k}.jpg`);
          await ffmpeg(['-ss', String(t), '-i', proxies[i], '-frames:v', '1', '-vf', `scale=${OV_CELL}:${OV_CELL}:force_original_aspect_ratio=decrease`, '-q:v', '5', img], { signal: o.signal });
          cells.push({ img: existsSync(img) ? img : null, label: timecode1(t) });   // none grabbed: blank, as in makeSheets
        }
        while (cells.length < OV_FRAMES) cells.push({ img: null, label: '' });
        rows.push({ label: `${v.id}\n${timecode(v.duration)}`, cells });
      }
      // the old pages go first (atomic() keeps a file that exists), also those left over from a longer list
      rmSync(meta, { force: true });
      for (let n = 1; existsSync(page(n)); n++) rmSync(page(n), { force: true });
      for (let n = 1; n <= pages; n++) {
        const part = rows.slice((n - 1) * OV_ROWS, n * OV_ROWS);
        await atomic(page(n), (out) => photoSheet(out, part.flatMap((r) => r.cells), o.signal,
          { cols: OV_FRAMES, cellW: OV_CELL, cellH: OV_CELL, rowLabels: part.map((r) => r.label), rowLabelW: 180 }));
      }
    });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  replaceFile(meta, JSON.stringify({ key, pages }));
  return files;
}
