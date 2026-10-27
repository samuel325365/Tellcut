import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync, type ReadStream } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  // module scripts are refused unless served as JavaScript (.mjs fx); fonts and images a plugin asks for by fileUrl()
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.log': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
export const contentType = (p: string) => TYPES[extname(p).toLowerCase()] ?? 'application/octet-stream';

/** Streams a file with Range support (the caller has already decided the path is allowed).
 *  Returns the read stream (undefined when nothing is streamed). */
export function sendFile(req: IncomingMessage, res: ServerResponse, p: string): ReadStream | undefined {
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  const size = statSync(p).size, type = contentType(p);
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  let head: [number, Record<string, string | number>], range: { start: number; end: number } | undefined;
  if (m) {
    // "a-b", "a-" and the suffix form "-n" (last n bytes); an end past the file is clamped to its last byte
    const s = m[1] ? +m[1] : Math.max(0, size - +m[2]), e = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (s >= size || s > e) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    head = [206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 }];
    range = { start: s, end: e };
  } else {
    head = [200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' }];
  }
  const stream = createReadStream(p, range);
  // headers only once the file is open, so an open failure (locked by another program, deleted) can still become a 500
  stream.once('open', () => { res.writeHead(...head); stream.pipe(res); });
  stream.on('error', (e: NodeJS.ErrnoException) => {
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Cannot read file (${e.code ?? e.message})`);
  });
  // a client that stops reading (video seeks cancel ranges constantly) must not leave the file open
  res.on('close', () => stream.destroy());
  return stream;
}

/** a Host header naming this machine's loopback (what a DNS-rebinding page cannot send) */
export const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

export function createStaticServer(rootDir: string) {
  const root = resolve(rootDir);
  const server = createServer((req, res) => {
    // only requests addressed to the loopback name: it serves all of tellcut/ (sources.local.json's keys too) for minutes during
    // an export, and a page that rebinds its own name to 127.0.0.1 could otherwise read it (the main server refuses the same)
    if (!LOOPBACK_HOST.test(req.headers.host ?? '')) { res.writeHead(403); res.end(); return; }
    let rel: string;
    try { rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
    const p = resolve(join(root, rel));
    if (!(p === root || p.startsWith(root + sep))) { res.writeHead(404); res.end(); return; }
    sendFile(req, res, p);
  });
  return {
    // loopback only: the project folders (incl. private source footage) must not be reachable from the LAN
    listen: (port = 0) => new Promise<number>((r) => server.listen(port, '127.0.0.1', () => r((server.address() as any).port))),
    address: () => (server.address() as any)?.address as string,
    // the page's keep-alive connections would hold close() open until they time out (a cancelled export waited on that)
    close: () => new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections(); }),
  };
}
