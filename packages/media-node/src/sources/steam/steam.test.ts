import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { SourceCtx } from '../types.ts';
import { steam, steamDeps } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
let dir: string, sent: Array<{ url: string; method: string }>, copied: string[];
const realHls = steamDeps.hls;
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url), p = new URL(u).searchParams, method = init?.method ?? 'GET';
  sent.push({ url: u, method });
  const json = (b: string) => new Response(b, { headers: { 'content-type': 'application/json' } });
  if (u.includes('/storesearch/')) return json(p.get('term') === 'nothing' ? '{"total":0,"items":[]}' : fx('search-elden'));
  if (u.includes('/appdetails')) {
    const id = p.get('appids')!;
    if (id === '1245620') return json(fx('app-1245620'));
    if (id === '730' || id === '570' || id === '578080') return json(`{"${id}":{"success":true,"data":{"name":"Game ${id}","steam_appid":${id}}}}`);
    if (id === '2622380' || id === '2778580') return json(`{"${id}":{"success":true,"data":{"name":"DLC ${id}","steam_appid":${id},"screenshots":[],"movies":[]}}}`);
    return json(`{"${id}":{"success":false}}`);
  }
  if (u.includes('GetMostPlayedGames')) return json(fx('top'));
  if (u.endsWith('/library_hero.jpg') && u.includes('/2622380/')) return new Response('Not Found', { status: 404 });
  if (method === 'HEAD') return new Response(null, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
  return new Response('jpg', { headers: { 'content-type': 'image/jpeg' } });
}) as typeof fetch;
const ctx = (): SourceCtx => {
  const http = createHttp({ source: 'steam', cacheDir: dir, limits: steam.limits, fetch: fakeFetch });
  return { http, sub: () => http, options: {}, tmpDir: dir };
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'steam-')); sent = []; copied = [];
  steamDeps.hls = async (url, out) => { copied.push(url); writeFileSync(out, 'mp4'); };
});
afterEach(() => { steamDeps.hls = realHls; rmSync(dir, { recursive: true, force: true }); });

test('a search opens the first games found: their cover, hero, header and screenshots, then trailers', async () => {
  const hits = await steam.search({ text: '艾爾登法環', opts: {}, limit: 20 }, ctx());
  expect(new URL(sent[0].url).searchParams.get('l')).toBe('tchinese');
  expect(sent.filter((s) => s.url.includes('/appdetails')).length).toBe(3);
  expect(hits.slice(0, 4).map((h) => h.ref)).toEqual(['steam:1245620-cover', 'steam:1245620-hero', 'steam:1245620-header', 'steam:1245620-shot-0']);
  expect(hits[0]).toMatchObject({ kind: 'image', title: '艾爾登法環（直式封面）', thumbUrl: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/library_600x900_2x.jpg' });
  expect(hits.find((h) => h.kind === 'video')).toMatchObject({ ref: 'steam:1245620-movie-256867718', title: '艾爾登法環：ELDEN RING CGI Trailer - TC', detail: '預告片' });
  const vids = await steam.search({ text: '1245620', kind: 'video', opts: {}, limit: 20 }, ctx());
  expect(vids.map((h) => h.kind)).toEqual(['video', 'video']);
  expect(await steam.search({ text: 'nothing', opts: {}, limit: 5 }, ctx())).toEqual([]);
});

test('get downloads the art or the screenshot its id names, or copies a trailer into an MP4', async () => {
  const cover = await steam.get('1245620-cover', ctx());
  expect(sent.at(-1)!.url).toBe('https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/library_600x900_2x.jpg');
  expect(cover).toMatchObject({ kind: 'image', meta: { title: '艾爾登法環（直式封面）', author: 'FromSoftware, Inc., Bandai Namco Entertainment', page: 'https://store.steampowered.com/app/1245620/' } });
  const shot = await steam.get('1245620-shot-1', ctx());
  expect(sent.at(-1)!.url).toMatch(/1920x1080\.jpg/);
  expect(shot.meta.title).toBe('艾爾登法環（截圖 2）');
  const movie = await steam.get('1245620-movie-256867718', ctx());
  expect(sent.at(-1)!.method).toBe('HEAD');
  expect(copied).toEqual([expect.stringMatching(/hls_264_master\.m3u8/)]);
  expect(movie).toMatchObject({ kind: 'video', file: join(dir, 'steam-1245620-movie-256867718.mp4'), meta: { title: '艾爾登法環：ELDEN RING CGI Trailer - TC' } });
  await expect(steam.get('1245620-shot-9', ctx())).rejects.toMatchObject({ kind: 'missing', message: '艾爾登法環 沒有第 10 張截圖' });
  await expect(steam.get('2622380-hero', ctx())).rejects.toMatchObject({ kind: 'missing', message: 'DLC 2622380 沒有橫幅主視覺' });
  await expect(steam.get('999-cover', ctx())).rejects.toMatchObject({ kind: 'missing', message: 'Steam 沒有 999 這個遊戲' });
  await expect(steam.get('elden', ctx())).rejects.toMatchObject({ kind: 'missing' });
});

test('data tells a game in Traditional Chinese, and top is the most-played chart with names', async () => {
  const out = (await steam.data!('艾爾登法環', ctx())).split('\n');
  expect(out[0]).toBe('艾爾登法環（appid 1245620）　https://store.steampowered.com/app/1245620/');
  expect(out[1]).toBe('開發 FromSoftware, Inc.｜發行 FromSoftware, Inc.、Bandai Namco Entertainment｜發售 2022 年 2 月 24 日');
  expect(out[2]).toBe('類型 動作、角色扮演｜Metacritic 94｜售價 NT$ 1,790｜834,631 篇評論');
  expect(out.join('\n')).toContain('截圖 3 張（-shot-0…）、預告片 2 支');
  const top = (await steam.data!('top', ctx())).split('\n');
  expect(top[0]).toBe('Steam 同時在線人數排行（每日高峰）：');
  expect(top[1]).toMatch(/^1\. Game 730（730）：[\d,]+ 人，上週第 1$/);
  expect(await steam.data!('nothing', ctx())).toContain('Steam 找不到「nothing」');
});
