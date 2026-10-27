import { api, fileUrl } from './api.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const json = (status: number, body: unknown) => ({ ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });

test('waitJob: every waiting job is answered by one shared list request a second, through transient errors', async () => {
  const replies: unknown[] = [new Error('network down'),
    json(200, [{ id: 'j1', status: 'running' }, { id: 'j2', status: 'done' }]),
    json(200, [{ id: 'j1', status: 'done' }])];
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (u: string) => { urls.push(u); const r = replies.shift(); if (r instanceof Error) throw r; return r; });
  const one = api.waitJob('j1'), two = api.waitJob('j2');
  await vi.advanceTimersByTimeAsync(3000);
  expect([await one, await two]).toEqual(['done', 'done']);
  expect(urls).toEqual(['/api/jobs', '/api/jobs', '/api/jobs']);   // three requests for two jobs, then none
});

test('a job the server no longer lists ends as failed', async () => {
  vi.stubGlobal('fetch', async () => json(200, []));
  const done = api.waitJob('j9');
  await vi.advanceTimersByTimeAsync(0);
  expect(await done).toBe('failed');
});

test('export calls: start posts an empty range, cancel deletes the job, file links are encoded', async () => {
  const calls: Array<[string, string | undefined]> = [];
  vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => { calls.push([u, init?.method]); return json(200, { id: 'e1' }); });
  await api.exportStart('de mo');
  await api.cancelJob('e1');
  expect(calls).toEqual([['/api/projects/de%20mo/export', 'POST'], ['/api/jobs/e1', 'DELETE']]);
  expect(fileUrl('de mo', 'exports/婚禮 1.mp4')).toBe('/api/projects/de%20mo/files/exports/%E5%A9%9A%E7%A6%AE%201.mp4');
});

test('a save carries the version the project was read at (If-Match) and then the one it wrote; forgetVersion drops it', async () => {
  const sent: Array<string | null> = [];
  let tag = '"v1"';
  vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { sent.push(new Headers(init.headers).get('If-Match')); tag = `"v${sent.length + 1}"`; }
    const r: any = json(200, init?.method === 'PUT' ? { ok: true } : { version: 1 });
    r.headers.set('etag', tag);
    return r;
  });
  await api.project('demo');
  await api.save('demo', {});
  await api.save('demo', {});
  api.forgetVersion('demo');
  await api.save('demo', {});
  expect(sent).toEqual(['"v1"', '"v2"', null]);
});

test('a save and the live stream carry this page\u2019s id: the server tells the other tabs of the save, not this one', async () => {
  const sent: Array<string | null> = [];
  vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => { sent.push(new Headers(init?.headers).get('X-Tellcut-Client')); return json(200, { ok: true }); });
  const urls: string[] = [];
  vi.stubGlobal('EventSource', class { onmessage: any = null; constructor(u: string) { urls.push(u); } close() {} });
  await api.save('demo', {});
  api.events('de mo', () => {})();
  expect(api.clientId).toMatch(/^[\w-]{8,64}$/);
  expect(sent).toEqual([api.clientId]);
  expect(urls).toEqual([`/api/projects/de%20mo/events?client=${api.clientId}`]);
});
