import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpeg } from './ffmpeg.ts';
import { fitImage, heicToJpg, photoMeta } from './photo.ts';
import { makeHeic, makePhoto } from './test-media.ts';

const dir = mkdtempSync(join(tmpdir(), 'photo-'));

test('a phone photo gives its upright size, when it was taken and where', async () => {
  const f = join(dir, 'a.jpg');
  await makePhoto(f, { w: 1200, h: 900, orientation: 6, taken: '2026:03:07 10:12:00', gps: [35.0116, -135.7681] });
  expect(await photoMeta(f)).toEqual({ width: 900, height: 1200, taken: '2026-03-07T10:12:00', offset: null, gps: [35.0116, -135.7681] });
  expect(await photoMeta(await makePhoto(join(dir, 'b.jpg'), { w: 64, h: 48 }))).toEqual({ width: 64, height: 48, taken: null, offset: null, gps: null });
}, 120000);

test('an iPhone HEIC becomes an upright JPG that keeps when it was taken', async () => {
  const f = join(dir, 'c.heic'), out = join(dir, 'c.jpg');
  await makeHeic(f, { w: 600, h: 800, taken: '2026:03:08 15:00:00' });
  expect(await heicToJpg(f, out)).toEqual({ width: 600, height: 800, taken: '2026-03-08T15:00:00', offset: null, gps: null });
}, 120000);

test('fitImage turns the photo upright and shrinks it into the box', async () => {
  const f = await makePhoto(join(dir, 'd.jpg'), { w: 1200, h: 900, orientation: 6 });
  expect(await fitImage(f, join(dir, 'd-fit.jpg'), 300, 300)).toEqual({ width: 225, height: 300 });
  expect((await photoMeta(join(dir, 'd-fit.jpg'))).width).toBe(225);   // no orientation left to apply
}, 120000);

test('a transparent picture used as a photo comes out on white, not on the black stored under its clear parts', async () => {
  // left half opaque red, right half fully clear (its stored colour black, as most PNGs keep it)
  const png = join(dir, 'clear.png');
  await ffmpeg(['-f', 'lavfi', '-i', 'color=black:s=64x32,format=rgba,geq=r=\'if(lt(X,32),255,0)\':g=0:b=0:a=\'if(lt(X,32),255,0)\'', '-frames:v', '1', '-update', '1', png]);
  const rgb = async (f: string, x: number) => [...(await ffmpeg(['-i', f, '-vf', `format=rgb24,crop=1:1:${x}:16`, '-f', 'rawvideo', '-'], { stdout: true })).stdout];
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 12);
  for (const out of [join(dir, 'clear-fit.jpg'), join(dir, 'clear-heic.jpg')]) {
    if (out.endsWith('fit.jpg')) await fitImage(png, out, 64, 64); else await heicToJpg(png, out);
    expect(near(await rgb(out, 8), [255, 0, 0]) && near(await rgb(out, 56), [255, 255, 255])).toBe(true);
  }
}, 120000);
