import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { connect } from 'node:net';
import { join } from 'node:path';
import { makeProjects, startApp } from './test-utils.ts';
import { fileTime } from './upload.ts';

// the upload's file handle belongs to its write stream: after an abort the route must not close it again (the number may
// already be another open file's)
const closed: number[] = [];
// a drive that refuses the time (set by a test)
let refuseTime = false;
vi.mock('node:fs', async (orig) => {
  const real = await orig<typeof import('node:fs')>();
  const utimesSync: typeof real.utimesSync = (...a) => { if (refuseTime) throw Object.assign(new Error('EPERM: operation not permitted, utime'), { code: 'EPERM' }); return real.utimesSync(...a); };
  return { ...real, default: { ...real, utimesSync }, utimesSync, closeSync: (fd: number) => { closed.push(fd); return real.closeSync(fd); } };
});

let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, projects: string;
beforeAll(async () => { projects = makeProjects(); ({ app, base } = await startApp({ projectsDir: projects })); });
afterAll(async () => { await app?.close(); });

const importDir = () => join(projects, 'demo', 'media', 'import');
const put = (name: string, body: string, mtime = 1_700_000_000_000, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/projects/demo/upload?name=${encodeURIComponent(name)}&mtime=${mtime}`, { method: 'PUT', body, headers });
const check = async (files: Array<{ name: string; size: number; mtime: number }>) =>
  (await (await fetch(`${base}/api/projects/demo/upload/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) })).json()).found;

test('upload writes into media/import, keeps the modified time, and check finds it again', async () => {
  const r = await put('trip.mp4', 'video bytes');
  expect(r.status).toBe(200);
  const { path } = await r.json();
  expect(path).toBe(join(importDir(), 'trip.mp4'));
  expect(readFileSync(path, 'utf8')).toBe('video bytes');
  expect(Math.round(statSync(path).mtimeMs / 1000)).toBe(1_700_000_000);
  // the same file again (another case, a second off): found; another size or time: not
  expect(await check([{ name: 'TRIP.mp4', size: 11, mtime: 1_700_000_001_000 }, { name: 'trip.mp4', size: 12, mtime: 1_700_000_000_000 },
    { name: 'trip.mp4', size: 11, mtime: 1_700_000_100_000 }])).toEqual([path, null, null]);
});

test('check finds a file the project already has by name, size and time', async () => {
  const f = join(projects, 'demo', 'src.mp4');
  writeFileSync(f, 'abcd');
  utimesSync(f, new Date(), new Date(1_600_000_000_000));
  expect(await check([{ name: 'src.mp4', size: 4, mtime: 1_600_000_000_500 }, { name: 'other.mp4', size: 4, mtime: 1_600_000_000_000 }])).toEqual([f, null]);
});

test('upload keeps odd names inside media/import', async () => {
  const r = await put('..\\a #1 %20 旅行.mp4', 'x');
  expect(r.status).toBe(200);
  expect((await r.json()).path).toBe(join(importDir(), 'a #1 %20 旅行.mp4'));
  const up = await put('../../../evil.mp4', 'x');
  expect((await up.json()).path).toBe(join(importDir(), 'evil.mp4'));
  expect(existsSync(join(projects, 'evil.mp4'))).toBe(false);
});

test('a second upload of the same name gets -2', async () => {
  const a = await (await put('same.wav', 'one')).json(), b = await (await put('same.wav', 'two')).json();
  expect([a.path, b.path]).toEqual([join(importDir(), 'same.wav'), join(importDir(), 'same-2.wav')]);
  // and check still knows the -2 copy by the name it was dropped as
  const st = statSync(b.path);
  expect(await check([{ name: 'same.wav', size: 3, mtime: st.mtimeMs }])).toEqual([a.path]);
});

test('an aborted upload leaves no file, and the log says which', async () => {
  mkdirSync(importDir(), { recursive: true });
  closed.length = 0;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const u = new URL(`${base}/api/projects/demo/upload?name=cut.mp4&mtime=1`);
  await new Promise<void>((done) => {
    const req = request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'PUT', headers: { 'Content-Length': '100000' } });
    req.on('error', () => done());
    req.write('x'.repeat(1000));
    setTimeout(() => { req.destroy(); done(); }, 200);
  });
  for (let i = 0; i < 50 && readdirSync(importDir()).some((f) => f.startsWith('cut')); i++) await new Promise((r) => setTimeout(r, 50));
  expect(readdirSync(importDir()).filter((f) => f.startsWith('cut'))).toEqual([]);
  expect(closed).toEqual([]);
  for (let i = 0; i < 50 && !warn.mock.calls.length; i++) await new Promise((r) => setTimeout(r, 20));
  expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/^upload of cut.mp4 into demo cut off mid-file/)]);
  warn.mockRestore();
});

test('a dropped file’s time is kept only when it can be one: not before 1970, not more than a day ahead', () => {
  const now = 1_800_000_000_000;
  expect([fileTime(1_700_000_000_123, now), fileTime(now + 3600_000, now), fileTime(now + 2 * 24 * 3600_000, now), fileTime(0, now), fileTime(-5, now),
    fileTime(8.64e15, now), fileTime(NaN, now)]).toEqual([1_700_000_000_123, now + 3600_000, null, null, null, null, null]);
});

test('an upload whose time is far ahead, or cannot be set, is still written (with the time of its writing)', async () => {
  const t0 = Date.now(), r = await put('ahead.mp4', 'abc', 8.64e15);
  expect(r.status).toBe(200);
  expect(Math.abs(statSync((await r.json()).path).mtimeMs - t0)).toBeLessThan(60_000);
  refuseTime = true;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const q = await put('refused.mp4', 'abc');
    expect(q.status).toBe(200);
    expect(readFileSync((await q.json()).path, 'utf8')).toBe('abc');
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/^upload of refused.mp4 into demo: its time not kept: EPERM/)]);
  } finally { refuseTime = false; warn.mockRestore(); }
});

test('a body sent slowly is not cut off (no limit on a whole request), while headers that never end still are', async () => {
  expect([app.server.requestTimeout, app.server.headersTimeout > 0]).toEqual([0, true]);   // Node's default request limit is 5 minutes
  // a server whose header limit is short: a body trickling well past it still arrives whole
  const slow = await startApp({ projectsDir: projects, slowHeaders: { timeout: 300, every: 50 } });
  try {
    const u = new URL(`${slow.base}/api/projects/demo/upload?name=slow.mp4&mtime=1700000000000`);
    const body = await new Promise<string>((done, fail) => {
      const req = request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'PUT', headers: { 'Content-Length': '10' } }, (res) => {
        let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => done(b));
      });
      req.on('error', fail);
      let sent = 0;
      const tick = setInterval(() => { req.write('x'); if (++sent === 10) { clearInterval(tick); req.end(); } }, 100);
    });
    expect(readFileSync(JSON.parse(body).path, 'utf8')).toBe('x'.repeat(10));
    // headers that never end: let go
    const closedAfter = await new Promise<number>((done) => {
      const t = Date.now(), s = connect(Number(u.port), u.hostname, () => s.write(`PUT ${u.pathname} HTTP/1.1
Host: ${u.host}
`));
      s.on('data', () => {}); s.on('close', () => done(Date.now() - t)); s.on('error', () => {});
      setTimeout(() => { s.destroy(); done(Infinity); }, 3000);
    });
    expect(closedAfter).toBeLessThan(3000);
  } finally { await slow.app.close(); }
});

test('an upload under way is listed in GET /api/jobs (server:restart waits for it), and gone once written', async () => {
  const u = new URL(`${base}/api/projects/demo/upload?name=busy.mp4&mtime=1700000000000`);
  const req = request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'PUT', headers: { 'Content-Length': '4' } });
  const answered = new Promise<number>((done, fail) => { req.on('response', (res) => { res.resume(); res.on('end', () => done(res.statusCode ?? 0)); }); req.on('error', fail); });
  req.write('ab');
  const jobs = async () => (await (await fetch(`${base}/api/jobs`)).json()) as Array<{ kind: string; project: string; label: string; status: string }>;
  let seen: Awaited<ReturnType<typeof jobs>> = [];
  for (let i = 0; i < 50 && !seen.length; i++) { seen = (await jobs()).filter((j) => j.kind === 'import'); if (!seen.length) await new Promise((r) => setTimeout(r, 20)); }
  expect(seen.map((j) => [j.kind, j.project, j.label, j.status])).toEqual([['import', 'demo', 'busy.mp4', 'running']]);
  req.end('cd');
  expect(await answered).toBe(200);
  expect((await jobs()).filter((j) => j.kind === 'import')).toEqual([]);
});

test('not media → 400 import.notMedia; another origin → 403', async () => {
  const r = await put('notes.txt', 'x');
  expect(r.status).toBe(400);
  expect((await r.json()).code).toBe('import.notMedia');
  expect((await put('a.mp4', 'x', 1, { Origin: 'http://evil.example' })).status).toBe(403);
  expect((await fetch(`${base}/api/projects/nope/upload?name=a.mp4&mtime=1`, { method: 'PUT', body: 'x' })).status).toBe(404);
});
