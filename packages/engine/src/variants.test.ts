import type { ParamDef } from './plugin.ts';
import { VARIANT_BLOCK_DOC, VARIANT_PARAMS, variantCode, variantProblems } from './variants.ts';

const params: ParamDef[] = [
  { key: 'mode', label: '樣式', type: 'enum', options: ['bar', 'dots', 'ring'], default: 'bar' },
  { key: 'color', label: '顏色', type: 'color', default: '#fff' },
];
const list = () => [
  { value: 'bar', label: '進度條', doc: '細長的一條' },
  { value: 'dots', label: '圓點', doc: '一排圓點' },
  { value: 'ring', label: '圓環', doc: '一個圓環' },
];
const block = (variants: unknown) => ({ type: 'common.progress', params, variants } as Parameters<typeof variantProblems>[0]);

test('a block without variants, or with a list that matches its options, has no problems', () => {
  expect(variantProblems({ type: 'common.slam', params })).toEqual([]);
  expect(variantProblems(block({ param: 'mode', list: list() }))).toEqual([]);
  expect(variantProblems(block({ param: 'mode', list: [{ ...list()[0], sample: 'progress' }, ...list().slice(1)] }))).toEqual([]);
});

test('variants must be { param, list }', () => {
  expect(variantProblems(block([]))).toEqual(['common.progress 的 variants 要是 { param, list }']);
  expect(variantProblems(block({ param: 'mode' }))).toEqual(['common.progress 的 variants 要是 { param, list }']);
  expect(variantProblems(block('mode'))).toEqual(['common.progress 的 variants 要是 { param, list }']);
});

test('param must be one of the block\'s enum params', () => {
  expect(variantProblems(block({ param: 'look', list: list() }))).toEqual(['common.progress 的 variants.param「look」不是它的選項（enum）參數']);
  expect(variantProblems(block({ param: 'color', list: list() }))).toEqual(['common.progress 的 variants.param「color」不是它的選項（enum）參數']);
});

test('the list must be the options, in their order: it names what is missing, what is extra, and a wrong order', () => {
  expect(variantProblems(block({ param: 'mode', list: list().slice(0, 2) }))).toEqual(['common.progress 的樣式少了 ring（mode 的選項是 bar / dots / ring）']);
  expect(variantProblems(block({ param: 'mode', list: [...list(), { value: 'pie', label: '圓餅', doc: '一塊圓餅' }] })))
    .toEqual(['common.progress 的樣式多了 pie（mode 沒有這個選項）']);
  const [a, b, c] = list();
  expect(variantProblems(block({ param: 'mode', list: [b, a, c] }))).toEqual(['common.progress 的樣式順序要和 mode 的選項相同：bar / dots / ring']);
});

test('a value listed twice', () => {
  const [a, b, c] = list();
  const out = variantProblems(block({ param: 'mode', list: [a, b, b, c] }));
  expect(out).toContain('common.progress@dots：value 重複');
});

test('an empty label or doc', () => {
  const [a, b, c] = list();
  expect(variantProblems(block({ param: 'mode', list: [{ ...a, label: ' ' }, b, c] }))).toEqual(['common.progress@bar：沒有 label']);
  expect(variantProblems(block({ param: 'mode', list: [a, { ...b, doc: '' }, c] }))).toEqual(['common.progress@dots：沒有 doc（要寫長什麼樣、用在什麼場合）']);
});

test('constants and how a variant is written', () => {
  expect(VARIANT_PARAMS).toContain('mode');
  expect(VARIANT_BLOCK_DOC).toBe(500);
  expect(variantCode('mode', 'rocket')).toBe("mode: 'rocket'");
});
