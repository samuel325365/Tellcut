import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticServer } from './static-server.ts';

test('serves files under its root and nothing outside it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ss-root-'));
  writeFileSync(join(root, 'a.txt'), 'root');
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'sub', 'b.txt'), 'deeper');
  const s = createStaticServer(root), port = await s.listen(0);
  const get = async (p: string) => { const r = await fetch(`http://127.0.0.1:${port}${p}`); return [r.status, r.status === 200 ? await r.text() : ''] as const; };
  try {
    expect(await get('/a.txt')).toEqual([200, 'root']);
    expect(await get('/sub/b.txt')).toEqual([200, 'deeper']);
    expect((await get('/sub/..%2f..%2fa.txt'))[0]).toBe(404);   // out of the root: no
  } finally { await s.close(); }
});

test('answers only requests addressed to the loopback host (a page on another site rebinding its name to 127.0.0.1 gets nothing)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ss-root-'));
  writeFileSync(join(root, 'sources.local.json'), '{"key":"secret"}');
  const s = createStaticServer(root), port = await s.listen(0);
  const status = (host: string) => new Promise<number>((ok, no) => {
    request({ host: '127.0.0.1', port, path: '/sources.local.json', headers: { Host: host } }, (r) => { r.resume(); ok(r.statusCode!); }).on('error', no).end();
  });
  try {
    expect(await status(`127.0.0.1:${port}`)).toBe(200);
    expect(await status(`localhost:${port}`)).toBe(200);
    expect(await status(`evil.example:${port}`)).toBe(403);
  } finally { await s.close(); }
});
