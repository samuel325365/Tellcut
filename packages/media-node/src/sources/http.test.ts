import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cleanUrl, createHttp } from './http.ts';

let dir: string, seen: Request[], replies: Array<() => Response>, now: number;
const reply = (status: number, body: string, type = 'application/json') => replies.push(() => new Response(body, { status, headers: { 'content-type': type } }));
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  seen.push(new Request(url, init));
  const r = replies.length > 1 ? replies.shift()! : replies[0];
  if (!r) throw new TypeError('fetch failed');
  return r();
}) as typeof fetch;
const h = (o: { contact?: string; hasKey?: boolean }) => createHttp({ source: 'x', cacheDir: dir, limits: [{ n: 100, per: 60 }], fetch: fakeFetch, now: () => now, ...o });

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'http-')); seen = []; replies = []; now = 0; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('every request says who it is', async () => {
  reply(200, '{"a":1}');
  await h({ contact: 'me@example.org' }).json('https://api.example/x');
  expect(seen[0].headers.get('user-agent')).toBe('Tellcut/0.1.0 (me@example.org)');
  await h({}).json('https://api.example/x', { ttl: 0 });
  expect(seen[1].headers.get('user-agent')).toBe('Tellcut/0.1.0 (https://github.com/samuel325365/tellcut)');
});

test('a POST sends its body as JSON', async () => {
  reply(200, '{"ok":true}');
  expect(await h({}).json('https://api.example/s', { method: 'POST', body: { q: 'rain' } })).toEqual({ ok: true });
  expect([seen[0].method, seen[0].headers.get('content-type'), await seen[0].text()]).toEqual(['POST', 'application/json', '{"q":"rain"}']);
});

test('an HTML page where JSON was expected is temporary, not empty', async () => {
  reply(200, '<!doctype html><title>Just a moment...</title>', 'text/html');
  await expect(h({}).json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary', source: 'x', message: expect.stringContaining('人機驗證') });
  replies = []; reply(200, '<html>maintenance</html>', 'application/json');
  await expect(h({}).json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary' });
});

test('429 and 5xx are temporary; 404 is broken unless the caller says missing; bad JSON is broken', async () => {
  reply(429, '{}');
  await expect(h({}).json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary', message: '暫時不能用（HTTP 429）' });
  replies = []; reply(503, 'busy', 'text/plain');
  await expect(h({}).json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary', message: '暫時不能用（HTTP 503）' });
  replies = []; reply(404, '{}');
  await expect(h({}).json('https://api.example/x')).rejects.toMatchObject({ kind: 'broken' });
  await expect(h({}).json('https://api.example/x', { notFound: 'missing' })).rejects.toMatchObject({ kind: 'missing' });
  replies = []; reply(200, '{ nope');
  await expect(h({}).json('https://api.example/x')).rejects.toMatchObject({ kind: 'broken', message: '回應格式看不懂' });
});

test('no connection is temporary', async () => {
  await expect(h({}).json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary', message: expect.stringContaining('連不上') });
});

test('403 without a key is temporary, with a key broken', async () => {
  reply(403, '{}');
  await expect(h({}).json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary' });
  await expect(h({ hasKey: true }).json('https://api.example/x')).rejects.toMatchObject({ kind: 'broken', message: expect.stringContaining('key 被拒絕') });
});

test('a 403 web page is a bot check even with a key; a 403 answer with a key is a refused key', async () => {
  reply(403, '<!doctype html><title>Just a moment...</title>', 'text/html');
  await expect(h({ hasKey: true }).json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary' });
  replies = []; reply(403, '{"error":"invalid key"}');
  await expect(h({ hasKey: true }).json('https://api.example/x')).rejects.toMatchObject({ kind: 'broken' });
});

test('a 400 that names the key, sent with a key, is a refused key; another 400 stays temporary', async () => {
  reply(400, '[ERROR 400] "key" is invalid', 'text/plain');
  await expect(h({ hasKey: true }).json('https://api.example/x')).rejects.toMatchObject({ kind: 'broken', message: 'key 被拒絕（HTTP 400）' });
  await expect(h({}).json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary' });
  replies = []; reply(400, '[ERROR 400] "q" is too long', 'text/plain');
  await expect(h({ hasKey: true }).json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary', message: '請求被拒絕（HTTP 400）' });
  // another key-taking source's 400 that only mentions a key somewhere is about the query, not the key
  for (const body of ['{"error":{"key":"q","message":"too long"}}', '{"detail":"filter is missing its key field"}', 'Bad key: value pair in q']) {
    replies = []; reply(400, body);
    await expect(h({ hasKey: true }).json('https://api.example/x'), body).rejects.toMatchObject({ kind: 'temporary', message: '請求被拒絕（HTTP 400）' });
  }
});

test('other 4xx answers are about this request, not a broken source', async () => {
  for (const s of [400, 405, 422]) {
    replies = []; reply(s, '{}');
    await expect(h({}).json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary', message: `請求被拒絕（HTTP ${s}）` });
  }
});

test('a JSON answer is served from the cache within its ttl and fetched again after it', async () => {
  reply(200, '{"n":1}');
  const http = h({});
  await http.json('https://api.example/c', { ttl: 60 });
  now = 59_000; expect(await http.json('https://api.example/c', { ttl: 60 })).toEqual({ n: 1 });
  now = 61_000; await http.json('https://api.example/c', { ttl: 60 });
  expect(seen).toHaveLength(2);
});

test('a status the caller expects gives its JSON body back instead of an error', async () => {
  reply(400, '{"code":"NoRoute","message":"Impossible route between points"}');
  expect(await h({}).json('https://api.example/route', { acceptStatus: [400] })).toEqual({ code: 'NoRoute', message: 'Impossible route between points' });
  await expect(h({}).json('https://api.example/route')).rejects.toMatchObject({ kind: 'temporary' });
});

test('an answer the caller says not to keep is not cached', async () => {
  reply(200, '{"error":{"code":"search-error"}}');
  const http = h({});
  for (let i = 0; i < 2; i++) await http.json('https://api.example/c', { ttl: 60, cacheIf: (b: any) => !b.error });
  expect(seen).toHaveLength(2);
});

test('the rate limit, once spent, is temporary with the wait in minutes', async () => {
  reply(200, '{}');
  const http = createHttp({ source: 'x', cacheDir: dir, limits: [{ n: 1, per: 3600 }], fetch: fakeFetch, now: () => 0 });
  await http.json('https://api.example/x');
  await expect(http.json('https://api.example/x')).rejects.toMatchObject({ kind: 'temporary', message: '額度暫時用完，約 60 分鐘後再試' });
});

test('a download is written whole; one over maxBytes stops and leaves no file', async () => {
  reply(200, 'x'.repeat(20), 'audio/mpeg');
  const dest = join(dir, 'a.mp3');
  expect(await h({}).download('https://media.example/a.mp3', dest, { maxBytes: 100 })).toEqual({ bytes: 20, type: 'audio/mpeg' });
  expect(readFileSync(dest, 'utf8')).toHaveLength(20);
  const big = join(dir, 'b.mp3');
  await expect(h({}).download('https://media.example/b.mp3', big, { maxBytes: 10 })).rejects.toThrow('檔案超過上限');
  expect([existsSync(big), readdirSync(dirname(big)).filter((f) => f.endsWith('.part'))]).toEqual([false, []]);
  // the message names the file, never its query (a Carto tile URL carries the user's key)
  reply(200, 'x'.repeat(20), 'image/png');
  const e = await h({}).download('https://tiles.example/1/2/3.png?api_key=SECRET', join(dir, 't.png'), { maxBytes: 10 }).catch((x: Error) => x.message);
  expect([e, String(e).includes('SECRET')]).toEqual([expect.stringContaining('https://tiles.example/1/2/3.png'), false]);
});

test('a download that answers with a web page is temporary; a missing file is missing', async () => {
  reply(200, '<html>login</html>', 'text/html');
  await expect(h({}).download('https://media.example/a.mp3', join(dir, 'a.mp3'), { maxBytes: 100 })).rejects.toMatchObject({ kind: 'temporary' });
  replies = []; reply(404, 'no', 'text/plain');
  await expect(h({}).download('https://media.example/a.mp3', join(dir, 'a.mp3'), { maxBytes: 100 })).rejects.toMatchObject({ kind: 'missing' });
});

test('a download cut off midway is temporary and leaves no partial file', async () => {
  replies.push(() => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('half')); c.error(new TypeError('terminated')); } }), { headers: { 'content-type': 'audio/mpeg' } }));
  const dest = join(dir, 'cut.mp3');
  await expect(h({}).download('https://media.example/cut.mp3', dest, { maxBytes: 100 })).rejects.toMatchObject({ name: 'SourceError', kind: 'temporary', message: expect.stringContaining('下載中斷') });
  expect([existsSync(dest), readdirSync(dirname(dest)).filter((f) => f.endsWith('.part'))]).toEqual([false, []]);
});

test('head tells the type and length', async () => {
  replies.push(() => new Response(null, { status: 200, headers: { 'content-type': 'audio/mpeg', 'content-length': '123' } }));
  expect(await h({}).head('https://media.example/a.mp3')).toEqual({ type: 'audio/mpeg', length: 123 });
  expect(seen[0].method).toBe('HEAD');
});

test('cleanUrl makes NASA links https and drops utm_ parameters', () => {
  expect(cleanUrl('http://images-assets.nasa.gov/a.jpg?utm_source=x&w=2')).toBe('https://images-assets.nasa.gov/a.jpg?w=2');
  expect(cleanUrl('https://commons.wikimedia.org/wiki/File:A.jpg?utm_medium=y')).toBe('https://commons.wikimedia.org/wiki/File:A.jpg');
  expect(cleanUrl('http://example.org/a')).toBe('http://example.org/a');
});
