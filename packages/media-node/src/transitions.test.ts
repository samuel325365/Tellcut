// The transitions in which both pictures show, drawn for real by the built player: two still pictures, each with two coloured
// halves, as the outgoing clip A and the incoming clip B, sampled halfway through the transition. The halves tell a wipe (each
// picture stays put, B uncovered over A) from a push (both pictures moved by half a frame).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corePlugin, createRegistry, parseProject } from '@tellcut/engine';
import { TELLCUT_ROOT } from './paths.ts';
import { ffmpeg, oneImage } from './ffmpeg.ts';
import { openHost, type PageHost } from './render.ts';
import { withProjectPage } from './stills.ts';
import { rawOf } from './golden.ts';

const W = 320, H = 180, FPS = 30;
const work = join(TELLCUT_ROOT, 'projects/_transitions-test');
const registry = createRegistry([corePlugin]);
const RED = [255, 0, 0], GREEN = [0, 255, 0], BLUE = [0, 0, 255], YELLOW = [255, 255, 0];
let host: PageHost, tmp: string;

/** a W × H picture, its left half one colour and its right half another */
const halves = (file: string, left: string, right: string) => ffmpeg(['-f', 'lavfi', '-i', `color=c=${left}:s=${W / 2}x${H}`, '-f', 'lavfi', '-i', `color=c=${right}:s=${W / 2}x${H}`,
  '-filter_complex', '[0][1]hstack', ...oneImage(file)]);

beforeAll(async () => {
  mkdirSync(join(work, 'media'), { recursive: true });
  tmp = mkdtempSync(join(tmpdir(), 'trans-'));
  await halves(join(work, 'media/a.png'), 'red', 'lime');
  await halves(join(work, 'media/b.png'), 'blue', 'yellow');
  host = await openHost();
}, 120000);
afterAll(async () => {
  await host?.close();
  rmSync(work, { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
});

const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
/** A (0–1.6 s) then B (1–2 s) with a linked 0.6 s transition: frame 39 (1.3 s) is its middle, where eIO3 is exactly 0.5 */
const film = (transitionIn: Record<string, unknown>) => parseProject({ version: 1,
  meta: { name: 't', width: W, height: H, fps: FPS, duration: 2, plugins: [], background: '#ff00ff',   // magenta: a gap between the pictures shows
    mix: { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } } },
  sources: { a: { path: 'media/a.png', duration: 1, width: W, height: H, kind: 'image' }, b: { path: 'media/b.png', duration: 1, width: W, height: H, kind: 'image' } },
  media: {}, grids: [],
  tracks: [{ id: 'v', kind: 'video', items: [
    { id: 'A', source: 'a', in: 0, speed: 1, start: 0, end: 1.6, crop },
    { id: 'B', source: 'b', in: 0, speed: 1, start: 1, end: 2, crop, transitionIn: { dur: 0.6, ...transitionIn } },
  ] }] });

/** the RGB of the pixels at (x, y) of the frame drawn at `frame` */
async function sample(transitionIn: Record<string, unknown>, frame: number, points: Array<[number, number]>) {
  return withProjectPage({ dir: work, project: film(transitionIn), registry, host }, async (s) => {
    await s.frame(frame);
    const f = join(tmp, `f-${String(transitionIn.type)}-${String(transitionIn.dir)}-${frame}.png`);
    writeFileSync(f, await s.png());
    const raw = await rawOf(f, `${W}:${H}`);
    return points.map(([x, y]) => [...raw.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)]);
  });
}
const near = (got: number[][], want: number[][]) => {
  expect(got.length).toBe(want.length);
  got.forEach((c, i) => c.forEach((v, k) => expect(Math.abs(v - want[i][k]), `point ${i}: got ${c} want ${want[i]}`).toBeLessThanOrEqual(12)));
};
/** a quarter in from each side, and a few columns either side of the middle: the stills are cached as JPEG, which blurs a
 *  picture's own colour edge by a pixel or so (a wipe's edge lies on it), while a push's seam is between two pictures' outer columns
 *  and is checked to the pixel */
const POINTS: Array<[number, number]> = [[W / 4, H / 2], [(3 * W) / 4, H / 2], [W / 2 - 3, H / 2], [W / 2 + 2, H / 2]];
const SEAM: Array<[number, number]> = [[W / 4, H / 2], [(3 * W) / 4, H / 2], [W / 2 - 1, H / 2], [W / 2, H / 2]];

test('wipe halfway: B uncovered over A from its dir side, neither picture moved', async () => {
  // 'l': B's left half on the left (blue), A's right half still on the right (green)
  near(await sample({ type: 'wipe', dir: 'l' }, 39, POINTS), [BLUE, GREEN, BLUE, GREEN]);
  // 'r': A's left half (red), B's right half (yellow)
  near(await sample({ type: 'wipe', dir: 'r' }, 39, POINTS), [RED, YELLOW, RED, YELLOW]);
  // before B starts and after the wipe: only A, then only B
  near(await sample({ type: 'wipe', dir: 'l' }, 29, POINTS), [RED, GREEN, RED, GREEN]);
  near(await sample({ type: 'wipe', dir: 'l' }, 50, POINTS), [BLUE, YELLOW, BLUE, YELLOW]);
}, 180000);

test('push halfway: both pictures moved half a frame, edge to edge with no gap', async () => {
  // 'l': B came in from the left, so its right half is on the left (yellow); A moved right, its left half on the right (red)
  near(await sample({ type: 'push', dir: 'l' }, 39, SEAM), [YELLOW, RED, YELLOW, RED]);
  // 'r': B's left half on the right (blue), A's right half on the left (green)
  near(await sample({ type: 'push', dir: 'r' }, 39, SEAM), [GREEN, BLUE, GREEN, BLUE]);
}, 180000);
