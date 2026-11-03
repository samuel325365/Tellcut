import { bytesToBase64, pcm16 } from './wav.ts';

const buf = (ch: Float32Array[]) => ({ numberOfChannels: ch.length, length: ch[0].length, sampleRate: 48000, getChannelData: (c: number) => ch[c] });

test('pcm16 interleaves 16-bit little-endian PCM, clipped to ±1', () => {
  const b = Buffer.from(pcm16(buf([new Float32Array([0, 1, -1, 2]), new Float32Array([0.5, -0.5, 0, -3])]), 0, 4));
  expect(b.length).toBe(16);
  expect([...Array(8).keys()].map((i) => b.readInt16LE(i * 2))).toEqual([0, 16383, 32767, -16384, -32768, 0, 32767, -32768]);
});

test('pcm16 slices whole frames and stops at the end of the buffer', () => {
  const ch = [new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]), new Float32Array([-0.1, -0.2, -0.3, -0.4, -0.5])], all = Buffer.from(pcm16(buf(ch), 0, 5));
  expect(Buffer.from(pcm16(buf(ch), 1, 2))).toEqual(all.subarray(4, 12));
  expect(Buffer.from(pcm16(buf(ch), 3, 10))).toEqual(all.subarray(12));
  expect(pcm16(buf(ch), 5, 4).length).toBe(0);
});

test('bytesToBase64 matches Node over the 32 KB steps it builds the string in', () => {
  const u8 = new Uint8Array(0x8000 * 2 + 5).map((_, i) => (i * 37) & 255);
  expect(bytesToBase64(u8)).toBe(Buffer.from(u8).toString('base64'));
});

import { AudioEngine } from './player.ts';
test('AudioEngine.load reports HTTP errors with the URL', async () => {
  const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: { b: 'http://h/a.wav' } }, () => undefined, {} as any, 1);
  const fetchFn: any = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
  await expect(eng.load(fetchFn)).rejects.toThrow('404 http://h/a.wav');
});
