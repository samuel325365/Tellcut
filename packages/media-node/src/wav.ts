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
/** Port of the original norm(): RMS over every 7th sample of channel 0, gain capped at 6. */
export function rmsNorm(d: Float32Array, target: number): number {
  let s = 0;
  for (let i = 0; i < d.length; i += 7) s += d[i] * d[i];
  const rms = Math.sqrt(s / (d.length / 7)) || 1e-4;
  return Math.min(6, target / rms);
}
/** Seconds of audio in a PCM WAV file from its header alone (any bit depth), or null when it is not one. */
export function wavDuration(buf: Buffer): number | null {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let o = 12, byteRate = 0;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ' && o + 16 <= buf.length) byteRate = buf.readUInt32LE(o + 16);
    if (id === 'data') return byteRate > 0 ? Math.min(size, buf.length - o - 8) / byteRate : null;
    o += 8 + size + (size % 2);
  }
  return null;
}

/** 16-bit PCM as the player hands it out: channels, rate and length in sample frames */
export interface PcmFormat { channels: number; sampleRate: number; frames: number }
/** A RIFF size field is 32 bits: data past this cannot be described (about 6.2 h of 48 kHz stereo 16-bit) */
export const WAV_MAX_DATA = 0xffffffff - 36;
/** frames per slice read from the page: 4 MB of stereo PCM, 5.6 MB as base64 */
export const WAV_SLICE_FRAMES = 1 << 20;

/** Why a film this long cannot have its mix written as a WAV (48 kHz stereo 16-bit, as the player renders it), or null. */
export function wavTooLong(seconds: number, f: Omit<PcmFormat, 'frames'> = { channels: 2, sampleRate: 48000 }): string | null {
  const bytes = Math.ceil(seconds * f.sampleRate) * f.channels * 2;
  if (bytes <= WAV_MAX_DATA) return null;
  const max = WAV_MAX_DATA / (f.channels * 2 * f.sampleRate) / 3600;
  return `The film is ${(seconds / 3600).toFixed(2)} h long: its mix would not fit in a WAV file (at most ${max.toFixed(1)} h of ${f.sampleRate / 1000} kHz ${f.channels === 2 ? 'stereo' : `${f.channels}-channel`} 16-bit). Split it into shorter projects.`;
}

/** The 44-byte header of a 16-bit PCM WAV holding `f`; throws when the data would pass WAV_MAX_DATA. */
export function wavHeader(f: PcmFormat): Buffer {
  const data = f.frames * f.channels * 2;
  if (data > WAV_MAX_DATA) throw new Error(wavTooLong(f.frames / f.sampleRate, f) ?? 'The mix does not fit in a WAV file');
  const b = Buffer.alloc(44);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + data, 4); b.write('WAVE', 8, 'ascii'); b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(f.channels, 22); b.writeUInt32LE(f.sampleRate, 24);
  b.writeUInt32LE(f.sampleRate * f.channels * 2, 28); b.writeUInt16LE(f.channels * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(data, 40);
  return b;
}

/** Writes a WAV of `f` through `write`: the header once, then the PCM a slice of whole frames at a time from `slice`
 *  (each checked for its exact size, so a short or misaligned slice fails here instead of shifting every sample after it).
 *  Never holds more than one slice. `silent`: every sample was digital zero. */
export async function pullWav(f: PcmFormat, slice: (from: number, frames: number) => Promise<Buffer>, write: (b: Buffer) => void | Promise<void>,
  sliceFrames = WAV_SLICE_FRAMES): Promise<{ silent: boolean }> {
  if (!(sliceFrames >= 1) || !Number.isInteger(sliceFrames)) throw new Error(`Bad WAV slice size: ${sliceFrames}`);
  await write(wavHeader(f));
  let silent = true;
  for (let from = 0; from < f.frames; from += sliceFrames) {
    const n = Math.min(sliceFrames, f.frames - from), b = await slice(from, n);
    if (b.length !== n * f.channels * 2) throw new Error(`WAV slice at frame ${from}: ${b.length} bytes, expected ${n * f.channels * 2}`);
    if (silent) for (let i = 0; i < b.length; i++) if (b[i] !== 0) { silent = false; break; }
    await write(b);
  }
  return { silent };
}
