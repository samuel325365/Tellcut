import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cardSample, samples, templateSample, type Sample } from '@tellcut/plugin-common/samples';
import { THUMB_PARAMS } from '../packages/plugin-common/golden/thumbs.ts';
import { goldenFile } from '@tellcut/media-node';
import { THUMBS_DIR, thumbCases, thumbKey, variantCards } from './thumbs.ts';

const IDEOGRAPH = /[぀-ヿ一-鿿]/;
const CJK = /[　-鿿＀-￯]/;
/** each block's card (its first sample, or that one over the street) */
const firsts = () => { const m = new Map<string, (typeof samples)[number]>(); for (const c of samples) if (!c.clips && !m.has(c.type)) m.set(c.type, cardSample(c.type)!); return [...m.values()]; };
/** the block templates' cards, <block>-tpl-<id> (or over the street): each is a thumbnail too (thumbs.ts thumbCases) */
const blockTemplates = () => samples.filter((c) => /.-tpl-/.test(c.name) && !c.street).map((c) => cardSample(c.type, c.name.slice(templateSample(c.type, '').length))!);

test('the English thumbnails show no Chinese, and every thumbnail whose case is Chinese has its words in both languages', () => {
  const en = thumbCases('en');
  expect(en.length).toBeGreaterThan(50);
  expect(en.filter((c) => IDEOGRAPH.test(JSON.stringify(c.params))).map((c) => c.name)).toEqual([]);
  // the tables name the sample a card is drawn from (a card over the street has its words)
  const chinese = [...firsts(), ...blockTemplates(), ...variantCards()].filter((c) => CJK.test(JSON.stringify(c.params ?? {}))).map((c) => c.street ?? c.name);
  for (const lang of ['en', 'ja'] as const) {
    expect(chinese.filter((n) => !THUMB_PARAMS[lang][n])).toEqual([]);
    expect(Object.keys(THUMB_PARAMS[lang]).filter((n) => !chinese.includes(n))).toEqual([]);
    const drawn = new Set(thumbCases(lang).map((c) => (c as Sample).street ?? c.name));
    expect([...new Set(chinese)].filter((n) => !drawn.has(n))).toEqual([]);
  }
  // one moment each, the one the gallery shows (the case's last)
  const title = en.find((c) => c.type === 'core.title')!;
  expect(title.at).toEqual([samples.find((c) => c.name === title.name)!.at.at(-1)]);
});

test('a variant’s card is a thumbnail too when it shows Chinese: its own words, or the ones its block starts with', () => {
  const variants = new Set(variantCards().map((c) => c.name));
  for (const lang of ['en', 'ja'] as const) {
    const names = thumbCases(lang).map((c) => c.name);
    // drawn once each, though a variant's card may be its block's card or a template's too
    expect(names.length).toBe(new Set(names).size);
    // its own Chinese words (chart's pie, flatlay's card), or its block's (progress's ring sets none of its own)
    expect(names.filter((n) => variants.has(n))).toEqual(expect.arrayContaining(['chart-pie', 'flatlay-card', 'progress-ring']));
    // a variant whose picture has no Chinese has no copy (the gallery shows the shared one): a lens over the street, a sample in English
    expect(names.filter((n) => ['lens-streak-street', 'slam-gold', 'headline-brand'].includes(n))).toEqual([]);
  }
  expect(['lens-streak-street', 'slam-gold', 'headline-brand'].every((n) => variants.has(n))).toBe(true);
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
