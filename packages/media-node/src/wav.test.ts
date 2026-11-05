import { pcm16 } from '@tellcut/engine';
import { readWav } from './test-media.ts';
import { pullWav, WAV_MAX_DATA, wavDuration, wavHeader, wavTooLong, type PcmFormat } from './wav.ts';

/** a PCM WAV header (+ data) with an extra chunk before the data, as some writers add */
const wav = (frames: number, o: { sr?: number; channels?: number; bits?: number; list?: boolean } = {}) => {
  const sr = o.sr ?? 48000, ch = o.channels ?? 1, bits = o.bits ?? 16, size = frames * ch * (bits / 8), extra = o.list ? 12 : 0;
  const b = Buffer.alloc(44 + extra + size);
  b.write('RIFF', 0); b.writeUInt32LE(36 + extra + size, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * ch * (bits / 8), 28); b.writeUInt16LE(ch * (bits / 8), 32); b.writeUInt16LE(bits, 34);
  let o2 = 36;
  if (o.list) { b.write('LIST', o2); b.writeUInt32LE(4, o2 + 4); b.write('INFO', o2 + 8); o2 += 12; }
  b.write('data', o2); b.writeUInt32LE(size, o2 + 4);
  return b;
};

test('a WAV file\'s length comes from its header, at any rate, channel count and bit depth', () => {
  expect(wavDuration(wav(48000))).toBe(1);
  expect(wavDuration(wav(22050, { sr: 44100, channels: 2 }))).toBe(0.5);
  expect(wavDuration(wav(12000, { bits: 24, list: true }))).toBe(0.25);
  expect(wavDuration(Buffer.from('ID3 not a wav file at all'))).toBe(null);
});

/** the WAV the player built in one piece before export read it in slices (its old encodeWavBase64, decoded): the reference */
function wholeWav(ch: Float32Array[], sampleRate: number): Buffer {
  const n = ch[0].length, bytes = 44 + n * ch.length * 2, dv = new DataView(new ArrayBuffer(bytes));
  const ws = (o: number, t: string) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch.length, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * ch.length * 2, true); dv.setUint16(32, ch.length * 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * ch.length * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (const d of ch) { const v = Math.max(-1, Math.min(1, d[i])); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return Buffer.from(dv.buffer);
}
/** a page's mix as the player keeps it: 3 channels (6-byte frames: a slice cut by bytes or by 4 lands mid-frame), 101 frames */
const channels = [0, 1, 2].map((c) => Float32Array.from({ length: 101 }, (_, i) => Math.sin(i * 0.37 + c) * (c === 2 ? 1.3 : 0.8)));
const mix = { numberOfChannels: 3, length: 101, sampleRate: 44100, getChannelData: (c: number) => channels[c] };
const fmt: PcmFormat = { channels: 3, sampleRate: 44100, frames: 101 };
const pull = async (sliceFrames?: number, slice = async (from: number, n: number) => Buffer.from(pcm16(mix, from, n))) => {
  const parts: Buffer[] = [], asked: Array<[number, number]> = [];
  const r = await pullWav(fmt, async (from, n) => { asked.push([from, n]); return slice(from, n); }, (b) => { parts.push(b); }, sliceFrames);
  return { wav: Buffer.concat(parts), asked, ...r };
};

test('a WAV read in slices is byte for byte the one built whole, at any slice size', async () => {
  const ref = wholeWav(channels, 44100);
  for (const size of [1, 7, 100, 101, 1000, undefined]) expect((await pull(size)).wav.equals(ref)).toBe(true);
  // whole frames, in order, the last one short
  expect((await pull(7)).asked).toEqual([...Array(15).keys()].map((i) => [i * 7, i < 14 ? 7 : 3]));
  const back = readWav((await pull(7)).wav);
  expect([back.channels, back.sampleRate, back.frames]).toEqual([3, 44100, 101]);
});

test('a slice of the wrong size fails instead of shifting every sample after it', async () => {
  await expect(pull(10, async (from, n) => Buffer.from(pcm16(mix, from, n)).subarray(1))).rejects.toThrow(/WAV slice at frame 0: 59 bytes, expected 60/);
  // a page that cut by bytes (4 per stereo frame) instead of whole frames of 3 channels
  await expect(pull(10, async (from, n) => Buffer.from(pcm16(mix, 0, 101)).subarray(from * 4, (from + n) * 4))).rejects.toThrow(/expected 60/);
});

test('silence is told from the samples as they pass', async () => {
  const zero = async (_: number, n: number) => Buffer.alloc(n * 6);
  expect((await pull(7, zero)).silent).toBe(true);
  // one sample in the last slice
  expect((await pull(7, async (from, n) => { const b = Buffer.alloc(n * 6); if (from + n === 101) b[b.length - 1] = 1; return b; })).silent).toBe(false);
  expect((await pull(7)).silent).toBe(false);
});

test('a mix past what a WAV header can say is refused with the length it can hold', () => {
  const most = Math.floor(WAV_MAX_DATA / 4);
  expect(wavHeader({ channels: 2, sampleRate: 48000, frames: most }).readUInt32LE(4)).toBe(36 + most * 4);
  expect(() => wavHeader({ channels: 2, sampleRate: 48000, frames: most + 1 })).toThrow(/at most 6.2 h of 48 kHz stereo 16-bit/);
  expect(wavTooLong(6 * 3600)).toBe(null);
  expect(wavTooLong(40 * 60)).toBe(null);
  expect(wavTooLong(6.3 * 3600)).toMatch(/^The film is 6.30 h long/);
});
