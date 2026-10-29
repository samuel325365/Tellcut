// Copying a library entry into a project, the link it leaves and updating it (spec 2026-10-29-my-library §3.3, §4.4).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fxModule, makeProject, tempProjects } from './fixture.ts';
import { saveBlock, saveStyle } from './save.ts';
import { libraryRoot, removeBlock } from './store.ts';
import { projectLinks, useBlock, useStyle } from './use.ts';

async function saved(o: { otherFont?: boolean } = {}) {
  const projects = tempProjects(), root = libraryRoot(projects), p1 = makeProject(projects, 'p1');
  const p2 = makeProject(projects, 'p2', { fx: fxModule(['fx.other']), font: o.otherFont ? 'FONT-B' : 'FONT-A' });
  const r = await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' });
  if (!('entry' in r)) throw new Error('conflict');
  return { projects, root, p1, p2, slug: r.entry.slug };
}

test('copies an entry into fx/lib and records the link', async () => {
  const { root, p2, slug } = await saved();
  const r = await useBlock({ root, projectDir: p2, projectId: 'p2', slug, fx: ['fx/chalk.js'] });
  expect(r.file).toBe('fx/lib/chalk-title/chalk.js');
  expect(r.types).toEqual(['fx.chalk-title', 'fx.chalk-line']);
  expect(existsSync(join(p2, 'fx/lib/chalk-title/util.js'))).toBe(true);
  expect(JSON.parse(readFileSync(join(p2, 'fx/lib/links.json'), 'utf8'))[slug]).toMatchObject({ file: r.file });
});

test('the same font is not copied twice; a different one goes under media/lib', async () => {
  const a = await saved();
  expect((await useBlock({ root: a.root, projectDir: a.p2, projectId: 'p2', slug: a.slug, fx: [] })).copied).not.toContain('media/fonts/Chalk.ttf');
  const b = await saved({ otherFont: true });
  const r = await useBlock({ root: b.root, projectDir: b.p2, projectId: 'p2', slug: b.slug, fx: [] });
  expect(readFileSync(join(b.p2, 'media/fonts/Chalk.ttf'), 'utf8')).toBe('FONT-B');
  expect(readFileSync(join(b.p2, 'media/lib/chalk-title/media/fonts/Chalk.ttf'), 'utf8')).toBe('FONT-A');
  expect(readFileSync(join(b.p2, r.file), 'utf8')).toContain("'media/lib/chalk-title/media/fonts/Chalk.ttf'");
});

test('using an entry in its own source project links the existing file', async () => {
  const { root, p1, slug } = await saved();
  const r = await useBlock({ root, projectDir: p1, projectId: 'p1', slug, fx: ['fx/chalk.js'] });
  expect(r).toEqual({ file: 'fx/chalk.js', types: ['fx.chalk-title', 'fx.chalk-line'], copied: [] });
  expect(existsSync(join(p1, 'fx/lib'))).toBe(false);
});

test('a type the project already has from elsewhere is refused', async () => {
  const { projects, root, slug } = await saved();
  const p3 = makeProject(projects, 'p3');   // its own fx/chalk.js defines the same ids
  await expect(useBlock({ root, projectDir: p3, projectId: 'p3', slug, fx: ['fx/chalk.js'] })).rejects.toMatchObject({ code: 'library.idTaken', params: { type: 'fx.chalk-title' } });
});

test('using again updates the copy', async () => {
  const { root, p1, p2, slug } = await saved();
  const first = await useBlock({ root, projectDir: p2, projectId: 'p2', slug, fx: [] });
  writeFileSync(join(p1, 'fx/chalk.js'), fxModule(['fx.chalk-title', 'fx.chalk-line'], '// v2'));
  await saveBlock({ root, projectDir: p1, projectId: 'p1', file: 'fx/chalk.js' });
  expect(projectLinks(root, p2)[0].version).not.toBe(projectLinks(root, p2)[0].latest);
  await useBlock({ root, projectDir: p2, projectId: 'p2', slug, fx: [first.file] });
  expect(readFileSync(join(p2, first.file), 'utf8')).toContain('// v2');
  const [link] = projectLinks(root, p2);
  expect(link.version).toBe(link.latest);
});

test('projectLinks shows latest null for a deleted entry', async () => {
  const { root, p2, slug } = await saved();
  await useBlock({ root, projectDir: p2, projectId: 'p2', slug, fx: [] });
  removeBlock(root, slug);
  expect(projectLinks(root, p2)).toEqual([expect.objectContaining({ slug, latest: null })]);
});

test('useStyle copies the style into score/', async () => {
  const projects = tempProjects(), root = libraryRoot(projects), p1 = makeProject(projects, 'p1'), p2 = makeProject(projects, 'p2');
  const r = await saveStyle({ root, projectDir: p1, projectId: 'p1', id: 'street-jazz' });
  if (!('entry' in r)) throw new Error('conflict');
  writeFileSync(join(p2, 'score/street-jazz.js'), 'old');
  expect(useStyle({ root, projectDir: p2, slug: r.entry.slug })).toEqual({ file: 'score/street-jazz.js', id: 'street-jazz' });
  expect(readFileSync(join(p2, 'score/street-jazz.js'), 'utf8')).toContain("id: 'street-jazz'");
});
