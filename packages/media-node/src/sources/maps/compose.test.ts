import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { ffmpeg } from '../../ffmpeg.ts';
import { probeMedia } from '../../probe.ts';
import { composeMap } from './compose.ts';

let dir: string, white: string, out: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tiles-'));
  const p = new PNG({ width: 256, height: 256 }); p.data.fill(255);
  white = join(dir, 'white.png'); writeFileSync(white, PNG.sync.write(p));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => { out = join(dir, `map-${Math.random().toString(36).slice(2)}.jpg`); });

/** one pixel of a picture, as [r, g, b] */
async function pixel(file: string, x: number, y: number): Promise<number[]> {
  // to RGB first: cropping the 4:2:0 JPEG itself moves an odd x to the even column before it
  return [...(await ffmpeg(['-i', file, '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdout: true })).stdout];
}
const near = (want: number[], got: number[]) => want.every((v, i) => Math.abs(v - got[i]) <= 24);

test('tiles are pasted where they go, scaled, and missing ones leave the background', async () => {
  await composeMap({ out, width: 400, height: 600, background: '#203040', tiles: [{ file: white, left: -50, top: 0, size: 512 }, { file: null, left: 0, top: 512, size: 512 }], attribution: '© test' });
  expect(await probeMedia(out)).toMatchObject({ width: 400, height: 600 });
  expect(near([255, 255, 255], await pixel(out, 200, 100))).toBe(true);
  expect(near([0x20, 0x30, 0x40], await pixel(out, 100, 560))).toBe(true);
});

test('the route is drawn in its colour with a white edge, and the attribution sits bottom right on a dark box', async () => {
  await composeMap({ out, width: 400, height: 600, background: '#000000', tiles: [{ file: white, left: -100, top: -100, size: 1024 }],
    route: { points: [[50, 300], [350, 300]], color: '#ff0000', width: 12 }, pins: [[50, 300], [350, 300]], attribution: '© 內政部國土測繪中心' });
  expect(near([255, 0, 0], await pixel(out, 200, 300))).toBe(true);
  const box = await pixel(out, 377, 560);   // in the box's padding, right of the text
  expect(box[0] + box[1] + box[2]).toBeLessThan(450);   // white map under a dark label box
  expect(near([255, 255, 255], await pixel(out, 200, 200))).toBe(true);
});

test('the attribution stays 5 % in from the edges, so a 1.1× push-in (c.photo zoom) does not crop it', async () => {
  await composeMap({ out, width: 400, height: 600, background: '#000000', tiles: [{ file: white, left: -100, top: -100, size: 1024 }], attribution: '© OpenStreetMap contributors, © CARTO' });
  expect(near([255, 255, 255], await pixel(out, 384, 572))).toBe(true);   // the corner beyond 5 % is still map
  const box = await pixel(out, 377, 560);   // in the box's padding, right of the text
  expect(box[0] + box[1] + box[2]).toBeLessThan(450);
});

test('a credit too long for a small picture gets a smaller font instead of running off the left edge', async () => {
  const eox = 'EOxCloudless 2024 https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)';
  await composeMap({ out, width: 480, height: 640, background: '#000000', tiles: [{ file: white, left: -100, top: -100, size: 1024 }], attribution: eox });
  for (let y = 560; y < 610; y += 4) expect(near([255, 255, 255], await pixel(out, 12, y))).toBe(true);   // the left 5 % stays map
});

test('tiles at fractional positions and sizes meet without a seam of background between them', async () => {
  await composeMap({ out, width: 520, height: 300, background: '#000000', attribution: '',
    tiles: [{ file: white, left: 0.4, top: 0.4, size: 257.4 }, { file: white, left: 257.8, top: 0.4, size: 257.4 }] });
  for (let x = 254; x <= 262; x++) expect(near([255, 255, 255], await pixel(out, x, 100)), `x ${x}`).toBe(true);
});
