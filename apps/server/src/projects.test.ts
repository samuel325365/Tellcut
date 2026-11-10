import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { demoProject, makeProjects, startApp } from './test-utils.ts';

// One server for the file (opening and closing thousands of servers sets off Node 24's native fail-fast on Windows now and then,
// CLAUDE.md "Test temp folders"). The tests read the whole projects folder (the list), so it is laid out afresh before each one:
// the jobs a test started are finished first, and the store forgets what it read.
let root: string, base: string, dist: string, app: Awaited<ReturnType<typeof startApp>>['app'], store: typeof app.store;
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'srv-'));
  // the editor and player pages, outside the projects folder
  dist = mkdtempSync(join(tmpdir(), 'dist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html>');
  const s = await startApp({ projectsDir: root, editorDist: dist, playerDist: dist });
  base = s.base; app = s.app; store = s.app.store;
});
afterAll(async () => { await app.close(); rmSync(dist, { recursive: true, force: true }); });
beforeEach(() => {
  for (const x of readdirSync(root)) { store.forget(x); rmSync(join(root, x), { recursive: true, force: true }); }
  makeProjects(root);
  mkdirSync(join(root, '_hidden'), { recursive: true });
  writeFileSync(join(root, '_hidden', 'project.json'), JSON.stringify(demoProject()));
  mkdirSync(join(root, 'broken'), { recursive: true });
  writeFileSync(join(root, 'broken', 'project.json'), JSON.stringify({ version: 1 }));
  mkdirSync(join(root, 'empty'), { recursive: true });
  writeFileSync(join(root, 'secret.txt'), 'top secret');
});
afterEach(async () => { app.queue.cancelAll(); await Promise.all(app.queue.list().map((j) => app.queue.wait(j.id))); });

const put = (id: string, body: unknown) => fetch(`${base}/api/projects/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('lists projects with a project.json, hiding _-prefixed dirs and reporting broken ones', async () => {
  const list = await (await fetch(`${base}/api/projects`)).json();
  expect(list.map((p: any) => p.id)).toEqual(['broken', 'demo']);
  // the demo's footage (src.mp4) is not there: the home page marks it 缺素材 and asks for no thumbnail of it
  expect(list[1]).toEqual({ id: 'demo', name: 'Demo', width: 320, height: 180, duration: 1, poster: null, missing: 1 });
  expect(list[0].error).toMatch(/Invalid project/);
  writeFileSync(join(root, 'demo', 'src.mp4'), '');
  const again = (await (await fetch(`${base}/api/projects`)).json())[1];
  expect(again.poster).toEqual({ source: 's1', t: 1 });
  expect('missing' in again).toBe(false);
});

test('reads a project; a broken one answers 422 with its issues; unknown ids 404', async () => {
  expect((await (await fetch(`${base}/api/projects/demo`)).json()).meta.name).toBe('Demo');
  const r = await fetch(`${base}/api/projects/broken`);
  expect(r.status).toBe(422);
  expect((await r.json()).issues.some((i: string) => i.startsWith('meta'))).toBe(true);
  expect((await fetch(`${base}/api/projects/nope`)).status).toBe(404);
});

test('a project from a newer Tellcut answers with a code the page words itself (reading it, or saving one like it)', async () => {
  mkdirSync(join(root, 'newer'), { recursive: true });
  writeFileSync(join(root, 'newer/project.json'), JSON.stringify(demoProject({ version: 99 })));
  const r = await fetch(`${base}/api/projects/newer`);
  expect([r.status, await r.json()]).toEqual([422, expect.objectContaining({ code: 'project.tooNew', params: { version: 99, max: 1 }, issues: [expect.any(String)] })]);
  const w = await put('demo', demoProject({ version: 99 }));
  expect([w.status, (await w.json()).code]).toEqual([400, 'project.tooNew']);
  rmSync(join(root, 'newer'), { recursive: true, force: true });
});

test('a valid PUT replaces project.json and keeps the old version in .history', async () => {
  const before = readFileSync(join(root, 'demo/project.json'), 'utf8');
  const r = await put('demo', demoProject({ meta: { ...demoProject().meta, name: 'Renamed' } }));
  expect(r.status).toBe(200);
  expect(JSON.parse(readFileSync(join(root, 'demo/project.json'), 'utf8')).meta.name).toBe('Renamed');
  const hist = readdirSync(join(root, 'demo/.history'));
  expect(hist.length).toBe(1);
  expect(readFileSync(join(root, 'demo/.history', hist[0]), 'utf8')).toBe(before);
});

test('an invalid PUT answers 400 with field issues and changes nothing', async () => {
  const bad = demoProject();
  bad.tracks[0].items[0].end = -1;
  const r = await put('demo', bad);
  expect(r.status).toBe(400);
  expect((await r.json()).issues).toContain('tracks.0.items.0.end: end must be greater than start');
  expect(JSON.parse(readFileSync(join(root, 'demo/project.json'), 'utf8')).tracks[0].items[0].end).toBe(1);
  expect((await fetch(`${base}/api/projects/demo/history`).then((x) => x.json())).length).toBe(0);
  expect((await fetch(`${base}/api/projects/demo`, { method: 'PUT', body: '{not json' })).status).toBe(400);
});

test('history keeps the newest 20 versions, newest first, each readable', async () => {
  for (let i = 0; i < 25; i++) await put('demo', demoProject({ meta: { ...demoProject().meta, name: `v${i}` } }));
  const hist: string[] = await (await fetch(`${base}/api/projects/demo/history`)).json();
  expect(hist.length).toBe(20);
  expect([...hist].sort().reverse()).toEqual(hist);
  expect((await (await fetch(`${base}/api/projects/demo/history/${hist[0]}`)).json()).meta.name).toBe('v23');
});

test('path escapes never leave the project directory', async () => {
  for (const u of ['/api/projects/..%2fsecret.txt', '/api/projects/demo/files/..%2fsecret.txt', '/api/projects/demo/files/..%5c..%5csecret.txt',
    '/api/projects/demo/history/..%2f..%2fsecret.txt', `/api/projects/demo/files/${encodeURIComponent(join(root, 'secret.txt'))}`]) {
    const r = await fetch(base + u);
    expect([400, 404]).toContain(r.status);
    expect(await r.text()).not.toContain('top secret');
  }
  expect((await fetch(`${base}/api/projects/demo/files/project.json`)).status).toBe(200);
});

test('the server listens on loopback only', async () => {
  expect(base.startsWith('http://127.0.0.1:')).toBe(true);
});

test('a port already in use: listen rejects, and npm run server says so in a line; a mistyped flag is refused', async () => {
  const { createApp } = await import('./app.ts');
  const second = createApp({ projectsDir: root, extras: false });
  try { await expect(second.listen(Number(new URL(base).port))).rejects.toMatchObject({ code: 'EADDRINUSE' }); } finally { await second.close(); }
  const { spawnSync } = await import('node:child_process');
  const { TELLCUT_ROOT } = await import('@tellcut/media-node');
  const server = (...args: string[]) => spawnSync(process.execPath, [join(TELLCUT_ROOT, 'node_modules/tsx/dist/cli.mjs'), 'apps/server/src/main.ts', ...args], { cwd: TELLCUT_ROOT, encoding: 'utf8', timeout: 60000 });
  const busy = server('--port', new URL(base).port);
  expect(busy.status).toBe(1);
  expect(busy.stderr).toContain(`Port ${new URL(base).port} is already in use`);
  const typo = server('--prot', '5200');
  expect(typo.status).toBe(2);
  expect(typo.stderr).toContain('There is no option --prot');
}, 120000);

const raw = (path: string, headers: Record<string, string>, method = 'GET') => new Promise<number>((ok, no) => {
  const r = request({ host: '127.0.0.1', port: Number(new URL(base).port), path, method, headers }, (res) => { res.resume(); ok(res.statusCode!); });
  r.on('error', no);
  r.end();
});

test('requests for other host names or from other sites are refused (DNS rebinding, cross-site POST)', async () => {
  expect(await raw('/api/projects', { Host: `evil.example:${new URL(base).port}` })).toBe(403);
  expect(await raw('/api/projects', { Host: `localhost:${new URL(base).port}` })).toBe(200);
  expect(await raw('/api/projects/demo/analyze', { Origin: 'https://evil.example' }, 'POST')).toBe(403);
  // a page on another local port (any dev server on this computer) is refused too; the editor's dev server proxies with its own Host
  expect(await raw('/api/projects/demo/analyze', { Origin: 'http://127.0.0.1:9' }, 'POST')).toBe(403);
  expect(await raw('/api/projects/demo/analyze', { Origin: 'http://localhost:5173', Host: 'localhost:5173' }, 'POST')).toBe(202);
  expect(await raw('/api/projects/demo/analyze', { Origin: base }, 'POST')).toBe(202);
});

test('the editor and the player pages run scripts only from this server and cannot be framed by another site', async () => {
  for (const page of ['/editor/', '/player/']) {
    const r = await fetch(`${base}${page}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-security-policy')).toMatch(/script-src 'self'.*frame-ancestors 'self'/);
    expect(r.headers.get('content-security-policy')).not.toContain('unsafe-inline');   // no inline script runs, even one slipped in
  }
});

test('a PUT made from an older version (If-Match) answers 409 and changes nothing; a PUT without one still writes', async () => {
  const a = await fetch(`${base}/api/projects/demo`), tag = a.headers.get('etag')!;
  expect(tag).toMatch(/^"[0-9a-f]{40}"$/);
  const named = (name: string) => demoProject({ meta: { ...demoProject().meta, name } });
  const first = await fetch(`${base}/api/projects/demo`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': tag }, body: JSON.stringify(named('Tab A')) });
  expect(first.status).toBe(200);
  const next = first.headers.get('etag')!;
  expect(next).not.toBe(tag);
  // tab B still has the version tab A started from
  const stale = await fetch(`${base}/api/projects/demo`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': tag }, body: JSON.stringify(named('Tab B')) });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ code: 'project.conflict', conflict: true });
  expect(JSON.parse(readFileSync(join(root, 'demo/project.json'), 'utf8')).meta.name).toBe('Tab A');
  expect((await fetch(`${base}/api/projects/demo`)).headers.get('etag')).toBe(next);
  expect((await put('demo', named('Forced'))).status).toBe(200);
});

test('a page on another site cannot reach the API through the browser (it could start ffmpeg work with a GET); the tools and the editor can', async () => {
  const get = (site?: string) => fetch(`${base}/api/projects`, site ? { headers: { 'Sec-Fetch-Site': site } } : {});
  expect((await get('cross-site')).status).toBe(403);
  expect((await get('same-site')).status).toBe(403);                              // another port on this computer
  expect((await get('same-origin')).status).toBe(200);
  expect((await get()).status).toBe(200);                                         // node, curl, the CLI send none
  // the request target written in absolute form (as to a proxy) reaches the same route: it is checked by its path
  expect(await raw(`${base}/api/projects`, { 'Sec-Fetch-Site': 'cross-site' })).toBe(403);
});

test('project files, history versions and music are sandboxed and never sniffed: an SVG or HTML in the folder runs no script here', async () => {
  mkdirSync(join(root, 'demo', 'media'), { recursive: true });
  writeFileSync(join(root, 'demo', 'media', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/projects/demo",{method:"DELETE"})</script></svg>');
  writeFileSync(join(root, 'demo', 'page.html'), '<script>alert(1)</script>');
  writeFileSync(join(root, 'demo', 'media', 'song.mp3'), 'ID3');
  const p = JSON.parse(readFileSync(join(root, 'demo', 'project.json'), 'utf8'));
  await put('demo', { ...p, media: { m1: { path: 'media/song.mp3', duration: 1 } } });
  const hist: string[] = await (await fetch(`${base}/api/projects/demo/history`)).json();
  for (const u of ['files/media/logo.svg', 'files/page.html', 'files/project.json', `history/${hist[0]}`]) {
    const r = await fetch(`${base}/api/projects/demo/${u}`);
    expect([u, r.status, r.headers.get('content-security-policy'), r.headers.get('x-content-type-options')]).toEqual([u, 200, "sandbox; default-src 'none'", 'nosniff']);
  }
  // a video or a song opened in its own tab plays there (the browser's player page loads it again: a sandbox would block it)
  const m = await fetch(`${base}/api/projects/demo/media/music/m1`);
  expect([m.status, m.headers.get('content-security-policy'), m.headers.get('x-content-type-options')]).toEqual([200, null, 'nosniff']);
});

test('a module asked for with a version comes with it on each relative import, so a page loading fx again gets edited helpers too', async () => {
  mkdirSync(join(root, 'demo', 'fx', 'lib', 'chalk'), { recursive: true });
  const src = "import { a } from './util.js';\nexport { b } from \"../b.js\";\nimport './side.js';\nimport { c } from './lib/chalk/c.js?lib=abc';\nconst d = () => import('./d.js');\nimport x from 'https://x.example/y.js';\nexport default [];\n";
  writeFileSync(join(root, 'demo', 'fx', 'a.js'), src);
  const get = async (q: string) => { const r = await fetch(`${base}/api/projects/demo/files/fx/a.js${q}`); return [r.status, r.headers.get('content-type'), r.headers.get('x-content-type-options'), await r.text()]; };
  expect(await get('?v=1730000000000')).toEqual([200, 'text/javascript', 'nosniff',
    "import { a } from './util.js?v=1730000000000';\nexport { b } from \"../b.js?v=1730000000000\";\nimport './side.js?v=1730000000000';\nimport { c } from './lib/chalk/c.js?lib=abc&v=1730000000000';\nconst d = () => import('./d.js?v=1730000000000');\nimport x from 'https://x.example/y.js';\nexport default [];\n"]);
  // no version (a fresh page: the player in an export), or one that is not a plain stamp: the file as it is
  for (const q of ['', '?v=', '?v=%27%3B%20alert(1)']) expect((await get(q))[3]).toBe(src);
  expect((await fetch(`${base}/api/projects/demo/files/fx/none.js?v=1`)).status).toBe(404);
});

test('an id whose case is not the folder\'s is no project (NTFS finds demo for DEMO: two ids, two chats and locks for one folder)', async () => {
  expect((await fetch(`${base}/api/projects/demo`)).status).toBe(200);
  expect((await fetch(`${base}/api/projects/Demo`)).status).toBe(404);
  const put = await fetch(`${base}/api/projects/DEMO`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(demoProject()) });
  expect(put.status).toBe(404);
  expect((await fetch(`${base}/api/chat/Demo`)).status).toBe(404);
  expect((await fetch(`${base}/api/projects/Demo`, { method: 'DELETE' })).status).toBe(404);
});

test('GET sends the version its ETag names: a save landing while it reads cannot pair the new body with the old tag (a false 409 next)', async () => {
  const { projectHash } = await import('@tellcut/media-node');
  const file = join(root, 'demo', 'project.json'), old = readFileSync(file, 'utf8'), was = store.version.bind(store);
  // another writer (Claude's CLI, a second server) saves right after the version is read
  store.version = (id: string) => { const v = was(id); writeFileSync(file, JSON.stringify(demoProject({ meta: { ...demoProject().meta, name: 'Meanwhile' } }))); return v; };
  onTestFinished(() => { delete (store as { version?: unknown }).version; });   // the class's own again
  const r = await fetch(`${base}/api/projects/demo`), body = await r.json(), tag = r.headers.get('etag')!.replace(/"/g, '');
  expect(tag).toBe(projectHash(body.meta.name === 'Meanwhile' ? readFileSync(file, 'utf8') : old));
});
