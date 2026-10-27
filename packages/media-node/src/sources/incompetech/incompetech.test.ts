import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { AssetRecord, SourceCtx } from '../types.ts';

const noSub = () => { throw new Error('this source has no other service'); };
import { CATALOG, incompetech, incompetechSource, type Catalog } from './index.ts';

const BYTES = 'ID3-fake-pamgaea';
const small: Catalog = { snapshot: '2026-09-28', mirror: 'abook-music-incompetech-cc-by-4.0', items: [
  { id: 'pamgaea', title: 'Pamgaea', file: 'incompetech-Pamgaea.mp3', genre: 'World', feel: ['Bouncy', 'Grooving'], bpm: 114, length: 184.3, instruments: ['Drums'], description: 'Global groove.', isrc: 'USUAN1100301', sha1: createHash('sha1').update(BYTES).digest('hex'), size: BYTES.length },
  { id: 'calm-piano', title: 'Calm Piano Thing', file: 'incompetech-Calm Piano Thing.mp3', genre: 'Contemporary', feel: ['Calming', 'Relaxed'], bpm: 80, length: 150, instruments: ['Piano'], description: 'Soft piano.', sha1: 'x', size: 1 },
  { id: 'short-calm', title: 'Short Calm', file: 'incompetech-Short Calm.mp3', genre: 'Contemporary', feel: ['Calming'], bpm: 70, length: 40, instruments: ['Piano'], description: '', sha1: 'x', size: 1 },
  { id: 'fast-calm', title: 'Fast Calm', file: 'incompetech-Fast Calm.mp3', genre: 'Contemporary', feel: ['Calming'], bpm: 140, length: 200, instruments: ['Piano'], description: '', sha1: 'x', size: 1 },
] };

let dir: string, ctx: SourceCtx, urls: string[], body: string;
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  urls.push(`${init?.method ?? 'GET'} ${String(url)}`);
  return new Response(init?.method === 'HEAD' ? null : body, { headers: { 'content-type': 'audio/mpeg' } });
}) as typeof fetch;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inc-')); urls = []; body = BYTES;
  ctx = { http: createHttp({ source: 'incompetech', cacheDir: dir, limits: incompetech.limits, fetch: fakeFetch }), options: {}, tmpDir: dir, sub: noSub };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('the catalog is the mirror: 833 pieces with a file, a length and a sha1', () => {
  expect(CATALOG.items).toHaveLength(833);
  for (const x of CATALOG.items) { expect(x.file).toMatch(/^incompetech-.*\.mp3$/); expect(x.length).toBeGreaterThan(0); expect(x.sha1).toMatch(/^[0-9a-f]{40}$/); }
  expect(new Set(CATALOG.items.map((x) => x.id)).size).toBe(833);
});

test('search ranks by title, feel and genre, filters by opts and length, and never goes online', async () => {
  const s = incompetechSource(small);
  const hits = await s.search({ text: 'calm piano', minSec: 90, opts: { feel: 'Calming', bpm: '60-100' }, limit: 5 }, ctx);
  expect(hits.map((h) => h.id)).toEqual(['calm-piano']);
  expect(hits[0]).toMatchObject({ ref: 'incompetech:calm-piano', kind: 'music', title: 'Calm Piano Thing', duration: 150, bpm: 80, author: 'Kevin MacLeod', detail: 'Contemporary · Calming、Relaxed' });
  expect((await s.search({ text: '', opts: { genre: 'world' }, limit: 5 }, ctx)).map((h) => h.id)).toEqual(['pamgaea']);
  expect(await s.search({ text: 'zzzz', opts: {}, limit: 5 }, ctx)).toEqual([]);
  expect(urls).toEqual([]);
});

test('conditions without a keyword give a mixed page, not the first titles of the alphabet, and the same page again', async () => {
  const q = { text: '', opts: { feel: 'Calming' }, limit: 8 };
  const hits = await incompetech.search(q, ctx), again = await incompetech.search(q, ctx);
  expect(hits).toHaveLength(8);
  expect(again.map((h) => h.id)).toEqual(hits.map((h) => h.id));
  expect(new Set(hits.map((h) => h.title[0].toUpperCase())).size).toBeGreaterThan(3);
});

test('on the real catalog a mood search finds pieces', async () => {
  const hits = await incompetech.search({ text: 'calm piano', minSec: 90, opts: { feel: 'Calming', bpm: '60-100' }, limit: 5 }, ctx);
  expect(hits.length).toBeGreaterThan(0);
  for (const h of hits) { expect(h.duration!).toBeGreaterThanOrEqual(90); expect(h.bpm!).toBeGreaterThanOrEqual(60); expect(h.bpm!).toBeLessThanOrEqual(100); }
});

test('get downloads from the archive.org mirror, checks the sha1, and carries the listed bpm', async () => {
  const f = await incompetechSource(small).get('pamgaea', ctx);
  expect(urls).toEqual(['GET https://archive.org/download/abook-music-incompetech-cc-by-4.0/incompetech-Pamgaea.mp3']);
  expect(f).toMatchObject({ kind: 'music', bpm: 114, meta: { source: 'incompetech', id: 'pamgaea', title: 'Pamgaea', author: 'Kevin MacLeod', license: 'CC BY 4.0', quality: 'original', page: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100301' } });
  expect(readFileSync(f.file, 'utf8')).toBe(BYTES);
});

test('a file whose sha1 does not match is not kept', async () => {
  body = 'truncated';
  await expect(incompetechSource(small).get('pamgaea', ctx)).rejects.toMatchObject({ kind: 'temporary', message: '下載的檔案不完整' });
  expect(existsSync(join(dir, 'incompetech-pamgaea.mp3'))).toBe(false);
});

test('an id that is not in the catalog is missing', async () => {
  await expect(incompetechSource(small).get('nope', ctx)).rejects.toMatchObject({ kind: 'missing' });
});

test('check asks the mirror for the first piece', async () => {
  expect(await incompetechSource(small).check(ctx)).toBe('清單 4 首（快照 2026-09-28），鏡像可下載');
  expect(urls).toEqual(['HEAD https://archive.org/download/abook-music-incompetech-cc-by-4.0/incompetech-Pamgaea.mp3']);
});

test('the credit line matches the hand-written ones', () => {
  expect(incompetech.credit({ title: 'Pamgaea' } as AssetRecord)).toBe('- Music: "Pamgaea" by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)');
});

test('the card says unofficial mirror and personal use', () => { expect(incompetech.card()).toMatch(/Unofficial mirror[\s\S]*personal use only/); });
