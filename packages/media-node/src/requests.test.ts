import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestRequest, newRequestId, readRequest, requestsDir, saveRequest, type AskRequest } from './requests.ts';

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
