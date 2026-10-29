// A saved block's thumbnail, really drawn by the player in Chrome (spec 2026-10-29-my-library §4.2).
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { plugins } from '@tellcut/plugins';
import { TELLCUT_ROOT } from '../paths.ts';
import { saveBlock } from './save.ts';
import { blockDir, libraryRoot } from './store.ts';
import { makeThumb, THUMB_FILE } from './thumb.ts';

// the player serves only files under tellcut/: the projects folder of this test lives in .cache
const projects = (() => { mkdirSync(join(TELLCUT_ROOT, '.cache'), { recursive: true }); return mkdtempSync(join(TELLCUT_ROOT, '.cache', 'library-thumb-')); })();
afterAll(() => rmSync(projects, { recursive: true, force: true }));

test('makeThumb draws the block into thumb.png', async () => {
  const p = join(projects, 'p1');
  mkdirSync(join(p, 'fx'), { recursive: true });
  writeFileSync(join(p, 'project.json'), JSON.stringify({ version: 1, meta: { fx: ['fx/box.js'] } }));
  writeFileSync(join(p, 'fx/box.js'), `export default [{ type: 'fx.box', label: 'Box', doc: 'a box', kind: 'overlay', params: [],
    build: (ctx) => { const el = document.createElement('div'); el.style.cssText = 'position:absolute;inset:30%;background:#f00'; ctx.root.appendChild(el); return {}; }, draw: () => {} }];\n`);
  const root = libraryRoot(projects), r = await saveBlock({ root, projectDir: p, projectId: 'p1', file: 'fx/box.js' });
  if (!('entry' in r)) throw new Error('conflict');
  expect(await makeThumb(root, r.entry.slug, plugins)).toBe(join(blockDir(root, r.entry.slug), THUMB_FILE));
  expect(existsSync(join(blockDir(root, r.entry.slug), THUMB_FILE))).toBe(true);
}, 120_000);
