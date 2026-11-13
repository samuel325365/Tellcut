import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readHealth, recordHealth } from './health.ts';
import { openSources, sourceStatuses } from './registry.ts';
import type { SourceAdapter } from './types.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'health-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const a: SourceAdapter = { id: 'a', label: 'a', category: 'media', kinds: ['image'], needsKey: false, limits: [{ n: 100, per: 60 }], summary: 'a', sample: 'x',
  card: () => '# a', search: async () => [], get: async () => { throw new Error('not here'); }, check: async () => ({ zh: 'ok', en: 'ok' }), credit: (r) => `- ${r.title}` };

test('a health file that is not an object of entries counts as never checked, and sourceStatuses does not throw', async () => {
  const s = openSources({ root: dir, config: { contact: '', keys: {}, sources: { a: { enabled: true, options: {} } } }, adapters: { a }, env: {} });
  mkdirSync(dirname(s.healthFile), { recursive: true });
  for (const text of ['null', '42', '"broken"', '[{"status":"broken"}]']) {
    writeFileSync(s.healthFile, text);
    expect(readHealth(s.healthFile)).toEqual({});
    expect(sourceStatuses(s)).toMatchObject([{ id: 'a', available: true }]);
  }
  // a bad entry is dropped, a good one beside it kept
  writeFileSync(s.healthFile, JSON.stringify({ a: null, b: 'broken', c: { status: 'gone' }, d: { status: 'broken', detail: '404', at: '2026-11-13T00:00:00.000Z' } }));
  expect(readHealth(s.healthFile)).toEqual({ d: { status: 'broken', detail: '404', at: '2026-11-13T00:00:00.000Z' } });
  expect(sourceStatuses(s)[0].available).toBe(true);
  // the next result written over a file of null makes it whole again
  writeFileSync(s.healthFile, 'null');
  await recordHealth(s.healthFile, 'a', { status: 'broken', detail: '404' });
  expect(sourceStatuses(s)[0]).toMatchObject({ available: false, why: '壞掉：404' });
});
