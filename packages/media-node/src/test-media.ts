// Generated test media (never real footage), and reading a WAV back. Not a test file itself: tests in several packages import it.
import { execFile } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { ffmpeg } from './ffmpeg.ts';
import { runPy } from './py.ts';

/** A JPG whose stored pixels are left red / right blue (fixtures.py), with optional EXIF orientation, time and GPS. */
export async function makePhoto(out: string, o: { w?: number; h?: number; orientation?: number; taken?: string; gps?: [number, number]; offset?: string } = {}) {
  await runPy('fixtures.py', ['jpg', out, String(o.w ?? 1200), String(o.h ?? 900), String(o.orientation ?? 1), o.taken ?? '-', ...(o.gps ? o.gps.map(String) : []), ...(o.offset ? [`offset=${o.offset}`] : [])]);
  return out;
}

export async function makeHeic(out: string, o: { w?: number; h?: number; taken?: string } = {}) {
  await runPy('fixtures.py', ['heic', out, String(o.w ?? 800), String(o.h ?? 600), o.taken ?? '-']);
  return out;
}

/** A phone-style clip: pixels 640×360 (left red, right blue) flagged to display rotated 90°, with a tone, optional creation time. */
export async function makePhoneVideo(out: string, o: { seconds?: number; created?: string } = {}) {
  const tmp = out.replace(/\.mp4$/, '.raw.mp4'), d = String(o.seconds ?? 2);
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=red:s=640x360:r=30:d=${d},drawbox=x=320:y=0:w=320:h=360:color=blue:t=fill`,
    '-f', 'lavfi', '-i', `sine=frequency=330:duration=${d}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', tmp]);
  await ffmpeg(['-display_rotation:v:0', '90', '-i', tmp, '-c', 'copy', ...(o.created ? ['-metadata', `creation_time=${o.created}`] : []), out]);
  rmSync(tmp, { force: true });
  return out;
}

/**
 * A 3 s WebM (VP9 + Opus) written through a pipe, as a browser's MediaRecorder writes one: the muxer never goes back to write the
 * length, so its header has none. `stub`: also the same recording cut off before its first frame (it stopped before one was
 * written) — its streams, but no packet to measure: the first Cluster's header (Matroska ID 1F43B675) whole, cut before its first
 * SimpleBlock (A3).
 */
export async function makePipedWebm(out: string, o: { stub?: string } = {}) {
  const { stdout } = await ffmpeg(['-f', 'lavfi', '-i', 'testsrc=s=320x240:r=30:d=3', '-f', 'lavfi', '-i', 'sine=d=3', '-c:v', 'libvpx-vp9', '-deadline', 'realtime',
    '-cpu-used', '8', '-b:v', '300k', '-c:a', 'libopus', '-f', 'webm', '-'], { stdout: true });
  writeFileSync(out, stdout);
  if (o.stub) writeFileSync(o.stub, stdout.subarray(0, stdout.indexOf(0xa3, stdout.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75])) + 4)));
  return out;
}

/** A gray video whose sound is the system's built-in English speech saying `text` (Windows' System.Speech, macOS' say). */
export async function makeTalkingVideo(out: string, text: string) {
  const wav = out.replace(/\.mp4$/, '.speech.wav');
  // Samantha: the US English voice every Mac has; the system's default voice may be another language's
  if (process.platform === 'darwin') await promisify(execFile)('say', ['-v', 'Samantha', '-o', wav, '--data-format=LEI16@22050', text]).catch(() => promisify(execFile)('say', ['-o', wav, '--data-format=LEI16@22050', text]));
  else {
    const say = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}'); $s.Speak('${text.replace(/'/g, "''")}'); $s.Dispose()`;
    await promisify(execFile)('powershell', ['-NoProfile', '-NonInteractive', '-Command', say]);
  }
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=gray:s=640x360:r=30', '-i', wav, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out]);
  rmSync(wav, { force: true });
  return out;
}

/** A click track (a short decaying 900 Hz tone with a low thump on every beat) as a 16-bit mono WAV. */
export async function makeClicks(out: string, o: { bpm?: number; seconds?: number } = {}) {
  const sr = 44100, n = Math.round(sr * (o.seconds ?? 12)), period = 60 / (o.bpm ?? 120), data = Buffer.alloc(44 + n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / sr, ph = t % period, env = Math.exp(-40 * ph);
    const v = env * (0.5 * Math.sin(2 * Math.PI * 900 * t) + 0.5 * Math.sin(2 * Math.PI * 60 * t));
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 30000), 44 + i * 2);
  }
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8); data.write('fmt ', 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(sr, 24);
  data.writeUInt32LE(sr * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 2, 40);
  writeFileSync(out, data);
  return out;
}

/** A 16-bit PCM WAV as samples per channel (-1…1): what a test checks a cut, a mix or a score by */
export function readWav(buf: Buffer) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file');
  let o = 12, channels = 0, sampleRate = 0, bits = 0, data: Buffer | null = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') { channels = buf.readUInt16LE(o + 10); sampleRate = buf.readUInt32LE(o + 12); bits = buf.readUInt16LE(o + 22); }
    if (id === 'data') data = buf.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size % 2);
  }
  if (!data || bits !== 16) throw new Error('Only 16-bit PCM WAV is supported');
  const frames = data.length / (2 * channels);
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) out[c][i] = data.readInt16LE((i * channels + c) * 2) / 32768;
  return { sampleRate, channels, frames, data: out };
}
