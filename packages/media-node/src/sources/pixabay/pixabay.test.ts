import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { SourceCtx } from '../types.ts';
import { pickRendition, pixabay } from './index.ts';

const KEY = '12345-abcdef';
const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const VIDEOS = fx('search-video'), IMAGES = fx('search-image');
let dir: string, sent: Array<{ url: string; method: string }>, landscapeOnly: boolean, refuseKey: boolean, noFile: boolean, clock: number;
/** a video Pixabay lists without a downloadable file: every rendition's url empty, 0×0 */
const NO_FILE = { id: 409999, pageURL: 'https://pixabay.com/videos/id-409999/', tags: 'coffee', duration: 5, user: 'Nobody',
  videos: Object.fromEntries(['large', 'medium', 'small', 'tiny'].map((k) => [k, { url: '', width: 0, height: 0, size: 0, thumbnail: '' }])) };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  const u = new URL(String(url)), method = init?.method ?? 'GET';
  sent.push({ url: u.toString(), method });
  if (refuseKey) return new Response('[ERROR 400] "key" is invalid', { status: 400, headers: { 'content-type': 'text/plain' } });
  if (u.hostname === 'pixabay.com' && u.pathname.startsWith('/api')) {
    const all = u.pathname === '/api/videos/' ? VIDEOS : IMAGES, id = u.searchParams.get('id');
    if (id) { const hits = all.hits.filter((h: { id: number }) => String(h.id) === id); return json({ total: hits.length, totalHits: hits.length, hits }); }
    if (noFile && all === VIDEOS) return json({ ...all, hits: [NO_FILE, ...all.hits] });
    if (landscapeOnly && all === VIDEOS) { const hits = all.hits.filter((h: { id: number }) => h.id !== 401001); return json({ ...all, hits }); }
    return json(all);
  }
  return new Response('media-bytes', { headers: { 'content-type': u.pathname.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' } });
}) as typeof fetch;
const ctx = (options: Record<string, unknown> = {}): SourceCtx => {
  const http = createHttp({ source: 'pixabay', cacheDir: dir, limits: pixabay.limits, fetch: fakeFetch, hasKey: true, now: () => clock });
  return { http, sub: () => http, key: KEY, options, tmpDir: dir };
};
const lastCdn = () => sent.filter((s) => s.url.includes('cdn.pixabay.com') || s.url.includes('pixabay.com/get/')).at(-1)!.url;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pixabay-')); sent = []; landscapeOnly = false; refuseKey = false; noFile = false; clock = 1.8e12; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('search reads hits: videos from /api/videos/, kind, size, duration, thumbnail, AI tag', async () => {
  const hits = await pixabay.search({ text: 'coffee pouring', kind: 'video', opts: {}, limit: 5 }, ctx());
  const u = new URL(sent[0].url);
  expect(u.pathname).toBe('/api/videos/');
  expect(u.searchParams.get('q')).toBe('coffee pouring');
  expect(u.searchParams.get('safesearch')).toBe('true');
  expect(hits[0]).toMatchObject({ ref: 'pixabay:video-307249', source: 'pixabay', id: 'video-307249', kind: 'video', duration: 8, width: 1920, height: 1080, author: 'Poor-Designer' });
  expect(hits[0].thumbUrl).toMatch(/^https:\/\/cdn\.pixabay\.com\//);
  expect(hits.find((h) => h.tags?.includes('ai generated'))!.detail).toContain('AI 生成');
  expect(hits.find((h) => h.id === 'video-401001')!.detail).toContain('直式');
  expect(JSON.stringify(hits)).not.toContain(KEY);
});

test('images come from /api/ as photos; no kind asks both and lists videos first', async () => {
  const imgs = await pixabay.search({ text: 'bakery', kind: 'image', opts: {}, limit: 5 }, ctx());
  expect(new URL(sent.at(-1)!.url).pathname).toBe('/api/');
  expect(new URL(sent.at(-1)!.url).searchParams.get('image_type')).toBe('photo');
  expect(imgs[0]).toMatchObject({ kind: 'image', ref: 'pixabay:image-501001', width: 6000, height: 4000, author: 'Crumb' });
  const both = await pixabay.search({ text: 'bakery', opts: {}, limit: 10 }, ctx());
  expect(both[0].kind).toBe('video');
  expect(both.some((h) => h.kind === 'image')).toBe(true);
});

test('ratio filter keeps only landscape footage (and asks images for that orientation)', async () => {
  const wide = await pixabay.search({ text: 'x', kind: 'video', ratio: '16:9', opts: {}, limit: 5 }, ctx());
  expect(wide.length).toBe(2);
  expect(wide.every((h) => h.width! > h.height!)).toBe(true);
  const tall = await pixabay.search({ text: 'x', kind: 'video', ratio: '9:16', opts: {}, limit: 5 }, ctx());
  expect(tall.map((h) => h.id)).toEqual(['video-401001']);
  await pixabay.search({ text: 'x', kind: 'image', ratio: '9:16', opts: {}, limit: 5 }, ctx());
  expect(new URL(sent.at(-1)!.url).searchParams.get('orientation')).toBe('vertical');
  landscapeOnly = true;
  expect(await pixabay.search({ text: 'y', kind: 'video', ratio: '9:16', opts: {}, limit: 5 }, ctx())).toEqual([]);
});

test('--opt passes order, category, editors_choice, video_type; another key is refused', async () => {
  await pixabay.search({ text: 'x', kind: 'video', opts: { order: 'latest', category: 'food', editors_choice: 'true', video_type: 'film' }, limit: 3 }, ctx());
  const p = new URL(sent.at(-1)!.url).searchParams;
  expect([p.get('order'), p.get('category'), p.get('editors_choice'), p.get('video_type')]).toEqual(['latest', 'food', 'true', 'film']);
  await expect(pixabay.search({ text: 'x', opts: { colour: 'red' }, limit: 3 }, ctx())).rejects.toThrow(/--opt colour/);
});

test('get takes the smallest rendition whose short side is at least 1080 (or --opt short)', async () => {
  const f = await pixabay.get('video-307249', ctx());
  expect(lastCdn()).toMatch(/307249_medium\.mp4$/);
  expect(f).toMatchObject({ kind: 'video', file: join(dir, 'pixabay-video-307249.mp4'),
    meta: { source: 'pixabay', id: 'video-307249', author: 'Poor-Designer', page: 'https://pixabay.com/videos/id-307249/', license: 'Pixabay Content License', quality: 'original' } });
  await pixabay.get('video-307249', ctx({ short: '2160' }));
  expect(lastCdn()).toMatch(/307249_large\.mp4$/);
});

test('get skips a rendition with an empty url', async () => {
  const f = await pixabay.get('video-326949', ctx({ short: '2160' }));
  expect(lastCdn()).toMatch(/326949_medium\.mp4$/);
  expect(f.meta.quality).toBe('preview');
  expect(pickRendition(VIDEOS.hits[2].videos, 2160)).toMatchObject({ name: 'medium', enough: false });
});

test('get downloads the large image, credit names Pixabay and the author', async () => {
  const f = await pixabay.get('image-501001', ctx());
  expect(lastCdn()).toBe('https://pixabay.com/get/g501001_1280.jpg');
  expect(f).toMatchObject({ kind: 'image', file: join(dir, 'pixabay-image-501001.jpg') });
  expect(f.meta.quality).toBe('preview');   // 6000 px wide, largeImageURL is 1280
  expect(pixabay.credit({ ...f.meta, path: 'x', downloaded: 'd' })).toMatch(/^- Pixabay: ".+" by Crumb \(https:\/\/pixabay\.com\/.+\), Pixabay Content License$/);
});

test('a malformed id is missing without a request', async () => {
  for (const id of ['123', 'video-abc', 'clip-1']) await expect(pixabay.get(id, ctx())).rejects.toMatchObject({ kind: 'missing' });
  expect(sent).toEqual([]);
});

test('an id Pixabay does not have is missing', async () => {
  await expect(pixabay.get('video-999', ctx())).rejects.toMatchObject({ kind: 'missing', message: expect.stringContaining('video-999') });
});

test('a refused key never shows the key', async () => {
  refuseKey = true;
  const e = await pixabay.search({ text: 'x', opts: {}, limit: 3 }, ctx()).catch((x) => x);
  expect(e).toMatchObject({ kind: 'broken' });
  expect(String(e.message)).toContain('key');
  expect(String(e.message)).not.toContain(KEY);
});

test('a key of another shape is refused before any request, without showing it', async () => {
  const c = { ...ctx(), key: 'abc&q=x' };
  const e = await pixabay.search({ text: 'x', opts: {}, limit: 3 }, c).catch((x) => x);
  expect(e).toMatchObject({ kind: 'broken' });
  expect(String(e.message)).not.toContain('abc&q=x');
  expect(sent).toEqual([]);
});

test('check does not use the cache and reports the hit count', async () => {
  expect(await pixabay.check(ctx())).toMatch(/共 3 筆/);
  await pixabay.check(ctx());
  expect(sent.filter((s) => s.url.includes('/api/videos/')).length).toBe(2);
});

test('search answers are kept a day', async () => {
  await pixabay.search({ text: 'same', kind: 'video', opts: {}, limit: 3 }, ctx());
  await pixabay.search({ text: 'same', kind: 'video', opts: {}, limit: 3 }, ctx());
  expect(sent.length).toBe(1);
});

test('get covers the project frame without upscaling: a 9:16 film takes the large landscape copy', async () => {
  await pixabay.get('video-307249', ctx({ frame: '1080x1920' }));
  expect(lastCdn()).toMatch(/307249_large\.mp4$/);
  await pixabay.get('video-307249', ctx({ frame: '1920x1080' }));
  expect(lastCdn()).toMatch(/307249_medium\.mp4$/);
  await pixabay.get('video-307249', ctx({ frame: '1920x1080', short: '2160' }));   // --opt short wins
  expect(lastCdn()).toMatch(/307249_large\.mp4$/);
});

test('image hits say AI 生成 and 直式 like video hits', async () => {
  const imgs = await pixabay.search({ text: 'x', kind: 'image', opts: {}, limit: 5 }, ctx());
  expect(imgs.find((h) => h.id === 'image-501003')!.detail).toContain('AI 生成');
  expect(imgs.find((h) => h.id === 'image-501003')!.detail).toContain('直式');
});

test('a video with no downloadable file is not listed', async () => {
  noFile = true;
  const hits = await pixabay.search({ text: 'coffee', kind: 'video', opts: {}, limit: 10 }, ctx());
  expect(hits.length).toBe(3);
  expect(hits.some((h) => h.id === 'video-409999' || h.width === 0)).toBe(false);
});

test('a lookup by id is kept only minutes (its file URLs expire); search answers still a day', async () => {
  const apiCalls = () => sent.filter((s) => s.url.includes('/api/')).length;
  await pixabay.get('image-501001', ctx());
  await pixabay.get('image-501001', ctx());
  expect(apiCalls()).toBe(1);
  await pixabay.search({ text: 'same', kind: 'image', opts: {}, limit: 3 }, ctx());
  clock += 11 * 60_000;
  await pixabay.get('image-501001', ctx());
  expect(apiCalls()).toBe(3);
  await pixabay.search({ text: 'same', kind: 'image', opts: {}, limit: 3 }, ctx());
  expect(apiCalls()).toBe(3);
});
