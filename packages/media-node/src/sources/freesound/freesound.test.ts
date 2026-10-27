import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SourcesConfig } from '../config.ts';
import { createHttp } from '../http.ts';
import { openSources, sourceStatuses } from '../registry.ts';
import type { AssetRecord, SourceCtx } from '../types.ts';
import { freesound, licenseName } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
let dir: string, sent: Array<{ url: string; headers: Headers }>, media: string[], status: number;
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  sent.push({ url: u, headers: new Headers(init?.headers) });
  const json = (body: string, s = status) => new Response(body, { status: s, headers: { 'content-type': 'application/json' } });
  if (status !== 200) return json('{"detail":"Invalid token."}');
  if (u.includes('/apiv2/search/text/')) return json(fx('search-rain'));
  if (u.includes('/apiv2/sounds/346641/')) return json(fx('sound-346641'));
  if (u.includes('/apiv2/sounds/')) return json('{"detail":"No Sound matches the given query."}', 404);
  media.push(u);
  return new Response('OggS-fake', { headers: { 'content-type': 'audio/ogg' } });
}) as typeof fetch;
const ctx = (): SourceCtx => {
  const http = createHttp({ source: 'freesound', cacheDir: dir, limits: freesound.limits, hasKey: true, fetch: fakeFetch });
  return { http, sub: () => http, key: 'K123', options: {}, tmpDir: dir };
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fs-')); sent = []; media = []; status = 200; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('search sends the key in a header, never in the url, and reads hits', async () => {
  const hits = await freesound.search({ text: 'rain on window', opts: {}, limit: 5 }, ctx());
  expect(sent[0].headers.get('authorization')).toBe('Token K123');
  expect(sent[0].url).not.toContain('K123');
  const p = new URL(sent[0].url).searchParams;
  expect([p.get('query'), p.get('page_size'), p.get('fields'), p.has('filter')]).toEqual(['rain on window', '5', 'id,name,duration,license,username,tags', false]);
  expect(hits[0]).toMatchObject({ ref: 'freesound:346641', source: 'freesound', id: '346641', kind: 'audio', title: 'Rain on Windows, Interior, B.wav', duration: 31.9081, author: 'InspectorJ', detail: 'CC BY 4.0 · InspectorJ' });
  expect(hits[0].tags!.length).toBeLessThanOrEqual(5);
});

test('--opt values become Freesound filters', async () => {
  await freesound.search({ text: 'drum', minSec: 1, maxSec: 5, opts: { bpm: '90-120', license: 'cc0', loop: 'true' }, limit: 5 }, ctx());
  expect(new URL(sent[0].url).searchParams.get('filter')).toBe('duration:[1 TO 5] bpm:[90 TO 120] license:"Creative Commons 0" tag:loop');
  await freesound.search({ text: 'drum', minSec: 2, opts: { license: 'by-nc' }, limit: 5 }, ctx());
  expect(new URL(sent[1].url).searchParams.get('filter')).toBe('duration:[2 TO *] license:"Attribution NonCommercial"');
});

test('get looks the sound up and downloads its hq ogg preview', async () => {
  const f = await freesound.get('346641', ctx());
  expect(media).toEqual(['https://cdn.freesound.org/previews/346/346641_5121236-hq.ogg']);
  expect(f.file).toBe(join(dir, 'freesound-346641.ogg'));
  expect(f).toMatchObject({ kind: 'audio', meta: { source: 'freesound', id: '346641', title: 'Rain on Windows, Interior, B.wav', author: 'InspectorJ',
    page: 'https://freesound.org/people/InspectorJ/sounds/346641/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', quality: 'preview' } });
});

test('an id Freesound does not have is missing', async () => {
  await expect(freesound.get('999999999', ctx())).rejects.toMatchObject({ kind: 'missing', message: 'Freesound 沒有 999999999 這個音效' });
});

test('a refused key is broken, and the key never shows in a url', async () => {
  status = 401;
  await expect(freesound.search({ text: 'x', opts: {}, limit: 1 }, ctx())).rejects.toMatchObject({ kind: 'broken' });
  await expect(freesound.check(ctx())).rejects.toMatchObject({ kind: 'broken' });
  for (const s of sent) expect(s.url).not.toContain('K123');
});

test('check is one tiny search', async () => {
  expect(await freesound.check(ctx())).toBe('共 2 筆');
  expect(new URL(sent[0].url).searchParams.get('page_size')).toBe('1');
});

test('licences read as names, NC included', () => {
  expect(licenseName('http://creativecommons.org/publicdomain/zero/1.0/')).toBe('CC0 1.0');
  expect(licenseName('https://creativecommons.org/licenses/by/4.0/')).toBe('CC BY 4.0');
  expect(licenseName('https://creativecommons.org/licenses/by-nc/4.0/')).toBe('CC BY-NC 4.0');
  expect(licenseName('http://creativecommons.org/licenses/sampling+/1.0/')).toBe('Sampling+ 1.0');
  expect(licenseName('something else')).toBe('something else');
});

test('limits are 60 a minute and 2000 a day', () => {
  expect(freesound.limits).toEqual([{ n: 60, per: 60 }, { n: 2000, per: 86400 }]);
});

test('without a key freesound is not available', () => {
  const config: SourcesConfig = { contact: '', keys: {}, sources: { freesound: { enabled: true, keyEnv: 'FREESOUND_API_KEY', options: {} } } };
  expect(sourceStatuses(openSources({ root: dir, config, adapters: { freesound }, env: {} }))[0]).toMatchObject({ available: false, why: '缺 key（FREESOUND_API_KEY）' });
  expect(sourceStatuses(openSources({ root: dir, config, adapters: { freesound }, env: { FREESOUND_API_KEY: 'k' } }))[0].available).toBe(true);
});

test('the credit names title, author, page and licence', () => {
  const r = { title: 'Rain on Windows, Interior, B.wav', author: 'InspectorJ', page: 'https://freesound.org/people/InspectorJ/sounds/346641/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' } as AssetRecord;
  expect(freesound.credit(r)).toBe('- SFX: "Rain on Windows, Interior, B.wav" by InspectorJ (https://freesound.org/people/InspectorJ/sounds/346641/), CC BY 4.0 https://creativecommons.org/licenses/by/4.0/');
});

test('the card covers keywords, licences, filters and the daily quota', () => {
  for (const must of ['English', 'license=cc0', 'BY-NC', 'bpm=', 'loop=true', '2,000']) expect(freesound.card()).toContain(must);
});

test('check is never answered from the cache: a key that went bad shows at once', async () => {
  await freesound.check(ctx());
  status = 401;
  await expect(freesound.check(ctx())).rejects.toMatchObject({ kind: 'broken' });
});

test('an --opt value it does not know is refused, not silently dropped', async () => {
  for (const [k, v, msg] of [['license', 'cc-by', '--opt license 只能是 cc0、by、by-nc'], ['license', 'constructor', '--opt license 只能是 cc0、by、by-nc'], ['bpm', '90', '--opt bpm 要像 90-120'], ['loop', 'yes', '--opt loop 只能是 true']])
    await expect(freesound.search({ text: 'x', opts: { [k]: v }, limit: 1 }, ctx())).rejects.toThrow(msg);
  await freesound.search({ text: 'x', opts: { license: 'CC0' }, limit: 1 }, ctx());   // any case
  expect(new URL(sent[0].url).searchParams.get('filter')).toBe('license:"Creative Commons 0"');
});

test('a key of the wrong shape is broken and never printed', async () => {
  const http = createHttp({ source: 'freesound', cacheDir: dir, limits: freesound.limits, hasKey: true, fetch: fakeFetch });
  const bad: SourceCtx = { http, sub: () => http, key: 'AB\nCD', options: {}, tmpDir: dir };
  const e = await freesound.search({ text: 'x', opts: {}, limit: 1 }, bad).catch((x) => x);
  expect(e).toMatchObject({ kind: 'broken', message: 'Freesound 的 key 格式不對（只能有英文字母和數字）' });
  expect(String(e.message)).not.toContain('AB');
  expect(sent).toEqual([]);
});

test('an id that is not a number is missing without asking Freesound', async () => {
  for (const id of ['..', 'abc', '12/34']) await expect(freesound.get(id, ctx())).rejects.toMatchObject({ kind: 'missing', message: `Freesound 沒有 ${id} 這個音效` });
  expect(sent).toEqual([]);
});
