import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeClicks, makeTalkingVideo } from '@tellcut/media-node';
import { demoProject, makeProjects, startApp } from './test-utils.ts';

let root: string, base: string, app: Awaited<ReturnType<typeof startApp>>['app'];
const api = (p: string) => `${base}/api/projects/${p}`;
const project = (id: string, extra: Record<string, unknown> = {}) => {
  mkdirSync(join(root, id), { recursive: true });
  writeFileSync(join(root, id, 'project.json'), JSON.stringify(demoProject({ sources: { talk: { path: 'talk.mp4', duration: 4, width: 640, height: 360 } }, media: { beat: { path: 'beat.wav' } }, tracks: [], ...extra })));
};
beforeAll(async () => {
  root = makeProjects();
  for (const id of ['x', 'broken']) {
    project(id);
    await makeTalkingVideo(join(root, id, 'talk.mp4'), 'The birthday cake is ready.');
    await makeClicks(join(root, id, 'beat.wav'), { bpm: 120, seconds: 10 });
  }
  ({ app, base } = await startApp({ projectsDir: root, extras: true }));
}, 180000);
afterAll(() => app.close());

test('analyze also queues sheets + transcript per video and beats per music; their endpoints answer when done', async () => {
  const r = await (await fetch(api('x/analyze'), { method: 'POST' })).json();
  expect(r.extras.map((j: any) => [j.kind, j.label]).sort()).toEqual([['beats', 'beat'], ['extras', 'talk']]);
  for (const j of r.extras) { const w = await app.queue.wait(j.id); expect(w.status, `${j.kind} ${j.label}: ${w.error ?? ''}`).toBe('done'); }
  expect((await (await fetch(api('x/media/transcript/talk'))).json()).segments.map((s: any) => s.text).join(' ').toLowerCase()).toContain('cake');
  expect((await fetch(api('x/media/sheet/talk/1'))).headers.get('content-type')).toBe('image/jpeg');
  expect((await fetch(api('x/media/sheet/talk/9'))).status).toBe(404);
  expect(Math.round((await (await fetch(api('x/media/beats/beat'))).json()).bpm)).toBeGreaterThanOrEqual(118);
  // downloaded music whose source lists half that tempo: the editor gets the beats cut.ts uses, every other one
  mkdirSync(join(root, 'x', 'media'), { recursive: true });
  writeFileSync(join(root, 'x', 'media', 'assets.json'), JSON.stringify({ version: 1, items: [{ source: 'tunes', id: 'b', title: 'b', author: 'a', page: 'p', license: 'l', quality: 'preview', path: 'beat.wav', downloaded: '', bpm: 60 }] }));
  expect(Math.round((await (await fetch(api('x/media/beats/beat'))).json()).bpm)).toBeLessThanOrEqual(62);
  expect((await (await fetch(api('x/analyze'), { method: 'POST' })).json()).extras).toEqual([]);   // nothing left to do
}, 600000);

test('when the transcript fails, the basic analysis and the sheets still work; the transcript stays unavailable', async () => {
  process.env.TELLCUT_WHISPER_MODEL = 'no-such-model-for-tellcut-tests';
  try {
    const r = await (await fetch(api('broken/analyze'), { method: 'POST' })).json();
    const ex = r.extras.find((j: any) => j.kind === 'extras');
    expect((await app.queue.wait(ex.id)).status).toBe('failed');
    expect((await fetch(api('broken/media/thumbs/talk'))).status).toBe(200);
    expect((await fetch(api('broken/media/sheet/talk/1'))).status).toBe(200);
    expect((await fetch(api('broken/media/transcript/talk'))).status).toBe(409);
  } finally { delete process.env.TELLCUT_WHISPER_MODEL; }
}, 600000);

test("cancelling a source's analysis cancels its sheets and transcript too, instead of them analysing it all again", async () => {
  project('stop');
  await makeTalkingVideo(join(root, 'stop', 'talk.mp4'), 'Nothing to see here.');
  const r = await (await fetch(api('stop/analyze'), { method: 'POST' })).json();
  const basic = r.jobs.find((j: any) => j.kind === 'analyze'), ex = r.extras.find((j: any) => j.kind === 'extras');
  expect((await fetch(`${base}/api/jobs/${basic.id}`, { method: 'DELETE' })).status).toBe(200);
  expect([(await app.queue.wait(basic.id)).status, (await app.queue.wait(ex.id)).status]).toEqual(['cancelled', 'cancelled']);
  expect((await fetch(api('stop/media/thumbs/talk'))).status).toBe(409);   // nothing was analysed behind the user's back
}, 600000);
