import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { SourceAdapter, SourceCtx } from '../types.ts';
import { cocktaildb, mealdb } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
let dir: string, sent: string[];
const fakeFetch = (async (url: string | URL) => {
  const u = String(url), p = new URL(u).searchParams;
  sent.push(u);
  const json = (b: string) => new Response(b, { headers: { 'content-type': 'application/json' } });
  if (u.includes('themealdb.com/api')) {
    if (u.includes('search.php')) return json(p.get('s') === 'ramen' ? fx('meal-search-ramen') : fx('meal-search-none'));
    if (u.includes('filter.php')) return json(p.get('i') === 'salmon' ? fx('meal-filter-salmon') : '{"meals":null}');
    if (u.includes('lookup.php')) return json(p.get('i') === '53383' ? fx('meal-lookup') : '{"meals":null}');
  }
  if (u.includes('thecocktaildb.com/api')) {
    if (u.includes('search.php')) return json(p.get('s') === 'margarita' ? fx('drink-search-margarita') : '{"drinks":null}');
    if (u.includes('filter.php')) return json('{"drinks":"no data found"}');
  }
  if (u.includes('/api/')) return json('{"oops":true}');
  return new Response('jpg', { headers: { 'content-type': 'image/jpeg' } });
}) as typeof fetch;
const ctx = (a: SourceAdapter): SourceCtx => {
  const http = createHttp({ source: a.id, cacheDir: dir, limits: a.limits, fetch: fakeFetch });
  return { http, sub: () => http, options: {}, tmpDir: dir };
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'meal-')); sent = []; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('search by name, else by ingredient; the preview as the thumbnail', async () => {
  const ramen = await mealdb.search({ text: 'ramen', opts: {}, limit: 5 }, ctx(mealdb));
  expect(sent[0]).toBe('https://www.themealdb.com/api/json/v1/1/search.php?s=ramen');
  expect(ramen).toEqual([{ ref: 'mealdb:53383', source: 'mealdb', id: '53383', kind: 'image', title: 'Ramen Noodles with Boiled Egg',
    thumbUrl: 'https://www.themealdb.com/images/media/meals/ip5xtp1769779958.jpg/preview', detail: 'Miscellaneous · Chinese' }]);
  const salmon = await mealdb.search({ text: 'salmon', opts: {}, limit: 5 }, ctx(mealdb));
  expect(sent.at(-1)).toContain('filter.php?i=salmon');
  expect(salmon[0]).toMatchObject({ ref: 'mealdb:52959', title: 'Baked salmon with fennel & tomatoes' });
  const drinks = await cocktaildb.search({ text: 'margarita', opts: {}, limit: 5 }, ctx(cocktaildb));
  expect(drinks[0]).toMatchObject({ ref: 'cocktaildb:11007', title: 'Margarita', detail: 'Ordinary Drink · Alcoholic · Cocktail glass' });
  // TheCocktailDB says "no data found" instead of null: still nothing, not broken
  expect(await cocktaildb.search({ text: 'nothing', opts: {}, limit: 5 }, ctx(cocktaildb))).toEqual([]);
});

test('get looks the dish up and downloads its photo', async () => {
  const f = await mealdb.get('53383', ctx(mealdb));
  expect(sent.at(-1)).toBe('https://www.themealdb.com/images/media/meals/ip5xtp1769779958.jpg');
  expect(f).toMatchObject({ kind: 'image', file: join(dir, 'mealdb-53383.jpg'), meta: { title: 'Ramen Noodles with Boiled Egg', author: 'TheMealDB', page: 'https://www.themealdb.com/meal/53383' } });
  await expect(mealdb.get('1', ctx(mealdb))).rejects.toMatchObject({ kind: 'missing', message: 'TheMealDB 沒有 1 這個料理' });
  await expect(mealdb.get('ramen', ctx(mealdb))).rejects.toMatchObject({ kind: 'missing' });
});

test('data gives the recipe: category, ingredients with measures, steps; an ingredient lists the dishes with it', async () => {
  const out = await mealdb.data!('ramen', ctx(mealdb));
  const lines = out.split('\n');
  expect(lines[0]).toBe('Ramen Noodles with Boiled Egg　https://www.themealdb.com/meal/53383');
  expect(lines[1]).toBe('類別 Miscellaneous｜地區 Chinese');
  expect(lines[2]).toMatch(/^材料：.+（.+）/);
  expect(out).toContain('做法：Boil: Bring water to a boil');
  expect(out).toContain('影片：https://www.youtube.com/watch?v=AbJNVnkndS4');
  expect(await mealdb.data!('salmon', ctx(mealdb))).toContain('沒有叫「salmon」的料理；用到 salmon 的有：\nBaked salmon with fennel & tomatoes（mealdb:52959）');
  expect(await cocktaildb.data!('nothing', ctx(cocktaildb))).toBe('TheCocktailDB 找不到「nothing」（用英文菜名、酒名或材料）');
});

test('an answer without its list is broken', async () => {
  const http = createHttp({ source: 'mealdb', cacheDir: dir, limits: mealdb.limits, fetch: (async () => new Response('{"oops":1}', { headers: { 'content-type': 'application/json' } })) as typeof fetch });
  await expect(mealdb.search({ text: 'x', opts: {}, limit: 5 }, { http, sub: () => http, options: {}, tmpDir: dir })).rejects.toMatchObject({ kind: 'broken' });
});
