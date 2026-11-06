import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tryKey } from './check.ts';
import { readHealth } from './health.ts';
import { SourceError } from './http.ts';
import { openSources } from './registry.ts';
import type { SourceAdapter } from './types.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'srckey-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const adapter = (check: SourceAdapter['check']): SourceAdapter => ({
  id: 'k', label: 'K', category: 'media', kinds: ['image'], needsKey: true, limits: [{ n: 100, per: 60 }], summary: 'k', sample: 'x', card: () => '',
  search: async () => [], get: async () => { throw new Error('no'); }, check, credit: () => '',
});
const open = (a: SourceAdapter, env: NodeJS.ProcessEnv = {}) => openSources({ root: dir, env, adapters: { k: a },
  config: { contact: '', keys: {}, sources: { k: { enabled: true, keyEnv: 'K_KEY', options: {} } } } });

test('tryKey asks the source with the pasted key — not the environment\'s — and records a good one as ok', async () => {
  let seen: string | undefined;
  const s = open(adapter(async (ctx) => { seen = ctx.key; return '共 3 筆'; }), { K_KEY: 'from-env' });
  expect(await tryKey(s, 'k', 'pasted')).toEqual({ result: 'ok', detail: '共 3 筆' });
  expect(seen).toBe('pasted');
  expect(readHealth(s.healthFile).k.status).toBe('ok');
});

test('a key the source turns down is refused and not recorded; a source that cannot be reached leaves it untried', async () => {
  const refused = open(adapter(async () => { throw new SourceError('k', 'broken', 'key 被拒絕（HTTP 401）'); }));
  expect(await tryKey(refused, 'k', 'bad')).toEqual({ result: 'refused', detail: 'key 被拒絕（HTTP 401）' });
  expect(readHealth(refused.healthFile).k).toBeUndefined();
  // an answer the adapter cannot read: the key is the only thing that changed
  const odd = open(adapter(async () => { throw new TypeError('x is undefined'); }));
  expect((await tryKey(odd, 'k', 'bad')).result).toBe('refused');
  // an answer of the source's own that is not its bad-key wording is still about the key: the question is fixed and known to work
  const said = open(adapter(async () => { throw new SourceError('k', 'temporary', '請求被拒絕（HTTP 400）', 400); }));
  expect((await tryKey(said, 'k', 'bad')).result).toBe('refused');
  for (const [status, msg] of [[429, '暫時不能用（HTTP 429）'], [503, '暫時不能用（HTTP 503）'], [403, '被擋下（可能是人機驗證，HTTP 403）']] as const) {
    const busy = open(adapter(async () => { throw new SourceError('k', 'temporary', msg, status); }));
    expect((await tryKey(busy, 'k', 'maybe')).result, msg).toBe('untried');
  }
  const offline = open(adapter(async () => { throw new SourceError('k', 'temporary', '連不上'); }));
  expect(await tryKey(offline, 'k', 'maybe')).toEqual({ result: 'untried', detail: '連不上' });
  expect(readHealth(offline.healthFile).k.status).toBe('temporary');
});
