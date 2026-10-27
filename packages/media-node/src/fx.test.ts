import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corePlugin } from '@tellcut/engine';
import { loadProjectFx, projectRegistry } from './fx.ts';

const mod = (type: string, label = type) => `export default [{ type: '${type}', label: '${label}', kind: 'overlay', doc: 'd', params: [], build() { return 0; }, draw() {} }];\n`;

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fx-')); mkdirSync(join(dir, 'fx')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('imports the listed modules from the project folder', async () => {
  writeFileSync(join(dir, 'fx', 'a.js'), mod('fx.a'));
  const { registry, fx } = await projectRegistry(dir, [corePlugin], { meta: { fx: ['fx/a.js'] } });
  expect(fx.errors).toEqual([]);
  expect(registry.item('fx.a')?.label).toBe('fx.a');
  expect(registry.item('core.flash')).toBeDefined();
});

test('an edited module is read again, not taken from the module cache', async () => {
  const f = join(dir, 'fx', 'a.js');
  writeFileSync(f, mod('fx.a', 'one'));
  expect((await projectRegistry(dir, [corePlugin], { meta: { fx: ['fx/a.js'] } })).registry.item('fx.a')?.label).toBe('one');
  writeFileSync(f, mod('fx.a', 'two'));
  const later = new Date(Date.now() + 5000);
  (await import('node:fs')).utimesSync(f, later, later);
  expect((await projectRegistry(dir, [corePlugin], { meta: { fx: ['fx/a.js'] } })).registry.item('fx.a')?.label).toBe('two');
});

test('a project without fx gets the shared plugins; a missing or escaping path is an error, not a throw', async () => {
  expect((await projectRegistry(dir, [corePlugin], { meta: {} })).registry.item('core.flash')).toBeDefined();
  const r = await loadProjectFx(dir, ['fx/none.js', '../outside.js']);
  expect(r.errors.map((e) => e.path)).toEqual(['fx/none.js', '../outside.js']);
  expect(r.errors[1].message).toContain('之外');
});

test('an fx marked three loads in Node without three and makes usesThree true', async () => {
  // the 3D example uses ctx.three only inside build / draw, which Node never calls
  const { readFileSync } = await import('node:fs');
  const { usesThree } = await import('@tellcut/engine');
  writeFileSync(join(dir, 'fx', 'spin3d.js'), readFileSync(new URL('../../../tools/fx-example/spin3d.js', import.meta.url), 'utf8'));
  const project = { meta: { fx: ['fx/spin3d.js'] }, tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 's', type: 'fx.spin3d', start: 0, end: 2, params: {} }] }] };
  const { registry, fx } = await projectRegistry(dir, [corePlugin], project);
  expect(fx.errors).toEqual([]);
  expect(registry.item('fx.spin3d')?.three).toBe(true);
  expect(usesThree(project as any, registry)).toBe(true);
});
