// Putting a saved entry in place never loses the one it replaces (final review I3): the last step, moving the new copy into
// place, is made to fail (as an open file on Windows can make it), and the old entry must still be there afterwards. Likewise a delete
// or a music style's save that meets a file in use: a refusal the page words, the entry whole.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fxModule, makeProject, tempProjects } from './fixture.ts';
import { saveBlock, saveStyle } from './save.ts';
import { blockDir, blocksDir, libraryRoot, listLibrary, removeBlock, stylesDir } from './store.ts';

const fail = { into: '', from: '' };
vi.mock('node:fs', async (orig) => {
  const real = await orig<typeof import('node:fs')>();
  return { ...real, renameSync: (a: string, b: string) => { if ((fail.into && b === fail.into && a.includes('.tmp-')) || (fail.from && a === fail.from)) throw Object.assign(new Error('EPERM: busy'), { code: 'EPERM' }); return real.renameSync(a, b); } };
});

test('a save whose last step fails leaves the entry it would replace as it was', async () => {
  const projects = tempProjects(), root = libraryRoot(projects), p1 = makeProject(projects, 'p1');
  const a = await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' });
  if (!('entry' in a)) throw new Error('conflict');
  writeFileSync(join(p1, 'fx/chalk.js'), fxModule(['fx.chalk-title', 'fx.chalk-line'], '// v2'));
  fail.into = blockDir(root, a.entry.slug);
  await expect(saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' })).rejects.toThrow(/EPERM/);
  fail.into = '';
  expect(readFileSync(join(blockDir(root, a.entry.slug), 'fx/chalk.js'), 'utf8')).not.toContain('// v2');
  expect(readFileSync(join(blockDir(root, a.entry.slug), 'entry.json'), 'utf8')).toContain('chalk-title');
});

test('a delete that meets a file in use is refused as library.locked and leaves the entry whole', async () => {
  const projects = tempProjects(), root = libraryRoot(projects), p1 = makeProject(projects, 'p1');
  const a = await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' });
  if (!('entry' in a)) throw new Error('conflict');
  fail.from = blockDir(root, a.entry.slug);
  expect(() => removeBlock(root, a.entry.slug)).toThrow(expect.objectContaining({ code: 'library.locked' }));
  fail.from = '';
  expect(listLibrary(root).blocks.map((e) => e.slug)).toEqual([a.entry.slug]);
  expect(existsSync(join(blockDir(root, a.entry.slug), 'fx/util.js'))).toBe(true);
  removeBlock(root, a.entry.slug);
  expect(readdirSync(blocksDir(root))).toEqual([]);   // the folder renamed aside is removed too
});

test('a music style saved again over a file in use is refused as library.locked; the saved one stays', async () => {
  const projects = tempProjects(), root = libraryRoot(projects), p1 = makeProject(projects, 'p1');
  const a = await saveStyle({ root, projectDir: p1, projectId: 'p1', id: 'street-jazz' });
  if (!('entry' in a)) throw new Error('conflict');
  writeFileSync(join(p1, 'score/street-jazz.js'), readFileSync(join(p1, 'score/street-jazz.js'), 'utf8') + '// v2\n');
  fail.from = join(stylesDir(root), 'street-jazz.js.tmp');
  await expect(saveStyle({ root, projectDir: p1, projectId: 'p1', id: 'street-jazz' })).rejects.toMatchObject({ code: 'library.locked' });
  fail.from = '';
  expect(readFileSync(join(stylesDir(root), 'street-jazz.js'), 'utf8')).not.toContain('// v2');
  expect(readdirSync(stylesDir(root)).sort()).toEqual(['street-jazz.js', 'street-jazz.json']);
  expect(listLibrary(root).styles.map((e) => e.version)).toEqual([a.entry.version]);
});
