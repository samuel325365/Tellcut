// Per-source analysis for the editor (spec §6.3): a proxy 540 px on its short side, 1 fps thumbnail atlas, scene cuts and waveform peaks.
import { renameRetry } from './fsutil.ts';
import { heavy } from './limit.ts';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ffmpeg, probeDuration, probeHasAudio, probeSize } from './ffmpeg.ts';
import { fileHash } from './hash.ts';
import { fitImage } from './photo.ts';
import { isImagePath } from './probe.ts';
import { waitForLock, withLock } from './locks.ts';
import { shareFolder, siblingFolders } from './share.ts';

export const ANALYSIS_VERSION = 'a1';
/** the proxy: short side 540 (a portrait source was 304×540 before, too soft for a portrait film's preview) */
export const PROXY_SCALE = "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)'";
export const THUMB_H = 90, THUMB_COLS = 10, PEAK_RATE = 100, SCENE_THRESHOLD = 0.25;

export interface ThumbIndex { interval: number; width: number; height: number; cols: number; count: number }
export interface Peaks { rate: number; peaks: number[] }
export interface AnalysisFiles { dir: string; proxy: string; thumbs: string; thumbIndex: string; cuts: string; peaks: string }

/** Where a source's analysis lives; the directory changes whenever the file (size/mtime) or the analysis version does. */
export function analysisFiles(projectDir: string, srcPath: string): AnalysisFiles {
  const dir = join(projectDir, 'cache', 'analysis', fileHash(`analysis|${ANALYSIS_VERSION}`, srcPath));
  return { dir, proxy: join(dir, isImagePath(srcPath) ? 'proxy.jpg' : 'proxy.mp4'), thumbs: join(dir, 'thumbs.jpg'), thumbIndex: join(dir, 'thumbs.json'), cuts: join(dir, 'cuts.json'), peaks: join(dir, 'peaks.json') };
}
export const isAnalyzed = (f: AnalysisFiles) => [f.proxy, f.thumbs, f.thumbIndex, f.cuts, f.peaks].every((p) => existsSync(p));
/** analysed, and (for a video) its proxy checked for the short side of 540: nothing left for analyzeSource to do */
export const analysisDone = (f: AnalysisFiles, srcPath: string) => isAnalyzed(f) && (isImagePath(srcPath) || existsSync(join(f.dir, PROXY_STAMP)));
/** the stamp of a proxy made, or looked at, by this Tellcut: 540 on the short side (v2), crf 27 / a keyframe every 12 frames (v3) */
const PROXY_STAMP = 'proxy.v3';
/** more than this many bytes a second is a proxy of the old, heavier settings (crf 23: a 45-minute vlog's proxy was 1.7 GB) */
const HEAVY_PROXY = 500_000;

/** Peak |sample| per window of 16-bit mono PCM, 0..1 rounded to 3 decimals. */
export function peaksOf(pcm: Buffer, sampleRate: number, rate = PEAK_RATE): number[] {
  const win = Math.round(sampleRate / rate), n = Math.floor(pcm.length / 2), out: number[] = [];
  for (let i = 0; i < n; i += win) {
    let m = 0;
    for (let j = i; j < Math.min(n, i + win); j++) m = Math.max(m, Math.abs(pcm.readInt16LE(j * 2)));
    out.push(Math.round((m / 32768) * 1000) / 1000);
  }
  return out;
}

/** pts_time values printed by the showinfo filter. */
export const parseShowinfo = (stderr: string) => [...stderr.matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => +(+m[1]).toFixed(3));

/** Writes to a temp name and renames, so an interrupted step never looks finished. Skips finished steps. */
export async function atomic(final: string, make: (tmp: string) => Promise<unknown>) {
  if (existsSync(final)) return;
  // this process's own name (the extension kept for the tools that read it): two processes on one cache never share it
  const tmp = final.replace(/(\.\w+)$/, `.${process.pid}.tmp$1`);
  try { await make(tmp); renameRetry(tmp, final); } catch (e) { rmSync(tmp, { force: true }); throw e; }
}

async function atomicResult<T>(final: string, make: (tmp: string) => Promise<T>): Promise<T | undefined> {
  let out: T | undefined;
  await atomic(final, async (tmp) => { out = await make(tmp); });
  return out;
}

async function analyzeSourceNow(projectDir: string, srcPath: string, o: { signal?: AbortSignal; onStep?: (step: string, i: number, n: number) => void } = {}): Promise<AnalysisFiles> {
  const f = analysisFiles(projectDir, srcPath);
  // the folder names are hashes: a small note says which file a folder belongs to (toolkit phase 4)
  const note = join(f.dir, 'source.json'), label = () => { if (!existsSync(note)) writeFileSync(note, JSON.stringify({ path: srcPath })); };
  // a proxy made before the short side was 540 (portrait: 304 px wide), or with the old heavier settings (over 4 Mbps), is made
  // again — only the proxy: the folder also holds the transcript and the other analysis, which a new ANALYSIS_VERSION would throw
  // away. The stamp says it was looked at.
  const stamp = join(f.dir, PROXY_STAMP);
  if (!isImagePath(srcPath) && existsSync(f.proxy) && !existsSync(stamp)) {
    const s = await probeSize(f.proxy).catch(() => null), secs = await probeDuration(f.proxy).catch(() => 0);
    const heavyProxy = secs > 0 && statSync(f.proxy).size / secs > HEAVY_PROXY;
    if ((s && Math.min(s.width, s.height) < 530) || heavyProxy) rmSync(f.proxy, { force: true });
    else writeFileSync(stamp, '');
  }
  if (isAnalyzed(f)) { label(); return f; }
  mkdirSync(f.dir, { recursive: true });
  label();
  // another process (the server, the page chat's inspect) analysing this source: wait for it rather than writing the same files
  const lock = join(f.dir, 'analysis.lock');
  await waitForLock(lock, { signal: o.signal });
  // another project with the same footage analysing it now: wait, then take its work over (share.ts)
  for (const d of siblingFolders(f.dir)) await waitForLock(join(d, 'analysis.lock'), { signal: o.signal });
  shareFolder(f.dir);
  if (analysisDone(f, srcPath)) return f;
  return withLock(lock, () => analyzeLocked(f, srcPath, stamp, o));
}

async function analyzeLocked(f: AnalysisFiles, srcPath: string, stamp: string, o: { signal?: AbortSignal; onStep?: (step: string, i: number, n: number) => void }): Promise<AnalysisFiles> {
  if (isImagePath(srcPath)) {
    // a photo: an upright proxy and a one-tile thumbnail; no cuts, no sound
    o.onStep?.('proxy', 0, 2);
    const fit = await atomicResult(f.proxy, (tmp) => fitImage(srcPath, tmp, 1920, 1920, o.signal));
    o.onStep?.('thumbs', 1, 2);
    const ratio = fit ? fit.width / fit.height : 4 / 3, tw = 2 * Math.max(1, Math.round((THUMB_H * ratio) / 2));
    await atomic(f.thumbs, (tmp) => fitImage(srcPath, tmp, tw, THUMB_H, o.signal));
    await atomic(f.thumbIndex, async (tmp) => writeFileSync(tmp, JSON.stringify({ interval: 1, width: tw, height: THUMB_H, cols: 1, count: 1 } satisfies ThumbIndex)));
    await atomic(f.cuts, async (tmp) => writeFileSync(tmp, '[]'));
    await atomic(f.peaks, async (tmp) => writeFileSync(tmp, JSON.stringify({ rate: PEAK_RATE, peaks: [] } satisfies Peaks)));
    return f;
  }
  const duration = await probeDuration(srcPath), { width, height } = await probeSize(srcPath);
  const sig = { signal: o.signal };

  o.onStep?.('proxy', 0, 4);
  // crf 27 and a keyframe every 12 frames: about 15 MB a minute (crf 23 / every 6 made a 45-minute vlog's proxy 1.7 GB, more than
  // the source); scrubbing decodes at most 11 frames of 540p. Exports cut from the source, so the proxy's quality never reaches a film.
  await atomic(f.proxy, (tmp) => ffmpeg(['-i', srcPath, '-an', '-vf', PROXY_SCALE, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
    '-g', '12', '-bf', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp], sig));
  writeFileSync(stamp, '');

  o.onStep?.('thumbs', 1, 4);
  const count = Math.max(1, Math.round(duration)), rows = Math.ceil(count / THUMB_COLS);
  const tw = 2 * Math.round((THUMB_H * width) / height / 2);
  // thumbnails and scene cuts from the proxy just made: the source is decoded once (an AV1 or 4K source decodes slowly)
  await atomic(f.thumbs, (tmp) => ffmpeg(['-i', f.proxy, '-an', '-vf', `fps=1,scale=${tw}:${THUMB_H},tile=${THUMB_COLS}x${rows}`, '-frames:v', '1', '-q:v', '4', tmp], sig));
  await atomic(f.thumbIndex, async (tmp) => writeFileSync(tmp, JSON.stringify({ interval: 1, width: tw, height: THUMB_H, cols: THUMB_COLS, count } satisfies ThumbIndex)));

  o.onStep?.('cuts', 2, 4);
  await atomic(f.cuts, async (tmp) => {
    const { stderr } = await ffmpeg(['-i', f.proxy, '-an', '-vf', `select='gt(scene,${SCENE_THRESHOLD})',showinfo`, '-f', 'null', '-'], { ...sig, level: 'info' });
    writeFileSync(tmp, JSON.stringify(parseShowinfo(stderr)));
  });

  o.onStep?.('peaks', 3, 4);
  await atomic(f.peaks, async (tmp) => {
    const peaks = (await probeHasAudio(srcPath))
      ? peaksOf((await ffmpeg(['-i', srcPath, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { ...sig, stdout: true })).stdout, 8000)
      : [];
    writeFileSync(tmp, JSON.stringify({ rate: PEAK_RATE, peaks } satisfies Peaks));
  });
  return f;
}

/** One source's analysis holds one of the two heavy ffmpeg slots from start to end (spec §6.2). */
export const analyzeSource = (...a: Parameters<typeof analyzeSourceNow>) => {
  const f = analysisFiles(a[0], a[1]);
  if (analysisDone(f, a[1])) return Promise.resolve(f);
  shareFolder(f.dir);   // the same footage analysed in another project: taken over, not made again (share.ts)
  return analysisDone(f, a[1]) ? Promise.resolve(f) : heavy.run(() => analyzeSourceNow(...a));
};
