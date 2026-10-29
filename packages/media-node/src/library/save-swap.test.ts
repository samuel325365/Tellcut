// Putting a saved entry in place never loses the one it replaces (final review I3): the last step, moving the new copy into
// place, is made to fail (as an open file on Windows can make it), and the old entry must still be there afterwards.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fxModule, makeProject, tempProjects } from './fixture.ts';
import { saveBlock } from './save.ts';
import { blockDir, libraryRoot } from './store.ts';

const fail = { into: '' };
vi.mock('node:fs', async (orig) => {
  const real = await orig<typeof import('node:fs')>();
  return { ...real, renameSync: (a: string, b: string) => { if (fail.into && b === fail.into && a.includes('.tmp-')) throw Object.assign(new Error('EPERM: busy'), { code: 'EPERM' }); return real.renameSync(a, b); } };
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
