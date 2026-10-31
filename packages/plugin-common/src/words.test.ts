import { expect, test } from 'vitest';
import { chart, chartPlan, type ChartP } from './chart/index.ts';
import { resolveTheme } from '@tellcut/engine';
import { pollOf } from './story.ts';
import { ordinal, projectLang, textLang, wordsLang } from './words.ts';

test('the language of a text: kana make it Japanese, CJK characters Chinese, Latin letters English; no letters, none', () => {
  expect(textLang('一天裡的心情排行', 'Kahneman 等，2004')).toBe('zh');
  expect(textLang('World output: dried chilli vs black pepper', 'FAO 2017')).toBe('en');
  expect(textLang('もう一度行く？')).toBe('ja');
  expect(textLang('台北の夜市')).toBe('zh');                         // a lone の in a Chinese name
  expect(textLang('Who cooks at home', ' 萬噸')).toBe('en');          // a Chinese unit left at its default
  expect(textLang('', '2024', '⋯')).toBeNull();
  expect(textLang(undefined, 3)).toBeNull();
});

test('the project\'s language: the words its items were given, not ids, fonts or what is left at a Chinese default', () => {
  const types = (t: string): any => (t === 'common.caption' ? { params: [{ key: 'text', type: 'string', default: '字幕' }, { key: 'font', type: 'string', default: 'Noto Sans TC' }] } : undefined);
  const project = (params: Record<string, unknown>): any => ({ tracks: [{ items: [{ type: 'common.caption', params }, { type: 'nope', params: { text: '中文' } }, { source: 'a' }] }] });
  expect(projectLang(project({ text: 'Two days in Rome', font: 'Noto Sans TC' }), types)).toBe('en');
  expect(projectLang(project({ font: 'Inter' }), types)).toBeNull();
  expect(projectLang(project({ text: '羅馬兩天' }), types)).toBe('zh');
  expect(projectLang(project({ text: 'x' }))).toBeNull();            // no registry: nothing to tell words from ids
  expect(wordsLang(['', '2024'], { project: project({ text: 'Two days in Rome' }), types })).toBe('en');
  expect(wordsLang(['羅馬'], { project: project({ text: 'Two days in Rome' }), types })).toBe('zh');   // the block's own words first
  expect(wordsLang([])).toBe('zh');
});

test('ordinals', () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 112].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '112th']);
});

const defaults = Object.fromEntries(chart.params.map((d) => [d.key, d.default])) as unknown as ChartP;
const words = (over: Partial<ChartP>, lang?: 'zh' | 'en' | 'ja') =>
  chartPlan({ ...defaults, ...over }, 1080, 1920, resolveTheme(undefined, { width: 1080, height: 1920 }), 3, lang).texts.map((t) => t.text);

test('common.chart writes its own words in the language of its text: people\'s line, the gap, the rank tag', () => {
  expect(words({ kind: 'people', n: 10, k: 4 })).toContain('10 人中有 【4】 人');
  expect(words({ kind: 'people', n: 10, k: 4, title: 'Who cooks at home', source: '' })).toContain('【4】 out of 10');
  expect(words({ kind: 'people', n: 10, k: 4, title: '家で料理するのは誰' })).toContain('10 人中 【4】 人');
  expect(words({ kind: 'people', n: 10, k: 4, title: '', source: '' }, 'en')).toContain('【4】 out of 10');   // no words: the film's
  const bars = { compare: 'gap' as const, data: 'Black pepper|69\nDried chilli|463', unit: ' kt', title: 'World output' };
  expect(words(bars)).toContain('Gap 394 kt');
  expect(words({ compare: 'gap' })).toContain('差 394 萬噸');
  const rank = { kind: 'rank' as const, data: 'Sleep|5\nWork|4\nCommute|3', unit: '', hl: '3', title: 'A day, ranked' };
  expect(words(rank)).toContain('3rd');
  expect(words({ ...rank, title: '一天的排行', data: '睡覺|5\n上班|4\n通勤|3' })).toContain('第 3 名');
  // nothing Chinese is left on an English chart
  for (const over of [{ kind: 'people' as const, title: 'In English', source: '' }, bars, rank]) expect(words(over).join(' ')).not.toMatch(/[一-鿿]/);
});

test('common.story fills a poll with fewer than two answers with yes and no in its language', () => {
  expect(pollOf('', '').opts).toEqual(['是', '否']);
  expect(pollOf('Sure', '', 'en').opts).toEqual(['Sure', 'Yes']);
  expect(pollOf('', '', 'ja').opts).toEqual(['はい', 'いいえ']);
});
