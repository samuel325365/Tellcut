import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '../http.ts';
import type { SourceCtx } from '../types.ts';
import { nasa } from './index.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
const VID = 'KSC-20190716-MH-NAS01_0001-Return_to_the_Pad_Crew_Quarters_Broll_HQ_Provided-3226478';
let dir: string, sent: Array<{ url: string; method: string }>, sizes: Record<string, number>;
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url), method = init?.method ?? 'GET';
  sent.push({ url: u, method });
  const json = (body: string, s = 200) => new Response(body, { status: s, headers: { 'content-type': 'application/json' } });
  if (u.includes('/search?') && u.includes('nasa_id=')) return json(fx('meta-image'));
  if (u.includes('/search?') && u.includes('media_type=video')) return json(fx('search-video'));
  if (u.includes('/search?')) return json(fx('search-image'));
  if (u.endsWith('/asset/PIA01973')) return json(fx('asset-image'));
  if (u.includes(`/asset/${VID}`)) return json(fx('asset-video'));
  if (u.includes('/asset/')) return json('{"reason":"No AssetDB records for nasaid=NOPE"}', 404);
  const size = Object.entries(sizes).find(([k]) => u.endsWith(k))?.[1] ?? 1000;
  if (method === 'HEAD') return new Response(null, { headers: { 'content-type': u.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg', 'content-length': String(size) } });
  return new Response('media-bytes', { headers: { 'content-type': u.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' } });
}) as typeof fetch;
const ctx = (): SourceCtx => {
  const http = createHttp({ source: 'nasa', cacheDir: dir, limits: nasa.limits, fetch: fakeFetch });
  return { http, sub: () => http, options: {}, tmpDir: dir };
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nasa-')); sent = []; sizes = {}; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('search asks for pictures, footage or both and reads hits with their previews', async () => {
  const hits = await nasa.search({ text: 'saturn', kind: 'image', opts: {}, limit: 2 }, ctx());
  expect(new URL(sent[0].url).searchParams.get('media_type')).toBe('image');
  expect(hits).toHaveLength(2);
  expect(hits[0]).toMatchObject({ ref: 'nasa:PIA01973', kind: 'image', title: 'Saturn Atmosphere', author: 'NASA/JPL', thumbUrl: 'https://images-assets.nasa.gov/image/PIA01973/PIA01973~thumb.jpg' });
  const vids = await nasa.search({ text: 'apollo 11 launch', kind: 'video', opts: {}, limit: 5 }, ctx());
  expect(vids[0]).toMatchObject({ ref: `nasa:${VID}`, kind: 'video' });
  expect(vids[0].thumbUrl).toMatch(/~(large|medium|small|thumb)\.jpg$/);
  await nasa.search({ text: 'moon', opts: {}, limit: 5 }, ctx());
  expect(new URL(sent.at(-1)!.url).searchParams.get('media_type')).toBe('image,video');
});

test('get downloads the original picture, with its title and the NASA licence line', async () => {
  const f = await nasa.get('PIA01973', ctx());
  expect(sent.filter((s) => s.method === 'GET' && !s.url.includes('images-api')).map((s) => s.url)).toEqual(['https://images-assets.nasa.gov/image/PIA01973/PIA01973~orig.jpg']);
  expect(f).toMatchObject({ kind: 'image', file: join(dir, 'nasa-PIA01973.jpg'), meta: { source: 'nasa', id: 'PIA01973', title: 'Saturn Atmosphere', page: 'https://images.nasa.gov/details/PIA01973', quality: 'original' } });
  expect(nasa.credit({ ...f.meta, path: 'x', downloaded: 'd' })).toContain('"Saturn Atmosphere"');
});

test('footage takes the original unless it is too big, then the next copy down', async () => {
  const f = await nasa.get(VID, ctx());
  expect(f.kind).toBe('video');
  expect(f.meta.quality).toBe('original');
  expect(sent.filter((s) => s.method === 'GET').at(-1)!.url).toMatch(/~orig\.mp4$/);
  sizes = { '~orig.mp4': 2e9, '~large.mp4': 5e8, '~medium.mp4': 9e7 };
  const g = await nasa.get(VID, ctx());
  expect(sent.filter((s) => s.method === 'GET').at(-1)!.url).toMatch(/~medium\.mp4$/);
  expect(g.meta.quality).toBe('preview');
});

test('an id NASA does not have is missing', async () => {
  await expect(nasa.get('NOPE', ctx())).rejects.toMatchObject({ kind: 'missing', message: 'NASA 沒有 NOPE 這個項目' });
});

test('an answer of another shape is broken', async () => {
  const http = createHttp({ source: 'nasa', cacheDir: dir, limits: nasa.limits, fetch: (async () => new Response('{"oops":1}', { headers: { 'content-type': 'application/json' } })) as typeof fetch });
  await expect(nasa.search({ text: 'x', opts: {}, limit: 2 }, { http, sub: () => http, options: {}, tmpDir: dir })).rejects.toMatchObject({ kind: 'broken' });
  await expect(nasa.check({ http, sub: () => http, options: {}, tmpDir: dir })).rejects.toMatchObject({ kind: 'broken' });
});
