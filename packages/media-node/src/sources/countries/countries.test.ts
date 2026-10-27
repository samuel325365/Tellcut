import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { SourceCtx } from '../types.ts';
import { countries, matchCountries } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
let dir: string, sent: string[];
const fakeFetch = (async (url: string | URL) => {
  const u = String(url);
  sent.push(u);
  const json = (b: string) => new Response(b, { headers: { 'content-type': 'application/json' } });
  if (u.includes('mledoze')) return json(fx('countries'));
  if (u.includes('worldbank.org/v2/country/JPN')) return json(fx('wb-jpn'));
  if (u.includes('worldbank.org')) return json('[{"page":0,"pages":0,"total":0},null]');
  return new Response('png', { headers: { 'content-type': 'image/png' } });
}) as typeof fetch;
const ctx = (): SourceCtx => {
  const http = createHttp({ source: 'countries', cacheDir: dir, limits: countries.limits, fetch: fakeFetch });
  return { http, sub: () => http, options: {}, tmpDir: dir };
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'countries-')); sent = []; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('a country is found by its Traditional Chinese, Japanese or English name, or its code', () => {
  const all = JSON.parse(fx('countries'));
  const ids = (q: string) => matchCountries(all, q).map((c: any) => c.cca2);
  expect(ids('蒙特內哥羅')).toEqual(['ME']);
  expect(ids('紐西蘭')).toEqual(['NZ']);
  expect(ids('モンテネグロ')).toEqual(['ME']);
  expect(ids('montenegro')).toEqual(['ME']);
  expect(ids('JPN')).toEqual(['JP']);
  expect(ids('美國')).toEqual(['US']);
  expect(ids('Atlantis')).toEqual([]);
});

test('search and get: the flag as a big PNG, named the way Taiwan writes it', async () => {
  const hits = await countries.search({ text: '日本', opts: {}, limit: 5 }, ctx());
  expect(hits).toEqual([{ ref: 'countries:jp', source: 'countries', id: 'jp', kind: 'image', title: '日本國旗（Japan）', thumbUrl: 'https://flagcdn.com/w320/jp.png', detail: '國旗 PNG · 寬 2560' }]);
  const f = await countries.get('JP', ctx());
  expect(sent.at(-1)).toBe('https://flagcdn.com/w2560/jp.png');
  expect(f).toMatchObject({ kind: 'image', file: join(dir, 'countries-jp.png'), meta: { id: 'jp', license: 'Public domain' } });
  await expect(countries.get('zz', ctx())).rejects.toMatchObject({ kind: 'missing' });
});

test('data: names, capital, population from the World Bank, area, languages, currency in Chinese, neighbours', async () => {
  const jp = (await countries.data!('日本', ctx())).split('\n');
  expect(jp[0]).toBe('日本（Japan；正式名稱 Japan）🇯🇵');
  expect(jp[1]).toBe('首都 Tokyo｜區域 Asia／Eastern Asia');
  expect(jp[2]).toBe('人口 1.23 億（2025 年，世界銀行）｜面積 377,930 平方公里');
  expect(jp[3]).toBe('語言 Japanese｜貨幣 日圓（JPY，¥）');
  const tw = await countries.data!('台灣', ctx());
  expect(tw).toContain('人口：世界銀行沒有資料');
  const me = await countries.data!('Montenegro', ctx());
  expect(me).toMatch(/^蒙特內哥羅（Montenegro/);
  expect(me).toContain('貨幣 歐元（EUR，€）');
  expect(await countries.data!('Atlantis', ctx())).toBe('找不到國家「Atlantis」（中文、英文名或代碼都可以）');
});
