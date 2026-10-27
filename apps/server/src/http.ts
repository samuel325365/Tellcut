// Minimal routing and JSON helpers on top of node:http (no framework dependency).
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Params = Record<string, string>;
export type Handler = (req: IncomingMessage, res: ServerResponse, params: Params, url: URL) => unknown;

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: Record<string, unknown>) { super(message); }
}

export function router() {
  const routes: Array<{ method: string; re: RegExp; keys: string[]; h: Handler }> = [];
  const add = (method: string, path: string, h: Handler) => {
    const keys: string[] = [];
    const src = path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }).replace(/\*$/, () => { keys.push('rest'); return '(.+)'; });
    routes.push({ method, re: new RegExp(`^${src}$`), keys, h });
  };
  return {
    get: (p: string, h: Handler) => add('GET', p, h),
    put: (p: string, h: Handler) => add('PUT', p, h),
    post: (p: string, h: Handler) => add('POST', p, h),
    del: (p: string, h: Handler) => add('DELETE', p, h),
    /** Runs the matching route; false when none matches. */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const url = new URL(req.url ?? '/', 'http://x');
      for (const r of routes) {
        const m = r.method === req.method ? r.re.exec(url.pathname) : null;
        if (!m) continue;
        let params: Params;
        try { params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])); }
        catch { throw new HttpError(400, 'Malformed URL escape'); }
        await r.h(req, res, params, url);
        return true;
      }
      return false;
    },
  };
}
export type Router = ReturnType<typeof router>;

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s), 'Cache-Control': 'no-store', ...headers });
  res.end(s);
}

/** Parses a JSON request body (≤ 20 MB); an empty body is `undefined`. */
export async function readJson(req: IncomingMessage, limit = 20 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > limit) throw new HttpError(413, 'Request body too large');
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return undefined;
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Request body is not valid JSON'); }
}
