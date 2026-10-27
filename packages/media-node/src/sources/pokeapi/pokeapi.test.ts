import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { SourceCtx } from '../types.ts';
import { describe as describeSpecies, matchSpecies, pokeapi } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
let dir: string, sent: Array<{ url: string; body?: string }>, gqlAnswer: string | null;
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url), body = typeof init?.body === 'string' ? init.body : undefined;
  sent.push({ url: u, body });
  const json = (b: string) => new Response(b, { headers: { 'content-type': 'application/json' } });
  if (u.includes('graphql')) {
    if (gqlAnswer) return json(gqlAnswer);
    if (body!.includes('by_pk(id: $id)')) return json(fx('gql-25'));
    if (body!.includes('by_pk(id: 25)')) return json('{"data":{"s":{"name":"pikachu"}}}');
    return json(fx('gql-index'));
  }
  if (u.endsWith('/99999.png') || u.includes('/home/shiny/134')) return new Response('Not Found', { status: 404 });
  return new Response('PNG-bytes', { headers: { 'content-type': 'image/png' } });
}) as typeof fetch;
const ctx = (): SourceCtx => {
  const http = createHttp({ source: 'pokeapi', cacheDir: dir, limits: pokeapi.limits, fetch: fakeFetch });
  return { http, sub: () => http, options: {}, tmpDir: dir };
};
const gqlCalls = () => sent.filter((s) => s.url.includes('graphql')).length;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'poke-')); sent = []; gqlAnswer = null; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('a name in Chinese, English or Japanese, part of one, or a number finds the species; exact names first', () => {
  const all = JSON.parse(fx('gql-index')).data.species;
  expect(matchSpecies(all, '皮卡丘').map((s: any) => s.id)).toEqual([25]);
  expect(matchSpecies(all, 'pikachu').map((s: any) => s.id)).toEqual([25]);
  expect(matchSpecies(all, 'リザードン').map((s: any) => s.id)).toEqual([6]);
  expect(matchSpecies(all, '#025').map((s: any) => s.id)).toEqual([25]);
  expect(matchSpecies(all, '妙蛙').map((s: any) => s.id)).toEqual([1, 2, 3]);
  expect(matchSpecies(all, '雷丘')[0].id).toBe(26);
  expect(matchSpecies(all, 'zzzz')).toEqual([]);
});

test('search answers from the name list, kept for 30 days, with the artwork as its preview', async () => {
  const hits = await pokeapi.search({ text: '噴火龍', opts: {}, limit: 5 }, ctx());
  expect(hits).toEqual([{ ref: 'pokeapi:6', source: 'pokeapi', id: '6', kind: 'image', title: '噴火龍（Charizard）#006',
    thumbUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png', detail: '官方插圖 · 去背 PNG' }]);
  await pokeapi.search({ text: '伊布', opts: { style: 'home', shiny: 'true' }, limit: 5 }, ctx());
  expect(gqlCalls()).toBe(1);
  const home = await pokeapi.search({ text: 'eevee', opts: { style: 'home', shiny: 'true' }, limit: 5 }, ctx());
  expect(home[0]).toMatchObject({ ref: 'pokeapi:133-home-shiny', thumbUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/133.png' });
  await expect(pokeapi.search({ text: 'x', opts: { style: '3d' }, limit: 5 }, ctx())).rejects.toThrow('--opt style 只能是 artwork 或 home');
});

test('get downloads the picture its id names, credited to its owners', async () => {
  const f = await pokeapi.get('25-home', ctx());
  expect(sent.at(-1)!.url).toBe('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/25.png');
  expect(f).toMatchObject({ kind: 'image', file: join(dir, 'pokeapi-25-home.png'), meta: { source: 'pokeapi', id: '25-home', title: '皮卡丘（Pikachu）#025 HOME', license: expect.stringContaining('Nintendo') } });
  await expect(pokeapi.get('pikachu', ctx())).rejects.toMatchObject({ kind: 'missing' });
  await expect(pokeapi.get('99999', ctx())).rejects.toMatchObject({ kind: 'missing', message: '沒有編號 99999 的寶可夢' });
  await expect(pokeapi.get('134-home-shiny', ctx())).rejects.toMatchObject({ kind: 'missing', message: '水伊布（Vaporeon）#134 沒有 HOME 圖（異色）' });
});

test('data tells a species in Traditional Chinese: types, stats with their total, abilities, family, Pokédex text', async () => {
  const out = await pokeapi.data!('皮卡丘', ctx());
  expect(out.split('\n').slice(0, 9)).toEqual([
    '皮卡丘（Pikachu／ピカチュウ）#025　鼠寶可夢',
    '屬性：電',
    '身高 0.4 m、體重 6.0 kg',
    '種族值：HP 35、攻擊 55、防禦 40、特攻 50、特防 50、速度 90（合計 320）',
    '特性：靜電、避雷針（隱藏特性）',
    '進化家族：皮丘、皮卡丘、雷丘',
    '第 1 世代；捕獲率 190',
    '圖鑑：皮卡丘們把尾巴貼在一起交換電流，其實是在互相打招呼。',
    '',
  ]);
  expect(out).toContain('pokeapi:25-home');
  expect(await pokeapi.data!('不存在的', ctx())).toBe('找不到寶可夢「不存在的」（中文、英文、日文名或編號都可以）');
});

test('a GraphQL answer with errors is broken, never cached', async () => {
  gqlAnswer = '{"errors":[{"message":"field \'pokemon_v2_pokemonspecies\' not found"}]}';
  await expect(pokeapi.search({ text: 'x', opts: {}, limit: 5 }, ctx())).rejects.toMatchObject({ kind: 'broken', message: expect.stringContaining('not found') });
  gqlAnswer = null;
  expect(await pokeapi.search({ text: '25', opts: {}, limit: 5 }, ctx())).toHaveLength(1);
  expect(await pokeapi.check(ctx())).toBe('GraphQL 可連線（25 號是 pikachu）');
  expect(describeSpecies).toBeTypeOf('function');
});
