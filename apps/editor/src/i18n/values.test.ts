import { plugins } from '@tellcut/plugins';
import { hasCjk, localValues, VALUES_EN, VALUES_JA } from './values.ts';

const IDEOGRAPH = /[぀-ヿ一-鿿]/;
/** every shared block or sound parameter whose default is Chinese, as `<type>.<key>` → the default */
const chinese = () => {
  const out: Record<string, string> = {};
  for (const p of plugins) for (const t of [...(p.items ?? []), ...(p.sfx ?? [])]) for (const d of t.params ?? [])
    if (hasCjk(d.default)) out[`${t.type}.${d.key}`] = d.default as string;
  return out;
};
const count = (s: string, part: string) => s.split(part).length - 1;

test('every shared block parameter whose default is Chinese starts in English and Japanese too; no translation is left over', () => {
  const zh = chinese();
  expect(Object.keys(zh).length).toBeGreaterThan(180);
  for (const table of [VALUES_EN, VALUES_JA]) {
    expect(Object.keys(zh).filter((k) => table[k] === undefined)).toEqual([]);
    expect(Object.keys(table).filter((k) => !(k in zh))).toEqual([]);
  }
  expect(Object.entries(VALUES_EN).filter(([, v]) => IDEOGRAPH.test(v)).map(([k]) => k)).toEqual([]);
});

test('a translation keeps the default’s layout: its lines, its | fields, the \\n inside a field and the commas of a comma list', () => {
  const zh = chinese(), bad: string[] = [];
  for (const [lang, table] of [['en', VALUES_EN], ['ja', VALUES_JA]] as const) for (const [k, z] of Object.entries(zh)) {
    const v = table[k];
    for (const part of ['\n', '|', '\\n']) if (count(v, part) !== count(z, part)) bad.push(`${lang} ${k}: ${JSON.stringify(part)}`);
    if (z.includes(',') && count(v, ',') !== count(z, ',')) bad.push(`${lang} ${k}: ","`);
  }
  expect(bad).toEqual([]);
});

test('localValues gives a block’s Chinese-default parameters in the UI language, and nothing in Chinese', () => {
  const caption = plugins.flatMap((p) => p.items ?? []).find((t) => t.type === 'common.caption')!;
  expect(localValues('common.caption', caption.params, 'en')).toEqual({ text: VALUES_EN['common.caption.text'] });
  expect(localValues('common.caption', caption.params, 'ja')).toEqual({ text: VALUES_JA['common.caption.text'] });
  expect(localValues('common.caption', caption.params, 'zh')).toEqual({});
  // a project's own effect has no table
  expect(localValues('fx.mine', [{ key: 'text', label: '文字', type: 'string', default: '你好' }], 'en')).toEqual({});
});

test('a choice of language that defaults to Chinese (the reels counts, 1.2萬) follows the UI language when it offers it', () => {
  const reels = plugins.flatMap((p) => p.items ?? []).find((t) => t.type === 'common.reels')!;
  expect(localValues('common.reels', reels.params, 'en').counts).toBe('en');
  expect(localValues('common.reels', reels.params, 'ja').counts).toBe('ja');
  expect(localValues('common.reels', reels.params, 'zh')).toEqual({});
  expect(localValues('x.y', [{ key: 'style', label: '寫法', type: 'enum', options: ['zh', 'plain'], default: 'zh' }], 'en')).toEqual({});
});
