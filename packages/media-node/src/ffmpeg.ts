import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { AudioRef, MediaRef, StillRef } from '@tellcut/engine';
import { ffmpegPath, ffprobePath } from './deps.ts';

export const abortError = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });
export const tail = (s: string, n: number) => s.trimEnd().split(/\r?\n/).slice(-n).join('\n');

export interface FfOpts { signal?: AbortSignal; level?: 'error' | 'info'; stdout?: boolean; cwd?: string }

/**
 * One ffmpeg process, the way every caller needs it: killed when `signal` fires (then `done` rejects with an AbortError),
 * otherwise `done` rejects with the exit code and the stderr tail. `onStdout` streams its output; `stdin: true` gives a pipe to feed.
 */
export function ffmpegProcess(args: string[], o: { signal?: AbortSignal; level?: 'error' | 'info'; cwd?: string; stdin?: boolean; onStdout?: (d: Buffer) => void; label?: string } = {}) {
  const p = spawn(ffmpegPath(), ['-hide_banner', '-v', o.level ?? 'error', '-y', ...args], { cwd: o.cwd, windowsHide: true, stdio: [o.stdin ? 'pipe' : 'ignore', o.onStdout ? 'pipe' : 'ignore', 'pipe'] });
  let err = '';
  p.stdout?.on('data', (d: Buffer) => o.onStdout!(d));
  p.stderr!.on('data', (d) => (err += d));
  p.stdin?.on('error', () => {});   // EPIPE when ffmpeg died: reported through `done`
  const kill = () => p.kill('SIGKILL');
  o.signal?.addEventListener('abort', kill, { once: true });
  const done = new Promise<string>((res, rej) => {
    p.on('error', (e) => { o.signal?.removeEventListener('abort', kill); rej(e); });
    p.on('close', (code) => {
      o.signal?.removeEventListener('abort', kill);
      if (o.signal?.aborted) rej(abortError());
      else if (code) rej(new Error(`ffmpeg${o.label ? ` (${o.label})` : ''} exit ${code}${o.label ? '' : `: ${args.join(' ')}`}\n${tail(err, 20)}`));
      else res(err);
    });
  });
  return { proc: p, done, kill };
}

/** Runs ffmpeg. Rejects with the exit code and the stderr tail, or with an AbortError (process killed) when `signal` fires. */
export async function ffmpeg(args: string[], o: FfOpts = {}): Promise<{ stdout: Buffer; stderr: string }> {
  if (o.signal?.aborted) throw abortError();
  const out: Buffer[] = [];
  const stderr = await ffmpegProcess(args, { signal: o.signal, level: o.level, cwd: o.cwd, onStdout: o.stdout ? (d) => out.push(d) : undefined }).done;
  return { stdout: Buffer.concat(out), stderr };
}
export const run = (args: string[], o: Pick<FfOpts, 'signal' | 'cwd'> = {}) => ffmpeg(args, o).then(() => {});

/**
 * The output arguments for one picture at `out`. ffmpeg's image2 muxer reads a `%d` (or `%03d`…) anywhere in an output path as
 * a frame-number pattern, so a folder named "100%done" (the tellcut folder's, or TEMP's) sent the picture to ".../1001one/..."
 * instead: an error when no such folder exists, another file when one does. `-update 1` takes the path as it is.
 */
export const oneImage = (out: string) => ['-frames:v', '1', '-update', '1', out];
/** a folder inside an image-sequence pattern: its own `%` doubled (image2 reads `%%` as one `%`), so only the pattern's counter counts */
export const patternDir = (dir: string) => dir.replaceAll('%', '%%');
/** whether ffmpeg reads `path` as a frame-number pattern, the way av_filename_number_test does: exactly one `%d` (`%03d`…), any
 *  other `%` only as `%%` (a lone `%20` makes it no pattern at all, and the path is taken as it is) */
export function isFramePattern(path: string): boolean {
  let found = false;
  for (let i = 0; i < path.length; i++) {
    if (path[i] !== '%') continue;
    while (/\d/.test(path[i + 1] ?? '')) i++;
    const c = path[++i];
    if (c === '%') continue;
    if (c !== 'd' || found) return false;
    found = true;
  }
  return found;
}
/** the pictures ffmpeg opens with its image2 demuxer (a GIF, AVIF or HEIC has a demuxer of its own, which has no pattern_type) */
const IMAGE2 = /\.(jpe?g|png|webp|bmp|tiff?)$/i;
/**
 * What ffmpeg or ffprobe needs before `path` to open it as it is. A picture whose path reads as a frame pattern (a folder named
 * "100%done") was looked for as ".../1001one/..." and not found; `-pattern_type none` takes it literally. Only then: the other
 * demuxers (a video's, a JPEG read without a pattern) refuse the option.
 */
export const literalInput = (path: string) => (IMAGE2.test(path) && isFramePattern(path) ? ['-pattern_type', 'none'] : []);
/** the input arguments for `path`, taken as it is (literalInput) */
export const inFile = (path: string) => [...literalInput(path), '-i', path];

/** ffmpeg's ebur128 filter logs a running "I:" on every line; the integrated loudness is the one after "Summary:". */
export function parseLoudness(stderr: string): { lufs: number; peak?: number } | null {
  const i = stderr.lastIndexOf('Summary:');
  if (i < 0) return null;
  const s = stderr.slice(i), m = /I:\s+(-?[\d.]+) LUFS/.exec(s), pk = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(s);
  // a silent file's peak is -inf: a peak, not an unknown one
  return m ? { lufs: +m[1], ...(pk ? { peak: pk[1] === '-inf' ? -Infinity : +pk[1] } : {}) } : null;
}
/** a file's integrated loudness and true peak (its first audio stream) */
export const measureLoudness = async (path: string, o: Pick<FfOpts, 'signal'> = {}) =>
  parseLoudness((await ffmpeg(['-nostats', '-i', path, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { ...o, level: 'info' })).stderr);

// windowsHide everywhere: a server without a console of its own (started detached) would flash a window per call
// ffprobe runs asynchronously: a synchronous call froze the whole server (every request) while it ran
const execFileP = promisify(execFile);
/** ffprobe's stdout (trimmed): the one way media-node runs ffprobe */
export const ffprobe = async (args: string[]) => (await execFileP(ffprobePath(), ['-v', 'error', ...args], { maxBuffer: 16 << 20, windowsHide: true })).stdout.toString().trim();
const probe = ffprobe;
/** A video stream's size as ffmpeg decodes it: upright, so a phone clip turned 90° swaps width and height. */
export function uprightSize(s: { width?: number; height?: number; side_data_list?: Array<{ rotation?: number }>; tags?: { rotate?: string } }) {
  const rot = Number(s.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? s.tags?.rotate ?? 0);
  return Math.abs(rot) % 180 === 90 ? { width: s.height!, height: s.width! } : { width: s.width!, height: s.height! };
}

export const probeHasAudio = async (path: string) => (await probe(['-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path])) !== '';

/** a length that is one: ffprobe says "N/A" (NaN), or nothing, for a file whose header has none */
export const lengthOrNull = (x: unknown): number | null => { const n = Number(x); return x !== undefined && x !== null && x !== '' && Number.isFinite(n) && n > 0 ? n : null; };
const PACKETS = ['-v', 'quiet', '-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0'];
/** the end of the last packet in ffprobe's `pts_time,duration_time` lines (the latest pts plus its packet's length), or null */
export function packetsEnd(lines: Iterable<string>): number | null {
  let end = 0;
  for (const l of lines) {
    const [pts, dur] = l.split(',').map(Number);
    if (Number.isFinite(pts)) end = Math.max(end, pts + (Number.isFinite(dur) ? dur : 0));
  }
  return end > 0 ? end : null;
}
/**
 * A file's length measured from its packets, for one whose header gives none: a WebM written through a pipe (a browser's
 * MediaRecorder, a screen recorder) or a recording cut off before its end was written. ffprobe only reads the packets (no
 * decoding); its lines are read as they come, as an hour of footage prints a few hundred thousand. Null when no packet has a time.
 */
export function measureDuration(path: string): Promise<number | null> {
  return new Promise((res) => {
    const p = spawn(ffprobePath(), [...PACKETS, path], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let end = 0, rest = '';
    const take = (lines: string[]) => { const e = packetsEnd(lines); if (e) end = Math.max(end, e); };
    p.stdout!.setEncoding('utf8').on('data', (d: string) => { const lines = (rest + d).split(/\r?\n/); rest = lines.pop()!; take(lines); });
    p.on('error', () => res(null));
    p.on('close', () => { take([rest]); res(end > 0 ? end : null); });
  });
}
const noLength = (path: string) => new Error(`${path}: no length in its header, and none could be measured from its packets (a recording cut off, or not a media file?)`);
/** A file's length in seconds: its header's, else measured from its packets (measureDuration); throws when neither gives one,
 *  never NaN (a NaN length made thumbGrid ask ffmpeg for a NaN-row atlas and an export cut NaN seconds) */
export async function probeDuration(path: string): Promise<number> {
  const d = lengthOrNull(await probe(['-show_entries', 'format=duration', '-of', 'csv=p=0', path])) ?? (await measureDuration(path));
  if (d === null) throw noLength(path);
  return d;
}
/** Synchronous duration probe for one-off CLI tools (importers); the server uses the async probes. Like probeDuration. */
export function probeDurationSync(path: string): number {
  const run = (args: string[]) => execFileSync(ffprobePath(), args, { windowsHide: true, maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  const d = lengthOrNull(run(['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).trim()) ?? packetsEnd(run([...PACKETS, path]).split(/\r?\n/));
  if (d === null) throw noLength(path);
  return d;
}

export async function probeSize(path: string): Promise<{ width: number; height: number }> {
  const j = JSON.parse(await probe(['-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:stream_tags=rotate', '-of', 'json', ...literalInput(path), path]));
  return uprightSize(j.streams?.[0] ?? {});
}

export function retimeFilter(speed: number, interp: 'none' | 'blend' | 'mci', fps = 30): string {
  if (speed === 1) return `fps=${fps}`;
  const pts = `setpts=(PTS-STARTPTS)/${speed}`;
  if (interp === 'mci') return `${pts},minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`;
  if (interp === 'blend') return `${pts},minterpolate=fps=${fps}:mi_mode=blend`;
  return `${pts},fps=${fps}`;
}

export const cutLength = (ref: { in: number; out: number }, sourceDuration: number) =>
  Math.min(ref.out - ref.in + 0.2, sourceDuration - ref.in - 0.02);

export async function cutVideo(o: { src: string; ref: MediaRef; out: string; crf: number; preset: string; width: number; height: number; fps: number; sourceDuration: number; signal?: AbortSignal }) {
  const len = cutLength(o.ref, o.sourceDuration), src = resolve(o.src), out = resolve(o.out);
  const input = ['-ss', String(o.ref.in), '-t', len.toFixed(3), '-i', src, '-an'];
  const encode = ['-c:v', 'libx264', '-preset', o.preset, '-crf', String(o.crf), '-g', '6', '-bf', '0', '-movflags', '+faststart', out];
  const scale = `${retimeFilter(o.ref.speed, o.ref.interp, o.fps)},scale=${o.width}:${o.height}:flags=lanczos,format=yuv420p`;
  if (!o.ref.stab) return run([...input, '-vf', scale, ...encode], { signal: o.signal });
  // vidstab matches transforms to frame numbers: the detect pass reads exactly the frames the cut reads.
  // The .trf goes next to the output under a relative name (a Windows drive colon would break the filter argument).
  const cwd = dirname(out), trf = `${basename(out)}.trf`, st = o.ref.stab;
  // `copy` first: vidstab keeps and rewrites frames in place, and a VP9 decoder reuses its frame buffers — without
  // a filter-owned copy the stabilised picture breaks into 64 px blocks
  try {
    await run([...input, '-vf', `copy,vidstabdetect=shakiness=6:accuracy=12:result=${trf}`, '-f', 'null', '-'], { signal: o.signal, cwd });
    await run([...input, '-vf', `copy,vidstabtransform=input=${trf}:smoothing=${st.smoothing}:zoom=${st.zoom}:interpol=bicubic,${scale}`, ...encode], { signal: o.signal, cwd });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new Error(`stabilise ${o.ref.source} ${o.ref.in}–${o.ref.out} s: ${(e as Error)?.message ?? e}`);
  } finally {
    rmSync(join(cwd, trf), { force: true });
  }
}
/** A source without a sound stream gives silence of the same length (a timeline audio clip of it must still play). */
export async function cutAudio(o: { src: string; ref: AudioRef; out: string; signal?: AbortSignal }) {
  if (!(await probeHasAudio(o.src)))
    return run(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', (o.ref.out - o.ref.in).toFixed(3), '-c:a', 'pcm_s16le', o.out], { signal: o.signal });
  return run(['-ss', String(o.ref.in), '-to', String(o.ref.out), '-i', o.src, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', o.out], { signal: o.signal });
}
export function grabStill(o: { src: string; ref: StillRef; out: string; signal?: AbortSignal }) {
  if (o.ref.strip) {   // filmstrip: n frames across the range, 90×120 each, tiled horizontally
    const { n, dur } = o.ref.strip;
    return run(['-ss', String(o.ref.t), '-t', dur.toFixed(3), '-i', o.src, '-vf', `fps=${n}/${dur},scale=-2:120,crop=90:120,tile=${n}x1`, '-q:v', '4', ...oneImage(o.out)], { signal: o.signal });
  }
  const vf = o.ref.square ? `scale=-2:${o.ref.square},crop=${o.ref.square}:${o.ref.square}` : o.ref.w ? `scale=${o.ref.w}:-2` : 'null';
  // no seek at 0 s, nor in a photo: seeking a phone JPG (one frame at pts 0) to 0 s drops that frame and ffmpeg still exits 0
  const seek = o.ref.t > 0 && !PHOTO.test(o.src) ? ['-ss', String(o.ref.t)] : [];
  return run([...seek, ...inFile(o.src), '-vf', vf, '-q:v', '2', ...oneImage(o.out)], { signal: o.signal }).then(() => {
    if (!existsSync(o.out)) throw new Error(`no still at ${o.ref.t} s in ${o.src}: ffmpeg wrote no frame`);
  });
}
const PHOTO = /.(jpe?g|png|webp|bmp|tiff?|gif|heic|heif|avif)$/i;
