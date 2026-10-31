// Saving a project's fx and music styles into the user's library (spec 2026-10-29-my-library §4.1, §4.2).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fxModule, makeProject, tempProjects } from './fixture.ts';
import { findFxFile, renameId, saveBlock, saveStyle } from './save.ts';
import { blockDir, libraryRoot, slugFor } from './store.ts';

const setup = () => { const projects = tempProjects(); return { projects, root: libraryRoot(projects), p1: makeProject(projects, 'p1'), p2: makeProject(projects, 'p2') }; };
const entryOf = (r: Awaited<ReturnType<typeof saveBlock>>) => { if (!('entry' in r)) throw new Error(`expected an entry, got ${JSON.stringify(r)}`); return r; };

test('saves a block with its imports and fonts', async () => {
  const { root, p1 } = setup();
  const { entry } = entryOf(await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' }));
  expect([...entry.files].sort()).toEqual(['fx/chalk.js', 'fx/util.js', 'media/fonts/Chalk.ttf']);
  expect(entry.types.map((t) => t.type)).toEqual(['fx.chalk-title', 'fx.chalk-line']);
  expect(entry.types[0]).toMatchObject({ name: 'chalk-title', desc: 'chalk-title doc', category: 'text' });
  expect(entry.from).toEqual({ project: 'p1', file: 'fx/chalk.js' });
  expect(entry.main).toBe('fx/chalk.js');
  expect(entry.theme).toEqual({ palette: { accent: '#ff0000' } });
  expect(readFileSync(join(blockDir(root, entry.slug), 'media/fonts/Chalk.ttf'), 'utf8')).toBe('FONT-A');
});

test('names given for a type replace its label and doc', async () => {
  const { root, p1 } = setup();
  const { entry } = entryOf(await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js', names: { 'fx.chalk-title': { name: '粉筆標題卡', desc: '黑板上的標題' } } }));
  expect(entry.types[0]).toMatchObject({ name: '粉筆標題卡', desc: '黑板上的標題' });
  expect(entry.slug).toBe('chalk-title');
});

test('a computed path is skipped, the save still succeeds', async () => {
  const projects = tempProjects(), root = libraryRoot(projects);
  const p = makeProject(projects, 'p1', { fx: fxModule(['fx.pic'], 'export const pic = (m, n) => m.fileUrl(`media/${n}.png`);') });
  const r = entryOf(await saveBlock({ root, projectDir: p, projectId: 'p1', file: 'fx/chalk.js' }));
  expect(r.skipped).toHaveLength(1);
});

test('an import outside fx/ is refused', async () => {
  const projects = tempProjects(), root = libraryRoot(projects);
  const p = makeProject(projects, 'p1', { fx: `import x from '../x.js';\n${fxModule(['fx.a'])}` });
  writeFileSync(join(p, 'x.js'), 'export default 1;');
  await expect(saveBlock({ root, projectDir: p, projectId: 'p1', file: 'fx/chalk.js' })).rejects.toMatchObject({ code: 'library.outsideFx' });
});

test('a type already in the library from elsewhere is a conflict', async () => {
  const { root, p1, p2 } = setup();
  entryOf(await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' }));
  const r = await saveBlock({ root, projectDir: p2, projectId: 'p2', file: 'fx/chalk.js' });
  expect(r).toMatchObject({ conflict: { slug: 'chalk-title', types: ['fx.chalk-title', 'fx.chalk-line'] } });
});

test('resaving the same source replaces without a conflict', async () => {
  const { root, p1 } = setup();
  const a = entryOf(await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' }));
  writeFileSync(join(p1, 'fx/chalk.js'), fxModule(['fx.chalk-title', 'fx.chalk-line'], '// changed'));
  const b = entryOf(await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' }));
  expect(b.entry.slug).toBe(a.entry.slug);
  expect(b.entry.version).not.toBe(a.entry.version);
});

test('replace takes the place of the entry it hit', async () => {
  const { root, p1, p2 } = setup();
  const a = entryOf(await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' }));
  const b = entryOf(await saveBlock({ root, projectDir: p2, projectId: 'p2', file: 'fx/chalk.js', onConflict: 'replace' }));
  expect(b.entry.slug).toBe(a.entry.slug);
  expect(b.entry.from.project).toBe('p2');
});

test('keep-both renames the id once', async () => {
  const projects = tempProjects(), root = libraryRoot(projects);
  const p1 = makeProject(projects, 'p1', { fx: fxModule(['fx.chalk-title']) }), p2 = makeProject(projects, 'p2', { fx: fxModule(['fx.chalk-title']) });
  entryOf(await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' }));
  const { entry } = entryOf(await saveBlock({ root, projectDir: p2, projectId: 'p2', file: 'fx/chalk.js', onConflict: 'keep-both' }));
  expect(entry.types.map((t) => t.type)).toEqual(['fx.chalk-title-2']);
  expect(entry.slug).toBe('chalk-title-2');
  expect(readFileSync(join(blockDir(root, entry.slug), 'fx/chalk.js'), 'utf8')).toContain("'fx.chalk-title-2'");
});

test('keep-both fails when the id appears twice', async () => {
  const projects = tempProjects(), root = libraryRoot(projects);
  const p1 = makeProject(projects, 'p1', { fx: fxModule(['fx.chalk-title']) });
  const p2 = makeProject(projects, 'p2', { fx: fxModule(['fx.chalk-title'], "export const again = 'fx.chalk-title';") });
  entryOf(await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' }));
  await expect(saveBlock({ root, projectDir: p2, projectId: 'p2', file: 'fx/chalk.js', onConflict: 'keep-both' })).rejects.toMatchObject({ code: 'library.renameFailed', params: { type: 'fx.chalk-title' } });
});

test('renameId changes a quoted id only when it appears exactly once', () => {
  expect(renameId(`x = "fx.a"; y = 'fx.ab'`, 'fx.a', 'fx.a-2')).toBe(`x = "fx.a-2"; y = 'fx.ab'`);
  expect(renameId(`'fx.a' 'fx.a'`, 'fx.a', 'fx.a-2')).toBeNull();
  expect(renameId(`nothing`, 'fx.a', 'fx.a-2')).toBeNull();
});

test('slug from a Chinese name falls back to the type', () => {
  expect(slugFor('粉筆標題卡', 'chalk-title', new Set())).toBe('chalk-title');
  expect(slugFor('粉筆標題卡', 'chalk-title', new Set(['chalk-title']))).toBe('chalk-title-2');
  expect(slugFor('Chalk Title!', 'x', new Set())).toBe('chalk-title');
});

test('findFxFile finds the module that defines a type', async () => {
  const { p1 } = setup();
  expect(await findFxFile(p1, ['fx/chalk.js'], 'fx.chalk-line')).toBe('fx/chalk.js');
  expect(await findFxFile(p1, ['fx/chalk.js'], 'fx.nope')).toBeNull();
});

test('saves a style', async () => {
  const { root, p1 } = setup();
  const r = await saveStyle({ root, projectDir: p1, projectId: 'p1', id: 'street-jazz' });
  if (!('entry' in r)) throw new Error('conflict');
  expect(r.entry).toMatchObject({ id: 'street-jazz', name: 'street-jazz 風格', slug: 'street-jazz', from: { project: 'p1', file: 'score/street-jazz.js' } });
  expect(existsSync(join(root, 'score', 'street-jazz.js'))).toBe(true);
  await expect(saveStyle({ root, projectDir: p1, projectId: 'p1', id: 'nope' })).rejects.toMatchObject({ code: 'library.noStyle' });
});

test('a style id already in the library from elsewhere is a conflict; keep-both renames it', async () => {
  const { root, p1, p2 } = setup();
  await saveStyle({ root, projectDir: p1, projectId: 'p1', id: 'street-jazz' });
  expect(await saveStyle({ root, projectDir: p2, projectId: 'p2', id: 'street-jazz' })).toMatchObject({ conflict: { slug: 'street-jazz' } });
  const r = await saveStyle({ root, projectDir: p2, projectId: 'p2', id: 'street-jazz', onConflict: 'keep-both' });
  expect(r).toMatchObject({ entry: { id: 'street-jazz-2', slug: 'street-jazz-2' } });
  expect(readFileSync(join(root, 'score', 'street-jazz-2.js'), 'utf8')).toContain("'street-jazz-2'");
});


test('the same file saved again after its type id was renamed replaces its entry instead of adding a second one', async () => {
  const { root, p1 } = setup();
  const first = entryOf(await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' })).entry;
  writeFileSync(join(p1, 'fx', 'chalk.js'), fxModule(['fx.board-title', 'fx.board-line']));
  const again = entryOf(await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' })).entry;
  expect(again.slug).toBe(first.slug);
  expect(again.types.map((t) => t.type)).toEqual(['fx.board-title', 'fx.board-line']);
  const { listLibrary } = await import('./store.ts');
  expect(listLibrary(root).blocks.map((e) => e.slug)).toEqual([first.slug]);
});
