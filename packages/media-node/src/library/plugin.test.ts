// Loading My blocks' modules (the library's cards, the catalog): kept until an entry's module files change.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fxModule, makeProject, tempProjects } from './fixture.ts';
import { loadEntry } from './plugin.ts';
import { saveBlock } from './save.ts';
import { blockDir, libraryRoot, readBlock } from './store.ts';

test('an entry is loaded once while its files stay the same; an edit in place is loaded again', async () => {
  const projects = tempProjects(), root = libraryRoot(projects), p = makeProject(projects, 'p1');
  const r = await saveBlock({ root, projectDir: p, projectId: 'p1', file: 'fx/chalk.js' });
  if (!('entry' in r)) throw new Error('not saved');
  const e = readBlock(root, r.entry.slug)!;
  const first = await loadEntry(root, e);
  expect(await loadEntry(root, e)).toBe(first);
  writeFileSync(join(blockDir(root, e.slug), 'fx', 'chalk.js'), fxModule(['fx.chalk-title', 'fx.chalk-line', 'fx.chalk-box']));
  const again = await loadEntry(root, e);
  expect(again).not.toBe(first);
  expect(again.plugin.items?.map((t) => t.type)).toEqual(['fx.chalk-title', 'fx.chalk-line', 'fx.chalk-box']);
});
