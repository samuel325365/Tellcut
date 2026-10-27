import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
