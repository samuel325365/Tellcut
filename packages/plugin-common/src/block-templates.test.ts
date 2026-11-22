// The block templates of every registered block (engine templates.ts, spec 2026-11-16-block-templates): well formed, within the
// limit, more than a colour apart from each other and from the block's defaults (admission rule 1), each with its golden sample. Rule 2, how different their pictures are, is
// golden/templates.test.ts.
import { colourOnlyFromDefault, colourOnlyPairs, MAX_TEMPLATES, templateProblems, type ItemType } from '@tellcut/engine';
import { TEMPLATE_KINDS } from '@tellcut/protocol';
import { plugins } from '@tellcut/plugins';
import { samples, templateSample } from './samples.ts';

const blocks = plugins.flatMap((p) => p.items ?? []) as ItemType[];
const withTemplates = blocks.filter((t) => t.templates?.length);

test('some blocks have templates (the seed ones at least)', () => {
  expect(withTemplates.map((t) => t.type)).toEqual(expect.arrayContaining(['common.leak', 'common.film']));
});

test('every block\'s templates are well formed: unique kebab-case ids, declared params, valid values, none empty, at most the limit', () => {
  expect(blocks.flatMap((t) => templateProblems(t))).toEqual([]);
  for (const t of withTemplates) expect(t.templates!.length, t.type).toBeLessThanOrEqual(MAX_TEMPLATES);
});

test('the caption and title blocks keep their own kind of template (a `template` param) and carry no templates list', () => {
  for (const k of Object.values(TEMPLATE_KINDS)) {
    const t = blocks.find((x) => x.type === k.block)!;
    expect(t.params.some((d) => d.key === 'template'), k.block).toBe(true);
    expect(t.templates, k.block).toBeUndefined();
  }
  // and no block has both
  expect(blocks.filter((t) => t.templates && t.params.some((d) => d.key === 'template')).map((t) => t.type)).toEqual([]);
});

test('templateProblems finds each kind of mistake', () => {
  const block = { type: 'fx.t', params: [
    { key: 'look', label: '', type: 'enum' as const, options: ['a', 'b'], default: 'a' },
    { key: 'n', label: '', type: 'number' as const, min: 0, max: 1, default: 0.5 },
    { key: 'on', label: '', type: 'bool' as const, default: false },
  ] };
  const tpl = (id: string, params: Record<string, unknown>) => ({ id, label: '範本', doc: '某個場合', params });
  expect(templateProblems({ ...block, templates: [tpl('ok-one', { look: 'b' })] })).toEqual([]);
  expect(templateProblems({ ...block, templates: [tpl('Bad_Id', { look: 'b' }), tpl('dup', { n: 2 }), tpl('dup', { look: 'c' }), tpl('none', {}), tpl('what', { size: 1, on: 'yes' })] })).toEqual([
    'fx.t/Bad_Id：id 要是小寫 kebab-case（例如 prism-sweep）',
    'fx.t/dup：n 2 大於最大值 1',
    'fx.t/dup：id 重複',
    'fx.t/dup：look 「c」不在選項 a / b 裡',
    'fx.t/none：params 是空的',
    'fx.t/what：fx.t 沒有 size 參數',
    'fx.t/what：on 要是 true 或 false，現在是 "yes"',
  ]);
  // a template that writes only the defaults (the colour included) would change nothing
  expect(templateProblems({ ...block, templates: [tpl('plain', { look: 'a', n: 0.5, on: false })] })).toEqual(['fx.t/plain：params 全都是預設值，套用它什麼都不會變']);
  const many = Array.from({ length: MAX_TEMPLATES + 1 }, (_, i) => tpl(`t${i}`, { n: i / 10 }));
  expect(templateProblems({ ...block, templates: many })[0]).toMatch(/最多 8 個/);
  expect(templateProblems({ ...block, params: [...block.params, { key: 'template', label: '', type: 'string', default: '' }], templates: [tpl('x', { look: 'b' })] })[0]).toMatch(/有 template 參數/);
});

test('admission rule 1: no two templates of a block differ only in colour, nor a template from the block\'s defaults', () => {
  // a colour block's templates differ in colour by nature: the colour measure of rule 2 keeps them apart instead
  const measured = withTemplates.filter((t) => t.likeness !== 'colour');
  expect(measured.flatMap((t) => colourOnlyPairs(t).map(([a, b]) => `${t.type}: ${a} / ${b}`))).toEqual([]);
  expect(measured.flatMap((t) => colourOnlyFromDefault(t).map((a) => `${t.type}: ${a} / 預設`))).toEqual([]);
});

test('rule 1 itself: colour dropped, the look differs or at least two other params do', () => {
  const block = { type: 'fx.t', params: [
    { key: 'look', label: '', type: 'enum' as const, options: ['a', 'b'], default: 'a' },
    { key: 'n', label: '', type: 'number' as const, default: 0.5 },
    { key: 'm', label: '', type: 'number' as const, default: 1 },
    { key: 'color', label: '', type: 'color' as const, default: '#fff' },
    { key: 'colors', label: '', type: 'string' as const, default: '#fff,#000' },
  ] };
  const tpl = (id: string, params: Record<string, unknown>) => ({ id, label: id, doc: id, params });
  // only colours apart: refused; one more param apart: still refused; the look, or two params: fine
  expect(colourOnlyPairs({ ...block, templates: [tpl('x', { color: '#f00' }), tpl('y', { color: '#00f', colors: '#0f0' })] })).toEqual([['x', 'y']]);
  expect(colourOnlyPairs({ ...block, templates: [tpl('x', { color: '#f00' }), tpl('y', { n: 0.9 })] })).toEqual([['x', 'y']]);
  expect(colourOnlyPairs({ ...block, templates: [tpl('x', { color: '#f00' }), tpl('y', { look: 'b' })] })).toEqual([]);
  expect(colourOnlyPairs({ ...block, templates: [tpl('x', { n: 0.1 }), tpl('y', { m: 2 })] })).toEqual([]);
  // a template that writes the default value is the same as one that leaves it out
  expect(colourOnlyPairs({ ...block, templates: [tpl('x', { look: 'a', n: 0.2 }), tpl('y', { n: 0.3 })] })).toEqual([['x', 'y']]);
  // against the block's defaults, the same measure: a colour, or a colour and one param, is not enough; the look or two params are
  expect(colourOnlyFromDefault({ ...block, templates: [tpl('tint', { color: '#f00', colors: '#0f0,#00f' }), tpl('one', { color: '#f00', n: 0.9 }), tpl('look', { look: 'b' }), tpl('two', { n: 0.1, m: 2 }), tpl('same-look', { look: 'a', m: 3 })] }))
    .toEqual(['tint', 'one', 'same-look']);
});

test('every template has its golden sample, <block>-tpl-<id>, drawn with the template\'s params', () => {
  const bad: string[] = [];
  for (const t of withTemplates) for (const x of t.templates!) {
    const s = samples.find((c) => c.name === templateSample(t.type, x.id));
    if (!s) { bad.push(`${t.type}/${x.id}: 沒有樣本 ${templateSample(t.type, x.id)}`); continue; }
    if (s.type !== t.type) bad.push(`${s.name}: 是 ${s.type} 的樣本`);
    for (const [k, v] of Object.entries(x.params)) if (JSON.stringify(s.params?.[k]) !== JSON.stringify(v)) bad.push(`${s.name}: ${k} 不是範本的 ${JSON.stringify(v)}`);
  }
  expect(bad).toEqual([]);
  expect(templateSample('common.leak', 'prism-sweep')).toBe('leak-tpl-prism-sweep');
  expect(templateSample('core.flash', 'fade-black')).toBe('core-flash-tpl-fade-black');
});

test('rule 1 leaves out the colour blocks, and only them; a template of only defaults is refused in both', () => {
  expect(blocks.filter((t) => t.likeness === 'colour').map((t) => t.type).sort()).toEqual(['common.grade', 'common.tone', 'core.flash']);
  const block = { type: 'fx.t', params: [{ key: 'color', label: '', type: 'color' as const, default: '#fff' }, { key: 'n', label: '', type: 'number' as const, default: 0.5 }] };
  const tpl = (id: string, params: Record<string, unknown>) => ({ id, label: id, doc: id, params });
  const t = { ...block, templates: [tpl('red', { color: '#f00' }), tpl('blue', { color: '#00f' })] };
  // colour-only pairs by the measure, which the admission test above skips on a block marked 'colour'; well formed all the same, while
  // a template of only defaults is refused whatever the block
  expect(colourOnlyPairs(t)).toEqual([['red', 'blue']]);
  expect(templateProblems(t)).toEqual([]);
  expect(templateProblems({ ...block, templates: [tpl('plain', { color: '#fff' })] })).toEqual(['fx.t/plain：params 全都是預設值，套用它什麼都不會變']);
});
