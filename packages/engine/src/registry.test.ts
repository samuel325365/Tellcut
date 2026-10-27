// @vitest-environment jsdom
import { createRegistry } from './registry.ts';
import { corePlugin } from './core.ts';

test('registers items, sfx, grades and css; rejects duplicates', () => {
  const reg = createRegistry([corePlugin, { id: 'x', grades: { warm: 'sepia(.1)' }, css: '.a{}' }]);
  expect(reg.item('core.flash')).toBeDefined();
  expect(reg.grades.warm).toBe('sepia(.1)');
  expect(Object.values(reg.cssById)).toEqual(['.a{}']);
  expect(() => createRegistry([corePlugin, corePlugin])).toThrow('Duplicate item type "core.flash"');
});

test('core.flash follows rise / hold / fall with a power curve', () => {
  const flash = createRegistry([corePlugin]).item('core.flash')!;
  const root = document.createElement('div');
  const ctx = (local: number, params: any): any => ({ t: local, local, dur: 1, item: { id: 'f', start: 0, end: 1, type: 'core.flash', params }, params, root, W: 10, H: 10 });
  const params = { peak: 0.85, rise: 0, hold: 0, fall: 0.3, power: 2, color: '#fff' };
  const st = flash.build(ctx(0, params));
  flash.draw(ctx(0.15, params), st);
  expect(parseFloat((root.firstChild as HTMLElement).style.opacity)).toBeCloseTo(0.85 * 0.25, 3);
  const bloom = { peak: 0.95, rise: 0.95, hold: 0.1, fall: 0.95, power: 1, color: '#fffaf3' };
  const st2 = flash.build(ctx(0, bloom));
  flash.draw(ctx(0.475, bloom), st2);
  expect(parseFloat((root.lastChild as HTMLElement).style.opacity)).toBeCloseTo(0.475, 3);
  // keys: the opacity itself, eased between keys and held after the last (a fade to black)
  const keys = { ...params, keys: '0:0, 0.3:1', color: '#000' };
  const st3 = flash.build(ctx(0, keys));
  flash.draw(ctx(0.15, keys), st3);
  expect(parseFloat((root.lastChild as HTMLElement).style.opacity)).toBeCloseTo(0.5, 3);
  flash.draw(ctx(5, keys), st3);
  expect(parseFloat((root.lastChild as HTMLElement).style.opacity)).toBe(1);
  // bloom: the layer stays fully shown, the glow's strength is in its gradient (color-mix, which jsdom does not parse)
  const glow = { ...params, mode: 'bloom', rise: 1, hold: 1, fall: 0, peak: 0.9, x: 0.5, y: 0.5 };
  const st4 = flash.build(ctx(0, glow));
  flash.draw(ctx(1.5, glow), st4);
  expect((root.lastChild as HTMLElement).style.opacity).toBe('1');
});

test('core.flash keys: parsed, sorted, junk dropped; blend sets the layer\'s blend mode', async () => {
  const { flashKeys, flashAt } = await import('./core.ts');
  const k = flashKeys('0.3:1, 0:0, x:2, 1');
  expect(k).toEqual([[0, 0], [0.3, 1]]);
  expect(flashAt(k, -1)).toBe(0);
  expect(flashAt(k, 2)).toBe(1);
  expect(flashAt([], 1)).toBe(0);
  const flash = createRegistry([corePlugin]).item('core.flash')!, root = document.createElement('div');
  flash.build({ t: 0, local: 0, dur: 1, params: { blend: 'screen', color: '#fff' }, root, W: 10, H: 10 } as any);
  expect(root.style.mixBlendMode).toBe('screen');
});

test('the registry lists its item and sound-effect types', () => {
  const reg = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.a', label: 'A', kind: 'overlay', params: [], build: () => null, draw: () => {} }],
    sfx: [{ type: 'x.tap', label: '點', params: [], duration: () => 0.1, synth() {} }] } as any]);
  expect(reg.itemTypes().map((t) => t.type)).toEqual(['core.flash', 'core.title', 'core.caption', 'core.lowerThird', 'core.endCard', 'x.a']);
  expect(reg.sfxTypes().map((t) => t.type)).toEqual(['x.tap']);
});

test('plugins bring SVG filters whose ids start with the plugin id', () => {
  const r = createRegistry([{ id: 'red', svg: '<filter id="red-dawn"><feColorMatrix type="saturate" values="0.6"/></filter>', grades: { dawn: 'url(#red-dawn)' } }]);
  expect(r.svgById.red).toContain('red-dawn');
  expect(r.grades.dawn).toBe('url(#red-dawn)');
  expect(() => createRegistry([{ id: 'red', svg: '<filter id="dawn"></filter>' }])).toThrow(/red.*dawn/);
  const twice = { id: 'a', svg: '<filter id="a-x"></filter>' };
  expect(() => createRegistry([twice, twice])).toThrow(/Duplicate SVG filter id "a-x"/);
});

test('SVG filter ids written in single quotes are checked too; core fonts include Noto Serif TC 500', () => {
  expect(() => createRegistry([{ id: 'red', svg: "<filter id='dawn'></filter>" }])).toThrow(/red.*dawn/);
  expect(createRegistry([{ id: 'red', svg: "<filter id='red-dawn'></filter>" }]).svgById.red).toContain('red-dawn');
  expect(corePlugin.fonts).toContain('Noto Serif TC:wght@400;500;700');
});
