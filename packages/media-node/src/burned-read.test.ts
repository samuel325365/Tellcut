import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cropFilter, readBurnedText } from './burned-read.ts';
import type { Burned, BurnedText } from './burned.ts';
import { run } from './ffmpeg.ts';
import { fakeOcr } from './providers/fake.ts';
import type { OcrProvider } from './providers/types.ts';

const piece = (span: [number, number], rect: BurnedText['rect'], band: BurnedText['band'] = 'top'): BurnedText => ({ span, rect, band });
const burned = (text: BurnedText[]): Burned => ({ version: 1, step: 0.5, frames: 12, caption: null, text });

test('the crop is the box with a margin, kept inside the picture, enlarged when asked', () => {
  expect(cropFilter(piece([0, 1], [0.5, 0.1, 0.2, 0.1]), 2)).toBe('crop=w=iw*0.2600:h=ih*0.1600:x=iw*0.4700:y=ih*0.0700,scale=w=iw*2:h=-2:flags=lanczos');
  expect(cropFilter(piece([0, 1], [0, 0.9, 1, 0.1]), 1)).toBe('crop=w=iw*1.0000:h=ih*0.1300:x=iw*0.0000:y=ih*0.8700');
});

test('each piece is read once in its middle, and a second time a third of the way in only when the middle read nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'burned-read-')), src = join(dir, 'v.mp4');
  try {
    await run(['-f', 'lavfi', '-i', 'color=c=gray:size=640x360:rate=10:duration=6', '-vf', 'noise=alls=80:allf=t+u,format=yuv420p', '-c:v', 'libx264', src]);
    // fakeOcr reads by picture name: `<pass>-<piece>.png`
    const ocr = fakeOcr({ '0-0.png': 'Trevi  Fountain', '1-2.png': '6:00 AM' });
    const b = await readBurnedText(src, burned([piece([1, 3], [0.1, 0.05, 0.3, 0.1]), piece([2, 5], [0.4, 0.4, 0.2, 0.1], 'middle'), piece([3, 6], [0.7, 0.8, 0.2, 0.06], 'bottom')]), { ocr });
    expect(b.text?.map((t) => t.words)).toEqual(['Trevi Fountain', undefined, '6:00 AM']);
    expect(b.ocr).toEqual({ ok: true });
    expect(ocr.calls.map((c) => c.map((x) => x.split(/[\\/]/).pop()))).toEqual([['0-0.png', '0-1.png', '0-2.png'], ['1-1.png', '1-2.png']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60000);

test('no OCR on this PC, or OCR breaking, leaves every piece a guess and says why; no pieces, no OCR at all', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'burned-read-')), src = join(dir, 'v.mp4');
  try {
    await run(['-f', 'lavfi', '-i', 'color=c=gray:size=320x180:rate=10:duration=3', '-vf', 'format=yuv420p', '-c:v', 'libx264', src]);
    const broken: OcrProvider = { ...fakeOcr(), read: async () => { throw new Error('沒有 zh-Hant-TW 的文字辨識\nmore'); } };
    const b = await readBurnedText(src, burned([piece([0, 2], [0.1, 0.1, 0.2, 0.1])]), { ocr: broken });
    expect(b.ocr).toEqual({ ok: false, why: '沒有 zh-Hant-TW 的文字辨識' });
    expect(b.text?.[0].words).toBeUndefined();
    const none = fakeOcr();
    expect((await readBurnedText(src, burned([]), { ocr: none })).ocr).toEqual({ ok: true });
    expect(none.calls).toEqual([]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60000);
