// Stand-ins for tests: the same interfaces, no network, no downloads, nothing installed.
import { writeFileSync } from 'node:fs';
import type { FaceInfo, FacesProvider, OcrProvider, ProviderStatus, TranscribeProvider, TtsProvider, TtsRequest, TtsResult } from './types.ts';

/** A tone per character (0.18 s each) as a 16-bit mono wav, with the word times that implies. */
export function fakeTts(o: { words?: boolean; ok?: boolean } = {}): TtsProvider & { calls: TtsRequest[] } {
  const calls: TtsRequest[] = [];
  return {
    id: 'fake', label: '假的語音引擎（測試用）', online: false, calls,
    voices: () => ['fake-a', 'fake-b'],
    async check(): Promise<ProviderStatus> { return o.ok === false ? { ok: false, detail: '故意壞掉', install: 'none' } : { ok: true, version: '0', detail: 'fake' }; },
    async synth(req): Promise<TtsResult> {
      calls.push(req);
      const chars = [...req.text.replace(/\s+/g, '')], per = 0.18 * (1 - (req.rate ?? 0) / 100), sr = 16000, n = Math.round(chars.length * per * sr);
      const pcm = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 8000), i * 2);
      const h = Buffer.alloc(44);
      h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
      h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
      writeFileSync(req.out, Buffer.concat([h, pcm]));
      return { dur: +(n / sr).toFixed(3), words: o.words === false ? null : chars.map((c, i) => ({ text: c, start: +(i * per).toFixed(3), end: +((i + 1) * per).toFixed(3) })) };
    },
  };
}

/** OCR that "reads" what `texts` says each image holds (by file name), for tests. */
export function fakeOcr(texts: Record<string, string> = {}): OcrProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    id: 'fake', label: '假的文字辨識（測試用）', online: false, calls,
    async check() { return { ok: true, detail: 'fake' }; },
    async read(images) {
      calls.push(images);
      return images.map((image) => { const t = Object.entries(texts).find(([k]) => image.endsWith(k))?.[1]; return { image, width: 100, height: 100, lines: t ? [{ text: t, box: [0, 80, 100, 10] as [number, number, number, number] }] : [] }; });
    },
  };
}

/** Faces that "are" where `at` says, by file name, for tests. */
export function fakeFaces(at: (image: string) => FaceInfo[] = () => []): FacesProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    id: 'fake', label: '假的人臉偵測（測試用）', online: false, calls,
    async check() { return { ok: true, detail: 'fake' }; },
    async detect(images) { calls.push(images); return images.map(at); },
  };
}

export function fakeTranscribe(text = '假的逐字稿'): TranscribeProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: 'fake', label: '假的逐字稿（測試用）', online: false, calls,
    async check() { return { ok: true, detail: 'fake' }; },
    async transcribe(src, out) {
      calls.push(src);
      writeFileSync(out, JSON.stringify({ language: 'zh', segments: [{ start: 0, end: 1, text, words: [] }] }));
    },
  };
}
