import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { SourceCtx } from '../types.ts';
import { anime } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
let dir: string, sent: Array<{ url: string; body?: any }>, status: number;
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url), body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  sent.push({ url: u, body });
  const json = (b: string, s = 200) => new Response(b, { status: s, headers: { 'content-type': 'application/json' } });
  if (status !== 200) return json('{"errors":[{"message":"The AniList API has been temporarily disabled due to severe stability issues.","status":403}],"data":null}', status);
  if (u.includes('graphql')) {
    const q: string = body.query, v = body.variables;
    if (q.includes('characters(search')) return json(fx('chars-frieren'));
    if (q.includes('media(search')) return json(v.q === 'nothing' ? '{"data":{"Page":{"media":[]}}}' : fx('media-frieren'));
    if (q.includes('studios(isMain')) return json(fx('detail-154587'));
    if (q.includes('Character(id')) return json(`{"data":{"Character":{"id":${v.id},"name":{"full":"Frieren","native":"フリーレン"},"image":{"large":"https://s4.anilist.co/file/anilistcdn/character/large/b176754-PCnpqIOkjhFk.png"},"siteUrl":"https://anilist.co/character/176754"}}}`);
    if (q.includes('Media(id') && v.id === 999) return json('{"errors":[{"message":"Not Found.","status":404}],"data":{"Media":null}}', 404);
    if (q.includes('Media(id')) return json(JSON.stringify({ data: { Media: { ...JSON.parse(fx('detail-154587')).data.Media, id: v.id } } }));
  }
  return new Response('img', { headers: { 'content-type': 'image/jpeg' } });
}) as typeof fetch;
const ctx = (options: Record<string, unknown> = {}): SourceCtx => {
  const http = createHttp({ source: 'anime', cacheDir: dir, limits: anime.limits, fetch: fakeFetch });
  return { http, sub: () => http, options, tmpDir: dir };
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'anime-')); sent = []; status = 200; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('a show gives its cover and its banner; characters on asking', async () => {
  const hits = await anime.search({ text: 'Frieren', opts: {}, limit: 4 }, ctx());
  expect(sent[0].body.variables).toEqual({ q: 'Frieren', type: 'ANIME', n: 4 });
  expect(hits.slice(0, 2)).toMatchObject([
    { ref: 'anime:154587-cover', kind: 'image', title: 'Frieren: Beyond Journey’s End／葬送のフリーレン', detail: '封面（直式）· TV · 2023 · 91 分' },
    { ref: 'anime:154587-banner', detail: expect.stringMatching(/^橫幅（寬扁）/) },
  ]);
  await anime.search({ text: 'Frieren', opts: { type: 'manga' }, limit: 4 }, ctx());
  expect(sent.at(-1)!.body.variables.type).toBe('MANGA');
  const chars = await anime.search({ text: 'Frieren', opts: { what: 'character' }, limit: 4 }, ctx());
  expect(chars).toEqual([{ ref: 'anime:char-176754', source: 'anime', id: 'char-176754', kind: 'image', title: 'Frieren／フリーレン',
    thumbUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b176754-PCnpqIOkjhFk.png', detail: '角色 · Sousou no Frieren' }]);
  await expect(anime.search({ text: 'x', opts: { type: 'novel' }, limit: 4 }, ctx())).rejects.toThrow('--opt type 只能是 anime 或 manga');
});

test('get downloads the cover, the banner or the character its id names', async () => {
  const cover = await anime.get('154587-cover', ctx());
  expect(sent.at(-1)!.url).toBe('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg');
  expect(cover).toMatchObject({ kind: 'image', file: join(dir, 'anime-154587-cover.jpg'), meta: { title: 'Frieren: Beyond Journey’s End／葬送のフリーレン（封面）', page: 'https://anilist.co/anime/154587' } });
  expect((await anime.get('char-176754', ctx())).file).toBe(join(dir, 'anime-char-176754.png'));
  await expect(anime.get('999-cover', ctx())).rejects.toMatchObject({ kind: 'missing', message: 'AniList 沒有 999-cover' });
  await expect(anime.get('frieren', ctx())).rejects.toMatchObject({ kind: 'missing' });
});

test('data tells the show: format, dates, studio, score, cast with voices, a short description', async () => {
  const out = await anime.data!('Frieren', ctx());
  const lines = out.split('\n');
  expect(lines[0]).toBe('Frieren: Beyond Journey’s End／葬送のフリーレン（Sousou no Frieren）　https://anilist.co/anime/154587');
  expect(lines[1]).toMatch(/^TV｜FINISHED｜開播 2023-9-29｜2023 FALL｜28 集｜每集 24 分$/);
  expect(lines[2]).toMatch(/^製作 MADHOUSE｜類型 .*Adventure.*｜評分 91\/100｜[\d,]+ 人收藏$/);
  expect(lines[3]).toMatch(/^主要角色：Frieren（フリーレン） CV：種﨑敦美［主角］/);
  expect(out).toContain('anime:154587-banner');
  expect(await anime.data!('nothing', ctx())).toContain('AniList 找不到「nothing」');
});

test('AniList switching its API off is unavailable for now, not broken', async () => {
  status = 403;
  await expect(anime.search({ text: 'Frieren', opts: {}, limit: 4 }, ctx())).rejects.toMatchObject({ kind: 'temporary' });
});
