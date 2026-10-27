import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corePlugin, createRegistry } from '@tellcut/engine';
import { TELLCUT_ROOT } from './paths.ts';
import { diffShare, goldenFile, goldenProject, runGolden, type GoldenCase } from './golden.ts';

const registry = createRegistry([corePlugin]);
const work = join(TELLCUT_ROOT, 'projects/_golden-test');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gold-')); });
afterAll(() => { rmSync(work, { recursive: true, force: true }); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('diffShare counts the pixels that moved beyond the tolerance', () => {
  const a = Buffer.alloc(30, 100), b = Buffer.from(a);
  expect(diffShare(a, b)).toBe(0);
  b[0] = 100 + 20;                         // within the tolerance
  expect(diffShare(a, b)).toBe(0);
  b[3] = 100 + 60; b[4] = 100 + 60;        // one pixel of ten
  expect(diffShare(a, b)).toBeCloseTo(0.1);
  expect(diffShare(a, Buffer.alloc(27))).toBe(1);
});

test('goldenProject is a 1080×1920 film of one item', () => {
  const p = goldenProject({ name: 'x', type: 'core.flash', at: [0], len: 2, theme: { radius: 3 } });
  expect([p.meta.width, p.meta.height, p.meta.duration, p.meta.theme?.radius]).toEqual([1080, 1920, 2, 3]);
  expect(p.tracks[0].items).toHaveLength(1);
  const w = goldenProject({ name: 'x', type: 'core.flash', at: [0], wide: true });
  expect([w.meta.width, w.meta.height]).toEqual([1920, 1080]);
});

test('a missing golden is new, update writes it, the same picture is ok, a different one is changed, update rewrites it', async () => {
  const flash = (color: string): GoldenCase => ({ name: 'flash', type: 'core.flash', params: { color, peak: 1 }, len: 1, at: [0.1] });
  const o = { registry, goldenDir: dir, work };
  expect((await runGolden([flash('#fff')], o)).map((r) => r.status)).toEqual(['new']);
  expect((await runGolden([flash('#fff')], { ...o, update: true })).map((r) => r.status)).toEqual(['updated']);
  expect((await runGolden([flash('#fff')], o)).map((r) => r.status)).toEqual(['ok']);
  const changed = await runGolden([flash('#f00')], o);
  expect(changed.map((r) => r.status)).toEqual(['changed']);
  expect(changed[0].file).toBe(goldenFile(flash('#f00'), 0.1));
  expect((await runGolden([flash('#f00')], { ...o, update: true })).map((r) => r.status)).toEqual(['updated']);
  expect((await runGolden([flash('#f00')], o)).map((r) => r.status)).toEqual(['ok']);
}, 180000);
