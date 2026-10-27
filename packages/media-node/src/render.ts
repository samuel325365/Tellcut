// Frame-exact renderer shared by tools/render.ts and the Tellcut server: serves the tellcut folder, drives the player
// in headless Chrome, pipes every frame into ffmpeg, renders the WebAudio mix offline and muxes the final MP4.
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { createStaticServer } from './static-server.ts';
import { readWav } from './wav.ts';
import { abortError, ffmpegProcess, measureLoudness, run } from './ffmpeg.ts';
import { TELLCUT_ROOT } from './paths.ts';
import { chromePath } from './deps.ts';


/** a text item's boxes on screen, in project pixels */
export interface TextBox { id: string; rects: Array<{ x: number; y: number; w: number; h: number }> }
/** loudness: the integrated loudness an export of this page is normalised to (LUFS);
 *  layout(): the words on screen after the last frame() (Tellcut player only), in project pixels */
export interface PageSession { fps: number; duration: number; loudness: number; version: string; frame(n: number): Promise<void>; png(): Promise<Buffer>; jpeg(): Promise<Buffer>; wav(): Promise<Buffer>; layout(): Promise<TextBox[]>; close(): Promise<void> }
export interface PlayerTarget { project: string; media: 'cache'; index?: string }

export const playerUrl = (t: PlayerTarget) =>
  `/apps/player/dist/index.html?project=${t.project}&mode=render&media=${t.media}` + (t.index ? `&index=${t.index}` : '');
export const projectTarget = (projectId: string, media: 'cache' = 'cache'): PlayerTarget => ({ project: `/projects/${projectId}/project.json`, media });
export const playerPath = (projectId: string, media: 'cache' = 'cache') => playerUrl(projectTarget(projectId, media));

/** The site path (as served by openPage) of a directory inside tellcut/. */
export function sitePath(absDir: string): string {
  const rel = relative(TELLCUT_ROOT, absDir);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Not under the tellcut folder: ${absDir}`);
  return '/' + rel.split(sep).join('/');
}

/** Resolves with `p` unless `signal` aborts or `ms` passes first. */
function guard<T>(p: Promise<T>, o: { signal?: AbortSignal; ms: number; what: string }): Promise<T> {
  return new Promise<T>((res, rej) => {
    if (o.signal?.aborted) return rej(abortError());
    const timer = setTimeout(() => rej(new Error(`${o.what} timed out after ${o.ms / 1000} s`)), o.ms);
    const onAbort = () => rej(abortError());
    o.signal?.addEventListener('abort', onAbort, { once: true });
    p.then(res, rej).finally(() => { clearTimeout(timer); o.signal?.removeEventListener('abort', onAbort); });
  });
}

/** The stage size of a player target, from its project file (its meta width × height); undefined when it cannot be read. */
export function stageSizeOf(t: PlayerTarget): { w: number; h: number } | undefined {
  try {
    const meta = JSON.parse(readFileSync(join(TELLCUT_ROOT, t.project.replace(/^\//, '')), 'utf8')).meta;
    return Number.isFinite(meta?.width) && Number.isFinite(meta?.height) ? { w: meta.width, h: meta.height } : undefined;
  } catch { return undefined; }
}

/** `size`: the stage size when it is known (the project's): the page opens at it directly, without a first page to measure it. */
export async function openPage(path: string, api: '__tellcut' | '__app', o: { signal?: AbortSignal; readyTimeout?: number; size?: { w: number; h: number } } = {}): Promise<PageSession> {
  if (api === '__tellcut' && !existsSync(join(TELLCUT_ROOT, 'apps/player/dist/index.html'))) throw new Error('Player not built: run `npm run build:player` in tellcut/');
  if (o.signal?.aborted) throw abortError();
  const server = createStaticServer(TELLCUT_ROOT);
  const port = await server.listen(0);
  const launching = chromium.launch({ executablePath: chromePath(), headless: true,
    // --disable-lcd-text: video frames must use grayscale text AA (subpixel fringes become colour noise when encoded)
    args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-lcd-text'] });
  let browser: Awaited<typeof launching>;
  // starting Chrome is cancellable too (under load it takes seconds); one that comes up after the cancel is closed
  try { browser = await guard(launching, { signal: o.signal, ms: 120000, what: 'Starting Chrome' }); }
  catch (e) { void launching.then((b) => b.close()).catch(() => {}); await server.close(); throw e; }
  try {
    const url = `http://127.0.0.1:${port}${path}`;
    // navigation too stays cancellable: under load a page load can take long, and the player waits for itself below
    const load = { signal: o.signal, ms: o.readyTimeout ?? 300000, what: 'Player loading' };
    // The page must open AT the stage size: resizing a headless page afterwards lets Chrome on Windows clamp captures
    // to the window size (1920×1080 came out as 1898×982). Unknown size: measure it on a throwaway page first.
    const measure = async () => {
      const probe = await browser.newPage({ viewport: { width: 1920, height: 1920 }, deviceScaleFactor: 1 });
      // until its project loads the stage is an empty block as wide as the window and 0 high: wait for both sides
      await guard(probe.goto(url, { waitUntil: 'domcontentloaded' }), load);
      const sized = probe.waitForFunction(() => { const s = document.getElementById('stage'); return !!s && s.offsetWidth > 0 && s.offsetHeight > 0; }, null, { timeout: 0 });
      // a player that fails to load never sizes its stage: its own error ends the wait instead of the timeout
      const failed = probe.waitForFunction((a) => !!(window as any)[a]?.ready, api, { timeout: 0 })
        .then(() => probe.evaluate((a) => (window as any)[a].ready, api)).then(() => new Promise<never>(() => {}));
      sized.catch(() => {}); failed.catch(() => {});
      await guard(Promise.race([sized, failed]), load);
      const s = await probe.evaluate(() => { const el = document.getElementById('stage')!; return { w: el.offsetWidth, h: el.offsetHeight }; });
      await probe.close();
      return s;
    };
    const size = o.size ?? await measure();
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    // a missing file is reported with its address (the console's own line does not say which file)
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().startsWith('Failed to load resource')) console.log('[page]', m.text()); });
    page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[page]', `${r.status()} ${decodeURIComponent(new URL(r.url()).pathname)}`); });
    await guard(page.goto(url, { waitUntil: 'domcontentloaded' }), load);
    // an export must stay cancellable while the player loads, and must not wait forever on it
    await guard(page.evaluate((a) => (window as any)[a].ready, api), { signal: o.signal, ms: o.readyTimeout ?? 300000, what: 'Player loading' });
    const { fps, duration, loudness } = await page.evaluate((a) => ({ fps: (window as any)[a].fps, duration: (window as any)[a].duration, loudness: (window as any)[a].loudness }), api);
    const cdp = await page.context().newCDPSession(page);
    const shot = async (format: 'png' | 'jpeg') =>
      Buffer.from((await cdp.send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? 95 : undefined, optimizeForSpeed: true } as any)).data, 'base64');
    return {
      fps, duration, loudness: typeof loudness === 'number' ? loudness : -14, version: browser.version(),
      frame: (n) => page.evaluate(([a, k]) => (window as any)[a].frame(k), [api, n] as const).catch((e: Error) => { throw new Error(`frame ${n}: ${e.message}`); }),
      png: () => shot('png'),
      jpeg: () => shot('jpeg'),
      wav: async () => Buffer.from(await page.evaluate((a) => (window as any)[a].wav(), api), 'base64'),
      layout: () => page.evaluate((a) => (window as any)[a].layout(), api),
      close: async () => { await browser.close(); await server.close(); },
    };
  } catch (e) {
    // a cancel is answered at once (closing Chrome under load takes seconds); Chrome and the server still close, behind it
    if (o.signal?.aborted) { void browser.close().catch(() => {}).then(() => server.close()); throw e; }
    await browser.close(); await server.close();
    throw e;
  }
}

/** The bitrate the video may not pass, in kbit/s: CRF 16 alone gave full-frame grain or noise several times the usual size (a
 *  film of an ordinary picture stays well under it). 24 Mbit/s for 1080p30, by pixels and above 30 fps by frame rate. */
export function maxRateKbps(w: number, h: number, fps: number): number {
  return Math.max(4000, Math.round((24_000 * (w * h)) / (1920 * 1080) * Math.max(1, fps / 30)));
}

/** JPEG frames → libx264. write() waits for back-pressure; end() resolves only on exit code 0. */
function encoder(out: string, fps: number, size: { w: number; h: number } | undefined, signal?: AbortSignal) {
  const k = size ? maxRateKbps(size.w, size.h, fps) : undefined;
  const { proc, done, kill } = ffmpegProcess(['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', ...(k ? ['-maxrate', `${k}k`, '-bufsize', `${2 * k}k`] : []), '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-movflags', '+faststart', out], { signal, stdin: true, label: 'encoder' });
  done.catch(() => {});   // observed through write()/end()
  const stdin = proc.stdin!;
  return {
    async write(buf: Buffer) {
      if (!stdin.write(buf)) await Promise.race([new Promise((r) => stdin.once('drain', r)), done]);
    },
    async end() { stdin.end(); await done; },
    kill,
  };
}

/**
 * Mastering: the mix is turned up (or down) to the target loudness and an oversampled limiter keeps its peaks under a ceiling,
 * then the encoded file is measured and the gain or ceiling corrected, at most 4 encodes. loudnorm did this before: in one pass
 * it squeezes the whole film (LRA 17.6 → 11.4 on wedding-short) and, held under its true-peak ceiling, peaky mixes landed
 * 0.5–2 LUFS short (-15.6 on podcast-quote, -15.3..-16 on the food shorts); now six films land at -14.0..-14.2 under -1 dBTP,
 * limited by more than 1 dB 0–4 % of the time. The AAC encoder overshoots a peak by up to 2 dB, so a file over -1 dBTP
 * (platforms' limit) is encoded again with the ceiling 1.5 dB lower. Returns what the last encode used.
 */
export async function master(target: number, input: number, encode: (gain: number, ceiling: number) => Promise<void>,
  measure: () => Promise<{ lufs: number; peak?: number } | null>): Promise<{ gain: number; ceiling: number; passes: number }> {
  let gain = Math.round((target - input) * 10) / 10, ceiling = -1.5;
  for (let passes = 1; ; passes++) {
    await encode(gain, ceiling);
    const m = await measure();
    const over = m?.peak !== undefined && m.peak > -1, off = m ? target - m.lufs : 0;
    if (!m || passes === 4 || (!over && Math.abs(off) <= 0.5)) return { gain, ceiling, passes };
    if (over) ceiling -= 1.5;
    if (Math.abs(off) > 0.5) gain = Math.round((gain + off) * 10) / 10;
  }
}
/** the mastering chain: gain, then a limiter at 4× the rate so it catches the peaks between samples too */
export const masterFilter = (gain: number, ceiling: number) =>
  `volume=${gain}dB,aresample=192000,alimiter=limit=${(10 ** (ceiling / 20)).toFixed(4)}:attack=3:release=60:level=0:latency=1,aresample=48000`;

export interface RenderOpts {
  target: PlayerTarget; out: string; from?: number; to?: number;
  signal?: AbortSignal; onProgress?: (frame: number, total: number) => void; log?: (line: string) => void;
}

export async function renderVideo(o: RenderOpts): Promise<string> {
  const log = o.log ?? console.log;
  mkdirSync(dirname(o.out), { recursive: true });
  // the intermediates sit next to the output whatever it is called (an `out` without .mp4 made the video pass write onto it)
  const stem = o.out.replace(/\.mp4$/i, ''), vOut = `${stem}.video.mp4`, wav = `${stem}.mix.wav`;
  const size = stageSizeOf(o.target), s = await openPage(playerUrl(o.target), '__tellcut', { signal: o.signal, size });
  let enc: ReturnType<typeof encoder> | undefined;
  let ok = false;
  try {
    log(`chrome ${s.version}`);
    const f0 = Math.round((o.from ?? 0) * s.fps), f1 = Math.round((o.to ?? s.duration) * s.fps);
    if (!(f1 > f0)) throw new Error(`Empty range: ${o.from ?? 0}–${o.to ?? s.duration} s`);
    enc = encoder(vOut, s.fps, size, o.signal);
    const t0 = Date.now();
    for (let n = f0; n < f1; n++) {
      if (o.signal?.aborted) throw abortError();
      await s.frame(n);
      await enc.write(await s.jpeg());
      o.onProgress?.(n - f0 + 1, f1 - f0);
      if ((n - f0) % 60 === 0) log(`frame ${n}/${f1}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    await enc.end();
    const wavBuf = await s.wav();
    writeFileSync(wav, wavBuf);
    // digital silence has no loudness to bring to the target (and the AAC encoder rejects what the chain makes of it)
    const silent = readWav(wavBuf).data.every((ch) => ch.every((v) => v === 0));
    const partial = f0 > 0 || f1 < Math.round(s.duration * s.fps);
    const range = partial ? ['-ss', (f0 / s.fps).toFixed(4), '-t', ((f1 - f0) / s.fps).toFixed(4)] : [];
    const mux = (af?: string) => run(['-i', vOut, ...range, '-i', wav, ...(af ? ['-af', af] : []), '-ar', '48000',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', o.out], { signal: o.signal });
    const input = silent ? null : (await measureLoudness(wav, { signal: o.signal }))?.lufs;
    if (input === null || input === undefined || input < -70) await mux();
    else {
      const m = await master(s.loudness, input, (gain, ceiling) => mux(masterFilter(gain, ceiling)), () => measureLoudness(o.out, { signal: o.signal }));
      log(`loudness: ${input.toFixed(1)} LUFS mix, gain ${m.gain} dB, ceiling ${m.ceiling} dB, ${m.passes} encode${m.passes > 1 ? 's' : ''}`);
    }
    ok = true;
    return o.out;
  } finally {
    enc?.kill();
    await s.close();
    // a cleanup failure (e.g. a directory in the way) must not mask the render error
    for (const f of [vOut, wav, ...(ok ? [] : [o.out])]) try { rmSync(f, { force: true }); } catch { /* not a removable file */ }
  }
}
