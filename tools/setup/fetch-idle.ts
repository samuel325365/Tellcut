// Downloads that give up when the connection stalls (setup's programs and models, fonts, the brand font, the examples): without a
// limit a connection that stopped sending hung `npm run setup` until the system's TCP timeout, if ever. The limit is on silence,
// not on the whole download: a big file arriving slowly is never cut short.

/** No byte arrived for `seconds`. */
export class Stalled extends Error {
  readonly seconds: number;
  // English: setup and examples print it, and they print English (fonts and brand-assets print English too)
  constructor(seconds: number) { super(`the connection stalled: nothing arrived for ${seconds} s`); this.name = 'Stalled'; this.seconds = seconds; }
}

/** how long a download may stay silent */
export const IDLE_MS = 60_000;

/** An abort signal that fires after `ms` of silence; touch() when data arrives, stop() when done. */
export function idleTimer(ms = IDLE_MS) {
  const ac = new AbortController();
  let t: ReturnType<typeof setTimeout> | undefined;
  const touch = () => { clearTimeout(t); t = setTimeout(() => ac.abort(new Stalled(Math.round(ms / 1000))), ms); };
  // rejects once it fires: a read raced against it ends even when the fetch does not honour its signal
  const fired = new Promise<never>((_, rej) => ac.signal.addEventListener('abort', () => rej(ac.signal.reason), { once: true }));
  fired.catch(() => {});
  touch();
  return { signal: ac.signal, touch, fired, stop: () => clearTimeout(t) };
}

const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/** `get(url)` whose answer and body must keep arriving (no `idleMs` of silence, else Stalled). The body comes back read whole, as a
 *  Response over the bytes: for files that fit in memory (a program's zip, a font). */
export async function fetchIdle(get: typeof fetch, url: string, init: RequestInit = {}, idleMs = IDLE_MS): Promise<Response> {
  const idle = idleTimer(idleMs);
  try {
    const r = await Promise.race([get(url, { ...init, signal: idle.signal }), idle.fired]);
    if (!r.body) return r;
    const reader = r.body.getReader(), chunks: Uint8Array[] = [];
    for (;;) {
      idle.touch();
      const { done, value } = await Promise.race([reader.read(), idle.fired]);
      if (done) break;
      chunks.push(value);
    }
    return new Response(NULL_BODY.has(r.status) ? null : Buffer.concat(chunks), { status: r.status, statusText: r.statusText, headers: r.headers });
  } catch (e) {
    throw idle.signal.aborted ? idle.signal.reason : e;
  } finally { idle.stop(); }
}
