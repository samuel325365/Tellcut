import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSources, type SourceAdapter } from '@tellcut/media-node';
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
