// The health check (spec 2026-10-22-external-sources §4.1): every source that is on and has its key is asked its cheapest question;
// --live also searches and downloads one asset. The result goes to the health file, which is how a broken source comes back.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordHealth, type HealthEntry } from './health.ts';
import { SourceError } from './http.ts';
import { contextFor, sourceStatuses, type SourceStatus, type Sources } from './registry.ts';

/** result null: not checked (off, no key, no adapter) */
export async function checkSources(s: Sources, o: { live?: boolean; tmpDir?: string } = {}): Promise<Array<{ status: SourceStatus; result: HealthEntry | null }>> {
  const tmp = o.tmpDir ?? mkdtempSync(join(tmpdir(), 'sources-live-'));
  try {
    return await Promise.all(sourceStatuses(s).map(async (status) => {
      const a = status.adapter;
      if (!a || !status.enabled || status.key === 'missing') return { status, result: null };
      const ctx = contextFor(s, a.id, tmp);
      let e: { status: HealthEntry['status']; detail: string };
      try {
        let detail = await a.check(ctx);
        // a source that takes no part in searches (maps: tiles only) is fully checked by check(), which downloads
        if (o.live && a.kinds.length) {
          const [hit] = await a.search({ text: a.sample, opts: {}, limit: 1 }, ctx);
          if (!hit) throw new SourceError(a.id, 'temporary', `搜尋「${a.sample}」沒有結果`);
          const f = await a.get(hit.id, ctx);
          rmSync(f.file, { force: true });
          detail += `；實測下載 ${hit.ref}`;
        }
        e = { status: 'ok', detail };
      } catch (err) {
        // every network failure comes as a SourceError (http.ts); anything else is the adapter failing on what it got back — an
        // answer of another shape — which waiting will not mend (review M-5: it was recorded as temporary)
        e = err instanceof SourceError ? { status: err.kind === 'temporary' ? 'temporary' : 'broken', detail: err.message }
          : { status: 'broken', detail: `轉接程式出錯（${(err as Error)?.name ?? 'Error'}：${(err as Error)?.message ?? err}）` };
      }
      await recordHealth(s.healthFile, a.id, e);
      return { status, result: { ...e, at: new Date().toISOString() } };
    }));
  } finally { if (!o.tmpDir) rmSync(tmp, { recursive: true, force: true }); }
}
