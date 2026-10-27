import { loadFx } from './fx.ts';

const item = (type: string, extra: object = {}) => ({ type, label: type, kind: 'overlay', doc: 'd', params: [], build: () => 0, draw: () => {}, ...extra });
const importer = (mods: Record<string, unknown>) => async (path: string) => {
  if (!(path in mods)) throw new Error(`cannot load ${path}`);
  return mods[path];
};

test('collects the item types of every module into one plugin', async () => {
  const r = await loadFx(['fx/a.js', 'fx/b.js'], importer({ 'fx/a.js': { default: [item('fx.a')] }, 'fx/b.js': { default: [item('fx.b'), item('fx.c')] } }));
  expect(r.errors).toEqual([]);
  expect(r.plugin.id).toBe('fx');
  expect(r.plugin.items!.map((i) => i.type)).toEqual(['fx.a', 'fx.b', 'fx.c']);
});

test('refuses a type without the fx. prefix, a missing build/draw, a non-array default and a duplicate id', async () => {
  const r = await loadFx(['fx/p.js', 'fx/q.js', 'fx/r.js', 'fx/s.js', 'fx/t.js'], importer({
    'fx/p.js': { default: [item('core.sneaky')] },
    'fx/q.js': { default: [item('fx.q', { draw: undefined })] },
    'fx/r.js': { default: item('fx.r') },
    'fx/s.js': { default: [item('fx.s')] },
    'fx/t.js': { default: [item('fx.s')] },
  }));
  expect(r.plugin.items!.map((i) => i.type)).toEqual(['fx.s']);
  expect(r.errors.map((e) => e.path)).toEqual(['fx/p.js', 'fx/q.js', 'fx/r.js', 'fx/t.js']);
  expect(r.errors[0].message).toContain('fx.');
  expect(r.errors[3].message).toContain('fx.s');
});

test('a duplicate id inside one module refuses that module (it never reaches the registry)', async () => {
  const r = await loadFx(['fx/u.js', 'fx/v.js'], importer({ 'fx/u.js': { default: [item('fx.u'), item('fx.u')] }, 'fx/v.js': { default: [item('fx.v')] } }));
  expect(r.plugin.items!.map((i) => i.type)).toEqual(['fx.v']);
  expect(r.errors).toEqual([{ path: 'fx/u.js', message: expect.stringContaining('fx.u 重複') }]);
});

test('a module that fails to load is reported and the others still load', async () => {
  const r = await loadFx(['fx/gone.js', 'fx/a.js'], importer({ 'fx/a.js': { default: [item('fx.a')] } }));
  expect(r.plugin.items!.map((i) => i.type)).toEqual(['fx.a']);
  expect(r.errors).toEqual([{ path: 'fx/gone.js', message: 'cannot load fx/gone.js' }]);
});

test('a missing doc is a warning, not a refusal', async () => {
  const r = await loadFx(['fx/a.js'], importer({ 'fx/a.js': { default: [item('fx.a', { doc: undefined })] } }));
  expect(r.plugin.items).toHaveLength(1);
  expect(r.warnings).toEqual([{ path: 'fx/a.js', message: 'fx.a 沒有 doc（block catalog 會看不到它的說明）' }]);
});

const sound = (type: string, extra: object = {}) => ({ type, label: type, doc: 'd', params: [], duration: () => 0.2, synth: () => {}, ...extra });
test('a module may also export sfx, its own sound effects (fx.*), alone or beside its item types; bad ones refuse the module', async () => {
  const r = await loadFx(['fx/a.js', 'fx/b.js', 'fx/c.js', 'fx/d.js', 'fx/e.js'], importer({
    'fx/a.js': { default: [item('fx.a')], sfx: [sound('fx.zip')] },
    'fx/b.js': { sfx: [sound('fx.zap', { doc: undefined })] },                 // no default: only sounds
    'fx/c.js': { sfx: [sound('common.sneaky')] },
    'fx/d.js': { default: [], sfx: [sound('fx.d', { synth: undefined })] },
    'fx/e.js': { default: [], sfx: [sound('fx.zip')] },                        // taken by fx/a.js
  }));
  expect(r.plugin.items!.map((i) => i.type)).toEqual(['fx.a']);
  expect(r.plugin.sfx!.map((s) => s.type)).toEqual(['fx.zip', 'fx.zap']);
  expect(r.errors.map((e) => e.path)).toEqual(['fx/c.js', 'fx/d.js', 'fx/e.js']);
  expect(r.errors[0].message).toContain('fx.');
  expect(r.warnings.map((w) => w.message)).toEqual([expect.stringContaining('fx.zap')]);
  // without any sounds the plugin carries no sfx list (the registry stays as it was)
  expect((await loadFx(['fx/a.js'], importer({ 'fx/a.js': { default: [item('fx.a')] } }))).plugin.sfx).toBeUndefined();
});
