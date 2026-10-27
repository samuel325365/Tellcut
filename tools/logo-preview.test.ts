// tellcut logo shows the logo as common.logo draws it, in 3D and flat (spec 2026-10-25-brand-preset §8.1): the agent looks at
// both to see the logo is not distorted.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRegistry } from '@tellcut/engine';
import { importLogo, logoPreviews, meanRgb, TELLCUT_ROOT } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';

const dir = join(TELLCUT_ROOT, 'projects/_test-logo');
const MIX = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } };
beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ version: 1, meta: { name: 'logo', width: 1920, height: 1080, fps: 30, duration: 5, plugins: [], mix: MIX }, sources: {}, media: {}, grids: [], tracks: [] }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('logo previews of the Tellcut SVG are two pictures, and the mark is not the background colour', async () => {
  const { path } = await importLogo(dir, join(TELLCUT_ROOT, 'tools/fixtures/brand/tellcut.svg'));
  const r = await logoPreviews({ projectDir: dir, logoPath: path, name: 'Tellcut', registry: createRegistry(plugins) });
  expect(existsSync(r.mark) && existsSync(r.flat)).toBe(true);
  expect(r.mark).toMatch(/output[\\/]logo[\\/]/);
  // the background is #0d0f14; the blue mark and the white letters lift the average well above it
  const [rr, gg, bb] = await meanRgb(r.mark);
  expect(Math.max(rr - 13, gg - 15, bb - 20)).toBeGreaterThan(3);
}, 240_000);
