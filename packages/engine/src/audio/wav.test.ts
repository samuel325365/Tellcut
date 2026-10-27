import { encodeWavBase64 } from './wav.ts';

test('encodes interleaved 16-bit PCM with a RIFF header', () => {
  const ch = [new Float32Array([0, 1, -1]), new Float32Array([0.5, -0.5, 0])];
  const b = Buffer.from(encodeWavBase64({ numberOfChannels: 2, length: 3, sampleRate: 48000, getChannelData: (c) => ch[c] }), 'base64');
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.readUInt32LE(24)).toBe(48000);
  expect(b.readUInt16LE(22)).toBe(2);
  expect([b.readInt16LE(44), b.readInt16LE(46), b.readInt16LE(48), b.readInt16LE(50), b.readInt16LE(52)]).toEqual([0, 16383, 32767, -16384, -32768]);
});

import { AudioEngine } from './player.ts';
test('AudioEngine.load reports HTTP errors with the URL', async () => {
  const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: { b: 'http://h/a.wav' } }, () => undefined, {} as any, 1);
  const fetchFn: any = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
  await expect(eng.load(fetchFn)).rejects.toThrow('404 http://h/a.wav');
});
