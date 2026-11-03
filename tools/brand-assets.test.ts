import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { inspectLogo, stageCapture } from '@tellcut/media-node';
import { buildBrandAssets, ensureNunito } from './brand-assets.ts';

let tmp = '', font: string | null = null;
beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'brand-'));
  // the wordmark's font comes from Google Fonts the first time (kept in .cache/brand/); without a network the test is skipped
  font = await ensureNunito().catch(() => null);
}, 60_000);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

test('brand-assets writes every logo file, and the logo can be extruded', async (ctx) => {
  if (!font) ctx.skip();
  const files = await buildBrandAssets({ outDir: tmp, fontFile: font!, png: false });
  expect(files.map((f) => basename(f)).sort()).toEqual(['tellcut-icon-16.svg', 'tellcut-icon-dark.svg', 'tellcut-icon.svg', 'tellcut-lockup-dark.svg', 'tellcut-lockup.svg', 'tellcut-logo-dark.svg', 'tellcut-logo.svg']);
  expect(await inspectLogo(join(tmp, 'tellcut-logo.svg'))).toMatchObject({ kind: 'svg', extrudable: true });
  expect(await inspectLogo(join(tmp, 'tellcut-logo-dark.svg'))).toMatchObject({ kind: 'svg', extrudable: true });
  const lockup = readFileSync(join(tmp, 'tellcut-lockup.svg'), 'utf8');
  expect(lockup).not.toMatch(/<text/);   // the words are paths: no font needed to show it
  expect(lockup).toContain('fill="#161412"');
  expect(readFileSync(join(tmp, 'tellcut-lockup-dark.svg'), 'utf8')).toContain('fill="#f4ebdd"');
});

// the icons, the site's first screen and the export all open their page by stageCapture: macOS' headless Chrome paints its window
// 87 px short, so there the page is taller and each shot clipped to the picture; Windows (and Linux) stay at the picture's size
test('stageCapture: the picture size elsewhere, taller with a clip to the picture on macOS', () => {
  for (const platform of ['win32', 'linux'] as const) {
    expect(stageCapture(32, 32, platform)).toEqual({ viewport: { width: 32, height: 32 } });
    expect(stageCapture(1440, 900, platform)).toEqual({ viewport: { width: 1440, height: 900 } });
  }
  expect(stageCapture(32, 32, 'darwin')).toEqual({ viewport: { width: 32, height: 232 }, clip: { x: 0, y: 0, width: 32, height: 32, scale: 1 } });
  expect(stageCapture(1440, 900, 'darwin')).toEqual({ viewport: { width: 1440, height: 1100 }, clip: { x: 0, y: 0, width: 1440, height: 900, scale: 1 } });
  // the padding covers the unpainted strip
  expect(stageCapture(1080, 1920, 'darwin').viewport.height - 1920).toBeGreaterThan(87);
});
