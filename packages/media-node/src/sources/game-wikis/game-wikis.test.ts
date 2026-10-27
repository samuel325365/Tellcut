import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { SourceCtx } from '../types.ts';
import { gameWikis } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
let dir: string, sent: string[], zeldaDown: boolean;
const fakeFetch = (async (url: string | URL) => {
  const u = String(url), p = new URL(u).searchParams, host = new URL(u).hostname;
  sent.push(u);
  const json = (b: string) => new Response(b, { headers: { 'content-type': 'application/json' } });
  if (!u.includes('api.php')) return new Response('PNG-bytes', { headers: { 'content-type': 'image/png' } });
  // a Cloudflare bot check
  if (zeldaDown && host.includes('zelda')) return new Response('<!DOCTYPE html><title>Just a moment...</title>', { status: 403, headers: { 'content-type': 'text/html' } });
  const wiki = host.includes('mario') ? 'mario' : 'zelda';
  if (p.get('gsrsearch') === 'busy') return json('{"error":{"code":"search-error","info":"Search is currently too busy"}}');
  if (p.get('gsrnamespace') === '0' && p.get('prop') === 'pageimages') return json(wiki === 'mario' ? fx('mario-articles') : '{"batchcomplete":true}');
  if (p.has('titles') && p.get('prop') === 'imageinfo') return json(fx('mario-leads'));
  if (p.get('gsrnamespace') === '6') return json(fx(wiki === 'zelda' ? 'zelda-files' : 'mario-files'));
  if (p.get('pageids') === '457287') return json(fx('mario-file-one').replace(/560501/g, '457287'));
  if (p.has('pageids')) return json(`{"query":{"pages":[{"pageid":${p.get('pageids')},"missing":true,"title":"x"}]}}`);
  if (p.get('titles') === 'Yoshi') return json(fx(`${wiki}-page-yoshi`));
  if (p.get('gsrnamespace') === '0') return json('{"query":{"pages":[{"pageid":1,"title":"Yoshi","index":1},{"pageid":2,"title":"Yoshi (species)","index":2}]}}');
  if (p.has('titles')) return json(`{"query":{"pages":[{"title":"${p.get('titles')}","missing":true}]}}`);
  return json('{}');
}) as typeof fetch;
const ctx = (options: Record<string, unknown> = {}): SourceCtx => {
  const http = createHttp({ source: 'game-wikis', cacheDir: dir, limits: gameWikis.limits, fetch: fakeFetch });
  return { http, sub: () => http, options, tmpDir: dir };
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gw-')); sent = []; zeldaDown = false; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('a wiki\'s pictures: the lead images of the matching articles in their order, then the matching files', async () => {
  const hits = await gameWikis.search({ text: 'Yoshi', opts: {}, limit: 5 }, ctx({ wiki: 'mario' }));
  expect(hits.map((h) => h.title)).toEqual(['SMPJ Yoshi', 'TheYoshiFamily', 'Yoshi Franchise Logo', "Hello, Yoshi Green Yoshi's Egg", "Hello, Yoshi White Yoshi's Egg"]);
  expect(hits[0]).toMatchObject({ ref: 'game-wikis:mario-457287', kind: 'image', author: 'Super Mario Wiki', detail: expect.stringMatching(/^Super Mario Wiki · \d+×\d+$/) });
  expect(sent.every((u) => u.startsWith('https://www.mariowiki.com/'))).toBe(true);
});

test('without --opt wiki both are asked and their hits take turns; one that fails costs only its part; an unknown wiki is refused', async () => {
  const hits = await gameWikis.search({ text: 'Link', opts: {}, limit: 4 }, ctx());
  expect(hits.map((h) => h.id.split('-')[0])).toEqual(['mario', 'zelda', 'mario', 'zelda']);
  // another query (the first one's answers are cached): Zelda Wiki behind a bot check
  zeldaDown = true;
  expect((await gameWikis.search({ text: 'Ganon', opts: {}, limit: 4 }, ctx())).map((h) => h.id.split('-')[0])).toEqual(['mario', 'mario', 'mario', 'mario']);
  await expect(gameWikis.search({ text: 'Ganon', opts: {}, limit: 4 }, ctx({ wiki: 'zelda' }))).rejects.toMatchObject({ kind: 'temporary' });
  await expect(gameWikis.search({ text: 'x', opts: {}, limit: 4 }, ctx({ wiki: 'metroid' }))).rejects.toThrow('--opt wiki 只能是 mario、zelda');
});

test('get downloads a file small enough as it is, credited to the wiki that hosts it', async () => {
  const f = await gameWikis.get('mario-457287', ctx());
  expect(sent.at(-1)).toMatch(/^https:\/\/mario\.wiki\.gallery\/images\/7\/74\//);
  expect(f).toMatchObject({ kind: 'image', meta: { source: 'game-wikis', id: 'mario-457287', author: 'Super Mario Wiki', quality: 'original', license: expect.stringContaining('合理使用') } });
  await expect(gameWikis.get('mario-1', ctx())).rejects.toMatchObject({ kind: 'missing', message: 'Super Mario Wiki 沒有 1 這個檔案' });
  await expect(gameWikis.get('metroid-1', ctx())).rejects.toMatchObject({ kind: 'missing' });
});

test('data gives each wiki\'s article intro with its licence, or the nearest titles', async () => {
  const out = await gameWikis.data!('Yoshi', ctx());
  expect(out).toContain('【Super Mario Wiki】Yoshi（https://www.mariowiki.com/Yoshi）');
  expect(out).toContain('主圖：SMPJ_Yoshi.png');
  expect(out).toContain('Yoshi is a dinosaur-like character');
  expect(out).toContain('文字授權：CC BY-SA 4.0');
  // a redirect to an article with no intro still names it
  expect(out).toContain('【Zelda Wiki】Yoshi Doll（https://zeldawiki.wiki/wiki/Yoshi_Doll）\n主圖：LANS Yoshi Doll Model.png');
  expect(out).toContain('（這個條目沒有導言，見網址）');
  expect(out).toContain('文字授權：GFDL 1.3');
  const none = await gameWikis.data!('Nothing here', ctx({ wiki: 'mario' }));
  expect(none).toContain('【Super Mario Wiki】沒有條目「Nothing here」，最接近的：Yoshi、Yoshi (species)');
});

test('a busy MediaWiki search is temporary, not nothing found', async () => {
  await expect(gameWikis.search({ text: 'busy', opts: {}, limit: 4 }, ctx({ wiki: 'zelda' }))).rejects.toMatchObject({ kind: 'temporary', message: expect.stringContaining('Zelda Wiki 暫時不能用') });
});
