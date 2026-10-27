import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { availableSources, checkSources, ffmpeg, openSources, readHealth, recordHealth, SourceError, type SourceAdapter, type SourcesConfig } from '@tellcut/media-node';
import { sourcesReport } from './sources.ts';

let root: string, clip: string, checked: string[];
const adapter = (id: string, o: Partial<SourceAdapter> = {}): SourceAdapter => ({
  id, label: id, category: 'sound', kinds: ['audio'], needsKey: false, limits: [{ n: 100, per: 60 }], summary: id, sample: 'rain', card: () => '',
  check: async () => { checked.push(id); return '共 3 筆'; },
  search: async () => [{ ref: `${id}:1`, source: id, id: '1', kind: 'audio', title: 'one' }],
  get: async (x, ctx) => { const file = join(ctx.tmpDir, `${x}.wav`); copyFileSync(clip, file); return { file, kind: 'audio', meta: { source: id, id: x, title: 'one', author: 'a', page: 'p', license: 'l', quality: 'preview' } }; },
  credit: () => '', ...o,
});
const cfg = (contact = ''): SourcesConfig => ({ contact, keys: {}, sources: {
  fake: { enabled: true, options: {} }, off: { enabled: false, unofficial: true, options: {} }, keyed: { enabled: true, keyEnv: 'K_KEY', options: {} }, later: { enabled: true, options: {} } } });
const open = (adapters: Record<string, SourceAdapter>, contact = '') => openSources({ root, config: cfg(contact), adapters, env: {}, fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });

beforeAll(async () => { root = mkdtempSync(join(tmpdir(), 'sources-cli-')); clip = join(root, 'clip.wav'); await ffmpeg(['-f', 'lavfi', '-i', 'sine=d=0.5', clip]); });
afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => { checked = []; rmSync(join(root, '.cache'), { recursive: true, force: true }); });

test('a broken source that answers again is available again', async () => {
  const s = open({ fake: adapter('fake') });
  await recordHealth(s.healthFile, 'fake', { status: 'broken', detail: '404' });
  expect(availableSources(s)).toEqual([]);
  await checkSources(s);
  expect(readHealth(s.healthFile).fake).toMatchObject({ status: 'ok', detail: '共 3 筆' });
  expect(availableSources(s).map((a) => a.id)).toEqual(['fake']);
});

test('a check that fails is recorded as broken or temporary by its kind', async () => {
  const s = open({ fake: adapter('fake', { check: async () => { throw new SourceError('fake', 'broken', '找不到（HTTP 404）'); } }),
    later: adapter('later', { check: async () => { throw new SourceError('later', 'temporary', '暫時不能用（HTTP 503）'); } }) });
  await checkSources(s);
  expect([readHealth(s.healthFile).fake.status, readHealth(s.healthFile).later.status]).toEqual(['broken', 'temporary']);
});

test('an adapter that fails on the answer itself (not a SourceError) is broken, not temporary', async () => {
  const s = open({ fake: adapter('fake', { check: async () => { const r = {} as { results: string[] }; return `共 ${r.results.length} 筆`; } }) });
  await checkSources(s);
  expect(readHealth(s.healthFile).fake).toMatchObject({ status: 'broken', detail: expect.stringMatching(/^轉接程式出錯（TypeError：/) });
});

test('off sources and sources without a key are listed but not checked', async () => {
  const s = open({ fake: adapter('fake'), off: adapter('off'), keyed: adapter('keyed', { needsKey: true }) });
  const report = await sourcesReport(s);
  expect(checked).toEqual(['fake']);
  const line = (id: string) => report.split('\n').find((l) => l.startsWith(id))!;
  expect(line('fake')).toMatch(/^fake\s+開\s+不需要\s+可用\s+共 3 筆/);
  expect(line('off（非官方）')).toMatch(/關\s+不需要\s+未檢查/);
  expect(line('keyed')).toMatch(/開\s+缺（K_KEY）\s+未檢查/);
  expect(line('later')).toMatch(/開\s+—\s+還沒有轉接程式/);
});

test('the report reminds to fill in a contact only when there is none', async () => {
  expect(await sourcesReport(open({ fake: adapter('fake') }))).toContain('還沒填聯絡方式');
  expect(await sourcesReport(open({ fake: adapter('fake') }, 'me@example.org'))).not.toContain('還沒填聯絡方式');
});

test('--live searches and downloads one, then cleans up', async () => {
  const tmp = mkdtempSync(join(root, 'live-'));
  let got = '';
  const s = open({ fake: adapter('fake', { search: async (q) => [{ ref: `fake:${q.text}`, source: 'fake', id: q.text, kind: 'audio', title: 'x' }],
    get: async (x, ctx) => { got = x; const file = join(ctx.tmpDir, 'x.wav'); copyFileSync(clip, file); return { file, kind: 'audio', meta: { source: 'fake', id: x, title: 'x', author: 'a', page: 'p', license: 'l', quality: 'preview' } }; } }) });
  const [r] = await checkSources(s, { live: true, tmpDir: tmp });
  expect(got).toBe('rain');
  expect(r.result).toMatchObject({ status: 'ok', detail: '共 3 筆；實測下載 fake:rain' });
  expect(readdirSync(tmp)).toEqual([]);
});

test('--live does not search a source that takes no part in searches (maps): its check already downloads', async () => {
  const tmp = mkdtempSync(join(root, 'live-'));
  let searched = false;
  const s = open({ fake: adapter('fake', { kinds: [], search: async () => { searched = true; return []; } }) });
  const [r] = await checkSources(s, { live: true, tmpDir: tmp });
  expect(searched).toBe(false);
  expect(r.result).toMatchObject({ status: 'ok', detail: '共 3 筆' });
});
