import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { AssetRecord, SourceCtx } from '../types.ts';

const noSub = () => { throw new Error('this source has no other service'); };
import { plainText, wikimedia } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
const BY_ID: Record<string, string> = { '10279769': 'commons-jpeg', '118320023': 'commons-svg', '46367789': 'commons-huge', '99999999999': 'commons-missing' };
let dir: string, ctx: SourceCtx, sent: string[], media: string[], search: string, edit: ((body: string) => string) | null;
const fakeFetch = (async (url: string | URL) => {
  const u = new URL(String(url));
  if (u.hostname === 'commons.wikimedia.org') {
    sent.push(u.toString());
    const p = u.searchParams;
    let body = p.get('generator') === 'search' ? search : p.get('meta') === 'siteinfo' ? '{"query":{"general":{"sitename":"Wikimedia Commons"}}}' : fx(BY_ID[p.get('pageids') ?? ''] ?? 'commons-missing');
    // Commons' fixed thumbnail widths: asked for 3840, the same answer names the 3840 file
    if (p.get('iiurlwidth') === '3840') body = body.replaceAll('1920px-', '3840px-');
    if (edit) body = edit(body);
    return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  media.push(u.toString());
  return new Response('picture-bytes', { headers: { 'content-type': u.pathname.endsWith('.png') ? 'image/png' : 'image/jpeg' } });
}) as typeof fetch;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wiki-')); sent = []; media = []; search = fx('commons-search'); edit = null;
  ctx = { http: createHttp({ source: 'wikimedia', cacheDir: dir, limits: wikimedia.limits, fetch: fakeFetch }), options: {}, tmpDir: dir, sub: noSub };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('search asks Commons for bitmaps, sorts by rank and reads size, licence and author', async () => {
  const hits = await wikimedia.search({ text: '台北101', opts: {}, limit: 3 }, ctx);
  const p = new URL(sent[0]).searchParams;
  expect([p.get('gsrsearch'), p.get('gsrnamespace'), p.get('gsrlimit'), p.get('iiurlwidth')]).toEqual(['台北101 filetype:bitmap', '6', '3', '330']);
  expect(hits.map((h) => h.id)).toEqual(['46367789', '10279769', '10334348']);
  expect(hits[1]).toMatchObject({ ref: 'wikimedia:10279769', source: 'wikimedia', kind: 'image', title: 'Taipei 101 2009 amk', width: 2000, height: 3187, author: 'AngMoKio', detail: '2000×3187 · CC BY-SA 3.0 · AngMoKio' });
  expect(hits[1].thumbUrl).toMatch(/^https:\/\/thumb\.wikimedia\.org\/.+330px-Taipei_101_2009_amk\.jpg$/);
});

test('--ratio 9:16 keeps portrait images only, asking for more to choose from', async () => {
  const hits = await wikimedia.search({ text: '台北101', ratio: '9:16', opts: {}, limit: 3 }, ctx);
  expect(new URL(sent[0]).searchParams.get('gsrlimit')).toBe('9');
  expect(hits.map((h) => h.id)).toEqual(['10279769', '10334348']);
  expect((await wikimedia.search({ text: '台北101', ratio: '16:9', opts: {}, limit: 3 }, ctx)).map((h) => h.id)).toEqual(['46367789']);
});

test('no hits is an empty answer, not a broken source', async () => {
  search = fx('commons-none');
  expect(await wikimedia.search({ text: 'zzzz', opts: {}, limit: 3 }, ctx)).toEqual([]);
  search = '{"query":{"pages":"nope"}}';
  await expect(wikimedia.search({ text: 'x', opts: {}, limit: 3 }, ctx)).rejects.toMatchObject({ kind: 'broken' });
});

test('an error answer (HTTP 200 with "error") is temporary, never "nothing found", and is asked again next time', async () => {
  search = '{"error":{"code":"search-error","info":"Search is currently too busy. Please try again later."}}';
  for (let i = 0; i < 2; i++) await expect(wikimedia.search({ text: '台北101', opts: {}, limit: 3 }, ctx)).rejects.toMatchObject({ kind: 'temporary', message: expect.stringContaining('too busy') });
  expect(sent).toHaveLength(2);
});

test('svg and tiff originals come as a raster thumbnail 1920 wide', async () => {
  const svg = await wikimedia.get('118320023', ctx);
  expect(media.pop()).toMatch(/^https:\/\/thumb\.wikimedia\.org\/.+\/1920px-Taipei_101_logo\.svg\.png$/);
  expect([svg.file.endsWith('.png'), svg.meta.quality]).toEqual([true, 'preview']);
  expect(new URL(sent[0]).searchParams.get('iiurlwidth')).toBe('1920');
  edit = (b) => b.replace('"image/jpeg"', '"image/tiff"');
  const tiff = await wikimedia.get('10279769', ctx);
  expect(media.pop()).toMatch(/\/1920px-Taipei_101_2009_amk\.jpg$/);
  expect(tiff.meta.quality).toBe('preview');
});

test('a landscape original wider than 3840 comes as the 3840 thumbnail, tall enough for a 9:16 film', async () => {
  const huge = await wikimedia.get('46367789', ctx);
  expect(sent.map((u) => new URL(u).searchParams.get('iiurlwidth'))).toEqual(['1920', '3840']);
  expect(media.pop()).toMatch(/\/3840px-Taipei_Taiwan_Taipei-101-Tower-01\.jpg$/);
  expect(huge.meta.quality).toBe('preview');
});

test('animated or plain GIFs are not offered (the player cannot use them)', async () => {
  search = fx('commons-search').replace('"image/jpeg"', '"image/gif"');
  const gif = JSON.parse(search).query.pages.find((p: any) => p.imageinfo[0].mime === 'image/gif').pageid;
  const hits = await wikimedia.search({ text: '台北101', opts: {}, limit: 3 }, ctx);
  expect(hits.map((h) => h.id)).not.toContain(String(gif));
  expect(hits).toHaveLength(2);
});

test('a jpeg of a usable size is downloaded as the original', async () => {
  const f = await wikimedia.get('10279769', ctx);
  expect(media).toEqual(['https://upload.wikimedia.org/wikipedia/commons/5/53/Taipei_101_2009_amk.jpg']);
  expect(f).toMatchObject({ kind: 'image', meta: { source: 'wikimedia', id: '10279769', title: 'Taipei 101 2009 amk', author: 'AngMoKio', page: 'https://commons.wikimedia.org/wiki/File:Taipei_101_2009_amk.jpg', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0', quality: 'original' } });
  expect(f.file).toBe(join(dir, 'wikimedia-10279769.jpg'));
});

test('a page id that is not there is missing', async () => {
  await expect(wikimedia.get('99999999999', ctx)).rejects.toMatchObject({ kind: 'missing', message: 'Commons 沒有 99999999999 這個檔案' });
});

test('check asks for the site name', async () => {
  expect(await wikimedia.check(ctx)).toBe('Commons 可連線（Wikimedia Commons）');
});

test('the credit names the author in plain text and the licence', () => {
  expect(plainText('​<a href="//commons.wikimedia.org/wiki/User:Cccefalon">CEphoto, Uwe Aranas</a> &amp; co&#33;&nbsp; ')).toBe('CEphoto, Uwe Aranas & co!');
  expect(plainText('Ann &#99999999; &#x110000; &#x4e2d;')).toBe('Ann &#99999999; &#x110000; 中');
  const rec = { title: 'Taipei 101 2009 amk', author: 'AngMoKio', page: 'https://commons.wikimedia.org/wiki/File:Taipei_101_2009_amk.jpg', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0' } as AssetRecord;
  expect(wikimedia.credit(rec)).toBe('- Image: "Taipei 101 2009 amk" by AngMoKio (https://commons.wikimedia.org/wiki/File:Taipei_101_2009_amk.jpg), CC BY-SA 3.0 https://creativecommons.org/licenses/by-sa/3.0');
});

test('the card tells how to search and what to watch for', () => {
  expect(wikimedia.card()).toMatch(/--ratio 9:16[\s\S]*c\.photo[\s\S]*logo/);
});

describe('data: a Wikipedia intro', () => {
  const PAGES: Record<string, string> = { '台北101': 'wiki-title', '臺北101': 'wiki-redirect', '中山': 'wiki-disambig', '克拉科夫老街': 'wiki-missing', '克拉科夫老城': 'wiki-oldtown' };
  const SEARCHES: Record<string, string> = { '克拉科夫老街': 'wiki-search', '中山': 'wiki-search-zhongshan' };
  let asked: URL[], long: boolean;
  const wikiFetch = (async (url: string | URL) => {
    const u = new URL(String(url)), p = u.searchParams;
    asked.push(u);
    if (u.hostname === 'en.wikipedia.org') return new Response(JSON.stringify({ query: { pages: [{ pageid: 1, title: 'Kraków', fullurl: 'https://en.wikipedia.org/wiki/Krak%C3%B3w', extract: 'Kraków is the second-largest city in Poland.' }] } }));
    const name = p.get('generator') === 'search' ? SEARCHES[p.get('gsrsearch')!] : PAGES[p.get('titles')!];
    let body = name ? fx(name) : '{"batchcomplete":true}';
    if (long) { const j = JSON.parse(body); j.query.pages[0].extract = '很長的介紹。'.repeat(400); body = JSON.stringify(j); }
    return new Response(body, { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const dctx = (options: Record<string, unknown> = {}): SourceCtx => ({ http: createHttp({ source: 'wikimedia', cacheDir: dir, limits: wikimedia.limits, fetch: wikiFetch }), options, tmpDir: dir, sub: noSub });
  beforeEach(() => { asked = []; long = false; });
  const SOURCE_LINE = '來源：維基百科（CC BY-SA 4.0），旁白引用要自己改寫';

  test('a title gives its Traditional Chinese intro and its address', async () => {
    const out = await wikimedia.data!('台北101', dctx());
    expect([asked[0].hostname, asked[0].searchParams.get('variant'), asked[0].searchParams.get('titles')]).toEqual(['zh.wikipedia.org', 'zh-tw', '台北101']);
    expect(out).toMatch(/^台北101（https:\/\/zh\.wikipedia\.org\/wiki\/台北101）\n\n台北101（英語：TAIPEI 101）是位於臺灣臺北市信義區/);
    expect(out.split('\n').pop()).toBe(SOURCE_LINE);
  });

  test('a redirect is followed', async () => {
    expect(await wikimedia.data!('臺北101', dctx())).toMatch(/^台北101（.+）\n（「臺北101」重新導向到這裡）\n\n台北101（英語/);
  });

  test('a disambiguation page says so and lists candidates', async () => {
    const out = await wikimedia.data!('中山', dctx());
    expect(out).toMatch(/^中山（.+）\n⚠ 這是消歧義頁，請改查下面其中一個：\n中山市\n中山公園\n/);
    expect(out.split('\n').filter((l) => l === '中山')).toEqual([]);   // the page itself is not a candidate
  });

  test('an unknown title falls back to a search, in Taiwan titles', async () => {
    const out = await wikimedia.data!('克拉科夫老街', dctx());
    expect(out).toMatch(/^找不到條目「克拉科夫老街」，最接近的是：\n克拉科夫老城\n克拉科夫\n克拉科夫郊區街\n/);
    expect(out).toContain('\n\n克拉科夫老城（https://zh.wikipedia.org/wiki/克拉科夫老城）\n\n克拉科夫老城（波蘭語');
    expect(await wikimedia.data!('zzqqxx', dctx())).toBe('維基百科沒有「zzqqxx」的條目');
  });

  test('a title MediaWiki cannot have goes straight to the search, without its brackets; the title lookup converts variants', async () => {
    const out = await wikimedia.data!('[克拉科夫老街]', dctx());
    expect(asked.some((u) => u.searchParams.has('titles') && u.searchParams.get('titles')!.includes('['))).toBe(false);
    expect(asked[0].searchParams.get('gsrsearch')).toBe('克拉科夫老街');
    expect(out).toMatch(/^找不到條目「\[克拉科夫老街\]」，最接近的是：\n克拉科夫老城/);
    expect(await wikimedia.data!('|#', dctx())).toBe('維基百科沒有「|#」的條目');
    await wikimedia.data!('台北101', dctx());
    expect(asked.at(-1)!.searchParams.get('converttitles')).toBe('1');
  });

  test('--opt lang=en asks the English Wikipedia without a variant; a strange lang is refused', async () => {
    expect(await wikimedia.data!('Kraków', dctx({ lang: 'en' }))).toMatch(/^Kraków（https:\/\/en\.wikipedia\.org\/wiki\/Kraków）\n\nKraków is/);
    expect([asked[0].hostname, asked[0].searchParams.has('variant')]).toEqual(['en.wikipedia.org', false]);
    await expect(wikimedia.data!('x', dctx({ lang: 'evil.example/' }))).rejects.toThrow('--opt lang 要像 zh、en、ja');
  });

  test('a long intro is cut with a pointer to the article', async () => {
    long = true;
    const out = await wikimedia.data!('台北101', dctx());
    expect(out).toContain('…（全文見網址）');
    expect(out.length).toBeLessThan(1400);
  });
});

test('a Wikipedia error answer is temporary for data too', async () => {
  const errFetch = (async () => new Response('{"error":{"code":"maxlag","info":"Waiting for a database server"}}', { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
  const c: SourceCtx = { http: createHttp({ source: 'wikimedia', cacheDir: dir, limits: wikimedia.limits, fetch: errFetch }), options: {}, tmpDir: dir, sub: noSub };
  await expect(wikimedia.data!('台北101', c)).rejects.toMatchObject({ kind: 'temporary', message: expect.stringContaining('Waiting for a database server') });
  await expect(wikimedia.check(c)).rejects.toMatchObject({ kind: 'temporary' });
});
