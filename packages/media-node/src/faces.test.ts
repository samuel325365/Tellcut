import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeFaces, faceKey, facesAt, faceTimes } from './faces.ts';
import { ffmpeg, run } from './ffmpeg.ts';

// counts the ffmpeg runs facesAt makes (the real ffmpeg underneath)
vi.mock('./ffmpeg.ts', async (orig) => { const m = await orig<typeof import('./ffmpeg.ts')>(); return { ...m, ffmpeg: vi.fn(m.ffmpeg) }; });
import { fakeFaces } from './providers/fake.ts';
import type { FaceInfo } from './providers/types.ts';

const face = (x: number): FaceInfo => ({ box: [x - 0.05, 0.3, 0.1, 0.16], mouth: [x, 0.4], mouthW: 0.04 });

test('the grid: every 0.2 s, keys snap to it', () => {
  expect(faceTimes(1, 1.6)).toEqual([1, 1.2, 1.4, 1.6]);
  expect([faceKey(1.29), faceKey(0.05)]).toEqual(['1.2', '0.0']);
});

test('faces are looked at once per grid time: a second ask for the same times does not run the detector', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fc-')), video = join(dir, 'v.mp4');
  await run(['-f', 'lavfi', '-i', 'color=gray:s=160x90:d=3:r=10', video]);
  const det = fakeFaces(() => [face(0.5)]);
  const a = await facesAt(dir, video, [0.5, 1, 1.02], { provider: det });
  expect([...a.keys()]).toEqual(['0.6', '1.0']);                    // 0.5 s sits between grid points and rounds up to 0.6
  expect(det.calls.flat().length).toBe(2);
  await facesAt(dir, video, [1, 1.4], { provider: det });
  expect(det.calls.flat().length).toBe(3);                           // only 1.4 was new
}, 60000);

test('a time past the last frame has no face and does not sink the times before it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fc-')), video = join(dir, 'v.mp4');
  await run(['-f', 'lavfi', '-i', 'color=gray:s=160x90:d=3:r=10', video]);
  const det = fakeFaces(() => [face(0.5)]);
  const a = await facesAt(dir, video, [2.6, 3, 3.2], { provider: det });
  expect(a.get('2.6')).toEqual([face(0.5)]);
  expect(a.get('3.2')).toEqual([]);
}, 60000);

test('a stretch of times is read with one ffmpeg run, each frame landing on its own time', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fc-')), video = join(dir, 'v.mp4');
  // brightness grows with time (25 a second): a frame says when it is from
  await run(['-f', 'lavfi', '-i', 'nullsrc=s=160x90:d=8:r=25,format=gray,geq=lum=16+T*25', '-pix_fmt', 'yuv420p', video]);
  const lum = async (img: string) => (await ffmpeg(['-i', img, '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { stdout: true })).stdout[0];
  const det = { ...fakeFaces(), async detect(images: string[]) { const out = []; for (const i of images) out.push([face((await lum(i)) / 255)]); return out; } };
  vi.mocked(ffmpeg).mockClear();
  const times = [...Array.from({ length: 21 }, (_, i) => 1 + i * 0.2), 6, 6.2];   // 1.0–5.0 s, then 6.0–6.2 s
  const a = await facesAt(dir, video, times, { provider: det });
  expect(vi.mocked(ffmpeg).mock.calls.length - 23).toBe(2);                       // two stretches (the 23 are the test's own brightness reads)
  for (const t of [1, 2.4, 5, 6.2]) expect(a.get(t.toFixed(1))![0].mouth[0] * 255).toBeCloseTo(16 + t * 25, -1);
}, 60000);

test('the inspect line: who is in the shot and where, in runs', () => {
  const tc = (t: number) => `${t}s`;
  expect(describeFaces([{ t: 0, faces: [face(0.5)] }, { t: 1, faces: [face(0.52)] }, { t: 2, faces: [face(0.2), face(0.8)] }, { t: 3, faces: [] }], tc))
    .toBe('0s–1s 一人置中、2s–2s 兩人（左、右）、3s–3s 沒有臉');
});
