// The shared combos (engine combos.ts, spec 2026-11-16-combos): well formed, within the limit, each with picture layers of its own, a
// layer with a shape, and its golden sample. How far apart their pictures are is golden/combos.test.ts.
import { comboProblems, createRegistry, expandCombo, MAX_COMBOS, templateName, type Combo } from '@tellcut/engine';
import { plugins } from '@tellcut/plugins';
import { combos } from './combos.ts';
import { samples } from './samples.ts';

const registry = createRegistry(plugins);
const all = plugins.flatMap((p) => p.combos ?? []) as Combo[];
/** a combo's picture layers as a set: the blocks and templates it draws (not their params, timing or sound) */
const pictureSet = (c: Combo) => c.parts.filter((p) => p.kind === 'effect').map((p) => (p.template ? templateName(p.type!, p.template) : p.type!)).sort().join(' + ');

test('the common plugin carries the combos, the seed ones at least, and ids are unique across plugins', () => {
  expect(plugins.find((p) => p.id === 'common')!.combos).toBe(combos);
  expect(all.map((c) => c.id)).toEqual(expect.arrayContaining(['impact', 'glitchcut']));
  expect(all.map((c) => c.id).filter((id, i, a) => a.indexOf(id) !== i)).toEqual([]);
});

test('(a) every combo is well formed: one-word id, two layers or more with a picture, existing blocks, templates and sounds', () => {
  expect(all.flatMap((c) => comboProblems(c, registry))).toEqual([]);
});

test('(b) no two combos draw the same set of picture layers: only the sound or the timing apart is not a combo of its own', () => {
  const sets = all.map((c) => [c.id, pictureSet(c)] as const);
  expect(sets.filter(([, s], i) => sets.findIndex(([, t]) => t === s) !== i).map(([id, s]) => `${id}: ${s}`)).toEqual([]);
});

test('(c) every combo has a picture layer other than core.flash: the likeness measure cannot see a flat brightening', () => {
  expect(all.filter((c) => !c.parts.some((p) => p.kind === 'effect' && p.type !== 'core.flash')).map((c) => c.id)).toEqual([]);
});

test('(e) at most MAX_COMBOS combos', () => {
  expect(MAX_COMBOS).toBe(16);
  expect(all.length).toBeLessThanOrEqual(MAX_COMBOS);
});

test('(f) every combo has its golden sample, combo-<id>, drawing its picture layers as they expand', () => {
  const bad: string[] = [];
  for (const c of all) {
    const s = samples.find((x) => x.name === `combo-${c.id}`);
    if (!s) { bad.push(`${c.id}: 沒有樣本 combo-${c.id}`); continue; }
    if (s.combo !== c.id || s.type !== `combo:${c.id}`) bad.push(`${s.name}: 不是組合 ${c.id} 的樣本`);
    if (s.at.length !== 3) bad.push(`${s.name}: 要三個時間（開始、最強、收尾），現在 ${s.at.length} 個`);
    const want = expandCombo(c, registry).filter((p) => p.kind === 'effect').map((p) => [p.type, p.params, p.len, p.layer]);
    if (JSON.stringify(s.items?.map((x) => [x.type, x.params, +(x.end - x.start).toFixed(6), x.layer])) !== JSON.stringify(want)) bad.push(`${s.name}: 畫的層和組合展開的不一樣`);
  }
  expect(bad).toEqual([]);
  // the combos' samples come last: a new one never moves another sample
  const first = samples.findIndex((x) => x.combo);
  expect(samples.slice(first).every((x) => x.combo)).toBe(true);
});
