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

test('every shared block parameter whose default is Chinese starts in English and Japanese too; no translation is left over', () => {
  const zh = chinese();
  expect(Object.keys(zh).length).toBeGreaterThan(180);
  for (const table of [VALUES_EN, VALUES_JA]) {
    expect(Object.keys(zh).filter((k) => table[k] === undefined)).toEqual([]);
    expect(Object.keys(table).filter((k) => !(k in zh))).toEqual([]);
  }
  expect(Object.entries(VALUES_EN).filter(([, v]) => IDEOGRAPH.test(v)).map(([k]) => k)).toEqual([]);
});

/** What the shared blocks' parsers split a text parameter on (grep plugin-common for `.split(`): lines and | fields everywhere, a
 *  written \n inside a field, and per block a comma list (both widths: /[,，]/), 、, ; or ；, : or ： (time:value pairs), > or ＞
 *  (geo routes), / (notify bodies, magazine and quote lines) and @ (a source and its time). A translation that adds or drops one
 *  of them changes how many parts the block draws. */
const SEPARATORS: Array<[string, RegExp]> = [
  ['line', /\n/g], ['field', /\|/g], ['written \\n', /\\n/g], ['comma', /[,，]/g], ['、', /、/g], ['semicolon', /[;；]/g],
  ['colon', /[:：]/g], ['arrow', /[>＞]/g], ['slash', /\//g], ['at', /@/g],
];
/** what a parameter's own parser does not split on, so a translation may write it as its language does: sentence punctuation in
 *  text split only on lines and | (quote: on spaces and /), and the / of progress' "step {n}/{N}" (split on | only) */
const PUNCTUATION = ['comma', '、', 'colon'];
const FREE: Record<string, string[]> = {
  'common.notecard.text': PUNCTUATION, 'common.postcard.lines': PUNCTUATION, 'common.slip.items': PUNCTUATION,
  'common.quote.text': PUNCTUATION, 'common.duo.topic': PUNCTUATION, 'common.versus.rows': PUNCTUATION,
  'common.reels.caption': PUNCTUATION, 'common.comments.items': PUNCTUATION, 'common.search.snip': PUNCTUATION,
  'common.magazine.headline': PUNCTUATION, 'common.progress.counter': ['slash'],
};
const parts = (s: string, re: RegExp) => (s.match(re) ?? []).length;

test('a translation keeps the default’s layout: as many of each separator the block parsers split on', () => {
  const zh = chinese(), bad: string[] = [];
  for (const [lang, table] of [['en', VALUES_EN], ['ja', VALUES_JA]] as const) for (const [k, z] of Object.entries(zh)) {
    const v = table[k];
    for (const [name, re] of SEPARATORS) {
      if (FREE[k]?.includes(name)) continue;
      if (parts(v, re) !== parts(z, re)) bad.push(`${lang} ${k}: ${name} ${parts(z, re)} → ${parts(v, re)}`);
    }
  }
  expect(bad).toEqual([]);
  // the exemptions are real parameters with Chinese defaults
  expect(Object.keys(FREE).filter((k) => !(k in zh))).toEqual([]);
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
