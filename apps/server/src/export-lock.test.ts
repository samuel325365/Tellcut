// One export of a project at a time across servers on the same projects/ (export.ts exportLock). No Chrome: every export here
// stops before rendering (a lock held elsewhere, or an offline source failing the prepare step).
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject } from '@tellcut/engine';
import { EXPORT_ELSEWHERE, exportLock, runExport } from './export.ts';
import { demoProject, makeProjects, startApp } from './test-utils.ts';

let root: string, demo: string, app: Awaited<ReturnType<typeof startApp>>['app'], base: string, other: ChildProcess;

beforeAll(async () => {
  root = makeProjects();
  demo = join(root, 'demo');
  const p = demoProject();
  p.sources.s1.path = 'missing.mp4';   // the prepare step fails at once: nothing reaches Chrome
  writeFileSync(join(demo, 'project.json'), JSON.stringify(p));
  ({ app, base } = await startApp({ projectsDir: root }));
  other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)']);   // "another server": a live process that is not this one
});
afterAll(async () => { other.kill(); await app.close(); });

const held = () => { mkdirSync(join(demo, 'cache'), { recursive: true }); writeFileSync(exportLock(demo), JSON.stringify({ pid: other.pid, started: Date.now() })); };
const exportsMade = () => (existsSync(join(demo, 'exports')) ? readdirSync(join(demo, 'exports')) : []);

test('a project another server is exporting: the export is refused as busy, and so is a delete', async () => {
  held();
  try {
    const r = await fetch(`${base}/api/projects/demo/export`, { method: 'POST' });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe(EXPORT_ELSEWHERE);
    expect(app.queue.active('export')).toEqual([]);
    const preview = await (await fetch(`${base}/api/projects/demo/delete-preview`)).json();
    expect(preview.busyCode).toEqual({ code: 'delete.busyJob', params: { label: 'export' } });
    expect((await fetch(`${base}/api/projects/demo`, { method: 'DELETE' })).status).toBe(409);
  } finally { writeFileSync(exportLock(demo), ''); }
  expect(existsSync(join(demo, 'project.json'))).toBe(true);
});

test('the lock taken after the POST\'s check (the other server won the race) fails the job before anything is written', async () => {
  held();
  const before = exportsMade();
  const ctx = { signal: new AbortController().signal, progress: () => {}, log: () => {} };
  await expect(runExport({ dir: demo, id: 'demo', project: parseProject(demoProject()), registry: app.registry, ctx })).rejects.toThrow(EXPORT_ELSEWHERE);
  expect(exportsMade()).toEqual(before);   // not even the export's .log
  expect(JSON.parse(readFileSync(exportLock(demo), 'utf8')).pid).toBe(other.pid);   // the other server's lock stays
});

test('an export holds the lock while it runs and lets it go when it ends (here: failed)', async () => {
  // the other server's lock has gone stale (its process ended): this one's export takes it over
  writeFileSync(exportLock(demo), JSON.stringify({ pid: 999999, started: 1 }));
  let during: number | undefined;
  // listening before the POST: the job may reach its prepare step before the response is read
  const on = (j: any) => { if (j.kind === 'export' && j.status === 'running' && j.message === 'prepare' && during === undefined) during = JSON.parse(readFileSync(exportLock(demo), 'utf8')).pid; };
  app.queue.on('change', on);
  const r = await fetch(`${base}/api/projects/demo/export`, { method: 'POST' });
  expect(r.status).toBe(202);
  const done = await app.queue.wait((await r.json()).id);
  app.queue.off('change', on);
  expect(done.status).toBe('failed');
  expect(done.error).toMatch(/missing\.mp4/);
  expect(during).toBe(process.pid);
  expect(existsSync(exportLock(demo))).toBe(false);
}, 60000);
