import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { createProject, makePhoneVideo } from '@tellcut/media-node';
import { inventory } from './inventory.ts';

// the overview is an extra like the sheets: when it fails, inspect and cut still work without it
vi.mock('@tellcut/media-node', async (orig) => ({ ...(await orig<object>()), overviewSheets: async () => { throw new Error('sheet.py: cannot identify image file'); } }));

test('a failing overview is logged and left out; the inventory is still made', async () => {
  const root = mkdtempSync(join(tmpdir(), 'inv-ov-')), src = join(root, 'src');
  mkdirSync(src, { recursive: true });
  await makePhoneVideo(join(src, 'walk.mp4'));
  await createProject({ id: 'p', inputs: [src], projectsDir: root });
  const log: string[] = [];
  const inv = await inventory(join(root, 'p'), { transcribe: false, log: (s) => log.push(s) });
  expect(inv.overview).toEqual([]);
  expect(inv.sources.map((s) => s.id)).toEqual(['walk']);
  expect(log.some((l) => l.includes('素材總覽失敗') && l.includes('cannot identify'))).toBe(true);
}, 300000);
