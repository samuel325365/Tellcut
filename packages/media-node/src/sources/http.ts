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
/** one line in both languages: Chinese for the tools and the page, English for doctor (it prints English) */
export interface ZhEn { zh: string; en: string }

export class SourceError extends Error {
  override name = 'SourceError';
  /** the message in English, when it has one: the errors a health check can meet do (doctor says them) */
  readonly en?: string;
  /** status: the HTTP status the source answered with, when it answered */
  constructor(readonly source: string, readonly kind: 'broken' | 'temporary' | 'missing', message: string | ZhEn, readonly status?: number) {
    super(typeof message === 'string' ? message : message.zh);
    if (typeof message !== 'string') this.en = message.en;
  }
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

const keyRefused = (s: number): ZhEn => ({ zh: `key 被拒絕（HTTP ${s}）`, en: `the key was refused (HTTP ${s})` });
/** an answer the adapter cannot read (a source that changed): what it missed, in Chinese and in English, when it can say */
export const unreadable = (zh?: string, en?: string): ZhEn => (zh ? { zh: `回應格式看不懂（${zh}）`, en: `cannot read the answer (${en ?? zh})` } : { zh: '回應格式看不懂', en: 'cannot read the answer' });
const UNREADABLE = unreadable();
/** "1 result", "3 results": a check's count in English */
export const resultsEn = (n: number | string) => `${n} ${Number(n) === 1 ? 'result' : 'results'}`;
const looksHtml = (type: string, text: string) => /text\/html/i.test(type) || /^\s*</.test(text);

export function createHttp(o: HttpOptions): Http {
  const doFetch = o.fetch ?? globalThis.fetch, now = o.now ?? Date.now, fail = (kind: SourceError['kind'], msg: ZhEn, status?: number) => new SourceError(o.source, kind, msg, status);

  async function request(url: string, init: RequestInit, timeout: number): Promise<Response> {
    try { await takeSlot(join(o.cacheDir, 'rate', `${o.source}.json`), o.limits, { now }); }
    catch (e) {
      if (e instanceof RateWait) { const min = Math.ceil(e.seconds / 60); throw fail('temporary', { zh: `額度暫時用完，約 ${min} 分鐘後再試`, en: `out of requests for now: try again in about ${min} min` }); }
      throw e;
    }
    const headers = new Headers(init.headers);
    headers.set('User-Agent', userAgent(o.contact));
    try { return await doFetch(url, { ...init, headers, signal: AbortSignal.timeout(timeout) }); }
    catch (e) { throw cutOff(e as Error, timeout, { zh: '連不上', en: 'cannot connect' }); }
  }
  /** a fetch, or the reading of its answer, that failed on the way: the time ran out or the connection dropped (try later) */
  const cutOff = (err: Error, timeout: number, what: ZhEn) => {
    const secs = Math.round(timeout / 1000), why = err?.message ?? err;
    return fail('temporary', err?.name === 'TimeoutError' ? { zh: `逾時（${secs} 秒）`, en: `timed out (${secs} s)` } : { zh: `${what.zh}（${why}）`, en: `${what.en} (${why})` });
  };
  /** A status that is not 2xx, as the error it means (its body is read: a 403 web page is a bot check even when a key was sent).
   *  Other 4xx are about this request (a query the source refuses), never a reason to hide the source (review M-4). */
  async function statusError(r: Response, notFound: SourceError['kind']): Promise<SourceError> {
    const s = r.status, text = await r.text().catch(() => ''), f = (kind: SourceError['kind'], msg: ZhEn) => fail(kind, msg, s);
    if (s === 404 || s === 410) return f(notFound, { zh: `找不到（HTTP ${s}）`, en: `not found (HTTP ${s})` });
    if (s === 401 || s === 403) return o.hasKey && !looksHtml(r.headers.get('content-type') ?? '', text) ? f('broken', keyRefused(s)) : f('temporary', { zh: `被擋下（可能是人機驗證，HTTP ${s}）`, en: `blocked (perhaps a bot check, HTTP ${s})` });
    // a source that takes its key in the query answers a bad one with a 400 naming it (Pixabay, once: [ERROR 400] "key" is invalid;
    // since 2026: [ERROR 400] Invalid or missing API key); only those words: a bare "key" in another source's 400 (a JSON field,
    // "missing key field") is about the query
    if (s === 400 && o.hasKey && /"key"\s+is\b|\binvalid or missing api key\b/i.test(text)) return f('broken', keyRefused(s));
    if (s === 429 || s >= 500) return f('temporary', { zh: `暫時不能用（HTTP ${s}）`, en: `unavailable for now (HTTP ${s})` });
    return f('temporary', { zh: `請求被拒絕（HTTP ${s}）`, en: `request refused (HTTP ${s})` });
  }

  return {
    async json<T>(url: string, q: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string>; ttl?: number; notFound?: 'broken' | 'missing'; cacheIf?: (body: any) => boolean; acceptStatus?: number[] } = {}): Promise<T> {
      const method = q.method ?? 'GET', ttl = q.ttl ?? 0;
      const key = createHash('sha1').update(method + url + JSON.stringify(q.body ?? null)).digest('hex');
      const cached = join(o.cacheDir, 'http', o.source, `${key}.json`);
      if (ttl > 0 && existsSync(cached)) {
        try { const c = JSON.parse(readFileSync(cached, 'utf8')) as { at: number; body: T }; if (now() - c.at < ttl * 1000) return c.body; } catch { /* torn: fetch again */ }
      }
      const timeout = o.timeoutMs ?? 20_000;
      const r = await request(url, { method, headers: { Accept: 'application/json', ...(q.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...q.headers }, body: q.body !== undefined ? JSON.stringify(q.body) : undefined }, timeout);
      // acceptStatus: an answer the caller reads itself (OSRM says NoRoute with HTTP 400)
      if (!r.ok && !q.acceptStatus?.includes(r.status)) throw await statusError(r, q.notFound ?? 'broken');
      // the body streams after the headers: a connection dropped or the timeout reached while reading it is as temporary as one
      // before (it was a bare TypeError, which the health check recorded as a broken source)
      let text: string;
      try { text = await r.text(); } catch (e) { throw cutOff(e as Error, timeout, { zh: '回應讀到一半中斷', en: 'the answer broke off halfway' }); }
      if (looksHtml(r.headers.get('content-type') ?? '', text)) throw fail('temporary', { zh: '被人機驗證擋下或在維護（回的是網頁，不是資料）', en: 'stopped by a bot check, or down for maintenance (it sent a web page, not data)' });
      let body: T;
      try { body = JSON.parse(text); } catch { throw fail('broken', UNREADABLE); }
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
      if (/text\/html/i.test(type)) { await r.body?.cancel(); throw fail('temporary', { zh: '被人機驗證擋下或在維護（回的是網頁，不是檔案）', en: 'stopped by a bot check, or down for maintenance (it sent a web page, not a file)' }); }
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
        throw fail('temporary', (e as Error).name === 'TimeoutError' ? { zh: '下載中斷（逾時 10 分鐘）', en: 'the download broke off (timed out after 10 min)' }
          : { zh: `下載中斷（${(e as Error).message}）`, en: `the download broke off (${(e as Error).message})` });
      }
      closeSync(fd);
      if (over) { rmSync(part, { force: true }); throw new Error(`檔案超過上限 ${Math.round(d.maxBytes / 1e6)} MB：${url.split('?')[0]}`); }   // no query: a key may ride in it
      renameRetry(part, dest);
      return { bytes, type };
    },
  };
}
