import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticServer, sendFile } from './static-server.ts';

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

// a file removed while the request is answered: the first stat still sees it, every later one does not
const vanish = vi.hoisted(() => ({ name: '', stats: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const gone = (p: unknown) => vanish.name !== '' && String(p).endsWith(vanish.name);
  return {
    ...real,
    existsSync: ((p: any) => gone(p) || real.existsSync(p)) as typeof real.existsSync,
    statSync: ((p: any, o?: any) => {
      if (!gone(p)) return real.statSync(p, o);
      if (vanish.stats++ === 0) return real.statSync(import.meta.filename);
      if (o?.throwIfNoEntry === false) return undefined;
      throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    }) as typeof real.statSync,
  };
});

test('a file removed while its request is answered gets a 404, not an exception in the request listener', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ss-root-'));
  vanish.name = 'vanish.txt'; vanish.stats = 0;
  let thrown: unknown;
  const server = createServer((req, res) => {
    try { sendFile(req, res, join(root, 'vanish.txt')); } catch (e) { thrown = e; res.writeHead(599); res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/vanish.txt`);
    expect([r.status, thrown]).toEqual([404, undefined]);
  } finally { vanish.name = ''; server.closeAllConnections(); await new Promise((r) => server.close(r)); }
});
