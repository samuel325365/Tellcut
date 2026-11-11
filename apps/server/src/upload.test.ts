import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { makeProjects, startApp } from './test-utils.ts';

// the upload's file handle belongs to its write stream: after an abort the route must not close it again (the number may
// already be another open file's)
const closed: number[] = [];
vi.mock('node:fs', async (orig) => {
  const real = await orig<typeof import('node:fs')>();
  return { ...real, default: real, closeSync: (fd: number) => { closed.push(fd); return real.closeSync(fd); } };
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

test('an aborted upload leaves no file', async () => {
  mkdirSync(importDir(), { recursive: true });
  closed.length = 0;
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
});

test('not media → 400 import.notMedia; another origin → 403', async () => {
  const r = await put('notes.txt', 'x');
  expect(r.status).toBe(400);
  expect((await r.json()).code).toBe('import.notMedia');
  expect((await put('a.mp4', 'x', 1, { Origin: 'http://evil.example' })).status).toBe(403);
  expect((await fetch(`${base}/api/projects/nope/upload?name=a.mp4&mtime=1`, { method: 'PUT', body: 'x' })).status).toBe(404);
});
