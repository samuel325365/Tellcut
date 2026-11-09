import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corePlugin, createRegistry } from '@tellcut/engine';
import { TELLCUT_ROOT } from './paths.ts';
import { diffShare, goldenFile, goldenPlatformDir, goldenProject, runGolden, type GoldenCase } from './golden.ts';

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
  const q = goldenProject({ name: 'x', type: 'core.flash', at: [0], square: true });
  expect([q.meta.width, q.meta.height]).toEqual([1080, 1080]);
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

test('cases drawn side by side in one Chrome come back in case order, each with its own picture', async () => {
  const flash = (name: string, color: string): GoldenCase => ({ name, type: 'core.flash', params: { color, peak: 1 }, len: 1, at: [0.1] });
  const cases = [flash('a', '#fff'), flash('b', '#f00'), flash('c', '#00f')], o = { registry, goldenDir: dir, work, jobs: 3 };
  expect((await runGolden(cases, { ...o, update: true })).map((r) => [r.file, r.status])).toEqual(cases.map((c) => [goldenFile(c, 0.1), 'updated']));
  expect((await runGolden(cases, o)).map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
  // each picture is its own case's: b drawn white no longer matches
  expect((await runGolden([flash('b', '#fff')], o)).map((r) => r.status)).toEqual(['changed']);
}, 180000);

test('a system with pictures of its own (macOS) keeps them beside the shared ones and never writes those', async () => {
  expect(goldenPlatformDir('/g', 'darwin')).toBe(join('/g', 'darwin'));
  expect(goldenPlatformDir('/g', 'win32')).toBeUndefined();
  const flash = (color: string): GoldenCase => ({ name: 'flash', type: 'core.flash', params: { color, peak: 1 }, len: 1, at: [0.1] });
  const own = join(dir, 'darwin'), file = goldenFile(flash('#fff'), 0.1), mac = { registry, goldenDir: dir, platformDir: own, work }, win = { registry, goldenDir: dir, work };
  const statuses = async (color: string, o: object) => (await runGolden([flash(color)], o as typeof mac)).map((r) => r.status);
  // a new case drawn on a Mac: its own picture only; the shared one comes from an update on Windows
  expect(await statuses('#fff', mac)).toEqual(['new']);
  expect(await statuses('#fff', { ...mac, update: true })).toEqual(['updated']);
  expect([existsSync(join(dir, file)), existsSync(join(own, file))]).toEqual([false, true]);
  expect(await statuses('#fff', mac)).toEqual(['ok']);
  expect(await statuses('#fff', { ...win, update: true })).toEqual(['updated']);
  const sharedBytes = readFileSync(join(dir, file));
  // drawn like the shared one: an update drops the Mac's own copy, and a second one has nothing to do
  expect(await statuses('#fff', { ...mac, update: true })).toEqual(['updated']);
  expect(existsSync(join(own, file))).toBe(false);
  expect(await statuses('#fff', { ...mac, update: true })).toEqual(['ok']);
  // drawn differently: changed, then the Mac's own picture; the shared one is untouched
  expect(await statuses('#f00', mac)).toEqual(['changed']);
  expect(await statuses('#f00', { ...mac, update: true })).toEqual(['updated']);
  expect(await statuses('#f00', { ...mac, update: true })).toEqual(['ok']);
  expect(readFileSync(join(dir, file))).toEqual(sharedBytes);
  expect(await statuses('#f00', mac)).toEqual(['ok']);
  // Windows moves the shared picture on (to blue): the Mac's own copy was made beside the white one, so it no longer counts —
  // the old red look is changed again, the new one ok, and a Mac update makes its own copy beside the new shared picture
  expect(await statuses('#00f', { ...win, update: true })).toEqual(['updated']);
  expect(await statuses('#f00', mac)).toEqual(['changed']);
  expect(await statuses('#00f', mac)).toEqual(['ok']);
  expect(await statuses('#f00', { ...mac, update: true })).toEqual(['updated']);
  expect(await statuses('#f00', mac)).toEqual(['ok']);
  expect(Object.keys(JSON.parse(readFileSync(join(own, 'shared.json'), 'utf8')))).toEqual([file]);
}, 180000);
