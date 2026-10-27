import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { SourceCtx } from '../types.ts';
import { amiibo } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
let dir: string, sent: string[];
const fakeFetch = (async (url: string | URL) => {
  const u = String(url), p = new URL(u).searchParams;
  sent.push(u);
  const json = (b: string) => new Response(b, { headers: { 'content-type': 'application/json' } });
  if (u.includes('amiiboapi.org')) {
    if (p.get('name') === 'yoshi') return json(fx('name-yoshi'));
    if (p.get('character') === 'link') return json(fx('char-link'));
    if (p.get('id') === '0100000000040002') return json(fx('id-link'));
    if (p.has('id')) return json('{"amiibo":null}');
    if (p.get('name') === 'broken') return json('{"error":"?"}');
    return json('{"amiibo":[]}');
  }
  return new Response('PNG-bytes', { headers: { 'content-type': 'image/png' } });
}) as typeof fetch;
const ctx = (): SourceCtx => {
  const http = createHttp({ source: 'amiibo', cacheDir: dir, limits: amiibo.limits, fetch: fakeFetch });
  return { http, sub: () => http, options: {}, tmpDir: dir };
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'amiibo-')); sent = []; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('search tries the name, then the character, then the game series', async () => {
  const hits = await amiibo.search({ text: 'link', opts: {}, limit: 2 }, ctx());
  expect(sent.map((u) => [...new URL(u).searchParams.keys()][0])).toEqual(['name', 'character']);
  expect(hits).toHaveLength(2);
  expect(hits[0]).toMatchObject({ ref: 'amiibo:0100000000040002', kind: 'image', title: 'Link（Super Smash Bros.）', detail: 'The Legend of Zelda · Figure · 2014-11-21',
    thumbUrl: 'https://raw.githubusercontent.com/8bitDream/AmiiboAPI/master/images/icon_01000000-00040002.png' });
  expect(await amiibo.search({ text: 'nothing', opts: {}, limit: 2 }, ctx())).toEqual([]);
});

test('get looks the amiibo up by its id and downloads its picture', async () => {
  const f = await amiibo.get('0100000000040002', ctx());
  expect(sent.at(-1)).toBe('https://raw.githubusercontent.com/8bitDream/AmiiboAPI/master/images/icon_01000000-00040002.png');
  expect(f).toMatchObject({ kind: 'image', file: join(dir, 'amiibo-0100000000040002.png'), meta: { title: 'Link（Super Smash Bros.）', author: 'Nintendo', license: expect.stringContaining('Nintendo') } });
  await expect(amiibo.get('0000000000000001', ctx())).rejects.toMatchObject({ kind: 'missing', message: '沒有編號 0000000000000001 的 amiibo' });
  await expect(amiibo.get('link', ctx())).rejects.toMatchObject({ kind: 'missing' });
});

test('data lists every amiibo found, one line each, with its id', async () => {
  const out = (await amiibo.data!('yoshi', ctx())).split('\n');
  expect(out[0]).toBe('「yoshi」共 4 個 amiibo：');
  expect(out[1]).toMatch(/^Yoshi - Golf｜角色 Yoshi｜遊戲 .+｜amiibo:[0-9a-f]{16}$/);
  expect(await amiibo.data!('nothing', ctx())).toContain('找不到「nothing」的 amiibo');
});

test('an answer without the amiibo field is broken', async () => {
  await expect(amiibo.search({ text: 'broken', opts: {}, limit: 2 }, ctx())).rejects.toMatchObject({ kind: 'broken' });
});
