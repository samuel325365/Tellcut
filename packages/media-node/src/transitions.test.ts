// The transitions in which both pictures show, drawn for real by the built player: two still pictures, each with two coloured
// halves, as the outgoing clip A and the incoming clip B, sampled halfway through the transition. The halves tell a wipe (each
// picture stays put, B uncovered over A) from a push (both pictures moved by half a frame).
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { corePlugin, createRegistry, parseProject, TRANSITION_TYPES } from '@tellcut/engine';
import { TELLCUT_ROOT } from './paths.ts';
import { ffmpeg, oneImage } from './ffmpeg.ts';
import { openHost, type PageHost } from './render.ts';
import { withProjectPage } from './stills.ts';
import { rawOf } from './golden.ts';
import { meanAbsDiff, printOf, TEMPLATE_LIKENESS } from './likeness.ts';

const W = 320, H = 180, FPS = 30;
const work = join(TELLCUT_ROOT, 'projects/_transitions-test');
const registry = createRegistry([corePlugin]);
const RED = [255, 0, 0], GREEN = [0, 255, 0], BLUE = [0, 0, 255], YELLOW = [255, 255, 0];
let host: PageHost, tmp: string;
/** two structured 480 × 270 pictures: A all warm (red high, blue low: stripes, a disc, squares, a block), B all cool (blue high, red
 *  low: checks, a band, a ring, a triangle), so a pixel tells which picture it shows and there are edges everywhere */
const FIXTURES = join(TELLCUT_ROOT, 'packages/media-node/src/fixtures');

/** a W × H picture, its left half one colour and its right half another */
const halves = (file: string, left: string, right: string) => ffmpeg(['-f', 'lavfi', '-i', `color=c=${left}:s=${W / 2}x${H}`, '-f', 'lavfi', '-i', `color=c=${right}:s=${W / 2}x${H}`,
  '-filter_complex', '[0][1]hstack', ...oneImage(file)]);

beforeAll(async () => {
  mkdirSync(join(work, 'media'), { recursive: true });
  tmp = mkdtempSync(join(tmpdir(), 'trans-'));
  await halves(join(work, 'media/a.png'), 'red', 'lime');
  await halves(join(work, 'media/b.png'), 'blue', 'yellow');
  for (const k of ['a', 'b']) copyFileSync(join(FIXTURES, `transition-${k}.png`), join(work, `media/p${k}.png`));
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

// ── every type between the two structured pictures: A (0–2 s) then B (1–3 s), a linked 1 s transition at 20 fps, so progress p is
// frame 20 + 20p exactly
const SW = 480, SH = 270, PFPS = 20;
const TYPES = TRANSITION_TYPES.filter((t) => t !== 'cut');
const pictures = (transitionIn: Record<string, unknown>, w = W, h = H) => parseProject({ version: 1,
  meta: { name: 't', width: w, height: h, fps: PFPS, duration: 3, plugins: [], background: '#ff00ff',
    mix: { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } } },
  sources: { a: { path: 'media/pa.png', duration: 1, width: SW, height: SH, kind: 'image' }, b: { path: 'media/pb.png', duration: 1, width: SW, height: SH, kind: 'image' } },
  media: {}, grids: [],
  tracks: [{ id: 'v', kind: 'video', items: [
    { id: 'A', source: 'a', in: 0, speed: 1, start: 0, end: 2, crop },
    { id: 'B', source: 'b', in: 0, speed: 1, start: 1, end: 3, crop, transitionIn: { dur: 1, dir: 'l', ...transitionIn } },
  ] }] });

interface Shot { w: number; h: number; d: Uint8Array; png: Buffer }
/** the frames at progress `ps` of one transition, drawn in one page */
const shoot = (transitionIn: Record<string, unknown>, ps: number[], w = W, h = H) =>
  withProjectPage({ dir: work, project: pictures(transitionIn, w, h), registry, host }, async (s) => {
    const out: Shot[] = [];
    for (const p of ps) {
      await s.frame(Math.round(PFPS * (1 + p)));
      const png = await s.png(), r = PNG.sync.read(png);
      out.push({ w: r.width, h: r.height, d: r.data, png });
    }
    return out;
  });
/** each type at p = 0.25, 0.5, 0.75 (dir l), drawn once and shared by the tests below */
const THIRDS = [0.25, 0.5, 0.75];
const drawn = new Map<string, Promise<Shot[]>>();
const thirds = (type: string) => { let x = drawn.get(type); if (!x) drawn.set(type, (x = shoot({ type }, THIRDS))); return x; };
const mid = async (type: string) => (await thirds(type))[1];

type RGB = [number, number, number];
const px = (s: { w: number; d: Uint8Array | Buffer }, x: number, y: number, ch = 4): RGB => {
  const i = (Math.round(y) * s.w + Math.round(x)) * ch;
  return [s.d[i], s.d[i + 1], s.d[i + 2]];
};
/** the two pictures as the player places them on the 320 × 180 frame (a cover fit of 480 × 270: scaled by 2/3) */
let picA: { w: number; d: Buffer }, picB: { w: number; d: Buffer };
const fixA = (x: number, y: number) => px(picA, Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)), 3);
const fixB = (x: number, y: number) => px(picB, Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)), 3);
const mix = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map((i) => a[i] * (1 - k) + b[i] * k) as RGB;
const far = (a: RGB, b: RGB) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i])));
/** which picture a pixel shows: A is warm (red over blue), B cool */
const whose = (c: RGB) => (c[0] - c[2] > 60 ? 'A' : c[2] - c[0] > 60 ? 'B' : 'mix');
/** how near the pixel at (x, y) is to what `want` expects there, the expectation allowed to shift by up to 2 px (the stills are
 *  cached as JPEG and scaled, which moves and softens the pictures' own edges by a pixel or so) */
const nearest = (s: Shot, x: number, y: number, want: (dx: number, dy: number) => RGB) => {
  let best = Infinity;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) best = Math.min(best, far(px(s, x, y), want(dx, dy)));
  return best;
};
/** the mean square step between neighbouring pixels across x and down y in a box: how sharp the picture is along each (squared: a
 *  blur spreads an edge's step over many pixels, which leaves their plain sum as it was) */
const steps = (s: Shot, [x0, y0, x1, y1]: number[]) => {
  let gx = 0, gy = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const c = px(s, x, y), r = px(s, x + 1, y), d = px(s, x, y + 1);
    gx += far(c, r) ** 2; gy += far(c, d) ** 2; n++;
  }
  return { gx: gx / n, gy: gy / n };
};
const meanOf = (s: Shot, [x0, y0, x1, y1]: number[]): RGB => {
  const t = [0, 0, 0];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(s, x, y).forEach((v, k) => (t[k] += v));
  const n = (x1 - x0) * (y1 - y0);
  return t.map((v) => v / n) as RGB;
};
const expectWhose = (s: Shot, pts: Array<[number, number, string]>) =>
  pts.forEach(([x, y, w]) => expect(whose(px(s, x, y)), `(${x}, ${y}) is ${px(s, x, y)}`).toBe(w));

describe('every transition halfway between two structured pictures', () => {
  beforeAll(async () => {
    picA = { w: W, d: await rawOf(join(FIXTURES, 'transition-a.png'), `${W}:${H}`) };
    picB = { w: W, d: await rawOf(join(FIXTURES, 'transition-b.png'), `${W}:${H}`) };
  }, 60000);
  const C: [number, number] = [W / 2, H / 2];
  /** points spread over the frame, off its very edges */
  const GRID = [40, 120, 200, 280].flatMap((x) => [30, 90, 150].map((y) => [x, y] as [number, number]));

  test('dissolve: every point half A, half B', async () => {
    const s = await mid('dissolve');
    for (const [x, y] of GRID) expect(nearest(s, x, y, (dx, dy) => mix(fixA(x + dx, y + dy), fixB(x + dx, y + dy), 0.5)), `(${x}, ${y})`).toBeLessThanOrEqual(24);
  }, 180000);

  test('slide: B nearly in from the left (40 px to go, 87.5 % opaque); A alone in the strip B has not reached', async () => {
    const s = await mid('slide');
    for (const [x, y] of GRID.filter(([x]) => x < 270)) expect(nearest(s, x, y, (dx, dy) => mix(fixA(x + dx, y + dy), fixB(x + 40 + dx, y + dy), 0.875)), `(${x}, ${y})`).toBeLessThanOrEqual(24);
    for (const y of [30, 90, 150]) expect(nearest(s, 300, y, (dx, dy) => fixA(300 + dx, y + dy))).toBeLessThanOrEqual(24);
  }, 180000);

  test('wipe: B on the left half, A on the right, neither moved', async () => {
    const s = await mid('wipe');
    for (const [x, y] of GRID) expect(nearest(s, x, y, (dx, dy) => (x < W / 2 ? fixB : fixA)(x + dx, y + dy)), `(${x}, ${y})`).toBeLessThanOrEqual(24);
  }, 180000);

  test('push: B moved in half a frame from the left, A moved out half a frame to the right', async () => {
    const s = await mid('push');
    for (const [x, y] of GRID) expect(nearest(s, x, y, (dx, dy) => (x < W / 2 ? fixB(x + W / 2 + dx, y + dy) : fixA(x - W / 2 + dx, y + dy))), `(${x}, ${y})`).toBeLessThanOrEqual(24);
  }, 180000);

  test('iris: B inside a circle round the centre (half the way to the corners), A outside it', async () => {
    const s = await mid('iris');
    // radius 0.5 × √(160² + 90²) ≈ 91.8 px
    expectWhose(s, [[160, 90, 'B'], [225, 90, 'B'], [160, 25, 'B'], [100, 140, 'B'], [8, 8, 'A'], [312, 172, 'A'], [40, 90, 'A'], [270, 20, 'A']]);
  }, 180000);

  test('a clip moved under the clip it comes from (first in the track\'s array) is still drawn over it while the transition runs', async () => {
    const p = pictures({ type: 'iris' }), items = p.tracks[0].items;
    p.tracks[0].items = [items[1], items[0]] as typeof items;
    const s = await withProjectPage({ dir: work, project: p, registry, host }, async (pg) => {
      const out: Shot[] = [];
      for (const n of [30, 50]) { await pg.frame(n); const png = await pg.png(), r = PNG.sync.read(png); out.push({ w: r.width, h: r.height, d: r.data, png }); }
      return out;
    });
    expectWhose(s[0], [[160, 90, 'B'], [8, 8, 'A']]);
    expectWhose(s[1], [[160, 90, 'B'], [8, 8, 'B']]);   // after A has ended
  }, 180000);

  test('clock: the hand has swept from 12 to 6 o\'clock: the right half is B, the left half A', async () => {
    const s = await mid('clock');
    expectWhose(s, [[170, 15, 'B'], [240, 45, 'B'], [300, 160, 'B'], [170, 165, 'B'], [150, 15, 'A'], [80, 45, 'A'], [20, 160, 'A'], [150, 165, 'A']]);
  }, 180000);

  test('bars: every strip on its way at its own height, the even ones filling from the top and the odd ones from the bottom', async () => {
    const s = await mid('bars');
    const x = (k: number) => Math.round((k + 0.5) * (W / 6));
    // filled to about 93 %, 78 %, 60 %, 40 %, 22 % and 7 % of the height
    expectWhose(s, [[x(0), 90, 'B'], [x(0), 176, 'A'], [x(1), 90, 'B'], [x(1), 8, 'A'], [x(2), 90, 'B'], [x(2), 172, 'A'], [x(3), 90, 'A'], [x(3), 172, 'B'],
      [x(4), 8, 'B'], [x(4), 90, 'A'], [x(5), 90, 'A'], [x(5), 8, 'A'], [x(5), 176, 'B']]);
  }, 180000);

  test('zoom: both pictures blended, A grown 1.61× and B still 1.2× round the centre', async () => {
    const s = await mid('zoom');
    const at = (x: number, y: number, k: number) => [C[0] + (x - C[0]) / k, C[1] + (y - C[1]) / k];
    for (const [x, y] of [C, [40, 30], [280, 150], [60, 160], [270, 25]] as Array<[number, number]>) {
      const want = (dx: number, dy: number) => { const [ax, ay] = at(x + dx, y + dy, 1 + 1.4 * 0.5 ** 1.2), [bx, by] = at(x + dx, y + dy, 1.2); return mix(fixA(ax, ay), fixB(bx, by), 0.5); };
      expect(nearest(s, x, y, want), `(${x}, ${y})`).toBeLessThanOrEqual(28);
    }
    // not merely a dissolve: away from the centre the pictures are where the scales put them
    const dissolve = await mid('dissolve');
    expect(meanAbsDiff(printOf({ width: s.w, height: s.h, data: s.d }), printOf({ width: dissolve.w, height: dissolve.h, data: dissolve.d }))).toBeGreaterThan(TEMPLATE_LIKENESS);
  }, 180000);

  test('whip: placed as push is halfway, but blurred along the travel only, with no background at the seam', async () => {
    const s = await mid('whip'), push = await mid('push');
    expectWhose(s, [[60, 90, 'B'], [100, 150, 'B'], [220, 90, 'A'], [290, 30, 'A']]);
    // smeared across on both pictures; still sharp down where the edges lie across (B's checks and band: A's stripes are diagonal,
    // and a diagonal edge smeared sideways softens downwards too)
    for (const box of [[12, 8, 148, 172], [172, 8, 308, 172]]) expect(steps(s, box).gx, `${box} across`).toBeLessThan(0.35 * steps(push, box).gx);
    expect(steps(s, [12, 8, 148, 172]).gy).toBeGreaterThan(0.6 * steps(push, [12, 8, 148, 172]).gy);
    // the seam between the two pictures and the frame's own ends show no magenta background
    for (let y = 4; y < H; y += 8) for (const x of [0, 1, W / 2 - 2, W / 2 - 1, W / 2, W / 2 + 1, W - 2, W - 1]) {
      const c = px(s, x, y);
      expect(c[0] > 150 && c[2] > 150 && c[1] < 120, `(${x}, ${y}) ${c}`).toBe(false);
    }
  }, 180000);

  test('blur: half way through a dissolve but blurred, with no fringe at the frame\'s edges', async () => {
    const s = await mid('blur'), dissolve = await mid('dissolve');
    const inner = [20, 20, 300, 160];
    const b = steps(s, inner), d = steps(dissolve, inner);
    expect(b.gx + b.gy).toBeLessThan(0.4 * (d.gx + d.gy));
    expect(far(meanOf(s, inner), meanOf(dissolve, inner))).toBeLessThanOrEqual(12);
    // the outer two pixels all round: the blend's colours, not the magenta stage (a CSS blur fades a frame's edge into what is
    // under it; at the edge that is A's edge, itself faded into the background)
    for (let i = 0; i < W; i += 4) for (const [x, y] of [[i, 0], [i, 1], [i, H - 1], [i, H - 2]] as Array<[number, number]>) {
      const c = px(s, x, y);
      expect(c[0] > 150 && c[2] > 150 && c[1] < 120, `(${x}, ${y}) ${c}`).toBe(false);
    }
    for (let j = 0; j < H; j += 4) for (const [x, y] of [[0, j], [1, j], [W - 1, j], [W - 2, j]] as Array<[number, number]>) {
      const c = px(s, x, y);
      expect(c[0] > 150 && c[2] > 150 && c[1] < 120, `(${x}, ${y}) ${c}`).toBe(false);
    }
    for (const side of [[0, 0, W, 3], [0, H - 3, W, H], [0, 0, 3, H], [W - 3, 0, W, H]]) expect(far(meanOf(s, side), meanOf(dissolve, side)), `${side}`).toBeLessThanOrEqual(30);
  }, 180000);

  test('dip: black in the middle; before it only A, darkening; after it only B, coming up', async () => {
    const [q1, half, q3] = await thirds('dip');
    for (const [x, y] of GRID) {
      expect(Math.max(...px(half, x, y)), `(${x}, ${y})`).toBeLessThanOrEqual(12);
      expect(nearest(q1, x, y, (dx, dy) => mix(fixA(x + dx, y + dy), [0, 0, 0], 0.5)), `A at (${x}, ${y})`).toBeLessThanOrEqual(24);
      expect(nearest(q3, x, y, (dx, dy) => mix(fixB(x + dx, y + dy), [0, 0, 0], 0.5)), `B at (${x}, ${y})`).toBeLessThanOrEqual(24);
    }
  }, 180000);

  test('flash: white in the middle; before it A burning out, after it B coming back, neither showing in the other\'s half', async () => {
    const [q1, half, q3] = await thirds('flash');
    for (const [x, y] of GRID) {
      expect(Math.min(...px(half, x, y)), `(${x}, ${y})`).toBeGreaterThanOrEqual(243);
      // brightness ×2 under a quarter of white: still warm before the middle, still cool after it
      expect(px(q1, x, y)[0] - px(q1, x, y)[2], `A at (${x}, ${y})`).toBeGreaterThan(0);
      expect(px(q3, x, y)[2] - px(q3, x, y)[0], `B at (${x}, ${y})`).toBeGreaterThan(0);
      // brighter than a plain quarter of white over A would be: the burn
      const sum = (c: RGB) => c[0] + c[1] + c[2];
      expect(sum(px(q1, x, y)) - sum(mix(fixA(x, y), [255, 255, 255], 0.25)), `burn at (${x}, ${y})`).toBeGreaterThan(30);
    }
  }, 180000);

  // Admission: every type must look clearly unlike every other at some point of the way. The edge-map likeness of the block
  // templates (likeness.ts, TEMPLATE_LIKENESS) sees where the pictures' edges are, so it parts the types that move, grow, cut or
  // smear the pictures; dissolve, blur, dip and flash keep both pictures in place, and dip and flash change only how bright they are,
  // which it is built not to see. A pair it cannot part must differ by at least PLAIN in the mean absolute difference of the
  // pixels (0–255, all three channels): a plain measure that sees brightness and colour.
  const PLAIN = 20;
  test('admission: every pair of types differs clearly at p = 0.25, 0.5 or 0.75', async () => {
    const shots = new Map<string, Shot[]>();
    for (const t of TYPES) shots.set(t, await thirds(t));
    const prints = new Map([...shots].map(([t, ss]) => [t, ss.map((s) => printOf({ width: s.w, height: s.h, data: s.d }))]));
    const plain = (a: Shot, b: Shot) => { let d = 0; for (let i = 0; i < a.d.length; i += 4) d += Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]); return d / ((a.d.length / 4) * 3); };
    const rows: string[] = [], close: string[] = [];
    for (let i = 0; i < TYPES.length; i++) for (let j = i + 1; j < TYPES.length; j++) {
      const a = TYPES[i], b = TYPES[j];
      const edge = Math.max(...THIRDS.map((_, k) => meanAbsDiff(prints.get(a)![k], prints.get(b)![k])));
      const flat = Math.max(...THIRDS.map((_, k) => plain(shots.get(a)![k], shots.get(b)![k])));
      rows.push(`${a.padEnd(8)} ${b.padEnd(8)} edge ${edge.toFixed(3)} plain ${flat.toFixed(1)}${edge > TEMPLATE_LIKENESS ? '' : flat >= PLAIN ? '  (plain)' : '  TOO ALIKE'}`);
      if (edge <= TEMPLATE_LIKENESS && flat < PLAIN) close.push(`${a} ~ ${b}: edge ${edge.toFixed(3)}, plain ${flat.toFixed(1)}`);
    }
    // TELLCUT_TRANSITION_SCORES=<file>: every pair's two distances written there
    if (process.env.TELLCUT_TRANSITION_SCORES) writeFileSync(process.env.TELLCUT_TRANSITION_SCORES, rows.join('\n'));
    expect(close).toEqual([]);
  }, 600000);
});

// The review sheets, only when asked for: TELLCUT_TRANSITION_SHEETS=<folder> writes transitions.png (a row per type at p = 0.1,
// 0.25, 0.5, 0.75, 0.9) and transitions-dirs.png (wipe, push, whip and bars from each side halfway, and iris, clock and zoom on a
// 9:16 frame) there, drawn at 480 × 270.
const SHEETS = process.env.TELLCUT_TRANSITION_SHEETS;
test.runIf(!!SHEETS)('review sheets', async () => {
  const cells: Array<{ row: string; label: string; png: Buffer; w: number; h: number }> = [];
  const PS = [0.1, 0.25, 0.5, 0.75, 0.9];
  for (const type of TYPES) (await shoot({ type }, PS, SW, SH)).forEach((s, k) => cells.push({ row: type, label: `${type} p=${PS[k]}`, png: s.png, w: s.w, h: s.h }));
  const dirCells: typeof cells = [];
  for (const type of ['wipe', 'push', 'whip', 'bars']) for (const dir of ['l', 'r', 'u', 'd']) {
    const [s] = await shoot({ type, dir }, [0.5], SW, SH);
    dirCells.push({ row: type, label: `${type} dir=${dir} p=0.5`, png: s.png, w: s.w, h: s.h });
  }
  const tall: typeof cells = [];
  for (const type of ['iris', 'clock', 'zoom']) { const [s] = await shoot({ type }, [0.5], 152, 270); tall.push({ row: type, label: `${type} 9:16 p=0.5`, png: s.png, w: s.w, h: s.h }); }
  const sheet = async (file: string, rows: Array<typeof cells>) => {
    const html = `<!doctype html><html><body style="margin:0;background:#222;font:14px sans-serif;color:#eee"><div style="display:inline-block;padding:8px">${rows.map((r) =>
      `<div style="display:flex;gap:8px;margin-bottom:8px">${r.map((c) => `<figure style="margin:0"><img style="display:block;width:${c.w}px;height:${c.h}px" src="data:image/png;base64,${c.png.toString('base64')}"><figcaption style="padding:2px 0">${c.label}</figcaption></figure>`).join('')}</div>`).join('')}</div></body></html>`;
    const page = await host.browser.newPage({ viewport: { width: 2600, height: 1200 } });
    try {
      await page.setContent(html);
      const box = await page.locator('body > div').boundingBox();
      mkdirSync(SHEETS!, { recursive: true });
      writeFileSync(join(SHEETS!, file), await page.screenshot({ clip: { x: 0, y: 0, width: Math.ceil(box!.width), height: Math.ceil(box!.height) }, fullPage: true }));
    } finally { await page.close(); }
  };
  await sheet('transitions.png', TYPES.map((t) => cells.filter((c) => c.row === t)));
  await sheet('transitions-dirs.png', [...['wipe', 'push', 'whip', 'bars'].map((t, i) => [...dirCells.filter((c) => c.row === t), ...(tall[i] ? [tall[i]] : [])])]);
}, 900000);

