// The outside sources for the chat's API menu (spec 2026-10-24-api-picker §3): every one Tellcut has an adapter for, in its group,
// with whether it can be used here (switched on, its key there, not broken) and why not — the page greys those out. Which ones the
// agent may use in a turn is the list the page sends with that message (`sources`), not this.
import { openSources, saveSourceKey, sourceStatuses, tryKey, type Sources } from '@tellcut/media-node';
import type { SourceInfo } from '@tellcut/protocol';
import { HttpError, readJson, sendJson, type Router } from './http.ts';

/** a key as pasted: letters, digits and the punctuation keys use, no spaces or control characters */
const KEY_SHAPE = /^[\x21-\x7e]{1,256}$/;

/** sources: opened afresh on every request (the files and the health may change while the server runs); tests pass their own */
export function sourceRoutes(r: Router, sources: () => Sources = () => {
  // the server's own environment never carries a conversation's ticks
  const { TELLCUT_SOURCES: _, ...env } = process.env;
  return openSources({ env });
}) {
  r.get('/api/sources', (_req, res) => {
    const s = sources();
    const rows: SourceInfo[] = sourceStatuses(s).filter((x) => x.adapter).map(({ id, adapter: a, available, reason }) => ({
      id, label: a!.label, category: a!.category, kinds: a!.kinds, data: !!a!.data, unofficial: !!a!.unofficial, available,
      ...(reason ? { reason } : {}), ...(reason === 'key' && s.config.sources[id]?.keyEnv ? { keyEnv: s.config.sources[id].keyEnv } : {}),
      ...(reason === 'key' && a!.keyUrl ? { keyUrl: a!.keyUrl } : {}),
    }));
    sendJson(res, 200, { sources: rows });
  });

  // a key pasted in the API menu: tried first, kept in sources.local.json unless the source refused it; the answer never carries
  // the key back. Only this server's own pages can call it (app.ts checks Origin), like every other write.
  r.post('/api/sources/:id/key', async (req, res, { id }) => {
    const body = await readJson(req, 4096) as { key?: unknown } | undefined;
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!KEY_SHAPE.test(key)) throw new HttpError(400, '請只貼上 key 本身（不含空白）', { code: 'source.keyBad' });
    // own keys only: "constructor" or "__proto__" in the URL is an unknown source, not Object's
    const s = sources(), a = Object.hasOwn(s.adapters, id) ? s.adapters[id] : undefined;
    if (!a) throw new HttpError(404, `沒有「${id}」這個來源`, { code: 'source.unknown', params: { id } });
    if (!a.needsKey) throw new HttpError(400, `來源 ${id} 不需要 key`, { code: 'source.noKeyNeeded', params: { id } });
    // the environment's key wins over the file's (config.ts sourceKey): a pasted one would never be used
    const env = s.config.sources[id]?.keyEnv;
    if (env && s.env[env]) throw new HttpError(409, `環境變數 ${env} 已經設了 key，它會蓋過貼上的`, { code: 'source.keyEnv', params: { env } });
    const trial = await tryKey(s, id, key);
    if (trial.result === 'refused') throw new HttpError(422, `key 不對：${trial.detail}`, { code: 'source.keyRefused', params: { detail: trial.detail } });
    await saveSourceKey(s.localFile, id, key);
    sendJson(res, 200, { ok: true, tried: trial.result === 'ok', ...(trial.result === 'untried' ? { detail: trial.detail } : {}) });
  });
}
