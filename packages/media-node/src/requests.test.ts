import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestRequest, newRequestId, readRequest, requestsDir, saveRequest, type AskRequest } from './requests.ts';

// another process pruning at the same time: readdirSync names a request already gone
const race = vi.hoisted(() => ({ gone: [] as string[] }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return { ...real, readdirSync: ((p: any, o?: any) => { const r = real.readdirSync(p, o) as any[]; return race.gone.length && !o ? [...race.gone, ...r] : r; }) as typeof real.readdirSync };
});
afterEach(() => { race.gone.length = 0; });

test('a request another process pruned first does not fail the save', () => {
  const d = mkdtempSync(join(tmpdir(), 'req-'));
  for (let i = 0; i < 50; i++) saveRequest(d, req(`20261016-0000${String(i).padStart(2, '0')}-aaa`));
  race.gone.push('20261015-000000-old.json');
  expect(() => saveRequest(d, req('20261016-235959-zzz'))).not.toThrow();
  expect(latestRequest(d)!.id).toBe('20261016-235959-zzz');
});

const req = (id: string, text = 'x'): AskRequest => ({ id, created: '2026-10-16T00:00:00Z', text, selection: ['c1'], playhead: 1, range: [0, 4], base: 'h' });

test('requests are kept newest last, the latest is read back whole, and only 50 stay', () => {
  const d = mkdtempSync(join(tmpdir(), 'req-'));
  for (let i = 0; i < 52; i++) saveRequest(d, req(`20261016-0000${String(i).padStart(2, '0')}-aaa`));
  saveRequest(d, req('20261016-235959-zzz', '換一個"更亮"的\n鏡頭'));
  expect(latestRequest(d)!.text).toBe('換一個"更亮"的\n鏡頭');
  expect(readRequest(d, '20261016-000051-aaa')!.id).toBe('20261016-000051-aaa');
  expect(readRequest(d, '20261016-000000-aaa')).toBeNull();
  expect(readdirSync(requestsDir(d))).toHaveLength(50);
  expect(newRequestId(new Date(2026, 9, 16, 9, 5, 7))).toMatch(/^20261016-090507-[a-z0-9]{3}$/);
});
