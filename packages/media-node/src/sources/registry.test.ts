import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SourcesConfig } from './config.ts';
import { readHealth, recordHealth } from './health.ts';
import { SourceError } from './http.ts';
import { makePhoto } from '../test-media.ts';
import { probeMedia } from '../probe.ts';
import { ADAPTERS, availableSources, contextFor, limitsFor, openSources, pickedSources, searchAll, searchSheet, sourceStatuses } from './registry.ts';
import { SOURCE_CATEGORIES, type AssetHit, type SourceAdapter } from './types.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'reg-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const hit = (source: string, id: string, kind: AssetHit['kind']): AssetHit => ({ ref: `${source}:${id}`, source, id, kind, title: id });
function fake(id: string, kind: AssetHit['kind'], search: SourceAdapter['search'], needsKey = false): SourceAdapter {
  return { id, label: id, category: 'media', kinds: [kind], needsKey, limits: [{ n: 100, per: 60 }], summary: `${id} 的說明`, sample: 'x', card: () => `# ${id}`, search,
    get: async () => { throw new Error('not here'); }, check: async () => 'ok', credit: (r) => `- ${r.title}` };
}
const config: SourcesConfig = { contact: '', keys: {}, sources: { a: { enabled: true, options: {} }, b: { enabled: true, keyEnv: 'B_KEY', options: {} }, c: { enabled: false, options: {} } } };
const noNet = (async () => { throw new Error('no network in tests'); }) as unknown as typeof fetch;
const open = (adapters: Record<string, SourceAdapter>, env: NodeJS.ProcessEnv = {}) => openSources({ root: dir, config, adapters, env, fetch: noNet });

const fakeA = fake('a', 'audio', async () => [hit('a', '1', 'audio'), hit('a', '2', 'audio')]);
const fakeB = fake('b', 'music', async () => [hit('b', '1', 'music'), hit('b', '2', 'music')], true);

test('a source is available only when on, with its key, and not broken', () => {
  const s = open({ a: fakeA, b: fakeB });
  expect(availableSources(s).map((a) => a.id)).toEqual(['a']);
  expect(sourceStatuses(s).find((x) => x.id === 'b')).toMatchObject({ available: false, key: 'missing', why: '缺 key（B_KEY）' });
  expect(sourceStatuses(s).find((x) => x.id === 'c')).toMatchObject({ available: false, enabled: false, why: '還沒有轉接程式' });
  expect(sourceStatuses(s).find((x) => x.id === 'a')).toMatchObject({ available: true, key: 'not-needed' });
  expect(availableSources(open({ a: fakeA, b: fakeB }, { B_KEY: 'k' })).map((a) => a.id)).toEqual(['a', 'b']);
});

test('the page chat\'s ticked list (TELLCUT_SOURCES) narrows what is available; without it nothing changes', () => {
  const statuses = (env: NodeJS.ProcessEnv) => sourceStatuses(open({ a: fakeA, b: fakeB }, { B_KEY: 'k', ...env }));
  expect(statuses({}).filter((x) => x.available).map((x) => x.id)).toEqual(['a', 'b']);
  expect(statuses({ TELLCUT_SOURCES: 'b' }).find((x) => x.id === 'a')).toMatchObject({ available: false, reason: 'unpicked', why: '這次對話沒有勾選' });
  expect(statuses({ TELLCUT_SOURCES: ' a , b ' }).filter((x) => x.available).map((x) => x.id)).toEqual(['a', 'b']);
  // none ticked: none at all
  expect(statuses({ TELLCUT_SOURCES: '' }).filter((x) => x.available)).toEqual([]);
  // a real problem comes before the ticks: the page shows it greyed out with its reason
  expect(sourceStatuses(open({ a: fakeA, b: fakeB }, { TELLCUT_SOURCES: 'b' })).find((x) => x.id === 'b')).toMatchObject({ reason: 'key', why: '缺 key（B_KEY）' });
  expect(pickedSources({})).toBeUndefined();
});

test('every adapter Tellcut ships belongs to a group of the API menu', () => {
  for (const a of Object.values(ADAPTERS)) expect(SOURCE_CATEGORIES).toContain(a.category);
});

test('an adapter that is switched off says so', () => {
  const s = openSources({ root: dir, config: { ...config, sources: { a: { enabled: false, options: {} } } }, adapters: { a: fakeA }, env: {}, fetch: noNet });
  expect(sourceStatuses(s)).toMatchObject([{ id: 'a', available: false, why: '關閉' }]);
});

test('broken in the health file hides a source; temporary and never checked do not', async () => {
  const s = open({ a: fakeA });
  await recordHealth(s.healthFile, 'a', { status: 'temporary', detail: '503' });
  expect(availableSources(s).map((a) => a.id)).toEqual(['a']);
  await recordHealth(s.healthFile, 'a', { status: 'broken', detail: '404' });
  expect(availableSources(s)).toEqual([]);
  expect(sourceStatuses(s)[0].why).toBe('壞掉：404');
});

test('one source failing does not hide the others\' hits', async () => {
  const flaky = fake('a', 'audio', async () => { throw new SourceError('a', 'temporary', '暫時不能用（HTTP 503）'); });
  const r = await searchAll(open({ a: flaky, b: fakeB }, { B_KEY: 'k' }), { text: 'rain', opts: {}, limit: 5 });
  expect(r.hits.map((h) => h.ref)).toEqual(['b:1', 'b:2']);
  expect(r.problems).toEqual([{ source: 'a', kind: 'temporary', message: '暫時不能用（HTTP 503）' }]);
});

test('a broken answer during a search is written to the health file', async () => {
  const gone = fake('a', 'audio', async () => { throw new SourceError('a', 'broken', '找不到（HTTP 404）'); });
  const s = open({ a: gone });
  await searchAll(s, { text: 'x', opts: {}, limit: 5 });
  expect(readHealth(s.healthFile).a).toMatchObject({ status: 'broken', detail: '找不到（HTTP 404）' });
});

test('--kind only asks the sources of that kind; hits from several sources take turns', async () => {
  const fakeA2 = fake('b', 'audio', async () => [hit('b', '1', 'audio'), hit('b', '2', 'audio')], true);
  const s = open({ a: fakeA, b: fakeA2 }, { B_KEY: 'k' });
  expect((await searchAll(s, { text: 'x', opts: {}, limit: 5 })).hits.map((h) => h.ref)).toEqual(['a:1', 'b:1', 'a:2', 'b:2']);
  const only = open({ a: fakeA, b: fakeB }, { B_KEY: 'k' });
  expect((await searchAll(only, { text: 'x', kind: 'music', opts: {}, limit: 5 })).hits.map((h) => h.ref)).toEqual(['b:1', 'b:2']);
});

test('asking for a source that is not available says why', async () => {
  await expect(searchAll(open({ a: fakeA, b: fakeB }), { text: 'x', opts: {}, limit: 5, source: 'b' })).rejects.toThrow('缺 key（B_KEY）');
  await expect(searchAll(open({ a: fakeA }), { text: 'x', opts: {}, limit: 5, source: 'zzz' })).rejects.toThrow('沒有「zzz」這個來源');
});

test('a health file that cannot be written does not cost the other sources their hits', async () => {
  const gone = fake('a', 'audio', async () => { throw new SourceError('a', 'broken', '找不到（HTTP 404）'); });
  const s = open({ a: gone, b: fakeB }, { B_KEY: 'k' });
  writeFileSync(join(dir, 'not-a-dir'), '');
  s.healthFile = join(dir, 'not-a-dir', 'health.json');
  const r = await searchAll(s, { text: 'x', opts: {}, limit: 5 });
  expect(r.hits.map((h) => h.ref)).toEqual(['b:1', 'b:2']);
  expect(r.problems).toEqual([{ source: 'a', kind: 'broken', message: '找不到（HTTP 404）' }]);
});

test('the answer says which sources were asked: none when no source of the kind is available', async () => {
  expect((await searchAll(open({ a: fakeA, b: fakeB }), { text: 'x', kind: 'music', opts: {}, limit: 5 })).asked).toEqual([]);
  expect((await searchAll(open({ a: fakeA, b: fakeB }, { B_KEY: 'k' }), { text: 'x', opts: {}, limit: 5 })).asked).toEqual(['a', 'b']);
});

describe('thumbnails', () => {
  let jpeg: Buffer, thumbFetches: number;
  beforeAll(async () => { const d = mkdtempSync(join(tmpdir(), 'reg-')); jpeg = readFileSync(await makePhoto(join(d, 't.jpg'), { w: 330, h: 500 })); rmSync(d, { recursive: true, force: true }); });
  beforeEach(() => { thumbFetches = 0; });
  const thumbFetch = (async (url: string | URL) => {
    thumbFetches++;
    return String(url).endsWith('bad.jpg') ? new Response('slow down', { status: 429 }) : new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg' } });
  }) as typeof fetch;
  const pics = (names: string[]) => fake('a', 'image', async () => names.map((n, i) => ({ ...hit('a', String(i + 1), 'image'), thumbUrl: `https://thumb.example/${n}` })));
  const openPics = (names: string[]) => openSources({ root: dir, config, adapters: { a: pics(names) }, env: {}, fetch: thumbFetch });

  test('thumbnails are downloaded once into the cache and named in the hits', async () => {
    const s = openPics(['1.jpg', '2.jpg']);
    const r = await searchAll(s, { text: 'x', opts: {}, limit: 5 });
    expect(r.hits[0].thumb).toBe(join(s.cacheDir, 'thumbs', 'a', '1.jpg'));
    expect(existsSync(r.hits[0].thumb!)).toBe(true);
    await searchAll(s, { text: 'x', opts: {}, limit: 5 });
    expect(thumbFetches).toBe(2);   // two hits, fetched the first time only
    utimesSync(r.hits[0].thumb!, new Date(0), new Date(0));
    await searchAll(s, { text: 'x', opts: {}, limit: 5 });
    expect(thumbFetches).toBe(3);   // a month old: fetched again (a file replaced on Commons keeps its id)
  });

  test('a thumbnail that fails leaves its hit without one, the others are still shown', async () => {
    const r = await searchAll(openPics(['1.jpg', 'bad.jpg']), { text: 'x', opts: {}, limit: 5 });
    expect(r.hits.map((h) => !!h.thumb)).toEqual([true, false]);
    expect(r.problems).toEqual([]);
  });

  test('searchSheet makes one labelled sheet of the thumbnails, none without any', async () => {
    const s = openPics(['1.jpg', '2.jpg']), r = await searchAll(s, { text: 'x', opts: {}, limit: 5 });
    const sheet = await searchSheet(r.hits, s.cacheDir);
    expect(sheet && existsSync(sheet)).toBe(true);
    expect(sheet!.startsWith(join(s.cacheDir, 'sheets'))).toBe(true);
    expect(await searchSheet([{ ...r.hits[0], thumb: undefined }], s.cacheDir)).toBeNull();
  });

  test('one very tall thumbnail does not make the sheet several screens high', async () => {
    const tower = await makePhoto(join(dir, 'tower.jpg'), { w: 100, h: 1000 }), wide = await makePhoto(join(dir, 'wide.jpg'), { w: 330, h: 220 });
    const h = (id: string, thumb: string): AssetHit => ({ ...hit('a', id, 'image'), thumb });
    const sheet = await searchSheet([h('1', tower), h('2', wide)], join(dir, '.cache', 'sources'));
    // one row: a cell at most 1.5 × its 320 px width, its label and padding — not the 3200 px the tower alone would ask for
    expect((await probeMedia(sheet!)).height).toBeLessThanOrEqual(480 + 28 + 12);
  });
});

test('without a contact the slower limits apply', () => {
  const slow: SourceAdapter = { ...fake('w', 'image', async () => []), limits: [{ n: 200, per: 60 }], limitsWithoutContact: [{ n: 10, per: 60 }] };
  const withContact = (contact: string) => openSources({ root: dir, config: { ...config, contact }, adapters: { w: slow }, env: {}, fetch: noNet });
  expect(limitsFor(withContact(''), slow)).toEqual([{ n: 10, per: 60 }]);
  expect(limitsFor(withContact('me@example.org'), slow)).toEqual([{ n: 200, per: 60 }]);
  expect(limitsFor(withContact(''), fakeA)).toEqual(fakeA.limits);
});

test('sub gives a service of the same source its own rate limit', async () => {
  const answers = (async () => new Response('{"ok":1}', { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
  const s = openSources({ root: dir, config, adapters: { a: fakeA }, env: {}, fetch: answers });
  const ctx = contextFor(s, 'a', dir);
  const geo = ctx.sub('geo', [{ n: 1, per: 3600 }]);
  await geo.json('https://geo.example/x');
  await expect(geo.json('https://geo.example/y')).rejects.toMatchObject({ kind: 'temporary', source: 'a-geo' });
  await expect(ctx.http.json('https://api.example/z')).resolves.toEqual({ ok: 1 });   // the source's own limit is untouched
});
