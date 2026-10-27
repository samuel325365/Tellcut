import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { AssetRecord, SourceCtx } from '../types.ts';

const noSub = () => { throw new Error('this source has no other service'); };
import { bbcSfx, cleanQuery } from './index.ts';

const fixture = readFileSync(new URL('./fixtures/search-rain.json', import.meta.url), 'utf8');
let dir: string, ctx: SourceCtx, sent: Array<{ url: string; body: unknown }>, search: string;
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  sent.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (u.endsWith('/api/sfx/search')) return new Response(search, { headers: { 'content-type': 'application/json' } });
  if (u.startsWith('https://sound-effects-media.bbcrewind.co.uk/')) return new Response('ID3fake-mp3', { headers: { 'content-type': 'audio/mpeg' } });
  return new Response('no', { status: 404 });
}) as typeof fetch;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bbc-')); sent = []; search = fixture;
  ctx = { http: createHttp({ source: 'bbc-sfx', cacheDir: dir, limits: bbcSfx.limits, fetch: fakeFetch }), options: {}, tmpDir: dir, sub: noSub };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('search posts the criteria and turns results into hits, filtered by length', async () => {
  const hits = await bbcSfx.search({ text: 'rain on window', minSec: 1, maxSec: 250, opts: {}, limit: 5 }, ctx);
  expect(sent[0].body).toEqual({ criteria: { from: 0, size: 15, query: 'rain on window' } });
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({ ref: 'bbc-sfx:07043377', source: 'bbc-sfx', id: '07043377', kind: 'audio', duration: 232.82, detail: 'Weather 2 - Storms', author: 'BBC' });
  const all = await bbcSfx.search({ text: 'rain on window', opts: {}, limit: 30 }, ctx);
  expect(sent[1].body).toEqual({ criteria: { from: 0, size: 50, query: 'rain on window' } });
  expect(all[0]).toMatchObject({ id: '07043376', title: 'Driving rain on window. (Interior acoustic.)', duration: 290.933 });
});

test('an unpaired quote and a dangling AND/OR/NOT, which make their search answer HTTP 500, never reach it', async () => {
  expect(cleanQuery('"seagulls harbour')).toBe('seagulls harbour');
  expect(cleanQuery('"seagulls" harbour')).toBe('"seagulls" harbour');
  expect(cleanQuery('rain AND')).toBe('rain');
  expect(cleanQuery('NOT rain AND wind OR')).toBe('rain AND wind');
  expect(cleanQuery('  Android  notebook ')).toBe('Android notebook');
  await bbcSfx.search({ text: 'waves AND "beach', opts: {}, limit: 5 }, ctx);
  expect(sent[0].body).toEqual({ criteria: { from: 0, size: 15, query: 'waves AND beach' } });
});

test('get looks the id up, downloads the mp3, and says where it came from', async () => {
  const f = await bbcSfx.get('07043376', ctx);
  expect(sent[0].body).toEqual({ criteria: { from: 0, size: 5, query: '07043376' } });
  expect(sent.map((s) => s.url)).toContain('https://sound-effects-media.bbcrewind.co.uk/mp3/07043376.mp3');
  expect(f).toMatchObject({ kind: 'audio', meta: { source: 'bbc-sfx', id: '07043376', title: 'Driving rain on window. (Interior acoustic.)', author: 'BBC', quality: 'preview', license: expect.stringContaining('RemArc') } });
  expect(readFileSync(f.file, 'utf8')).toBe('ID3fake-mp3');
});

test('--opt format=wav gets the original', async () => {
  const f = await bbcSfx.get('07043376', { ...ctx, options: { format: 'wav' } });
  expect(sent.map((s) => s.url)).toContain('https://sound-effects-media.bbcrewind.co.uk/wav/07043376.wav');
  expect(f.meta.quality).toBe('original');
});

test('an id BBC does not have is missing, not broken', async () => {
  await expect(bbcSfx.get('99999999', ctx)).rejects.toMatchObject({ kind: 'missing', message: 'BBC 沒有 99999999 這筆音效' });
});

test('an answer without results is broken', async () => {
  search = '{"error":"x"}';
  await expect(bbcSfx.search({ text: 'rain', opts: {}, limit: 5 }, ctx)).rejects.toMatchObject({ kind: 'broken' });
  await expect(bbcSfx.check(ctx)).rejects.toMatchObject({ kind: 'broken' });
});

test('check is one tiny search', async () => {
  expect(await bbcSfx.check(ctx)).toBe('共 2991 筆');
  expect(sent[0].body).toEqual({ criteria: { from: 0, size: 1, query: 'rain' } });
});

test('the credit line matches the hand-written ones', () => {
  const rec = { source: 'bbc-sfx', id: '07043376', title: 'Driving rain on window. (Interior acoustic.)' } as AssetRecord;
  expect(bbcSfx.credit(rec)).toBe('- SFX: BBC Sound Effects 07043376 "Driving rain on window. (Interior acoustic.)" (bbcrewind, RemArc licence, personal use)');
});

test('the card says unofficial and personal use', () => { expect(bbcSfx.card()).toMatch(/Unofficial[\s\S]*personal use only/); });
