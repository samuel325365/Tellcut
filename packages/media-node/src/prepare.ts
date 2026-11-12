// Cuts every clip / still / audio segment a project references into <project>/cache and writes cache/index.json; also the sound
// levels (peaks) blocks read (common.audiogram), and a copy of every music file the music tracks play.
import { heavy } from './limit.ts';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { renameRetry } from './fsutil.ts';
import { dirname, extname, join, resolve } from 'node:path';
import {
  allItems, audioKey, mediaIssues, withDefaults, audioRefOf, parseProject, resolveTimes, soundFiles, stillKey, videoKey, videoRefOf,
  type AudioItem, type AudioRef, type CacheIndex, type MediaRef, type Project, type Registry, type SceneItem, type StillRef, type VideoItem,
} from '@tellcut/engine';
import { abortError, cutAudio, cutVideo, grabStill, probeDuration, probeHasAudio, probeSize } from './ffmpeg.ts';
import { PEAK_RATE, analysisFiles, readPeaks } from './analysis.ts';
import { fitImage } from './photo.ts';
import { fileHash, sourceHash } from './hash.ts';

/** The cut file name's salt: encoding settings, plus a version for stabilised cuts (vs2 = vidstab on copied frames,
 *  so cuts made before that fix — broken into blocks on VP9 sources — are not reused). */
export const cutSalt = (r: MediaRef, base: string) => base + (r.stab ? '|vs2' : '');

/** Cache files being made in this process, by final path. Two prepareProject runs of one project in one process (an export
 *  and a preset's poster, the stills check) plan the same missing files: the later one waits for the file being made instead of
 *  cutting it again into the same place. */
const making = new Map<string, Promise<void>>();

/** A temp name of this job's own next to `final` (the pid and a random part: another process, or another call in this one, never
 *  writes the same one). It keeps the `.tmp.<ext>` ending the server's start-up cleanup looks for. */
export const tempName = (final: string) => {
  const ext = extname(final);
  return `${final.slice(0, final.length - ext.length)}.${process.pid}-${randomBytes(4).toString('hex')}.tmp${ext}`;
};

/** `p` settled (either way), or the abort as an AbortError */
const settledOrAbort = (p: Promise<unknown>, signal: AbortSignal) => new Promise<void>((res, rej) => {
  if (signal.aborted) return rej(abortError());
  const onAbort = () => rej(abortError());
  signal.addEventListener('abort', onAbort, { once: true });
  p.then(() => res(), () => res()).finally(() => signal.removeEventListener('abort', onAbort));
});

/** Makes `final` through `make(tmp)` and a rename, one job per file in this process at a time: a file another call is making
 *  is waited for, and taken as it is once made (unless `force`); when that call failed, this one makes it. A failed or
 *  interrupted job leaves no temp behind and nothing under the final name, so it never poisons the cache. */
export async function makeOnce(final: string, o: { force?: boolean; signal: AbortSignal }, make: (tmp: string) => Promise<void>): Promise<void> {
  const key = resolve(final);
  for (let other = making.get(key); other; other = making.get(key)) {
    await settledOrAbort(other, o.signal);
    if (!o.force && existsSync(final)) return;
  }
  // the plan's own check is from before the wait for a heavy slot: another call may have made it meanwhile
  if (!o.force && existsSync(final)) return;
  const tmp = tempName(final);
  const job = (async () => {
    try { await make(tmp); renameRetry(tmp, final); } catch (e) { rmSync(tmp, { force: true }); throw e; }
  })();
  making.set(key, job);
  try { await job; } finally { if (making.get(key) === job) making.delete(key); }
}

/** Runs jobs n at a time. On the first failure it aborts `ac` (stopping running cuts), starts nothing new,
 *  waits for every running job to settle, then throws that first error — no cut outlives the call. */
export async function runPool(jobs: Array<() => Promise<void>>, n: number, ac: AbortController) {
  const q = [...jobs];
  let first: unknown;
  await Promise.allSettled(Array.from({ length: n }, async () => {
    while (q.length && !ac.signal.aborted) {
      try { await q.shift()!(); } catch (e) { if (first === undefined) first = e; ac.abort(); }
    }
  }));
  if (first !== undefined) throw first;
  if (ac.signal.aborted) throw abortError();
}

/** Every piece of footage a project uses, as prepareProject cuts it: the clips, stills and sound pieces (by their cache keys), the
 *  photos, the sources whose sound levels blocks read, and the music files the music tracks play. export-project --trim keeps
 *  only these parts of each source, so it asks the same question. */
export function mediaRefs(p: Project, registry: Registry) {
  const times = resolveTimes(p);
  const videos = new Map<string, MediaRef>(), stills = new Map<string, StillRef>(), audio = new Map<string, AudioRef>();
  const images = new Set<string>(), peaks = new Set<string>();
  for (const { track, item } of allItems(p)) {
    const tm = times.get(item.id)!;
    if (track.kind === 'video') {
      const it = item as VideoItem;
      if (p.sources[it.source]?.kind === 'image') images.add(it.source);   // a photo: an upright copy, no cut
      else { const r = videoRefOf(it, tm.start, tm.end); videos.set(videoKey(r), r); }
    }
    if (track.kind === 'audio') { const r = audioRefOf(item as AudioItem, tm.start, tm.end); audio.set(audioKey(r), r); }
    if (track.kind === 'scene' || track.kind === 'overlay') {
      const type = registry.item((item as SceneItem).type);
      const m = type?.media?.({ ...(item as SceneItem), params: withDefaults(type.params, (item as SceneItem).params) }, p, (t) => registry.item(t));
      m?.videos.forEach((r) => videos.set(videoKey(r), r));
      m?.stills.forEach((r) => stills.set(stillKey(r), r));
      m?.peaks?.forEach((s) => { if (p.sources[s]?.kind !== 'image') peaks.add(s); });   // a photo has no sound
    }
  }
  const usedMedia = new Set(p.tracks.flatMap((t) => (t.kind === 'music' ? t.items.map((i) => i.media) : [])));
  return { videos, stills, audio, images, peaks, usedMedia };
}

export async function prepareProject(projectDir: string, registry: Registry, opts: { force?: boolean; log?: (s: string) => void; concurrency?: number; project?: Project; indexFile?: string; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<CacheIndex> {
  const log = opts.log ?? (() => {});
  const p = opts.project ?? parseProject(JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8')));
  const issues = mediaIssues(p, registry);
  if (issues.length) throw new Error(`Invalid media references:\n${issues.map((s) => `  ${s}`).join('\n')}`);
  const { videos, stills, audio, images, peaks, usedMedia } = mediaRefs(p, registry);
  const srcPath = (id: string) => resolve(projectDir, p.sources[id].path);
  const used = new Set([...[...videos.values(), ...stills.values(), ...audio.values()].map((r) => r.source), ...images, ...peaks]);
  const missing = [...used].filter((id) => !existsSync(srcPath(id))).map((id) => `  ${id}: ${p.sources[id].path}`);
  for (const id of usedMedia) if (!existsSync(resolve(projectDir, p.media[id].path))) missing.push(`  ${id}: ${p.media[id].path}`);
  for (const path of soundFiles(p)) if (!existsSync(resolve(projectDir, path))) missing.push(`  sound effect: ${path}`);
  if (missing.length) throw new Error(`Missing files:\n${missing.join('\n')}`);
  // the Stage and the cuts trust the declared size/duration, so a wrong declaration would distort or truncate
  const wrong: string[] = [];
  for (const id of used) {
    if (p.sources[id].kind === 'image') continue;   // photos have no media length
    const s = p.sources[id], f = await probeSize(srcPath(id)), d = await probeDuration(srcPath(id));
    if (f.width !== s.width || f.height !== s.height || Math.abs(d - s.duration) > 0.1)
      wrong.push(`  ${id}: declared ${s.width}×${s.height}, ${s.duration.toFixed(2)} s; file is ${f.width}×${f.height}, ${d.toFixed(2)} s`);
  }
  if (wrong.length) throw new Error(`Sources do not match project.json:\n${wrong.join('\n')}`);

  for (const d of ['cuts', 'stills', 'audio', 'images', 'peaks', 'music']) mkdirSync(join(projectDir, 'cache', d), { recursive: true });
  const index: CacheIndex = { videos: {}, stills: {}, audio: {}, images: {}, peaks: {}, music: {} };
  const jobs: Array<() => Promise<void>> = [];
  // one controller for this run: aborted by the caller (opts.signal) or by the first failed cut
  const ac = new AbortController();
  if (opts.signal?.aborted) ac.abort(); else opts.signal?.addEventListener('abort', () => ac.abort(), { once: true });
  let done = 0;
  const plan = <R extends { source: string }>(map: Map<string, R>, dir: string, ext: string, slot: Record<string, string>, cut: (src: string, r: R, out: string) => Promise<void>, salt: string | ((r: R) => string) = '') => {
    for (const [key, r] of map) {
      const name = fileHash(key + (typeof salt === 'function' ? salt(r) : salt), srcPath(r.source));
      const rel = `cache/${dir}/${name}.${ext}`;
      slot[key] = rel;
      if (!opts.force && existsSync(join(projectDir, rel))) continue;
      jobs.push(async () => {
        await makeOnce(join(projectDir, rel), { force: opts.force, signal: ac.signal }, (tmp) => cut(srcPath(r.source), r, tmp));
        log(`${dir} ${key}`);
        opts.onProgress?.(++done, jobs.length);
      });
    }
  };
  const { fps, cut } = p.meta;
  // cut at the SOURCE size: the Stage crops/zooms into the frame; scaling to the (maybe portrait) frame would distort
  plan(videos, 'cuts', 'mp4', index.videos, (src, ref, out) => {
    const s = p.sources[ref.source];
    return cutVideo({ src, ref, out, crf: cut.crf, preset: cut.preset, width: s.width, height: s.height, fps, sourceDuration: s.duration, signal: ac.signal });
  }, (r) => cutSalt(r, `|${cut.crf}|${cut.preset}|${fps}`));
  plan(stills, 'stills', 'jpg', index.stills, (src, ref, out) => grabStill({ src, ref, out, signal: ac.signal }));
  plan(audio, 'audio', 'wav', index.audio, (src, ref, out) => cutAudio({ src, ref, out, signal: ac.signal }));
  // photos: upright, at most twice the output size (Ken Burns zooms in)
  const L = 2 * Math.max(p.meta.width, p.meta.height);
  for (const sid of images) {
    const rel = `cache/images/${sourceHash(`image|${L}`, projectDir, srcPath(sid))}.jpg`;   // the path too: two photos of one size and time
    index.images![sid] = rel;
    if (!opts.force && existsSync(join(projectDir, rel))) continue;
    jobs.push(async () => {
      await makeOnce(join(projectDir, rel), { force: opts.force, signal: ac.signal }, async (tmp) => { await fitImage(srcPath(sid), tmp, L, L, ac.signal); });
      log(`image ${sid}`);
      opts.onProgress?.(++done, jobs.length);
    });
  }
  // sound levels: the analysis' peaks.json when the editor made one (the waveform the timeline shows), else read from the source
  for (const sid of peaks) {
    const rel = `cache/peaks/${sourceHash(`peaks|${PEAK_RATE}`, projectDir, srcPath(sid))}.json`;
    index.peaks![sid] = rel;
    if (!opts.force && existsSync(join(projectDir, rel))) continue;
    jobs.push(async () => {
      const src = srcPath(sid), made = analysisFiles(projectDir, src).peaks;
      await makeOnce(join(projectDir, rel), { force: opts.force, signal: ac.signal }, async (tmp) => {
        if (existsSync(made)) copyFileSync(made, tmp);
        else {
          const data = (await probeHasAudio(src)) ? await readPeaks(src, { signal: ac.signal }) : [];
          writeFileSync(tmp, JSON.stringify({ rate: PEAK_RATE, peaks: data }));
        }
      });
      log(`peaks ${sid}`);
      opts.onProgress?.(++done, jobs.length);
    });
  }
  // music: a copy under a plain name. Import registers a music file where it is (../../Music/a.mp3, another drive), which the
  // export's static server (the tellcut folder only) cannot serve, and a name with # or % breaks as a URL.
  for (const id of usedMedia) {
    const src = resolve(projectDir, p.media[id].path), ext = /^\.[a-z0-9]{1,5}$/.exec(extname(src).toLowerCase())?.[0] ?? '.bin';
    const rel = `cache/music/${sourceHash('music', projectDir, src)}${ext}`;
    index.music![id] = rel;
    if (!opts.force && existsSync(join(projectDir, rel))) continue;
    jobs.push(async () => {
      await makeOnce(join(projectDir, rel), { force: opts.force, signal: ac.signal }, (tmp) => copyFile(src, tmp));
      log(`music ${id}`);
      opts.onProgress?.(++done, jobs.length);
    });
  }
  opts.onProgress?.(0, jobs.length);
  await runPool(jobs.map((j) => () => heavy.run(j)), opts.concurrency ?? 3, ac);   // each cut takes a heavy slot (spec §6.2)
  const indexFile = join(projectDir, opts.indexFile ?? 'cache/index.json');
  mkdirSync(dirname(indexFile), { recursive: true });
  writeFileSync(indexFile, JSON.stringify(index, null, 2));
  return index;
}
