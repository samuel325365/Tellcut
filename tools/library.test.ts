// npm run tellcut -- library … (spec 2026-10-29-my-library §4.3) and the catalog listing the user's own blocks.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { plugins } from '@tellcut/plugins';
import { libraryPlugin, libraryRoot } from '@tellcut/media-node';
import { fxModule, makeProject, tempProjects } from '../packages/media-node/src/library/fixture.ts';
import { findBlocks, formatCatalog, formatFind } from './catalog.ts';
import { libraryCommand } from './library.ts';

const setup = () => { const projects = tempProjects(); makeProject(projects, 'p1'); makeProject(projects, 'p2', { fx: fxModule(['fx.other']) }); return projects; };
const run = (projects: string, ...args: string[]) => libraryCommand(args, { projects, thumb: false });

test('save then list shows the entry and the styles section', async () => {
  const projects = setup();
  expect(await run(projects, 'save', 'p1', 'fx/chalk.js', '--name', '粉筆標題卡', '--desc', '黑板')).toContain('chalk-title');
  await run(projects, 'save', 'p1', 'score/street-jazz.js');
  const s = await run(projects, 'list');
  expect(s).toMatch(/chalk-title +fx\.chalk-title +粉筆標題卡 — 黑板/);
  expect(s).toMatch(/我的配樂風格[\s\S]*street-jazz/);
});

test('a conflict without a flag says how to go on', async () => {
  const projects = setup();
  makeProject(projects, 'p3');
  await run(projects, 'save', 'p1', 'fx/chalk.js');
  await expect(run(projects, 'save', 'p3', 'fx/chalk.js')).rejects.toThrow(/--keep-both/);
  expect(await run(projects, 'save', 'p3', 'fx/chalk.js', '--keep-both')).toContain('fx.chalk-title-2');
});

test('use prints the c.fx line; --style copies a music style', async () => {
  const projects = setup();
  await run(projects, 'save', 'p1', 'fx/chalk.js');
  await run(projects, 'save', 'p1', 'score/street-jazz.js');
  expect(await run(projects, 'use', 'p2', 'chalk-title')).toContain("c.fx('fx/lib/chalk-title/_entry.js')");
  expect(await run(projects, 'use', 'p2', '--style', 'street-jazz')).toContain("c.score('street-jazz')");
  expect(readFileSync(join(projects, 'p2', 'score', 'street-jazz.js'), 'utf8')).toContain('street-jazz');
});

test('refresh takes a new version after the entry was edited; remove deletes it', async () => {
  const projects = setup();
  await run(projects, 'save', 'p1', 'fx/chalk.js');
  const file = join(libraryRoot(projects), 'blocks', 'chalk-title', 'fx', 'chalk.js');
  writeFileSync(file, fxModule(['fx.chalk-title', 'fx.chalk-line'], '// edited'));
  expect(await run(projects, 'refresh', 'chalk-title', '--no-thumb')).toMatch(/新版本/);
  writeFileSync(file, 'export default [{ type: "fx.chalk-title" }];');
  await expect(run(projects, 'refresh', 'chalk-title', '--no-thumb')).rejects.toThrow(/載入失敗|缺/);
  expect(await run(projects, 'remove', 'chalk-title')).toContain('chalk-title');
  expect(await run(projects, 'list')).not.toContain('fx.chalk-title');
});

test('refresh checks before it writes: a module that fails the checks is no new version for projects', async () => {
  const projects = setup();
  await run(projects, 'save', 'p1', 'fx/chalk.js');
  const entry = join(libraryRoot(projects), 'blocks', 'chalk-title', 'entry.json'), before = readFileSync(entry, 'utf8');
  writeFileSync(join(libraryRoot(projects), 'blocks', 'chalk-title', 'fx', 'chalk.js'), fxModule(['fx.chalk-title', 'fx.chalk-line'], 'export const r = () => Math.random();'));
  await expect(run(projects, 'refresh', 'chalk-title', '--no-thumb')).rejects.toThrow(/chalk-title 有問題/);
  expect(readFileSync(entry, 'utf8')).toBe(before);
});

test('a project id that is not one is refused before anything is written', async () => {
  const projects = setup();
  await run(projects, 'save', 'p1', 'fx/chalk.js');
  for (const id of ['../..', '_library', 'nope']) await expect(run(projects, 'use', id, 'chalk-title')).rejects.toThrow(/不是專案名稱|沒有專案/);
  await expect(run(projects, 'save', '..', 'fx/chalk.js')).rejects.toThrow(/不是專案名稱/);
});

test('the catalog lists the user’s own blocks first, marked 我的', async () => {
  const projects = setup();
  await run(projects, 'save', 'p1', 'fx/chalk.js');
  const { plugin } = await libraryPlugin(libraryRoot(projects));
  const all = [...plugins, plugin];
  expect(findBlocks(all, 'chalk').map((t) => t.type)).toEqual(['fx.chalk-title', 'fx.chalk-line']);
  expect(formatFind(all, 'chalk')).toMatch(/我的 +fx\.chalk-title/);
  const cat = formatCatalog(all);
  expect(cat.indexOf('fx.chalk-title')).toBeLessThan(cat.indexOf('core.'));
});

test('the music styles list has the user’s own, with how to use them', async () => {
  const { listStyles } = await import('./score.ts');
  const s = listStyles(undefined, [{ slug: 'street-jazz', id: 'street-jazz', name: '街頭爵士', desc: '輕快', from: { project: 'p1', file: 'score/street-jazz.js' }, savedAt: '', version: '' }]);
  expect(s).toMatch(/street-jazz +街頭爵士（我的：先 library use <專案> --style street-jazz）— 輕快/);
});

test('save --type names that block of a module with several (I2)', async () => {
  const projects = setup();
  await run(projects, 'save', 'p1', 'fx/chalk.js', '--type', 'fx.chalk-line', '--name', '粉筆底線', '--desc', '底線');
  const s = await run(projects, 'list');
  expect(s).toMatch(/fx\.chalk-line +粉筆底線 — 底線/);
  expect(s).toMatch(/fx\.chalk-title +chalk-title/);
});
