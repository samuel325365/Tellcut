// The 3D frame push / pull hands over to the clip without a visible jump (spec 2026-10-25-brand-preset §6.2-2): at the handoff
// frame, the dolly alone and the clip alone match within 1 per channel on average and at least SEAM_PSNR dB pixel by pixel.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRegistry, parseProject, type Project } from '@tellcut/engine';
import { dollySeams, meanRgb, psnr, run, SEAM_PSNR, TELLCUT_ROOT } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';

const dir = join(TELLCUT_ROOT, 'projects/_test-dolly');
// the page draws with the shared plugins only, which define no grades: the grade path is covered by dolly.test.ts
const registry = createRegistry(plugins);
const MIX = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } };
const crop = (x: number, y: number, zoom: number) => ({ x, y, zoom });

/** a clip of the colourful moving test picture on the main track, and a dolly that hands over to it (or takes over from it) */
function project(o: { W: number; H: number; dir: 'in' | 'out'; from?: number; dx?: number; clip?: Record<string, unknown> }): Project {
  const c = o.dir === 'in' ? crop(0.4, 0.5, 1.3) : crop(0.55, 0.45, 1.1), d = { ...c, x: c.x + (o.dx ?? 0) };
  const clip = { id: 'c', source: 's', in: 2, speed: 1, start: 1, end: 2.5, crop: { from: c, to: c }, ...o.clip };
  const dolly = o.dir === 'in'
    ? { id: 'd', type: 'common.dolly', start: 0, end: 1, params: { source: 's', from: o.from ?? 1, dir: 'in', ...d } }
    : { id: 'd', type: 'common.dolly', start: 2.5, end: 3.5, params: { source: 's', from: o.from ?? 3.5, dir: 'out', ...d } };
  return parseProject({ version: 1, meta: { name: 'seam', width: o.W, height: o.H, fps: 30, duration: 3.5, plugins: [], mix: MIX, cut: { crf: 12, preset: 'ultrafast' } },
    sources: { s: { path: 'src.mp4', duration: 6, width: 1920, height: 1080 } }, media: {}, grids: [],
    tracks: [{ id: 'v1', kind: 'video', items: [clip] }, { id: 'text', kind: 'overlay', items: [dolly] }] });
}

beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  await run(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=6', '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', join(dir, 'src.mp4')]);
}, 120_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('meanRgb of a flat colour is that colour', async () => {
  const png = join(dir, 'flat.png');
  await run(['-f', 'lavfi', '-i', 'color=c=0x336699:s=64x64,format=rgb24', '-frames:v', '1', png]);
  const [r, g, b] = await meanRgb(png);
  expect([r, g, b].map((v, i) => Math.abs(v - [51, 102, 153][i]) <= 0.5)).toEqual([true, true, true]);
  const other = join(dir, 'flat2.png');
  await run(['-f', 'lavfi', '-i', 'color=c=0x336698:s=64x64,format=rgb24', '-frames:v', '1', other]);
  expect(await psnr(png, png)).toBe(Infinity);
  expect(await psnr(png, other)).toBeCloseTo(10 * Math.log10((255 * 255 * 3) / 1), 1);   // one channel off by 1 everywhere
});

test('dolly in hands over to the clip within 1 per channel (16:9)', async () => {
  const p = project({ W: 1920, H: 1080, dir: 'in' });
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  const r = await dollySeams({ projectDir: dir, project: p, registry });
  expect(r.map((x) => x.id)).toEqual(['d']);
  expect(r[0].diff.every((d) => d < 1)).toBe(true);
  expect(r[0].psnr).toBeGreaterThanOrEqual(SEAM_PSNR);
  expect(r[0].ok).toBe(true);
}, 240_000);

test('dolly out takes over from the clip within 1 per channel (9:16)', async () => {
  const p = project({ W: 1080, H: 1920, dir: 'out' });
  const r = await dollySeams({ projectDir: dir, project: p, registry });
  expect(r[0].ok).toBe(true);
}, 240_000);

test('a dolly with the wrong from is caught', async () => {
  const p = project({ W: 1920, H: 1080, dir: 'in', from: 1.5 });
  const r = await dollySeams({ projectDir: dir, project: p, registry });
  expect(r[0].ok).toBe(false);
}, 240_000);

test('a small crop jump the average colour misses is caught pixel by pixel', async () => {
  const p = project({ W: 1920, H: 1080, dir: 'in', dx: 0.005 });
  const r = await dollySeams({ projectDir: dir, project: p, registry });
  expect(r[0].diff.every((d) => d < 1)).toBe(true);   // the average alone would pass it
  expect(r[0].psnr).toBeLessThan(SEAM_PSNR);
  expect([r[0].ok, r[0].why]).toEqual([false, expect.stringMatching(/PSNR/)]);
}, 240_000);

test('a push-in onto a clip that dissolves in is flagged, though the clip is drawn without its transition', async () => {
  const p = project({ W: 1920, H: 1080, dir: 'in', clip: { transitionIn: { type: 'dissolve', dur: 0.5 } } });
  const r = await dollySeams({ projectDir: dir, project: p, registry });
  expect([r[0].ok, r[0].why]).toEqual([false, expect.stringMatching(/轉場/)]);
}, 240_000);
