// Editor media endpoints (spec §6.1): per-source analysis results plus on-demand, cached audio segments and stills.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { AUDIO_PAD, stillKey, type StillRef } from '@tellcut/engine';
import { PEAK_RATE, analysisDone, analysisFiles, analyzeSource, cutAudio, extrasDone, extrasFiles, ffmpeg, fitImage, correctBeats, musicBeats, musicFiles, readAssetRecords, type Beats, sourceExtras, grabStill, isAnalyzed, peaksOf, readTranscript, sendFile, renameRetry, shareAnalysis, sourceHash } from '@tellcut/media-node';
import { HttpError, sendJson, type Router } from './http.ts';
import type { JobInfo, JobQueue } from './jobs.ts';
import { sendProjectFile, type ProjectStore } from './projects.ts';

const num = (url: URL, k: string) => {
  const v = url.searchParams.get(k), n = Number(v);
  if (v === null || v.trim() === '' || !Number.isFinite(n)) throw new HttpError(400, `Query parameter "${k}" must be a number`);
  return n;
};
/** An integer within [lo, hi] (sizes and counts go straight to ffmpeg filters), or undefined when absent. */
const intIn = (url: URL, k: string, lo: number, hi: number) => {
  if (!url.searchParams.has(k)) return undefined;
  const n = num(url, k);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `Query parameter "${k}" must be an integer from ${lo} to ${hi}`);
  return n;
};

/** One cache file per (key, source size/mtime and its path in the project: two files of one size and time are not one file);
 *  concurrent requests for the same file share one ffmpeg run. Cheap to make again, so no older name is looked for. */
const inflight = new Map<string, Promise<string>>();
function cached(dir: string, srcPath: string, key: string, ext: string, make: (tmp: string) => Promise<void>): Promise<string> {
  const file = join(dir, 'cache', 'media', `${sourceHash(key, dir, srcPath)}.${ext}`);
  if (existsSync(file)) return Promise.resolve(file);
  let p = inflight.get(file);
  if (!p) {
    p = (async () => {
      mkdirSync(dirname(file), { recursive: true });
      const tmp = file.replace(/\.(\w+)$/, '.tmp.$1');
      try { await make(tmp); renameRetry(tmp, file); } catch (e) { rmSync(tmp, { force: true }); throw e; }
      return file;
    })().finally(() => inflight.delete(file));
    inflight.set(file, p);
  }
  return p;
}

/** audio segments (cache/media/*.wav) above this many bytes are pruned oldest first, down to half of it */
export const AUDIO_CACHE_MAX = 1 << 30;

/** Keeps a project's cut audio segments under `max` bytes; `keep` (just made) and files still open stay. */
export function pruneAudioCache(mediaDir: string, keep: string, max = AUDIO_CACHE_MAX) {
  let files: Array<{ p: string; size: number; t: number }>;
  try { files = readdirSync(mediaDir).filter((f) => f.endsWith('.wav') && !f.includes('.tmp.')).map((f) => { const p = join(mediaDir, f), s = statSync(p); return { p, size: s.size, t: s.mtimeMs }; }); }
  catch { return; }
  let total = files.reduce((n, f) => n + f.size, 0);
  if (total <= max) return;
  // least recently used first (a hit touches its file); one used in the last minute may be on its way to a client
  const recent = Date.now() - 60_000;
  for (const f of files.sort((a, b) => a.t - b.t)) {
    if (total <= max / 2) break;
    if (f.p === keep || f.t > recent) continue;
    try { rmSync(f.p); total -= f.size; } catch { /* being streamed right now (Windows): next time */ }
  }
}

/** A file as it is now (size and time), to tell whether a job that failed on it would see the same input again. */
const stampOf = (path: string) => { try { const s = statSync(path); return `${s.size}|${s.mtimeMs}`; } catch { return ''; } };

/** opts.onAnalyzed: every job this request started is over (since: when it started; jobs: how each ended, a job no longer in
 *  the queue left out) */
export function mediaRoutes(r: Router, store: ProjectStore, queue: JobQueue, opts: { extras?: boolean; onAnalyzed?: (id: string, since: number, jobs: JobInfo[]) => void } = {}) {
  // sheets/transcripts and beats that failed in this server run, by kind and file: the editor asks for the analysis on every
  // open, and the same failure (a missing whisper model, say) would run again each time, minutes of work, and the chat waiting
  // for it would be told again. The same file is not tried again until it changes or the server restarts.
  const failed = new Map<string, string>();
  const failedBefore = (kind: string, path: string) => { const was = failed.get(`${kind}|${path}`); return was !== undefined && was === stampOf(path); };
  /** runs a job's work; a failure (not a cancel) is remembered for this file as it was */
  const remembered = async <T>(kind: string, path: string, signal: AbortSignal, work: () => Promise<T>): Promise<T> => {
    const stamp = stampOf(path);
    try { return await work(); } catch (e) { if (!signal.aborted) failed.set(`${kind}|${path}`, stamp); throw e; }
  };
  const source = (id: string, sid: string) => {
    const dir = store.dir(id), all = store.read(id).sources, s = Object.hasOwn(all, sid) ? all[sid] : undefined;   // "constructor" is no source
    if (!s) throw new HttpError(404, `No source "${sid}" in project "${id}"`);
    const path = resolve(dir, s.path);
    if (!existsSync(path)) throw new HttpError(404, `Source file is offline: ${s.path}`, { offline: true });
    return { dir, path, src: s };
  };
  const analysis = (id: string, sid: string) => {
    const { dir, path } = source(id, sid), f = analysisFiles(dir, path);
    if (!isAnalyzed(f)) throw new HttpError(409, `Source "${sid}" is not analyzed yet (POST /api/projects/${id}/analyze)`);
    return f;
  };

  r.post('/api/projects/:id/analyze', async (_req, res, { id }) => {
    const dir = store.dir(id), p = store.read(id);
    const jobs: JobInfo[] = [], extras: JobInfo[] = [], missing: string[] = [];
    for (const [sid, s] of Object.entries(p.sources)) {
      const path = resolve(dir, s.path);
      if (!existsSync(path)) { missing.push(sid); continue; }
      if (!analysisDone(analysisFiles(dir, path), path)) shareAnalysis(dir, path);   // the same footage analysed in another project: nothing to queue
      let basic: JobInfo | undefined;
      if (!analysisDone(analysisFiles(dir, path), path) && !queue.active('analyze', id).some((j) => j.label === sid)) {
        basic = queue.add('analyze', id, sid, async (ctx) => {
          await analyzeSource(dir, path, { signal: ctx.signal, onStep: (step, i, n) => ctx.progress(i / n, step) });
          return { source: sid };
        });
        jobs.push(basic);
      }
      // sheets and transcript (spec 2026-10-14 §7): after the basic analysis; a failure here leaves the rest usable
      if (opts.extras !== false && !failedBefore('extras', path) && !(await extrasDone(dir, path)) && !queue.active('extras', id).some((j) => j.label === sid)) {
        const job: JobInfo = queue.add('extras', id, sid, async (ctx) => {
          // a cancelled or failed analysis stops these too: sourceExtras would otherwise run the whole analysis again itself
          const b = basic && (await queue.wait(basic.id));
          if (b && b.status === 'cancelled') { queue.cancel(job.id); return { source: sid }; }
          if (b && b.status !== 'done') throw new Error(`素材分析沒有完成：${b.error ?? b.status}`);
          await remembered('extras', path, ctx.signal, () => sourceExtras(dir, path, { label: sid, signal: ctx.signal, onStep: (step, i, n) => ctx.progress(i / n, step) }));
          return { source: sid };
        }, { background: true });
        extras.push(job);
      }
    }
    for (const [mid, m] of Object.entries(p.media)) {
      const path = resolve(dir, m.path);
      if (!existsSync(path) || existsSync(musicFiles(dir, path).beats) || failedBefore('beats', path) || queue.active('beats', id).some((j) => j.label === mid)) continue;
      extras.push(queue.add('beats', id, mid, async (ctx) => { await remembered('beats', path, ctx.signal, () => musicBeats(dir, path, { signal: ctx.signal })); return { media: mid }; }, { background: true }));
    }
    // the page chat may have ended its turn waiting for this (a transcript takes minutes): tell it when all of it is over, and
    // how each job ended (one that failed or was cancelled is not "done")
    const started = [...jobs, ...extras];
    if (started.length && opts.onAnalyzed) { const since = Date.now(); void Promise.allSettled(started.map((j) => queue.wait(j.id)))
      .then((all) => opts.onAnalyzed!(id, since, all.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : []))))
      .catch((e) => console.warn(`after the analysis of ${id}: ${(e as Error).message}`)); }   // unhandled, it ends the server
    sendJson(res, 202, { jobs, missing, extras });
  });

  r.get('/api/projects/:id/media/proxy/:source', (req, res, { id, source: sid }) => sendFile(req, res, analysis(id, sid).proxy));
  r.get('/api/projects/:id/media/thumbs/:source', (_req, res, { id, source: sid }) =>
    sendJson(res, 200, { ...JSON.parse(readFileSync(analysis(id, sid).thumbIndex, 'utf8')), url: `/api/projects/${encodeURIComponent(id)}/media/thumbs/${encodeURIComponent(sid)}/image` }));
  r.get('/api/projects/:id/media/thumbs/:source/image', (req, res, { id, source: sid }) => sendFile(req, res, analysis(id, sid).thumbs));
  r.get('/api/projects/:id/media/peaks/:source', (req, res, { id, source: sid }) => sendFile(req, res, analysis(id, sid).peaks));
  r.get('/api/projects/:id/media/cuts/:source', (req, res, { id, source: sid }) => sendFile(req, res, analysis(id, sid).cuts));

  r.get('/api/projects/:id/media/audio', async (req, res, { id }, url) => {
    const sid = url.searchParams.get('source') ?? '', a0 = num(url, 'in'), b0 = num(url, 'out');
    const { dir, path, src } = source(id, sid);
    if (!(a0 >= 0 && a0 < src.duration && b0 > a0)) throw new HttpError(400, `Audio range ${a0}–${b0} s is outside source "${sid}" (0–${src.duration} s)`);
    const a = Math.max(0, a0 - AUDIO_PAD), b = Math.min(src.duration, b0 + AUDIO_PAD);
    let made = false;
    const file = await cached(dir, path, `audio|${a.toFixed(4)}|${b.toFixed(4)}`, 'wav', async (tmp) => { made = true; await cutAudio({ src: path, ref: { source: sid, in: a, out: b }, out: tmp }); });
    if (made) pruneAudioCache(dirname(file), file);
    else try { const now = new Date(); utimesSync(file, now, now); } catch { /* the pruning order just stays older */ }
    sendFile(req, res, file);
  });

  // a photo for the preview: upright, at most 1920 px (spec 2026-10-14 §5); made on first request, then cached
  r.get('/api/projects/:id/media/image/:source', async (req, res, { id, source: sid }) => {
    const { dir, path, src } = source(id, sid);
    if (src.kind !== 'image') throw new HttpError(400, `Source "${sid}" is not a photo`);
    const file = await cached(dir, path, 'image|1920', 'jpg', async (tmp) => { await fitImage(path, tmp, 1920, 1920); });
    sendFile(req, res, file);
  });

  // music by media id: its path may leave the project folder (like sources); /files/ only serves inside it
  r.get('/api/projects/:id/media/music/:media', (req, res, { id, media: mid }) => {
    const dir = store.dir(id), all = store.read(id).media, m = Object.hasOwn(all, mid) ? all[mid] : undefined;
    if (!m) throw new HttpError(404, `No media "${mid}" in project "${id}"`);
    const path = resolve(dir, m.path);
    if (!existsSync(path)) throw new HttpError(404, `Media file is offline: ${m.path}`, { offline: true });
    sendProjectFile(req, res, path);
  });

  r.get('/api/projects/:id/media/music-peaks/:media', async (req, res, { id, media: mid }) => {
    const dir = store.dir(id), all = store.read(id).media, m = Object.hasOwn(all, mid) ? all[mid] : undefined;
    if (!m) throw new HttpError(404, `No media "${mid}" in project "${id}"`);
    const path = resolve(dir, m.path);
    if (!existsSync(path)) throw new HttpError(404, `Media file is offline: ${m.path}`, { offline: true });
    const file = await cached(dir, path, `music-peaks|${PEAK_RATE}`, 'json', async (tmp) => {
      const { stdout } = await ffmpeg(['-i', path, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { stdout: true });
      writeFileSync(tmp, JSON.stringify({ rate: PEAK_RATE, peaks: peaksOf(stdout, 8000) }));
    });
    sendFile(req, res, file);
  });

  r.get('/api/projects/:id/media/transcript/:source', (req, res, { id, source: sid }) => {
    const { dir, path } = source(id, sid), tr = readTranscript(dir, path);
    if (!tr) throw new HttpError(409, `No transcript for "${sid}" yet (POST /api/projects/${id}/analyze)`);
    sendJson(res, 200, tr);
  });
  r.get('/api/projects/:id/media/sheet/:source/:n', (req, res, { id, source: sid, n }) => {
    const { dir, path } = source(id, sid), f = extrasFiles(dir, path);
    if (!/^[1-9]\d*$/.test(n)) throw new HttpError(400, 'Sheet number must be 1 or more');
    if (!existsSync(f.sheets)) throw new HttpError(409, `No contact sheets for "${sid}" yet`);
    if (!existsSync(f.sheet(Number(n)))) throw new HttpError(404, `No sheet ${n} for "${sid}"`);
    sendFile(req, res, f.sheet(Number(n)));
  });
  // the titles outside sources gave what was downloaded (media/assets.json), by source or music id: the Media panel shows them
  r.get('/api/projects/:id/media/titles', (_req, res, { id }) => {
    const out: Record<string, string> = {};
    for (const a of readAssetRecords(store.dir(id))) { const key = a.sourceId ?? a.mediaId; if (key && a.title) out[key] = a.title; }
    sendJson(res, 200, out);
  });
  r.get('/api/projects/:id/media/beats/:media', (req, res, { id, media: mid }) => {
    const dir = store.dir(id), all = store.read(id).media, m = Object.hasOwn(all, mid) ? all[mid] : undefined;
    if (!m) throw new HttpError(404, `No media "${mid}" in project "${id}"`);
    const f = musicFiles(dir, resolve(dir, m.path)).beats;
    if (!existsSync(f)) throw new HttpError(409, `No beats for "${mid}" yet`);
    // music whose source lists its tempo (assets get) shows the beats cut.ts uses, checked against it (review M-9)
    const bpm = readAssetRecords(dir).find((r) => r.path === m.path.replace(/\\/g, '/') && r.bpm)?.bpm;
    if (!bpm) return sendFile(req, res, f);
    sendJson(res, 200, correctBeats(JSON.parse(readFileSync(f, 'utf8')) as Beats, bpm));
  });

  r.get('/api/projects/:id/media/still', async (req, res, { id }, url) => {
    const sid = url.searchParams.get('source') ?? '', t = num(url, 't');
    const { dir, path, src } = source(id, sid);
    if (!(t >= 0 && t < src.duration)) throw new HttpError(400, `t = ${t} s is outside source "${sid}" (0–${src.duration} s)`);
    const n = intIn(url, 'n', 1, 64);
    const ref: StillRef = { source: sid, t, w: intIn(url, 'w', 16, 3840), square: intIn(url, 'square', 16, 2048),
      strip: n !== undefined ? { n, dur: num(url, 'dur') } : undefined };
    if (ref.strip && !(ref.strip.dur > 0 && ref.strip.dur <= src.duration)) throw new HttpError(400, `Query parameter "dur" is outside 0–${src.duration} s`);
    let file: string;
    try { file = await cached(dir, path, stillKey(ref), 'jpg', (tmp) => grabStill({ src: path, ref, out: tmp })); }
    catch (e) { throw new HttpError(422, `Could not make the still: ${String((e as Error)?.message ?? e).trim().split(/\r?\n/).pop()}`); }
    sendFile(req, res, file);
  });
}
