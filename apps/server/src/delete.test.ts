import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { demoProject, makeProjects, sse, startApp } from './test-utils.ts';
import { removeProject } from './delete.ts';
import type { HttpError } from './http.ts';

// One server for the file (opening and closing thousands of servers sets off Node 24's native fail-fast on Windows now and then,
// CLAUDE.md "Test temp folders"): each test deletes a project of its own (`id`, made fresh before it), and puts back what it
// changed in the server (a job, a hold).
let root: string, base: string, app: Awaited<ReturnType<typeof startApp>>['app'], id: string, n = 0;
beforeAll(async () => {
  root = makeProjects();
  const s = await startApp({ projectsDir: root });
  base = s.base; app = s.app;
});
afterAll(() => app.close());
beforeEach(() => { id = `demo${++n}`; makeProjects(root, id); });

const del = (id: string) => fetch(`${base}/api/projects/${id}`, { method: 'DELETE' });
const put = (rel: string, text = 'x') => { const f = join(root, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, text); return f; };

test('delete-preview counts finished videos in exports/ and output/ (nested), and fx files', async () => {
  put(`${id}/exports/a.mp4`); put(`${id}/exports/a.video.mp4`); put(`${id}/exports/a.log`);
  put(`${id}/output/b.mp4`); put(`${id}/output/demo-kit/c.mp4`); put(`${id}/output/frames/0001.png`); put(`${id}/fx/x.js`); put(`${id}/fx/y.mjs`); put(`${id}/fx/notes.md`);
  expect(await (await fetch(`${base}/api/projects/${id}/delete-preview`)).json()).toEqual({ videos: 3, fx: 2, busy: null });
});

test('deletes the whole project folder; the list no longer has it; a second delete is 404', async () => {
  put(`${id}/exports/a.mp4`); put(`${id}/.history/chat.json`, '{}');
  const before = await (await fetch(`${base}/api/projects`)).json();
  expect(before.map((p: { id: string }) => p.id)).toContain(id);
  const r = await del(id);
  expect([r.status, await r.json()]).toEqual([200, { ok: true }]);
  expect(existsSync(join(root, id))).toBe(false);
  expect(readdirSync(root).filter((x) => x.startsWith(`.deleting-${id}-`))).toEqual([]);
  expect(await (await fetch(`${base}/api/projects`)).json()).toEqual(before.filter((p: { id: string }) => p.id !== id));
  expect((await del(id)).status).toBe(404);
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
  const job = app.queue.add('analyze', id, '01.mp4', ({ signal }) => new Promise((ok) => signal.addEventListener('abort', ok)));
  onTestFinished(async () => { app.queue.cancel(job.id); await app.queue.wait(job.id); });
  const pre = await (await fetch(`${base}/api/projects/${id}/delete-preview`)).json();
  expect(pre.busy).toContain('01.mp4');
  expect(pre.busyCode).toEqual({ code: 'delete.busyJob', params: { label: '01.mp4' } });
  const r = await del(id);
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: '這個專案還有工作在進行（01.mp4），等它結束或取消後再刪', code: 'delete.busyJob', params: { label: '01.mp4' } });
  expect(existsSync(join(root, id, 'project.json'))).toBe(true);
});

test('refuses while a live analysis lock is held', async () => {
  // another live process (our parent) holds it, the way lockHolder reads it
  put(`${id}/cache/analysis/k/analysis.lock`, JSON.stringify({ pid: process.ppid, started: Date.now() }));
  const r = await del(id);
  expect(r.status).toBe(409);
  expect((await r.json()).error).toBe('這個專案正在分析素材，等分析完再刪');
  // a lock left by a process that is gone does not count
  put(`${id}/cache/analysis/k/analysis.lock`, JSON.stringify({ pid: 999999, started: Date.now() }));
  expect((await del(id)).status).toBe(200);
});

test('a hard-linked analysis file in another project survives', async () => {
  const mine = put(`${id}/cache/analysis/k/proxy.mp4`, 'shared bytes');
  const other = `${id}-other`;
  mkdirSync(join(root, other, 'cache', 'analysis', 'k'), { recursive: true });
  writeFileSync(join(root, other, 'project.json'), JSON.stringify(demoProject()));
  linkSync(mine, join(root, other, 'cache', 'analysis', 'k', 'proxy.mp4'));
  expect((await del(id)).status).toBe(200);
  expect(readFileSync(join(root, other, 'cache', 'analysis', 'k', 'proxy.mp4'), 'utf8')).toBe('shared bytes');
});

test('delete refuses and keeps everything when the folder cannot be renamed', () => {
  const busy = () => { throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); };
  let removed = false;
  try { removeProject(root, id, { renameSync: busy, rmSync: () => { removed = true; } }); throw new Error('no throw'); }
  catch (e) {
    expect((e as HttpError).status).toBe(409);
    expect((e as Error).message).toBe('有檔案正被別的程式使用（例如播放器開著這個專案的影片），關掉後再試');
  }
  expect(removed).toBe(false);
  expect(existsSync(join(root, id, 'project.json'))).toBe(true);
  // renamed but not removable (a file locked inside): no error, the .deleting- folder is left for the next start's cleanup
  removeProject(root, id, { renameSync, rmSync: () => { throw new Error('EPERM'); } });
  expect(existsSync(join(root, id))).toBe(false);
  expect(readdirSync(root).some((x) => x.startsWith(`.deleting-${id}-`))).toBe(true);
  for (const x of readdirSync(root)) if (x.startsWith('.deleting-')) rmSync(join(root, x), { recursive: true, force: true });
});

test('an editor open on the project (its live link watches the folder) does not block the delete; its link is closed', async () => {
  const events = sse(`${base}/api/projects/${id}/events`);
  await new Promise((r) => setTimeout(r, 300));   // the watchers are up
  expect((await del(id)).status).toBe(200);
  expect(existsSync(join(root, id))).toBe(false);
  expect((await events)[0]).toMatchObject({ type: 'hello' });   // the stream ended
});

test('an open editor tab saving after the delete gets 404 and nothing is recreated', async () => {
  expect((await del(id)).status).toBe(200);
  const r = await fetch(`${base}/api/projects/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(demoProject()) });
  expect(r.status).toBe(404);
  expect(existsSync(join(root, id))).toBe(false);
});

test('refuses while an import or a preset saved from the project holds it (no job of the queue): a HEIC conversion would recreate media/', async () => {
  const release = app.holds.hold(id, { text: '這個專案正在匯入檔案（IMG_0001.HEIC），等匯入完再刪', code: 'delete.busyImport', params: { file: 'IMG_0001.HEIC' } });
  const r = await del(id);
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: '這個專案正在匯入檔案（IMG_0001.HEIC），等匯入完再刪', code: 'delete.busyImport', params: { file: 'IMG_0001.HEIC' } });
  release(); release();   // twice: still one release
  expect((await del(id)).status).toBe(200);
});

test('a running import says so in the preview, with its first file and how many more', async () => {
  // the import's hold is kept past its end here, so the preview cannot miss it
  const orig = app.holds.hold.bind(app.holds), releases: Array<() => void> = [];
  app.holds.hold = (pid, why) => { releases.push(orig(pid, why)); return () => {}; };
  onTestFinished(() => { app.holds.hold = orig; for (const r of releases) r(); });
  put(`${id}-in/a.mp4`); put(`${id}-in/b.mp4`);
  const paths = [join(root, `${id}-in`, 'a.mp4'), join(root, `${id}-in`, 'b.mp4')];
  await (await fetch(`${base}/api/projects/${id}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) })).text();
  const pre = await (await fetch(`${base}/api/projects/${id}/delete-preview`)).json();
  expect(pre.busyCode).toEqual({ code: 'delete.busyImport', params: { file: 'a.mp4 +1' } });
  expect(pre.busy).toBe('這個專案正在匯入檔案（a.mp4 +1），等匯入完再刪');
  for (const r of releases) r();
  expect((await (await fetch(`${base}/api/projects/${id}/delete-preview`)).json()).busy).toBeNull();
});
