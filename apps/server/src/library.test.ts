// The library's routes (spec 2026-10-29-my-library §4.2–4.4): save, list, serve, rename, delete, use in a project.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fxModule, makeProject, tempProjects } from '../../../packages/media-node/src/library/fixture.ts';
import { startApp } from './test-utils.ts';

async function app() {
  const projects = tempProjects();
  makeProject(projects, 'p1'); makeProject(projects, 'p2', { fx: fxModule(['fx.other']) }); makeProject(projects, 'p3');
  const thumbs: string[] = [];
  const { base } = await startApp({ projectsDir: projects, libraryThumb: async (_root, slug) => { thumbs.push(slug); } });
  const post = (url: string, body: unknown) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { projects, base, post, thumbs };
}

test('saves, lists and serves a block', async () => {
  const { base, post, thumbs } = await app();
  const r = await post('/api/library/blocks', { project: 'p1', type: 'fx.chalk-line', name: '粉筆底線' });
  expect(r.status).toBe(200);
  const saved = await r.json();
  expect(saved.entry.slug).toBe('chalk-title');
  expect(thumbs).toEqual(['chalk-title']);
  const lib = await (await fetch(`${base}/api/library`)).json();
  expect(lib.blocks.map((b: any) => [b.type, b.name])).toEqual([['fx.chalk-title', 'chalk-title'], ['fx.chalk-line', '粉筆底線']]);
  expect(lib.blocks[0]).toMatchObject({ slug: 'chalk-title', kind: 'overlay', main: 'fx/chalk.js', group: ['fx.chalk-line'], thumb: null, from: { project: 'p1', file: 'fx/chalk.js' } });
  expect(lib.blocks[0].params[0].key).toBe('text');
  const js = await fetch(`${base}/api/library/blocks/chalk-title/fx/chalk.js`);
  expect(js.headers.get('content-type')).toContain('javascript');
});

test('a dry run says what would be saved and writes nothing', async () => {
  const { base, post } = await app();
  const d = await (await post('/api/library/blocks?dry=1', { project: 'p1', type: 'fx.chalk-title' })).json();
  expect(d).toMatchObject({ dry: true, group: ['fx.chalk-line'], conflict: null });
  expect([...d.files].sort()).toEqual(['fx/chalk.js', 'fx/util.js', 'media/fonts/Chalk.ttf']);
  expect((await (await fetch(`${base}/api/library`)).json()).blocks).toEqual([]);
});

test('a second save from another project is a 409 conflict; keep-both saves it', async () => {
  const { post } = await app();
  await post('/api/library/blocks', { project: 'p1', type: 'fx.chalk-title' });
  const dry = await (await post('/api/library/blocks?dry=1', { project: 'p3', type: 'fx.chalk-title' })).json();
  expect(dry.conflict).toMatchObject({ name: 'chalk-title' });
  const r = await post('/api/library/blocks', { project: 'p3', type: 'fx.chalk-title' });
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ code: 'library.conflict', params: { name: 'chalk-title' } });
  expect((await post('/api/library/blocks', { project: 'p3', type: 'fx.chalk-title', onConflict: 'keep-both' })).status).toBe(200);
});

test('use copies into the project and the project library shows the link', async () => {
  const { base, post } = await app();
  await post('/api/library/blocks', { project: 'p1', type: 'fx.chalk-title' });
  const u = await (await post('/api/projects/p2/library/use', { slug: 'chalk-title' })).json();
  expect(u).toMatchObject({ file: 'fx/lib/chalk-title/_entry.js', types: ['fx.chalk-title', 'fx.chalk-line'] });
  const info = await (await fetch(`${base}/api/projects/p2/library`)).json();
  expect(info.links).toEqual([{ slug: 'chalk-title', file: 'fx/lib/chalk-title/_entry.js', types: ['fx.chalk-title', 'fx.chalk-line'], outdated: false, gone: false }]);
  const p1 = await (await fetch(`${base}/api/projects/p1/library`)).json();
  expect(p1).toMatchObject({ savedFiles: ['fx/chalk.js'], savedStyles: [], styles: [{ id: 'street-jazz', label: 'street-jazz 風格', file: 'score/street-jazz.js' }] });
});

test('a block the project already has from elsewhere is a 409', async () => {
  const { post } = await app();
  await post('/api/library/blocks', { project: 'p1', type: 'fx.chalk-title' });
  const r = await post('/api/projects/p3/library/use', { slug: 'chalk-title' });
  expect(r.status).toBe(409);
  expect((await r.json()).code).toBe('library.idTaken');
});

test('rename, usage and delete', async () => {
  const { projects, base, post } = await app();
  await post('/api/library/blocks', { project: 'p1', type: 'fx.chalk-title' });
  await post('/api/projects/p2/library/use', { slug: 'chalk-title' });
  mkdirSync(join(projects, '_presets', 'my-food'), { recursive: true });
  writeFileSync(join(projects, '_presets', 'my-food', 'preset.md'), `---\n${JSON.stringify({ name: { zh: '我的美食' }, summary: { zh: 's' }, blocks: ['chalk-title'] })}\n---\nx\n`);
  const put = await fetch(`${base}/api/library/blocks/chalk-title/types/fx.chalk-title`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '粉筆標題卡' }) });
  expect((await put.json()).types[0].name).toBe('粉筆標題卡');
  expect(await (await fetch(`${base}/api/library/blocks/chalk-title/usage`)).json()).toEqual({ projects: 1, presets: ['我的美食'] });
  expect((await fetch(`${base}/api/library/blocks/chalk-title`, { method: 'DELETE' })).status).toBe(200);
  expect(existsSync(join(projects, '_library', 'blocks', 'chalk-title'))).toBe(false);
  expect((await (await fetch(`${base}/api/projects/p2/library`)).json()).links[0].gone).toBe(true);
});

test('styles: save, use, delete', async () => {
  const { projects, base, post } = await app();
  expect((await post('/api/library/styles', { project: 'p1', id: 'street-jazz' })).status).toBe(200);
  expect((await (await fetch(`${base}/api/library`)).json()).styles[0]).toMatchObject({ slug: 'street-jazz', id: 'street-jazz', defaults: { bpm: 96, key: 'C' } });
  expect(await (await post('/api/projects/p2/library/use', { style: 'street-jazz' })).json()).toEqual({ file: 'score/street-jazz.js', id: 'street-jazz' });
  expect((await fetch(`${base}/api/library/styles/street-jazz`, { method: 'DELETE' })).status).toBe(200);
  expect(existsSync(join(projects, '_library', 'score', 'street-jazz.js'))).toBe(false);
});

test('library routes refuse paths outside the library', async () => {
  const { base, post } = await app();
  await post('/api/library/blocks', { project: 'p1', type: 'fx.chalk-title' });
  for (const url of ['/api/library/blocks/..%2Fx/fx/a.js', '/api/library/blocks/chalk-title/..%2F..%2F..%2Fp1%2Fproject.json', '/api/library/blocks/chalk-title/entry.json'])
    expect([400, 404]).toContain((await fetch(base + url)).status);
  expect([400, 404]).toContain((await post('/api/library/blocks', { project: '../x', type: 'fx.a' })).status);
  expect([400, 404]).toContain((await fetch(`${base}/api/library/blocks/..%2Fx`, { method: 'DELETE' })).status);
});

test('preset-draft is 404 until the file exists', async () => {
  const { projects, base } = await app();
  expect((await fetch(`${base}/api/projects/p1/preset-draft`)).status).toBe(404);
  writeFileSync(join(projects, 'p1', 'preset-draft.json'), JSON.stringify({ name: 'x' }));
  expect(await (await fetch(`${base}/api/projects/p1/preset-draft`)).json()).toEqual({ name: 'x', blocks: [] });
});

test('the preset draft comes with the names of the blocks its modules hold', async () => {
  const { projects, base } = await app();
  writeFileSync(join(projects, 'p1', 'preset-draft.json'), JSON.stringify({ name: 'x', summary: '', points: [], fx: ['fx/chalk.js', 'fx/gone.js'] }));
  expect((await (await fetch(`${base}/api/projects/p1/preset-draft`)).json()).blocks).toEqual([{ file: 'fx/chalk.js', names: ['chalk-title', 'chalk-line'] }]);
});

test('the preset draft can be removed (a new Save as preset, or Cancel)', async () => {
  const { projects, base } = await app();
  writeFileSync(join(projects, 'p1', 'preset-draft.json'), JSON.stringify({ name: 'x' }));
  expect((await fetch(`${base}/api/projects/p1/preset-draft`, { method: 'DELETE' })).status).toBe(200);
  expect(existsSync(join(projects, 'p1', 'preset-draft.json'))).toBe(false);
  expect((await fetch(`${base}/api/projects/p1/preset-draft`, { method: 'DELETE' })).status).toBe(200);   // none: fine
});
