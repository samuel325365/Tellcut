import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makePhoto, probeSize } from '@tellcut/media-node';
import { demoProject, makeProjects, startApp } from './test-utils.ts';

let root: string, base: string, app: Awaited<ReturnType<typeof startApp>>['app'];
beforeAll(async () => {
  root = makeProjects();
  mkdirSync(join(root, 'pics'), { recursive: true });
  await makePhoto(join(root, 'pics', 'a.jpg'), { w: 3000, h: 2250, orientation: 6 });
  writeFileSync(join(root, 'pics', 'project.json'), JSON.stringify(demoProject({ sources: { ph: { path: 'a.jpg', duration: 3600, width: 2250, height: 3000, kind: 'image' } }, tracks: [] })));
  ({ app, base } = await startApp({ projectsDir: root }));
}, 120000);
afterAll(() => app.close());

test('a photo is served upright and at most 1920 px; its analysis is one thumbnail with no cuts or sound', async () => {
  const r = await fetch(`${base}/api/projects/pics/media/image/ph`);
  expect([r.status, r.headers.get('content-type')]).toEqual([200, 'image/jpeg']);
  const f = join(root, 'pics', 'served.jpg');
  writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  expect(await probeSize(f)).toEqual({ width: 1440, height: 1920 });
  const job = (await (await fetch(`${base}/api/projects/pics/analyze`, { method: 'POST' })).json()).jobs[0];
  expect((await app.queue.wait(job.id)).status).toBe('done');
  expect(await (await fetch(`${base}/api/projects/pics/media/thumbs/ph`)).json()).toMatchObject({ cols: 1, count: 1, height: 90 });
  expect(await (await fetch(`${base}/api/projects/pics/media/cuts/ph`)).json()).toEqual([]);
  expect((await (await fetch(`${base}/api/projects/pics/media/peaks/ph`)).json()).peaks).toEqual([]);
}, 120000);
