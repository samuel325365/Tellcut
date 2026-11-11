import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makePhoto } from '@tellcut/media-node';
import { fixture } from '@tellcut/engine/test-fixture';
import { registerImage } from './image-source.ts';

function proj() {
  const d = mkdtempSync(join(tmpdir(), 'img-'));
  writeFileSync(join(d, 'project.json'), JSON.stringify(fixture(), null, 2) + '\n');
  return d;
}
const sources = (d: string) => JSON.parse(readFileSync(join(d, 'project.json'), 'utf8')).sources;

test('image: a picture the project rendered into its own folder becomes a photo source in place; made again, it keeps its id', async () => {
  const d = proj();
  mkdirSync(join(d, 'render'));
  await makePhoto(join(d, 'render', 'Poster.png'), { w: 320, h: 180 });
  const r = await registerImage(d, 'render/Poster.png');                         // relative to the project
  expect(r).toMatchObject({ id: 'poster', path: 'render/Poster.png', width: 320, height: 180, copied: false, again: false });
  expect(sources(d).poster).toMatchObject({ path: 'render/Poster.png', kind: 'image', width: 320, height: 180 });
  await makePhoto(join(d, 'render', 'Poster.png'), { w: 200, h: 400 });            // the script drew it again, another size
  const again = await registerImage(d, join(d, 'render', 'Poster.png'));
  expect(again).toMatchObject({ id: 'poster', again: true, width: 200, height: 400 });
  expect(Object.keys(sources(d)).filter((k) => sources(d)[k].path === 'render/Poster.png')).toEqual(['poster']);
});

test('image: a picture from outside is copied into media/images/; --id names it, a taken id or a non-picture is refused', async () => {
  const d = proj(), out = mkdtempSync(join(tmpdir(), 'img-out-'));
  await makePhoto(join(out, 'chart.jpg'), { w: 100, h: 100 });
  const r = await registerImage(d, join(out, 'chart.jpg'), { id: 'chart_a' });
  expect(r).toMatchObject({ id: 'chart_a', path: 'media/images/chart.jpg', copied: true });
  expect(existsSync(join(d, 'media', 'images', 'chart.jpg'))).toBe(true);
  expect((await registerImage(d, join(out, 'chart.jpg'))).id).toBe('chart_a');   // the copy made last time is replaced, same id
  expect(existsSync(join(d, 'media', 'images', 'chart-2.jpg'))).toBe(false);
  const taken = Object.keys(fixture().sources)[0];
  await expect(registerImage(d, join(out, 'chart.jpg'), { id: taken })).rejects.toThrow(/已經是/);
  writeFileSync(join(out, 'notes.txt'), 'x');
  await expect(registerImage(d, join(out, 'notes.txt'))).rejects.toThrow(/不是圖片/);
  await expect(registerImage(d, join(out, 'gone.png'))).rejects.toThrow(/找不到圖檔/);
});

test('image: two pictures of one name from different folders are two copies and two ids; each one again keeps its own', async () => {
  const d = proj(), a = mkdtempSync(join(tmpdir(), 'img-a-')), b = mkdtempSync(join(tmpdir(), 'img-b-'));
  await makePhoto(join(a, 'photo.png'), { w: 320, h: 180 });
  await makePhoto(join(b, 'photo.png'), { w: 200, h: 400 });
  const r1 = await registerImage(d, join(a, 'photo.png'));
  const r2 = await registerImage(d, join(b, 'photo.png'));
  expect(r1).toMatchObject({ path: 'media/images/photo.png', width: 320, height: 180, again: false });
  expect(r2).toMatchObject({ path: 'media/images/photo-2.png', width: 200, height: 400, again: false });
  expect(r2.id).not.toBe(r1.id);
  expect(sources(d)[r1.id]).toMatchObject({ path: 'media/images/photo.png', width: 320, height: 180 });
  await makePhoto(join(a, 'photo.png'), { w: 640, h: 360 });                      // the first one remade outside
  expect(await registerImage(d, join(a, 'photo.png'))).toMatchObject({ id: r1.id, path: 'media/images/photo.png', width: 640, again: true });
  expect(await registerImage(d, join(b, 'photo.png'))).toMatchObject({ id: r2.id, path: 'media/images/photo-2.png', again: true });
  expect(existsSync(join(d, 'media', 'images', 'photo-3.png'))).toBe(false);
});
