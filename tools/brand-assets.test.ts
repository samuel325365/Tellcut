import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { inspectLogo } from '@tellcut/media-node';
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
