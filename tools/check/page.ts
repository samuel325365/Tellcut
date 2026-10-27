// Drives the player for `npm run check` (toolkit phase 1 Task 5): measures text at sample times, renders the mix,
// and optionally makes one contact sheet of the film (cache/check/sheet.jpg).
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTimes, type Project, type Registry, type Transcript } from '@tellcut/engine';
import { ffmpeg, ocrProvider, photoSheet, pyJson, readWav, timecode1, withProjectPage, type OcrLine, type OcrProvider, type PageSession } from '@tellcut/media-node';
import type { Finding } from './rules.ts';
import { burnedChecks } from './burned.ts';
import { leakFindings, leakProbes, leakUnchecked, type LeakProbe } from './leak.ts';
import { strayFindings, strayTimes, videoOnly } from './stray.ts';
import type { Burned } from '@tellcut/media-node';
import { audioChecks, captionSizeChecks, fallingIds, layoutChecks, sampleTimes, settledWindows, sheetTimes, type TextBox } from './visual.ts';

export async function renderedChecks(o: { dir: string; project: Project; registry: Registry; /** footage captions per source (toolkit phase 2d) */ burned?: Record<string, Burned | null>; /** per source, for the bleep-leak check (phase 5) */ transcripts?: Record<string, Transcript | null>; /** the OCR to read frames with (a test gives a stand-in) */ ocr?: OcrProvider; /** Simplified → Traditional for what OCR read (a test gives a stand-in) */ traditional?: (texts: string[]) => Promise<string[]>; sheet?: boolean; log?: (s: string) => void }): Promise<{ findings: Finding[]; sheet?: string }> {
  const p = o.project, times = resolveTimes(p), log = o.log ?? (() => {});
  const result = await withProjectPage(o, async (s): Promise<{ findings: Finding[]; sheet?: string }> => {
    const samples: Array<{ t: number; boxes: TextBox[] }> = [], findings0: Finding[] = [];
    const at = sampleTimes(p, times), falling = fallingIds(p);
    log(`量文字位置：${at.length} 個時間點`);
    for (const t of at) {
      await s.frame(Math.round(t * s.fps));
      samples.push({ t, boxes: (await s.layout()).filter((b) => !falling.has(b.id)) });
    }
    // toolkit phase 2a: a project-local effect must draw the same picture every time it is drawn at the same time
    // Drawn once at a and b first (a photo or font still loading), then a, b, a, compared as pictures, not bytes: Chrome scales a big
    // photo (a 4284×5712 one under an fx failed this) at a lower quality on its first draws, a few pixels off by one — 105 dB, never
    // seen — and a chat spent most of a film's tokens "fixing" that. An effect that reads chance or the clock moves things: far
    // below SAME_DB.
    for (const [id, a, b] of fxProbes(p, times)) {
      const at = async (t: number) => { await s.frame(Math.round(t * s.fps)); return s.png(); };
      await at(a); await at(b);
      const first = await at(a);
      await at(b);
      const second = await at(a);
      if (await samePicture(first, second)) continue;
      await at(b);
      if (await samePicture(second, await at(a))) continue;   // settled after the first: it was still loading
      findings0.push({ level: 'error', t: [a, a], ids: [id], msg: `fx 不是決定性的：同一時間 ${timecode1(a)} 畫了三次都不一樣（${id}）；檢查 draw 有沒有用到隨機、時間或上一次的狀態` });
    }
    // toolkit phase 5: a bleeped word the footage's own subtitles still show, read off the finished frames
    const probes = leakProbes(p, times, o.transcripts ?? {});
    if (probes.length) findings0.push(...await leakCheck(s, probes, o.dir, o.ocr, o.traditional ?? toTraditional, log));
    findings0.push(...leakUnchecked(p, times, o.transcripts ?? {}));
    log('混音');
    const wav = readWav(await s.wav());
    const captions = new Set(p.tracks.flatMap((t) => (t.items as Array<{ id: string; type?: string }>).filter((i) => /^(core|common)\.caption$/.test(i.type ?? '')).map((i) => i.id)));
    const findings = [...findings0, ...layoutChecks(samples, { W: p.meta.width, H: p.meta.height, spans: times, settled: settledWindows(p, times) }), ...captionSizeChecks(samples, { W: p.meta.width, H: p.meta.height, captions }), ...burnedChecks(p, o.burned ?? {}, samples), ...audioChecks(wav.data, wav.sampleRate)];
    // an old sheet left from an earlier --sheet run reads as this film (a review mistook one for the current cut): gone
    if (!o.sheet) { rmSync(join(o.dir, 'cache', 'check', 'sheet.jpg'), { force: true }); return { findings }; }
    const tmp = mkdtempSync(join(tmpdir(), 'check-sheet-')), cells: Array<{ img: string; label: string }> = [];
    try {
      for (const [i, t] of sheetTimes(p, times).entries()) {
        await s.frame(Math.round(t * s.fps));
        const img = join(tmp, `${i}.jpg`);
        writeFileSync(img, await s.jpeg());
        cells.push({ img, label: timecode1(t) });
      }
      const out = join(o.dir, 'cache', 'check', 'sheet.jpg');
      mkdirSync(join(o.dir, 'cache', 'check'), { recursive: true });
      rmSync(out, { force: true });
      await photoSheet(out, cells, undefined, { cols: 4, cellW: 320 });
      return { findings, sheet: out };
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
  // the footage's own text in the picture, read with the video tracks alone (stray.ts): a second page, after the first
  if (p.tracks.some((t) => t.kind === 'video' && (t.items as Array<{ source: string }>).some((c) => p.sources[c.source]?.kind !== 'image'))) {
    const at = strayTimes(p, times);
    log(`讀畫面裡原片自己的字：${at.length} 格`);
    const read = await withProjectPage({ ...o, project: videoOnly(p) }, (s) => ocrLines(s, at, o.dir, o.ocr, log));
    if (typeof read === 'string') result.findings.push({ level: 'note', msg: `沒辦法讀畫面裡原片自己的字（標題、標註、浮水印）：文字辨識不能用（${read}）` });
    else result.findings.push(...strayFindings(p, times, read));
  }
  return result;
}

/**
 * Reads the frames at `at` with the OCR provider, boxes as fractions of the frame (cached by picture content in
 * cache/check/ocr-lines-v2.json). An `edge` frame is read again at twice the size and what either read is kept: a few small
 * letters typing on at a cut ("Cre") were read only enlarged, and an enlarged frame lost a word the plain one read.
 * Why not, when this PC's OCR cannot read (the caller says so in a note: skipped in silence, a film with no bleeps passed).
 */
async function ocrLines(s: PageSession, at: Array<{ t: number; edge?: true }>, dir: string, given: OcrProvider | undefined, log: (s: string) => void): Promise<Map<number, OcrLine[]> | string> {
  const why = (e: unknown) => (e as Error).message.split('\n')[0].slice(0, 100);
  let provider: OcrProvider;
  try { provider = given ?? ocrProvider(); } catch (e) { return why(e); }
  const cacheFile = join(dir, 'cache', 'check', 'ocr-lines-v2.json');
  let cache: Record<string, OcrLine[]> = {};
  try { cache = JSON.parse(readFileSync(cacheFile, 'utf8')); } catch { /* none yet */ }
  const tmp = mkdtempSync(join(tmpdir(), 'check-stray-')), keys = new Map<number, string[]>(), todo: Array<{ img: string; key: string }> = [];
  try {
    for (const { t, edge } of at) {
      await s.frame(Math.round(t * s.fps));
      const png = await s.png(), key = `${provider.id}:${createHash('sha1').update(png).digest('hex')}`, img = join(tmp, `${t}.png`);
      keys.set(t, edge ? [key, `${key}:x2`] : [key]);
      if (key in cache && (!edge || `${key}:x2` in cache)) continue;
      writeFileSync(img, png);
      if (!(key in cache)) todo.push({ img, key });
      if (edge && !(`${key}:x2` in cache)) {
        const big = join(tmp, `${t}-x2.png`);
        await ffmpeg(['-i', img, '-vf', 'scale=iw*2:ih*2:flags=lanczos', big]);
        todo.push({ img: big, key: `${key}:x2` });
      }
    }
    if (todo.length) {
      log(`文字辨識：${todo.length} 格`);
      let read;
      try { read = await provider.read(todo.map((x) => x.img)); } catch (e) { return why(e); }
      // boxes as fractions of the picture read (x, y, w, h): what size the provider read it at does not matter
      todo.forEach((x, i) => { const r = read[i]; cache[x.key] = (r?.lines ?? []).map((l) => ({ text: l.text, box: [l.box[0] / r.width, l.box[1] / r.height, l.box[2] / r.width, l.box[3] / r.height] })); });
      mkdirSync(join(dir, 'cache', 'check'), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(cache));
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  // an edge frame: the plain read, and from the enlarged one only lines where the plain one read nothing (the same subtitle
  // read twice comes out spelt two ways)
  const out = new Map<number, OcrLine[]>();
  const meets = (a: OcrLine['box'], b: OcrLine['box']) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  for (const [t, [plain, big]] of keys) {
    const lines = [...(cache[plain] ?? [])];
    for (const l of big ? cache[big] ?? [] : []) if (!lines.some((m) => meets(m.box, l.box))) lines.push(l);
    out.set(t, lines);
  }
  return out;
}

/** the transcripts' own conversion (s2twp, tools/py/s2t.py): footage subtitles in Simplified characters still match */
const toTraditional = (texts: string[]) => pyJson<string[]>('s2t.py', [], { input: JSON.stringify(texts) });

/**
 * Reads the probes' frames with the OCR provider (results, in Traditional characters, kept by picture content and provider in
 * cache/check/ocr-v2.json: a frame read once is never read again) and returns the leak warnings. No OCR on this PC: one note, not
 * an error. When the conversion to Traditional fails, what OCR read is used as it is.
 */
async function leakCheck(s: PageSession, probes: LeakProbe[], dir: string, given: OcrProvider | undefined, traditional: (texts: string[]) => Promise<string[]>, log: (s: string) => void): Promise<Finding[]> {
  const noOcr = (e: unknown): Finding[] => [{ level: 'note', msg: `沒辦法檢查消音的字有沒有從原片字幕露出來：文字辨識不能用（${(e as Error).message.split('\n')[0].slice(0, 100)}）` }];
  let provider: OcrProvider;
  try { provider = given ?? ocrProvider(); } catch (e) { return noOcr(e); }
  const at = [...new Set(probes.flatMap((x) => x.at))].sort((a, b) => a - b);
  log(`讀原片字幕：${at.length} 格`);
  const cacheFile = join(dir, 'cache', 'check', 'ocr-v2.json');
  let cache: Record<string, string> = {};
  try { cache = JSON.parse(readFileSync(cacheFile, 'utf8')); } catch { /* none yet */ }
  const tmp = mkdtempSync(join(tmpdir(), 'check-ocr-')), byT = new Map<number, string>(), todo: Array<{ t: number; img: string; key: string }> = [];
  try {
    for (const t of at) {
      await s.frame(Math.round(t * s.fps));
      const png = await s.png(), key = `${provider.id}:${createHash('sha1').update(png).digest('hex')}`;
      if (key in cache) { byT.set(t, cache[key]); continue; }
      const img = join(tmp, `${t}.png`);
      writeFileSync(img, png);
      todo.push({ t, img, key });
    }
    if (todo.length) {
      let read;
      try { read = await provider.read(todo.map((x) => x.img)); }
      catch (e) { return noOcr(e); }
      let texts = todo.map((_, i) => (read[i]?.lines ?? []).map((l) => l.text).join(' '));
      try { const conv = await traditional(texts); if (conv.length === texts.length) texts = conv; } catch { /* as read */ }
      todo.forEach((x, i) => { cache[x.key] = texts[i]; byT.set(x.t, texts[i]); });
      mkdirSync(join(dir, 'cache', 'check'), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(cache));
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return leakFindings(probes, byT);
}

/** two pictures this close (PSNR, dB) are the same picture: what the eye cannot tell apart, and far above what a moving effect makes */
export const SAME_DB = 50;
/** Byte-equal, or at least SAME_DB apart (ffmpeg's psnr over the two PNGs). */
export async function samePicture(x: Buffer, y: Buffer): Promise<boolean> {
  if (x.equals(y)) return true;
  const tmp = mkdtempSync(join(tmpdir(), 'check-same-'));
  try {
    writeFileSync(join(tmp, 'x.png'), x); writeFileSync(join(tmp, 'y.png'), y);
    const { stderr } = await ffmpeg(['-i', join(tmp, 'x.png'), '-i', join(tmp, 'y.png'), '-lavfi', 'psnr', '-f', 'null', '-'], { level: 'info' });
    const m = /average:(inf|[0-9.]+)/.exec(stderr);
    return !!m && (m[1] === 'inf' || Number(m[1]) >= SAME_DB);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** per fx item: two times inside it, to draw a, then b, then a again (a repeat of a must look the same) */
function fxProbes(p: Project, times: ReturnType<typeof resolveTimes>): Array<[string, number, number]> {
  const snap = (t: number) => Math.round(t * p.meta.fps) / p.meta.fps, out: Array<[string, number, number]> = [];
  for (const tr of p.tracks) if (tr.kind === 'scene' || tr.kind === 'overlay') for (const it of tr.items) {
    if (!it.type.startsWith('fx.')) continue;
    const tm = times.get(it.id)!, len = tm.end - tm.start;
    out.push([it.id, snap(tm.start + len * 0.35), snap(tm.start + len * 0.75)]);
  }
  return out;
}
