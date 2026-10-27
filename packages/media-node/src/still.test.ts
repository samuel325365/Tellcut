import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grabStill, probeSize, run } from './ffmpeg.ts';
import { makePhoto } from './test-media.ts';

const dir = mkdtempSync(join(tmpdir(), 'still-'));

// A phone JPG has one frame at pts 0; seeking the image2 input to 0 s made ffmpeg drop it and still exit 0, so the still
// of a photo never appeared (uk-postcard copied its photos by hand to get round it).
test('the still of a phone photo at 0 s is grabbed, scaled to the asked width', async () => {
  const src = await makePhoto(join(dir, 'p.jpg'), { w: 1200, h: 900, orientation: 6, taken: '2022:05:26 10:00:00' });
  const out = join(dir, 'p-still.jpg');
  await grabStill({ src, ref: { source: 'p', t: 0, w: 300 }, out });
  expect(existsSync(out)).toBe(true);
  expect(await probeSize(out)).toEqual({ width: 300, height: 400 });
}, 120000);

test('a still past the end of a clip is an error, not a missing file', async () => {
  const src = join(dir, 'q.mp4');
  await run(['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10:duration=1', '-pix_fmt', 'yuv420p', src]);
  await grabStill({ src, ref: { source: 'q', t: 0.5, w: 80 }, out: join(dir, 'q-ok.jpg') });
  expect(existsSync(join(dir, 'q-ok.jpg'))).toBe(true);
  await expect(grabStill({ src, ref: { source: 'q', t: 30, w: 80 }, out: join(dir, 'q-still.jpg') })).rejects.toThrow();
}, 120000);
