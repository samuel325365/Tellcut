import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { demoProject, makeProjects, sse, startApp } from './test-utils.ts';
import { removeProject } from './delete.ts';
import type { HttpError } from './http.ts';

let root: string, base: string, app: Awaited<ReturnType<typeof startApp>>['app'];
beforeEach(async () => {
  root = makeProjects();
  const s = await startApp({ projectsDir: root });
  base = s.base; app = s.app;
});
afterEach(() => app.close());

const del = (id: string) => fetch(`${base}/api/projects/${id}`, { method: 'DELETE' });
const put = (rel: string, text = 'x') => { const f = join(root, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, text); return f; };

test('delete-preview counts finished videos in exports/ and output/ (nested), and fx files', async () => {
  put('demo/exports/a.mp4'); put('demo/exports/a.video.mp4'); put('demo/exports/a.log');
  put('demo/output/b.mp4'); put('demo/output/demo-kit/c.mp4'); put('demo/output/frames/0001.png'); put('demo/fx/x.js'); put('demo/fx/y.mjs'); put('demo/fx/notes.md');
  expect(await (await fetch(`${base}/api/projects/demo/delete-preview`)).json()).toEqual({ videos: 3, fx: 2, busy: null });
});

test('deletes the whole project folder; the list no longer has it; a second delete is 404', async () => {
  put('demo/exports/a.mp4'); put('demo/.history/chat.json', '{}');
  const r = await del('demo');
  expect([r.status, await r.json()]).toEqual([200, { ok: true }]);
  expect(existsSync(join(root, 'demo'))).toBe(false);
  expect(readdirSync(root).filter((n) => n.startsWith('.deleting-'))).toEqual([]);
  expect(await (await fetch(`${base}/api/projects`)).json()).toEqual([]);
  expect((await del('demo')).status).toBe(404);
});

test('refuses _-prefixed and invalid ids with 400', async () => {
  put('_home/project.json', JSON.stringify(demoProject()));
  const r = await del('_home');
  expect(r.status).toBe(400);
  expect((await r.json()).error).toBe('這個資料夾不能刪');
  expect(existsSync(join(root, '_home', 'project.json'))).toBe(true);
  expect((await del('a..b')).status).toBe(400);
});

test('refuses while a job of the project is running, and says which', async () => {
  app.queue.add('analyze', 'demo', '01.mp4', () => new Promise(() => {}));
  const pre = await (await fetch(`${base}/api/projects/demo/delete-preview`)).json();
  expect(pre.busy).toContain('01.mp4');
  expect(pre.busyCode).toEqual({ code: 'delete.busyJob', params: { label: '01.mp4' } });
  const r = await del('demo');
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: '這個專案還有工作在進行（01.mp4），等它結束或取消後再刪', code: 'delete.busyJob', params: { label: '01.mp4' } });
  expect(existsSync(join(root, 'demo', 'project.json'))).toBe(true);
});

test('refuses while a live analysis lock is held', async () => {
  // another live process (our parent) holds it, the way lockHolder reads it
  put('demo/cache/analysis/k/analysis.lock', JSON.stringify({ pid: process.ppid, started: Date.now() }));
  const r = await del('demo');
  expect(r.status).toBe(409);
  expect((await r.json()).error).toBe('這個專案正在分析素材，等分析完再刪');
  // a lock left by a process that is gone does not count
  put('demo/cache/analysis/k/analysis.lock', JSON.stringify({ pid: 999999, started: Date.now() }));
  expect((await del('demo')).status).toBe(200);
});

test('a hard-linked analysis file in another project survives', async () => {
  const mine = put('demo/cache/analysis/k/proxy.mp4', 'shared bytes');
  mkdirSync(join(root, 'other', 'cache', 'analysis', 'k'), { recursive: true });
  writeFileSync(join(root, 'other', 'project.json'), JSON.stringify(demoProject()));
  linkSync(mine, join(root, 'other', 'cache', 'analysis', 'k', 'proxy.mp4'));
  expect((await del('demo')).status).toBe(200);
  expect(readFileSync(join(root, 'other', 'cache', 'analysis', 'k', 'proxy.mp4'), 'utf8')).toBe('shared bytes');
});

test('delete refuses and keeps everything when the folder cannot be renamed', () => {
  const busy = () => { throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); };
  let removed = false;
  try { removeProject(root, 'demo', { renameSync: busy, rmSync: () => { removed = true; } }); throw new Error('no throw'); }
  catch (e) {
    expect((e as HttpError).status).toBe(409);
    expect((e as Error).message).toBe('有檔案正被別的程式使用（例如播放器開著這個專案的影片），關掉後再試');
  }
  expect(removed).toBe(false);
  expect(existsSync(join(root, 'demo', 'project.json'))).toBe(true);
  // renamed but not removable (a file locked inside): no error, the .deleting- folder is left for the next start's cleanup
  removeProject(root, 'demo', { renameSync, rmSync: () => { throw new Error('EPERM'); } });
  expect(existsSync(join(root, 'demo'))).toBe(false);
  expect(readdirSync(root).some((n) => n.startsWith('.deleting-demo-'))).toBe(true);
  for (const n of readdirSync(root)) if (n.startsWith('.deleting-')) rmSync(join(root, n), { recursive: true, force: true });
});

test('an editor open on the project (its live link watches the folder) does not block the delete; its link is closed', async () => {
  const events = sse(`${base}/api/projects/demo/events`);
  await new Promise((r) => setTimeout(r, 300));   // the watchers are up
  expect((await del('demo')).status).toBe(200);
  expect(existsSync(join(root, 'demo'))).toBe(false);
  expect((await events)[0]).toMatchObject({ type: 'hello' });   // the stream ended
});

test('an open editor tab saving after the delete gets 404 and nothing is recreated', async () => {
  expect((await del('demo')).status).toBe(200);
  const r = await fetch(`${base}/api/projects/demo`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(demoProject()) });
  expect(r.status).toBe(404);
  expect(existsSync(join(root, 'demo'))).toBe(false);
});

test('refuses while an import or a preset saved from the project holds it (no job of the queue): a HEIC conversion would recreate media/', async () => {
  const release = app.holds.hold('demo', 'IMG_0001.HEIC');
  const r = await del('demo');
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: '這個專案還有工作在進行（IMG_0001.HEIC），等它結束或取消後再刪', code: 'delete.busyJob', params: { label: 'IMG_0001.HEIC' } });
  release(); release();   // twice: still one release
  expect((await del('demo')).status).toBe(200);
});
