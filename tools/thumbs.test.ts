import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cases } from '../packages/plugin-common/golden/cases.ts';
import { THUMB_PARAMS } from '../packages/plugin-common/golden/thumbs.ts';
import { goldenFile } from '@tellcut/media-node';
import { THUMBS_DIR, thumbCases, thumbKey } from './thumbs.ts';

const IDEOGRAPH = /[぀-ヿ一-鿿]/;
const CJK = /[　-鿿＀-￯]/;
const firsts = () => { const m = new Map<string, (typeof cases)[number]>(); for (const c of cases) if (!m.has(c.type)) m.set(c.type, c); return [...m.values()]; };

test('the English thumbnails show no Chinese, and every thumbnail whose case is Chinese has its words in both languages', () => {
  const en = thumbCases('en');
  expect(en.length).toBeGreaterThan(50);
  expect(en.filter((c) => IDEOGRAPH.test(JSON.stringify(c.params))).map((c) => c.name)).toEqual([]);
  const chinese = firsts().filter((c) => CJK.test(JSON.stringify(c.params ?? {}))).map((c) => c.name);
  for (const lang of ['en', 'ja'] as const) {
    expect(chinese.filter((n) => !THUMB_PARAMS[lang][n])).toEqual([]);
    expect(Object.keys(THUMB_PARAMS[lang]).filter((n) => !chinese.includes(n))).toEqual([]);
  }
  // one moment each, the one the gallery shows (the case's last)
  const title = en.find((c) => c.type === 'core.title')!;
  expect(title.at).toEqual([cases.find((c) => c.name === title.name)!.at.at(-1)]);
});

test('every English and Japanese thumbnail is drawn from what the tables and the Chinese golden pictures say now (npm run thumbs after a change)', () => {
  const manifest = JSON.parse(readFileSync(join(THUMBS_DIR, 'manifest.json'), 'utf8')) as Record<string, Record<string, string>>;
  for (const lang of ['en', 'ja'] as const) {
    const want = Object.fromEntries(thumbCases(lang).map((c) => [goldenFile(c, c.at[0]), thumbKey(c)]));
    expect(manifest[lang], `npm run thumbs (${lang})`).toEqual(want);
    expect(Object.keys(want).filter((f) => !existsSync(join(THUMBS_DIR, lang, f)))).toEqual([]);
  }
});

test('a thumbnail is out of date when its block draws differently: the key follows the block’s own golden picture', () => {
  const [a, b] = thumbCases('en');
  // the same words and moment over another case's golden picture: only the picture differs
  expect(thumbKey({ ...a, name: b.name, at: b.at })).not.toBe(thumbKey({ ...a, at: b.at }));
});
