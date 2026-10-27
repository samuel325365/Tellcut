// The one way a source adapter goes online (spec 2026-10-22-external-sources §4.3): every request says who it is, takes a slot under
// the source's shared rate limit, and comes back either as data or as a SourceError that says whether the source is broken (hide it)
// or only unavailable for now (say so, keep it). A web page where data was expected — a bot check, a maintenance page — is the
// latter, never "no results". JSON answers may be cached under .cache/sources/http/<source>/; media files are not.
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renameRetry } from '../fsutil.ts';
import { RateWait, takeSlot, type RateLimit } from './rate.ts';

const VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
export const TELLCUT_REPO = 'https://github.com/samuel325365/tellcut';

/** `Tellcut/<version> (<contact>)`: Wikimedia, Nominatim and OSM refuse or throttle requests that do not say who sends them */
export const userAgent = (contact?: string) => `Tellcut/${VERSION} (${contact || TELLCUT_REPO})`;

/** NASA's http links as https; utm_* tracking parameters dropped */
export function cleanUrl(url: string): string {
  const u = new URL(url);
  if (u.protocol === 'http:' && /(^|\.)nasa\.gov$/.test(u.hostname)) u.protocol = 'https:';
  for (const k of [...u.searchParams.keys()]) if (k.startsWith('utm_')) u.searchParams.delete(k);
  return u.toString();
}

/** broken: the source is gone or changed (hidden until a check passes); temporary: try later; missing: that one item is not there */
export class SourceError extends Error {
  override name = 'SourceError';
  constructor(readonly source: string, readonly kind: 'broken' | 'temporary' | 'missing', message: string) { super(message); }
}

export interface Http {
  json<T = unknown>(url: string, o?: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string>; ttl?: number; notFound?: 'broken' | 'missing'; cacheIf?: (body: any) => boolean; acceptStatus?: number[] }): Promise<T>;
  head(url: string): Promise<{ type: string; length?: number }>;
  download(url: string, dest: string, o: { maxBytes: number; headers?: Record<string, string> }): Promise<{ bytes: number; type: string }>;
}

export interface HttpOptions {
  source: string; contact?: string; cacheDir: string; limits: RateLimit[];
  /** a key was sent: 401/403 then means the key is refused (broken), not a bot check (temporary) */
  hasKey?: boolean;
  fetch?: typeof fetch; now?: () => number;
  /** for JSON and HEAD; downloads get 10 minutes */
  timeoutMs?: number;
}

const looksHtml = (type: string, text: string) => /text\/html/i.test(type) || /^\s*</.test(text);

export function createHttp(o: HttpOptions): Http {
  const doFetch = o.fetch ?? globalThis.fetch, now = o.now ?? Date.now, fail = (kind: SourceError['kind'], msg: string) => new SourceError(o.source, kind, msg);

  async function request(url: string, init: RequestInit, timeout: number): Promise<Response> {
    try { await takeSlot(join(o.cacheDir, 'rate', `${o.source}.json`), o.limits, { now }); }
    catch (e) { if (e instanceof RateWait) throw fail('temporary', `額度暫時用完，約 ${Math.ceil(e.seconds / 60)} 分鐘後再試`); throw e; }
    const headers = new Headers(init.headers);
    headers.set('User-Agent', userAgent(o.contact));
    try { return await doFetch(url, { ...init, headers, signal: AbortSignal.timeout(timeout) }); }
    catch (e) {
      const err = e as Error;
      throw fail('temporary', err.name === 'TimeoutError' ? `逾時（${Math.round(timeout / 1000)} 秒）` : `連不上（${err.message}）`);
    }
  }
  /** A status that is not 2xx, as the error it means (its body is read: a 403 web page is a bot check even when a key was sent).
   *  Other 4xx are about this request (a query the source refuses), never a reason to hide the source (review M-4). */
  async function statusError(r: Response, notFound: SourceError['kind']): Promise<SourceError> {
    const s = r.status, text = await r.text().catch(() => '');
    if (s === 404 || s === 410) return fail(notFound, `找不到（HTTP ${s}）`);
    if (s === 401 || s === 403) return o.hasKey && !looksHtml(r.headers.get('content-type') ?? '', text) ? fail('broken', `key 被拒絕（HTTP ${s}）`) : fail('temporary', `被擋下（可能是人機驗證，HTTP ${s}）`);
    // a source that takes its key in the query answers a bad one with a 400 naming it (Pixabay: [ERROR 400] "key" is invalid);
    // only that quoted parameter name: a bare "key" in another source's 400 (a JSON field, "missing key field") is about the query
    if (s === 400 && o.hasKey && /"key"\s+is\b/i.test(text)) return fail('broken', `key 被拒絕（HTTP ${s}）`);
    if (s === 429 || s >= 500) return fail('temporary', `暫時不能用（HTTP ${s}）`);
    return fail('temporary', `請求被拒絕（HTTP ${s}）`);
  }

  return {
    async json<T>(url: string, q: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string>; ttl?: number; notFound?: 'broken' | 'missing'; cacheIf?: (body: any) => boolean; acceptStatus?: number[] } = {}): Promise<T> {
      const method = q.method ?? 'GET', ttl = q.ttl ?? 0;
      const key = createHash('sha1').update(method + url + JSON.stringify(q.body ?? null)).digest('hex');
      const cached = join(o.cacheDir, 'http', o.source, `${key}.json`);
      if (ttl > 0 && existsSync(cached)) {
        try { const c = JSON.parse(readFileSync(cached, 'utf8')) as { at: number; body: T }; if (now() - c.at < ttl * 1000) return c.body; } catch { /* torn: fetch again */ }
      }
      const r = await request(url, { method, headers: { Accept: 'application/json', ...(q.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...q.headers }, body: q.body !== undefined ? JSON.stringify(q.body) : undefined }, o.timeoutMs ?? 20_000);
      // acceptStatus: an answer the caller reads itself (OSRM says NoRoute with HTTP 400)
      if (!r.ok && !q.acceptStatus?.includes(r.status)) throw await statusError(r, q.notFound ?? 'broken');
      const text = await r.text();
      if (looksHtml(r.headers.get('content-type') ?? '', text)) throw fail('temporary', '被人機驗證擋下或在維護（回的是網頁，不是資料）');
      let body: T;
      try { body = JSON.parse(text); } catch { throw fail('broken', '回應格式看不懂'); }
      // cacheIf: an answer that is an error in disguise (MediaWiki says "busy" with HTTP 200) is not kept for the ttl
      if (ttl > 0 && (q.cacheIf?.(body) ?? true)) {
        mkdirSync(dirname(cached), { recursive: true });
        const tmp = `${cached}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify({ at: now(), body }));
        renameRetry(tmp, cached);
      }
      return body;
    },

    async head(url) {
      const r = await request(url, { method: 'HEAD' }, o.timeoutMs ?? 20_000);
      if (!r.ok) throw await statusError(r, 'missing');
      const len = r.headers.get('content-length');
      return { type: r.headers.get('content-type') ?? '', ...(len ? { length: Number(len) } : {}) };
    },

    async download(url, dest, d) {
      const r = await request(url, { headers: d.headers }, 600_000);
      if (!r.ok) throw await statusError(r, 'missing');
      const type = r.headers.get('content-type') ?? '';
      if (/text\/html/i.test(type)) { await r.body?.cancel(); throw fail('temporary', '被人機驗證擋下或在維護（回的是網頁，不是檔案）'); }
      mkdirSync(dirname(dest), { recursive: true });
      // its own name: parallel agents share the tile and thumbnail caches and may fetch the same file at once
      const part = `${dest}.${process.pid}-${randomBytes(4).toString('hex')}.part`, fd = openSync(part, 'w');
      let bytes = 0, over = false;
      try {
        const reader = r.body!.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > d.maxBytes) { over = true; await reader.cancel(); break; }
          writeSync(fd, value);
        }
      } catch (e) {
        // the connection dropped or the time ran out halfway: nothing half-written stays behind
        closeSync(fd); rmSync(part, { force: true });
        throw fail('temporary', (e as Error).name === 'TimeoutError' ? '下載中斷（逾時 10 分鐘）' : `下載中斷（${(e as Error).message}）`);
      }
      closeSync(fd);
      if (over) { rmSync(part, { force: true }); throw new Error(`檔案超過上限 ${Math.round(d.maxBytes / 1e6)} MB：${url.split('?')[0]}`); }   // no query: a key may ride in it
      renameRetry(part, dest);
      return { bytes, type };
    },
  };
}
