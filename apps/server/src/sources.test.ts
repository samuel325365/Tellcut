import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSources, SourceError, type SourceAdapter } from '@tellcut/media-node';
import { makeProjects, startApp } from './test-utils.ts';

const adapter = (id: string, o: Partial<SourceAdapter> = {}): SourceAdapter => ({
  id, label: `${id} 名稱`, category: 'media', kinds: ['image'], needsKey: false, limits: [{ n: 100, per: 60 }], summary: id, sample: 'x', card: () => '',
  search: async () => [], get: async () => { throw new Error('no'); }, check: async () => 'ok', credit: () => '', ...o,
});

test('GET /api/sources lists every adapter in its group, greying out the ones that cannot be used with the reason', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'srcroute-'));
  const sources = () => openSources({ root: dir, env: { TELLCUT_SOURCES: '' }, fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch,
    config: { contact: '', keys: {}, sources: { a: { enabled: true, options: {} }, k: { enabled: true, keyEnv: 'K_KEY', options: {} }, off: { enabled: false, options: {} }, ghost: { enabled: true, options: {} } } },
    adapters: { a: adapter('a', { data: async () => '', unofficial: true }), k: adapter('k', { needsKey: true, category: 'sound', kinds: ['audio'] }), off: adapter('off') } });
  const { app, base } = await startApp({ projectsDir: makeProjects(), sources });
  try {
    expect((await (await fetch(`${base}/api/sources`)).json()).sources).toEqual([
      // the ticks of a conversation are not this list's business: TELLCUT_SOURCES is not read here (it is the sources' own env above)
      { id: 'a', label: 'a 名稱', category: 'media', kinds: ['image'], data: true, unofficial: true, available: false, reason: 'unpicked' },
      { id: 'k', label: 'k 名稱', category: 'sound', kinds: ['audio'], data: false, unofficial: false, available: false, reason: 'key', keyEnv: 'K_KEY' },
      { id: 'off', label: 'off 名稱', category: 'media', kinds: ['image'], data: false, unofficial: false, available: false, reason: 'off' },
    ]);
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the default list never reads a conversation\'s ticks from the server\'s environment', async () => {
  process.env.TELLCUT_SOURCES = '';
  const { app, base } = await startApp({ projectsDir: makeProjects() });
  try {
    const rows = (await (await fetch(`${base}/api/sources`)).json()).sources as Array<{ id: string; reason?: string }>;
    expect(rows.map((r) => r.id)).toContain('wikimedia');
    expect(rows.some((r) => r.reason === 'unpicked')).toBe(false);
  } finally { await app.close(); delete process.env.TELLCUT_SOURCES; }
});

test('POST /api/sources/:id/key tries a pasted key, keeps it in sources.local.json unless refused, and never sends it back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'srckey-'));
  let answer: 'ok' | 'refused' | 'offline' = 'refused';
  const k = adapter('k', { needsKey: true, keyUrl: 'https://k.example/keys', check: async (ctx) => {
    if (answer === 'refused') throw new SourceError('k', 'broken', 'key 被拒絕（HTTP 401）');
    if (answer === 'offline') throw new SourceError('k', 'temporary', '連不上');
    return `key ${ctx.key}`;
  } });
  let env: NodeJS.ProcessEnv = {};
  // read from the files on every request, as the server's own does
  const sources = () => openSources({ root: dir, env, adapters: { k, a: adapter('a') } });
  writeFileSync(join(dir, 'sources.json'), JSON.stringify({ sources: { k: { enabled: true, keyEnv: 'K_KEY' }, a: { enabled: true } } }));
  writeFileSync(join(dir, 'sources.local.json'), JSON.stringify({ contact: 'me@example.org' }));
  const { app, base } = await startApp({ projectsDir: makeProjects(), sources });
  const post = (id: string, body: unknown) => fetch(`${base}/api/sources/${id}/key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const row = async () => ((await (await fetch(`${base}/api/sources`)).json()).sources as any[]).find((r) => r.id === 'k');
  const local = () => JSON.parse(readFileSync(join(dir, 'sources.local.json'), 'utf8'));
  try {
    expect(await row()).toMatchObject({ available: false, reason: 'key', keyEnv: 'K_KEY', keyUrl: 'https://k.example/keys' });
    expect((await (await post('k', { key: 'two words' })).json()).code).toBe('source.keyBad');
    expect((await (await post('k', {})).json()).code).toBe('source.keyBad');
    expect((await (await post('nope', { key: 'x' })).json()).code).toBe('source.unknown');
    expect((await (await post('a', { key: 'x' })).json()).code).toBe('source.noKeyNeeded');
    const refused = await post('k', { key: ' bad-key ' });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ code: 'source.keyRefused', params: { detail: 'key 被拒絕（HTTP 401）' } });
    expect(local()).toEqual({ contact: 'me@example.org' });
    answer = 'ok';
    const ok = await post('k', { key: ' good-key\n' });
    expect(ok.status).toBe(200);
    const body = await ok.text();
    expect(JSON.parse(body)).toEqual({ ok: true, tried: true });
    expect(body).not.toContain('good-key');
    expect(local()).toEqual({ contact: 'me@example.org', keys: { k: 'good-key' } });
    const now = await row();
    expect(now.available).toBe(true);
    expect(now.keyUrl).toBeUndefined();
    answer = 'offline';
    expect(await (await post('k', { key: 'other' })).json()).toEqual({ ok: true, tried: false, detail: '連不上' });
    expect(local().keys.k).toBe('other');
    // a key in the environment wins over the file's: pasting one would change nothing
    env = { K_KEY: 'env' };
    const taken = await post('k', { key: 'third' });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ code: 'source.keyEnv', params: { env: 'K_KEY' } });
    expect(local().keys.k).toBe('other');
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});
