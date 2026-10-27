import { wavDuration } from './wav.ts';

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
