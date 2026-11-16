import { comboProblems, comboSpan, expandCombo, type ComboLookup } from './combos.ts';
import type { Combo, ItemType, SfxType } from './plugin.ts';

const lines = { type: 'fx.lines', params: [{ key: 'count', label: '', type: 'number', min: 8, max: 120, default: 48 }, { key: 'inner', label: '', type: 'number', default: 0.3 }],
  templates: [{ id: 'burst', label: '爆發', doc: '登場', params: { count: 80, inner: 0.15 } }] } as unknown as ItemType;
const flash = { type: 'fx.flash', params: [{ key: 'peak', label: '', type: 'number', min: 0, max: 1, default: 0.85 }], templates: [] } as unknown as ItemType;
const hit = { type: 'fx.hit', params: [] } as unknown as SfxType;
const lookup: ComboLookup = { item: (t) => [lines, flash].find((x) => x.type === t), sfx: (t) => (t === hit.type ? hit : undefined) };
const combo: Combo = { id: 'impact', label: '重擊', doc: 'A hit.', parts: [
  { name: 'lines', kind: 'effect', type: 'fx.lines', template: 'burst', params: { inner: 0.2 }, at: 0, len: 0.7 },
  { name: 'flash', kind: 'effect', type: 'fx.flash', params: { peak: 1 }, at: 0, len: 0.5, layer: 'top' },
  { name: 'hit', kind: 'sfx', type: 'fx.hit', at: -0.05, len: 1.4, gain: -6 },
  { name: 'shake', kind: 'shake', at: 0, len: 0.4, px: 28 },
] };

test('a well-formed combo has no problems', () => {
  expect(comboProblems(combo, lookup)).toEqual([]);
});

test('comboProblems finds each kind of mistake', () => {
  const part = (p: Record<string, unknown>) => ({ name: 'x', kind: 'effect', type: 'fx.lines', at: 0, len: 1, ...p }) as Combo['parts'][number];
  expect(comboProblems({ id: 'Big-Hit', label: '', doc: ' ', parts: [part({ kind: 'sfx', type: 'fx.hit' })] }, lookup)).toEqual([
    '組合 Big-Hit：id 要是一個小寫英文字（例如 impact）',
    '組合 Big-Hit：沒有 label',
    '組合 Big-Hit：沒有 doc（一行英文：什麼場合用）',
    '組合 Big-Hit：至少要兩層，現在 1 層',
    "組合 Big-Hit：至少要有一層畫面（kind: 'effect'）",
  ]);
  expect(comboProblems({ ...combo, parts: [
    part({ name: 'a', template: 'nope' }), part({ name: 'a', len: 0 }), part({ name: 'b', type: 'fx.none' }), part({ name: 'c', params: { count: 200, size: 1 } }),
    part({ name: 'd', kind: 'sfx', type: 'fx.lines', layer: 'top' }), part({ name: 'e', kind: 'shake', type: 'fx.lines', px: 0 }), part({ name: 'f', layer: 'over', gain: -3, hz: 9 }),
  ] }, lookup)).toEqual([
    '組合 impact/a：fx.lines 沒有「nope」這個範本；它有：burst',
    '組合 impact/a：name 重複',
    '組合 impact/a：len 要大於 0',
    '組合 impact/b：沒有「fx.none」這個積木',
    '組合 impact/c：count 200 大於最大值 120',
    '組合 impact/c：fx.lines 沒有 size 參數',
    '組合 impact/d：沒有「fx.lines」這個音效',
    '組合 impact/d：音效沒有 template、layer',
    '組合 impact/e：shake 是片段的晃動，不能有 type、template、params',
    '組合 impact/e：px 要大於 0',
    '組合 impact/f：px、hz 只有 shake 用',
    '組合 impact/f：gain 只有音效用',
    "組合 impact/f：layer 只能是 'top' 或 'under'",
  ]);
});

test('expandCombo: every layer in order, the template under the combo\'s params, times still relative to the moment', () => {
  expect(expandCombo(combo, lookup)).toEqual([
    { name: 'lines', kind: 'effect', type: 'fx.lines', at: 0, len: 0.7, params: { count: 80, inner: 0.2 } },
    { name: 'flash', kind: 'effect', type: 'fx.flash', at: 0, len: 0.5, params: { peak: 1 }, layer: 'top' },
    { name: 'hit', kind: 'sfx', type: 'fx.hit', at: -0.05, len: 1.4, params: {}, gain: -6 },
    { name: 'shake', kind: 'shake', at: 0, len: 0.4, params: {}, px: 28 },
  ]);
});

test('expandCombo: sound off, a layer left out, a layer\'s params changed; an unknown layer lists the names', () => {
  const out = expandCombo(combo, lookup, { sound: false, parts: { flash: false, lines: { count: 30 }, shake: { px: 10 } } });
  expect(out.map((p) => p.name)).toEqual(['lines', 'shake']);
  expect(out[0].params).toEqual({ count: 30, inner: 0.2 });
  expect(out[1].px).toBe(10);
  expect(expandCombo(combo, lookup, { parts: { hit: { gain: -12 } } }).find((p) => p.name === 'hit')).toMatchObject({ gain: -12, params: {} });
  expect(() => expandCombo(combo, lookup, { parts: { line: false } })).toThrow('組合 impact 沒有「line」這一層；它有：lines、flash、hit、shake');
  expect(() => expandCombo(combo, lookup, { parts: { shake: { dur: 1 } } })).toThrow(/只能改 px、hz/);
  expect(() => expandCombo(combo, lookup, { parts: { lines: 3 as never } })).toThrow(/要是 false 或參數物件/);
  // the combo's own data is never handed out
  expandCombo(combo, lookup)[1].params.peak = 0;
  expect(combo.parts[1].params).toEqual({ peak: 1 });
});

test('comboSpan: a layer before the film\'s start is cut at 0 and keeps its end; one over before 0 is dropped', () => {
  expect(comboSpan({ at: -0.3, len: 1 }, 2)).toEqual({ start: 1.7, end: 2.7 });
  expect(comboSpan({ at: -0.3, len: 1 }, 0.1)).toEqual({ start: 0, end: 0.8 });
  expect(comboSpan({ at: -0.8, len: 0.5 }, 0.2)).toBeNull();
});
