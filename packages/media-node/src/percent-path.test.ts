// Paths with a `%` in them (a folder named "100%done" holding the projects, or TEMP): ffmpeg reads a `%d` in a picture's path as
// a frame-number pattern, so each single picture written (oneImage) or read (inFile / literalInput) must say it is just one.
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grabStill, isFramePattern, probeSize, run } from './ffmpeg.ts';
import { grabFrame } from './grab.ts';
import { posterFromImage } from './preset-write.ts';
import { extrasFiles, overviewSheets, sourceExtras } from './extras.ts';
import { facesAt } from './faces.ts';
import { analysisFiles } from './analysis.ts';
import { fakeFaces, fakeOcr, fakeTranscribe } from './providers/fake.ts';

const root = mkdtempSync(join(tmpdir(), 'pct-')), dir = join(root, '100%done'), video = join(dir, 'v.mp4');
const TEMP_VARS = ['TEMP', 'TMP', 'TMPDIR'] as const;
let saved: Array<string | undefined> = [];

beforeAll(async () => {
  mkdirSync(dir);
  await run(['-f', 'lavfi', '-i', 'testsrc=s=320x180:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  // the frames contact sheets, overviews and faces grab go to the system temp folder first: one with a `%d` in it too
  const temp = join(root, 'tmp%d');
  mkdirSync(temp);
  saved = TEMP_VARS.map((k) => process.env[k]);
  for (const k of TEMP_VARS) process.env[k] = temp;
  expect(tmpdir()).toBe(temp);
}, 60000);
afterAll(() => { TEMP_VARS.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }); });

test('a frame pattern is what ffmpeg takes for one: a single %d, other % only doubled', () => {
  expect(['C:/x/100%done/a.jpg', 'a-%04d.png', '/p/50%%/%d.jpg'].map(isFramePattern)).toEqual([true, true, true]);
  expect(['a.jpg', '50%%off/a.jpg', 'a%20b%d/x.jpg', '%d/%d.jpg', 'x%'].map(isFramePattern)).toEqual([false, false, false, false, false]);
});

test('single pictures are written and read where the path says: frames, stills, filmstrips, a photo, a poster', async () => {
  const g = join(dir, 'g.jpg');
  await grabFrame(video, 1, g);
  expect(await probeSize(g)).toEqual({ width: 320, height: 180 });
  await grabStill({ src: video, ref: { source: 'v', t: 1, w: 160 }, out: join(dir, 's.jpg') });
  expect(await probeSize(join(dir, 's.jpg'))).toEqual({ width: 160, height: 90 });
  await grabStill({ src: video, ref: { source: 'v', t: 0.5, strip: { n: 3, dur: 1 } }, out: join(dir, 'strip.jpg') });
  expect(await probeSize(join(dir, 'strip.jpg'))).toEqual({ width: 270, height: 120 });
  await grabStill({ src: g, ref: { source: 'p', t: 0, square: 64 }, out: join(dir, 'p.jpg') });   // a photo read from that folder
  expect(await probeSize(join(dir, 'p.jpg'))).toEqual({ width: 64, height: 64 });
  await posterFromImage(g, join(dir, 'poster.jpg'));
  expect(await probeSize(join(dir, 'poster.jpg'))).toEqual({ width: 540, height: 960 });
}, 120000);

test('a project there gets its thumbnails, contact sheets, overview and faces, their frames passing through a temp folder with % in it', async () => {
  await sourceExtras(dir, video, { label: 'v', stt: fakeTranscribe(), ocr: fakeOcr() });
  expect(existsSync(analysisFiles(dir, video).thumbs)).toBe(true);
  const f = extrasFiles(dir, video);
  expect(existsSync(f.sheets) && existsSync(f.sheet(1))).toBe(true);
  const pages = await overviewSheets(dir, [{ id: 'v', path: video, duration: 3 }]);
  expect(pages.length === 1 && existsSync(pages[0])).toBe(true);
  // a video's faces come from an image sequence in the temp folder, a photo's from one picture
  const det = fakeFaces(() => [{ box: [0.4, 0.3, 0.2, 0.3], mouth: [0.5, 0.5], mouthW: 0.05 }]);
  expect([...(await facesAt(dir, video, [1, 1.2], { provider: det })).values()].map((x) => x.length)).toEqual([1, 1]);
  expect([...(await facesAt(dir, join(dir, 'g.jpg'), [0], { provider: det })).values()].map((x) => x.length)).toEqual([1]);
  expect(det.calls.flat()).toHaveLength(3);
}, 300000);
