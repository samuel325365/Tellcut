// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRegistry, loadFx, parseProject, Stage } from '@tellcut/engine';
import { plugins } from '@tellcut/plugins';

const media: any = { begin() {}, video: () => document.createElement('video'), place() {}, stillUrl: () => 'x.jpg', image: () => 'x.jpg', sync: async () => {} };

for (const id of ['baking4-guide']) {
  test(`${id}: every element id in the loaded stage is unique`, async () => {
    // a copy of a real project (the 2026-10-19 baking guide): no footage, only its file and its own fx (review3 R3-H5)
    const dir = join(process.cwd(), 'tools', 'fixtures', id);
    const p = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')));
    // the example has its own fx: load them as the player does
    const fx = await loadFx(p.meta.fx ?? [], (f) => import(pathToFileURL(join(dir, f)).href));
    expect(fx.errors).toEqual([]);
    const root = document.createElement('div');
    document.body.appendChild(root);
    new Stage(root, createRegistry(fx.plugin.items?.length ? [...plugins, fx.plugin] : plugins), media, { strict: true }).load(p);
    const ids = [...root.querySelectorAll('[id]')].map((e) => e.id);
    expect([...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))]).toEqual([]);
    root.remove();
  });
}
