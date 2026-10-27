import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TELLCUT_ROOT, ffmpeg, makePhoneVideo, makePhoto, probeDuration, probeHasAudio } from '@tellcut/media-node';
import { demoProject, makeProjects, makeSource, sse, startApp } from './test-utils.ts';

// exports drive the built player through openPage, which serves the repo root: the projects must live inside it
const root = join(TELLCUT_ROOT, 'projects/_srv_test');
const demo = join(root, 'demo');
let base: string, app: Awaited<ReturnType<typeof startApp>>['app'];

beforeAll(async () => {
  rmSync(root, { recursive: true, force: true });
  makeProjects(root);
  await makeSource(join(demo, 'src.mp4'));
  ({ app, base } = await startApp({ projectsDir: root }));
}, 120000);
afterAll(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });

const post = (body?: unknown) => fetch(`${base}/api/projects/demo/export`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const mp4s = () => (existsSync(join(demo, 'exports')) ? readdirSync(join(demo, 'exports')).filter((f) => f.endsWith('.mp4')) : []);
const leftovers = () => [...readdirSync(demo).filter((f) => f.startsWith('.export-')), ...readdirSync(join(demo, 'cache')).filter((f) => f.startsWith('index-'))];

test('exports a snapshot to exports/<name>-<stamp>.mp4 with a log; later edits do not leak in', async () => {
  const r = await post();
  expect(r.status).toBe(202);
  const job = await r.json();
  expect((await post()).status).toBe(409);   // one export at a time
  await fetch(`${base}/api/projects/demo`, { method: 'PUT', body: JSON.stringify(demoProject({ meta: { ...demoProject().meta, duration: 2 } })) });
  const events = await sse(`${base}/api/jobs/${job.id}/events`);
  const last = events.at(-1);
  expect(last.status).toBe('done');
  expect(events.some((e) => e.message.startsWith('frame'))).toBe(true);
  expect(last.result.file).toMatch(/^exports\/Demo-\d{8}-\d{4}(-\d+)?\.mp4$/);
  const out = join(demo, last.result.file);
  expect(await probeDuration(out)).toBeCloseTo(1, 1);   // the snapshot, not the 2 s edit
  expect(await probeHasAudio(out)).toBe(true);
  expect(readFileSync(join(demo, last.result.log), 'utf8')).toMatch(/^chrome \d+\./m);
  expect(leftovers()).toEqual([]);
  expect(existsSync(join(demo, 'cache/index.json'))).toBe(false);
  const list = await (await fetch(`${base}/api/projects/demo/exports`)).json();
  expect(list[0]).toMatchObject({ file: last.result.file, log: last.result.log });
  expect((await fetch(base + list[0].url)).headers.get('content-type')).toBe('video/mp4');
  await fetch(`${base}/api/projects/demo`, { method: 'PUT', body: JSON.stringify(demoProject()) });
}, 240000);

test('exports a range', async () => {
  const job = await (await post({ from: 0.5, to: 1 })).json();
  const done = await app.queue.wait(job.id);
  expect(done.status).toBe('done');
  expect(await probeDuration(join(demo, (done.result as any).file))).toBeCloseTo(0.5, 1);
}, 240000);

test('rejects bad ranges', async () => {
  for (const b of [{ from: 1, to: 0.5 }, { to: 5 }, { from: -1 }, { from: 'x' }]) expect((await post(b)).status).toBe(400);
});

test('DELETE cancels a running export and leaves no mp4 or temp files', async () => {
  const before = mp4s().length;
  const job = await (await post()).json();
  await new Promise<void>((ok) => {
    const on = (j: any) => { if (j.id === job.id && j.message.startsWith('frame')) { app.queue.off('change', on); fetch(`${base}/api/jobs/${job.id}`, { method: 'DELETE' }).then(() => ok()); } };
    app.queue.on('change', on);
  });
  expect((await app.queue.wait(job.id)).status).toBe('cancelled');
  expect(mp4s().length).toBe(before);
  expect(leftovers()).toEqual([]);
}, 240000);

test('an offline source fails the export with the missing file listed and no leftovers', async () => {
  const p = demoProject();
  p.sources.s1.path = 'missing.mp4';
  await fetch(`${base}/api/projects/demo`, { method: 'PUT', body: JSON.stringify(p) });
  const before = mp4s().length;
  const done = await app.queue.wait((await (await post()).json()).id);
  expect(done.status).toBe('failed');
  expect(done.error).toMatch(/Missing files:[\s\S]*missing\.mp4/);
  expect(mp4s().length).toBe(before);
  expect(leftovers()).toEqual([]);
  await fetch(`${base}/api/projects/demo`, { method: 'PUT', body: JSON.stringify(demoProject()) });
}, 240000);
test('photos and rotated phone videos come out upright in the export', async () => {
  await makePhoto(join(demo, 'up.jpg'), { w: 1200, h: 900, orientation: 6 });   // upright: red on top, blue below
  await makePhoneVideo(join(demo, 'phone.mp4'));                                  // shown rotated: red and blue stacked
  const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
  const p = demoProject({ sources: { ph: { path: 'up.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' }, pv: { path: 'phone.mp4', duration: 2, width: 360, height: 640, kind: 'video', audio: true } },
    tracks: [{ id: 'v', kind: 'video', items: [{ id: 'a', source: 'ph', in: 0, speed: 1, start: 0, end: 1, crop }, { id: 'b', source: 'pv', in: 0, speed: 1, start: 1, end: 2, crop }] }] });
  p.meta = { ...p.meta, width: 180, height: 320, duration: 2 };
  await fetch(`${base}/api/projects/demo`, { method: 'PUT', body: JSON.stringify(p) });
  const job = await (await post()).json();
  const last = (await sse(`${base}/api/jobs/${job.id}/events`)).at(-1);
  expect(last.status).toBe('done');
  const px = async (t: number, y: number) => {
    const { stdout } = await ffmpeg(['-ss', String(t), '-i', join(demo, last.result.file), '-frames:v', '1', '-vf', `crop=1:1:90:${y},format=rgb24`, '-f', 'rawvideo', '-'], { stdout: true });
    return [...stdout.subarray(0, 3)];
  };
  const red = ([r, , b]: number[]) => r > b + 80, blue = ([r, , b]: number[]) => b > r + 80;
  const [pTop, pBottom] = [await px(0.5, 40), await px(0.5, 280)];
  expect([red(pTop), blue(pBottom)]).toEqual([true, true]);
  const [vTop, vBottom] = [await px(1.5, 40), await px(1.5, 280)];
  expect((red(vTop) && blue(vBottom)) || (blue(vTop) && red(vBottom))).toBe(true);   // stacked, not side by side
}, 240000);

test('a project effect that does not load stops the export with the reason (it rendered without that effect before)', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(demo, 'fx'), { recursive: true });
  writeFileSync(join(demo, 'fx', 'bad.js'), 'export default [ this is not javascript');
  const p = demoProject(); p.meta.fx = ['fx/bad.js'];
  await fetch(`${base}/api/projects/demo`, { method: 'PUT', body: JSON.stringify(p) });
  try {
    const job = await (await post()).json();
    const done = await app.queue.wait(job.id);
    expect([done.status, done.error]).toEqual(['failed', expect.stringMatching(/^專案的效果載入失敗：fx\/bad\.js：/)]);
  } finally {
    await fetch(`${base}/api/projects/demo`, { method: 'PUT', body: JSON.stringify(demoProject()) });
    rmSync(join(demo, 'fx'), { recursive: true, force: true });
  }
}, 120000);
