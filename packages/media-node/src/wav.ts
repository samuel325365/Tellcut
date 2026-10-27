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
