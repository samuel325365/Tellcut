// The library's folder: listing, renaming, removing (spec 2026-10-29-my-library §4.1).
import { existsSync } from 'node:fs';
import { makeProject, tempProjects } from './fixture.ts';
import { saveBlock } from './save.ts';
import { blockDir, libraryRoot, listLibrary, removeBlock, renameType } from './store.ts';

test('an empty library lists nothing', () => {
  expect(listLibrary(libraryRoot(tempProjects()))).toEqual({ blocks: [], styles: [] });
});

test('renameType changes only that card; removeBlock deletes the entry', async () => {
  const projects = tempProjects(), root = libraryRoot(projects), p = makeProject(projects, 'p1');
  const r = await saveBlock({ root, projectDir: p, projectId: 'p1', file: 'fx/chalk.js' });
  if (!('entry' in r)) throw new Error('conflict');
  const e = renameType(root, r.entry.slug, 'fx.chalk-line', { name: '粉筆底線', category: '' });
  expect(e.types.map((t) => t.name)).toEqual(['chalk-title', '粉筆底線']);
  expect(e.types[1].category).toBeUndefined();
  expect(listLibrary(root).blocks[0].types[1].name).toBe('粉筆底線');
  removeBlock(root, r.entry.slug);
  expect(existsSync(blockDir(root, r.entry.slug))).toBe(false);
  expect(() => removeBlock(root, r.entry.slug)).toThrow(expect.objectContaining({ code: 'library.noEntry' }));
});

test('a slug that is not one is refused', () => {
  expect(() => blockDir(libraryRoot(tempProjects()), '../x')).toThrow(expect.objectContaining({ code: 'library.badSlug' }));
});
