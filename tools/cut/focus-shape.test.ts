// The face focus of a clip cut to a named shape: the faces go into the part of the frame the shape certainly shows.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject, shapeSafe, visibleRegion, type Crop } from '@tellcut/engine';
import { fakeFaces, run, type FaceInfo } from '@tellcut/media-node';
import { Cut } from './cut.ts';
import { SHAPE_FOCUS_ZOOM, shapedFocus, shapedSubject } from './focus.ts';
import type { Inventory } from './inventory.ts';
import type { Rect } from './view.ts';

/** where a source rectangle lands in the frame, as fractions of the frame */
function onFrame(crop: Crop, r: Rect, src = [1920, 1080], frame = [1920, 1080]): Rect {
  const v = visibleRegion(src[0], src[1], frame[0], frame[1], crop);
  return [(r[0] - v.x0) / v.w, (r[1] - v.y0) / v.h, (r[2] - v.x0) / v.w, (r[3] - v.y0) / v.h];
}
const within = (r: Rect, s: [number, number, number, number]) => r[0] >= s[0] - 1e-3 && r[1] >= s[1] - 1e-3 && r[2] <= s[0] + s[2] + 1e-3 && r[3] <= s[1] + s[3] + 1e-3;

test('a face already in the middle of a circle in a wide frame needs nothing; one near the edge is brought in at the least zoom', () => {
  const safe = shapeSafe({ type: 'circle' }, 16 / 9)!;
  const mid = shapedFocus(1920, 1080, 1920, 1080, safe, [0.46, 0.35, 0.54, 0.55]);
  expect(mid).toEqual({ crop: { x: 0.5, y: 0.5, zoom: 1 }, inside: true });
  // a face at the left of the picture: outside the circle at zoom 1, where the view cannot move at all
  const face: Rect = [0.22, 0.3, 0.3, 0.5];
  expect(within(onFrame({ x: 0.5, y: 0.5, zoom: 1 }, face), safe)).toBe(false);
  const left = shapedFocus(1920, 1080, 1920, 1080, safe, face);
  expect(left.inside).toBe(true);
  expect(left.crop.zoom).toBeGreaterThan(1);
  expect(left.crop.zoom).toBeLessThanOrEqual(SHAPE_FOCUS_ZOOM);
  expect(within(onFrame(left.crop, face), safe)).toBe(true);
  // the least zoom: a little less and the face would no longer fit in
  const less = shapedFocus(1920, 1080, 1920, 1080, safe, [0.23, 0.3, 0.31, 0.5]);
  expect(less.crop.zoom).toBeLessThan(left.crop.zoom);
});

test('a landscape picture in a tall heart: the face moves sideways into the heart; a face too big for the shape is fitted as far as it goes', () => {
  // a 9:16 frame of a 1080 × 1920 film, a 16:9 source: cropped at the sides, the view can slide across
  const safe = shapeSafe({ type: 'heart' }, 9 / 16)!;
  const face: Rect = [0.7, 0.3, 0.76, 0.42];
  const r = shapedFocus(1920, 1080, 1080, 1920, safe, face);
  expect(r.inside).toBe(true);
  expect(r.crop.x).toBeGreaterThan(0.6);
  expect(within(onFrame(r.crop, face, [1920, 1080], [1080, 1920]), safe)).toBe(true);
  const big = shapedFocus(1920, 1080, 1920, 1080, shapeSafe({ type: 'star' }, 16 / 9)!, [0.25, 0.05, 0.75, 0.95]);
  expect(big.inside).toBe(false);
  expect(big.crop.zoom).toBe(1);
});

test('a big face that shows whole in the circle is inside: its margin does not grow past a share of the picture', () => {
  // a close-up in a circle in a wide frame: the bare face sits inside the circle's safe box at zoom 1, with a 12 % pad it would not
  const safe = shapeSafe({ type: 'circle' }, 16 / 9)!, face: Rect = [0.36, 0.2, 0.64, 0.8];
  expect(within(onFrame({ x: 0.5, y: 0.5, zoom: 1 }, face), safe)).toBe(true);
  expect(shapedFocus(1920, 1080, 1920, 1080, safe, face)).toEqual({ crop: { x: 0.5, y: 0.5, zoom: 1 }, inside: true });
});

test('a small or medium face keeps its full 12 % margin clear of the shape', () => {
  const safe = shapeSafe({ type: 'circle' }, 16 / 9)!;
  // a face 15 % of the picture's height, near the left edge
  const h = 0.15, w = h * (9 / 16), face: Rect = [0.2, 0.35, 0.2 + w, 0.35 + h];
  const r = shapedFocus(1920, 1080, 1920, 1080, safe, face);
  expect(r.inside).toBe(true);
  const padded: Rect = [face[0] - 0.12 * w, face[1] - 0.12 * h, face[2] + 0.12 * w, face[3] + 0.12 * h];
  expect(within(onFrame(r.crop, padded), safe)).toBe(true);
});

/** a detector's face: its box centred at x, `h` tall as a share of the picture's height, square in a 16:9 picture */
const at = (x: number, h: number, ar = 16 / 9): FaceInfo => ({ box: [x - h / ar / 2, 0.3, h / ar, h], mouth: [x, 0.3 + h * 0.75], mouthW: h / ar / 3 });
const box = (f: FaceInfo): Rect => [f.box[0], f.box[1], f.box[0] + f.box[2], f.box[1] + f.box[3]];

test('the shaped focus frames the main subject and leaves small faces in the background alone', () => {
  const main = at(0.45, 0.3), passer = at(0.9, 0.11), other = at(0.08, 0.11);
  // passers-by: the largest face of a sample where the subject looks away, or beside the subject
  expect(shapedSubject([[main, passer], [other], [main]], 1920, 1080)).toEqual(box(main));
  // only passers-by: nothing to frame
  expect(shapedSubject([[passer], [], [other]], 1920, 1080)).toBeNull();
  // someone further back, big enough to count on their own, is less than half the subject's size: the subject wins
  const back = at(0.85, 0.14);
  expect(shapedSubject([[main], [back], [main]], 1920, 1080)).toEqual(box(main));
  // the subject walking closer through the clip stays one subject
  const near = at(0.5, 0.45);
  expect(shapedSubject([[main], [near]], 1920, 1080)).toEqual([box(main)[0], 0.3, box(near)[2], 0.3 + 0.45]);
  // the size is a share of the short side: in a portrait picture a face 8 % of the height is 14 % of the width
  expect(shapedSubject([[at(0.5, 0.08, 9 / 16)]], 1080, 1920)).toEqual(box(at(0.5, 0.08, 9 / 16)));
  expect(shapedSubject([[at(0.5, 0.06, 9 / 16)]], 1080, 1920)).toBeNull();
});

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
const face = (x: number, w = 0.08): FaceInfo => ({ box: [x - w / 2, 0.3, w, w * 1.6], mouth: [x, 0.4], mouthW: w * 0.4 });
/** a 16:9 film over a 16:9 source whose one person stands at x = 0.25 */
async function wideCut() {
  const dir = mkdtempSync(join(tmpdir(), 'focus-shape-'));
  await run(['-f', 'lavfi', '-i', 'color=gray:s=320x180:d=6:r=10', join(dir, 'v.mp4')]);
  const p = parseProject({ version: 1, meta: { name: 't', width: 1920, height: 1080, fps: 30, duration: 10, plugins: [], mix: MIX },
    sources: { v: { path: 'v.mp4', duration: 6, width: 1920, height: 1080, kind: 'video', audio: false } }, media: {}, grids: [], tracks: [] });
  const inv: Inventory = { id: 't', dir, project: p, chapters: [], photoSheets: [], overview: [], music: [],
    sources: [{ id: 'v', kind: 'video', duration: 6, width: 1920, height: 1080, orientation: 'landscape', audio: false, speech: '', sheets: [], segments: [[0, 6]], transcript: null }] };
  const c = new Cut(structuredClone(p), inv, dir);
  c.facesProvider = fakeFaces(() => [face(0.25)]);
  return c;
}

test('at save(), a clip in a circle focuses its face into the circle even though the picture fits its frame; a text shape and a plain frame do not', async () => {
  const c = await wideCut();
  const circle = c.clip('v', { from: 0, len: 1, shape: 'circle' });
  const text = c.clip('v', { from: 1, len: 1, shape: { type: 'text', text: 'ROMA' } });
  const plain = c.clip('v', { from: 2, len: 1 });
  const own = c.clip('v', { from: 3, len: 1, shape: 'circle', crop: { x: 0.5 } });
  const p = await c.save();
  const crop = (id: string) => (p.tracks.find((t) => t.id === 'v1')!.items.find((i) => i.id === id) as any).crop;
  const safe = shapeSafe({ type: 'circle' }, 16 / 9)!, f = face(0.25).box;
  expect(crop(circle).from).toEqual(crop(circle).to);
  expect(crop(circle).from.zoom).toBeGreaterThan(1);
  expect(within(onFrame(crop(circle).from, [f[0], f[1], f[0] + f[2], f[1] + f[3]]), safe)).toBe(true);
  for (const id of [text, plain, own]) expect(crop(id).from).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
  expect(c.notes.filter((n) => n.includes('自動對焦到人臉'))).toEqual([expect.stringContaining('放進 circle 形狀一定看得到的範圍')]);
}, 60000);

test('at save(), a circle clip whose only faces are small passers-by stays centred and says why', async () => {
  const c = await wideCut();
  c.facesProvider = fakeFaces(() => [at(0.1, 0.1), at(0.88, 0.1)]);
  const circle = c.clip('v', { from: 0, len: 1, shape: 'circle' });
  const p = await c.save();
  expect((p.tracks.find((t) => t.id === 'v1')!.items.find((i) => i.id === circle) as any).crop.from).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
  expect(c.notes.filter((n) => n.includes('自動對焦到人臉') || n.includes('放不進'))).toEqual([]);
  expect(c.notes).toContainEqual(expect.stringContaining('臉都太小'));
}, 60000);
