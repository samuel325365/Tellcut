// The health check (spec 2026-10-22-external-sources §4.1): every source that is on and has its key is asked its cheapest question;
// --live also searches and downloads one asset. The result goes to the health file, which is how a broken source comes back.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordHealth, type HealthEntry } from './health.ts';
import { SourceError, type ZhEn } from './http.ts';
import { contextFor, sourceStatuses, type SourceStatus, type Sources } from './registry.ts';

/** result null: not checked (off, no key, no adapter) */
export async function checkSources(s: Sources, o: { live?: boolean; tmpDir?: string } = {}): Promise<Array<{ status: SourceStatus; result: HealthEntry | null }>> {
  const tmp = o.tmpDir ?? mkdtempSync(join(tmpdir(), 'sources-live-'));
  try {
    return await Promise.all(sourceStatuses(s).map(async (status) => {
      const a = status.adapter;
      if (!a || !status.enabled || status.key === 'missing') return { status, result: null };
      const ctx = contextFor(s, a.id, tmp);
      let e: Omit<HealthEntry, 'at'>;
      try {
        let said: ZhEn = await a.check(ctx);
        // a source that takes no part in searches (maps: tiles only) is fully checked by check(), which downloads
        if (o.live && a.kinds.length) {
          const [hit] = await a.search({ text: a.sample, opts: {}, limit: 1 }, ctx);
          if (!hit) throw new SourceError(a.id, 'temporary', { zh: `搜尋「${a.sample}」沒有結果`, en: `no results for "${a.sample}"` });
          const f = await a.get(hit.id, ctx);
          rmSync(f.file, { force: true });
          said = { zh: `${said.zh}；實測下載 ${hit.ref}`, en: `${said.en}; downloaded ${hit.ref} to try` };
        }
        e = { status: 'ok', detail: said.zh, en: said.en };
      } catch (err) {
        // every network failure comes as a SourceError (http.ts); anything else is the adapter failing on what it got back — an
        // answer of another shape — which waiting will not mend (review M-5: it was recorded as temporary)
        const name = (err as Error)?.name ?? 'Error', msg = (err as Error)?.message ?? err;
        e = err instanceof SourceError ? { status: err.kind === 'temporary' ? 'temporary' : 'broken', detail: err.message, ...(err.en ? { en: err.en } : {}) }
          : { status: 'broken', detail: `轉接程式出錯（${name}：${msg}）`, en: `the adapter failed (${name}: ${msg})` };
      }
      await recordHealth(s.healthFile, a.id, e);
      return { status, result: { ...e, at: new Date().toISOString() } };
    }));
  } finally { if (!o.tmpDir) rmSync(tmp, { recursive: true, force: true }); }
}

export type KeyTrial = { result: 'ok' | 'refused' | 'untried'; detail: string };

/** A key pasted in the API menu, tried with the source's own cheapest question before it is kept: `refused` when the source
 *  turns it down (or answers in a way the adapter cannot read — a key is the only thing that changed), `untried` when the source
 *  could not be reached (offline, rate-limited, a bot check), so the key may still be right. The health file records the result.
 *  The question is the adapter's own fixed check, known to work, so any 4xx answer but a timeout, a rate limit or a bot check's web
 *  page means the key: Pixabay changed the words of its bad-key 400 once, and a key kept on them would have been a wrong one. */
export async function tryKey(s: Sources, id: string, key: string, tmpDir?: string): Promise<KeyTrial> {
  const a = Object.hasOwn(s.adapters, id) ? s.adapters[id] : undefined;   // "constructor" is no source
  if (!a?.needsKey) throw new Error(`來源 ${id} 不需要 key`);
  // the pasted key itself, not one an environment variable would put first
  const envName = s.config.sources[id]?.keyEnv, { [envName ?? '']: _, ...env } = s.env;
  const trial: Sources = { ...s, env, config: { ...s.config, keys: { ...s.config.keys, [id]: key } } };
  const tmp = tmpDir ?? mkdtempSync(join(tmpdir(), 'source-key-'));
  let out: KeyTrial;
  try { out = { result: 'ok', detail: (await a.check(contextFor(trial, id, tmp))).zh }; }
  catch (err) {
    const said = err instanceof SourceError && err.status !== undefined && err.status >= 400 && err.status < 500 && ![408, 429].includes(err.status) && !/人機驗證/.test(err.message);
    out = err instanceof SourceError && err.kind !== 'broken' && !said ? { result: 'untried', detail: err.message }
      : { result: 'refused', detail: (err as Error)?.message ?? String(err) };
  } finally { if (!tmpDir) rmSync(tmp, { recursive: true, force: true }); }
  // a refused key is not kept, so the source stays "no key": nothing to record about it
  if (out.result !== 'refused') await recordHealth(s.healthFile, id, { status: out.result === 'ok' ? 'ok' : 'temporary', detail: out.detail }).catch(() => {});
  return out;
}
