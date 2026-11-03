/** What renderWav() keeps for export: the rendered mix, read out in slices of whole sample frames (a long film's WAV as one
 *  base64 string passed V8's string limit at about 35 minutes; the header is written by media-node, from these sizes). */
export interface PcmSource { numberOfChannels: number; length: number; sampleRate: number; getChannelData(c: number): Float32Array }

/** Frames [from, from + frames) of `buf` (clamped to its end) as interleaved 16-bit little-endian PCM —
 *  the conversion of wavBase64() from the original projects. */
export function pcm16(buf: PcmSource, from: number, frames: number): Uint8Array {
  const ch = buf.numberOfChannels, a = Math.max(0, Math.min(buf.length, from)), b = Math.max(a, Math.min(buf.length, from + frames));
  const dv = new DataView(new ArrayBuffer((b - a) * ch * 2));
  const data = [...Array(ch).keys()].map((c) => buf.getChannelData(c));
  let o = 0;
  for (let i = a; i < b; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Uint8Array(dv.buffer);
}

export function bytesToBase64(u8: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(bin);
}
