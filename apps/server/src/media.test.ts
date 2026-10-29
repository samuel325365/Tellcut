import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeSize, readWav, run } from '@tellcut/media-node';
import { demoProject, makeProjects, makeSource, startApp } from './test-utils.ts';
import { pruneAudioCache } from './media.ts';

let root: string, base: string, app: Awaited<ReturnType<typeof startApp>>['app'];
beforeAll(async () => {
  root = makeProjects();
  await makeSource(join(root, 'demo/src.mp4'));
  ({ app, base } = await startApp({ projectsDir: root }));
}, 120000);
afterAll(() => app.close());

const url = (p: string) => `${base}/api/projects/demo/media/${p}`;
const jpegSize = async (r: Response) => { const f = join(mkdtempSync(join(tmpdir(), 'img-')), 'x.jpg'); writeFileSync(f, Buffer.from(await r.arrayBuffer())); return probeSize(f); };

test('analysis results answer 409 until the analyze job has run, once per source', async () => {
  expect((await fetch(url('proxy/s1'))).status).toBe(409);
  const first = await (await fetch(`${base}/api/projects/demo/analyze`, { method: 'POST' })).json();
  expect(first.jobs.map((j: any) => j.label)).toEqual(['s1']);
  expect((await (await fetch(`${base}/api/projects/demo/analyze`, { method: 'POST' })).json()).jobs).toEqual([]);
  expect((await app.queue.wait(first.jobs[0].id)).status).toBe('done');
  expect((await (await fetch(`${base}/api/projects/demo/analyze`, { method: 'POST' })).json()).jobs).toEqual([]);
}, 120000);

test('serves proxy (with ranges), thumbnails, peaks and cuts', async () => {
  const pr = await fetch(url('proxy/s1'), { headers: { Range: 'bytes=0-99' } });
  expect([pr.status, pr.headers.get('content-type')]).toEqual([206, 'video/mp4']);
  const th = await (await fetch(url('thumbs/s1'))).json();
  expect(th).toMatchObject({ interval: 1, height: 90, cols: 10, url: '/api/projects/demo/media/thumbs/s1/image' });
  expect((await fetch(base + th.url)).headers.get('content-type')).toBe('image/jpeg');
  expect((await (await fetch(url('peaks/s1'))).json()).rate).toBe(100);
  expect((await (await fetch(url('cuts/s1'))).json())[0]).toBeCloseTo(2, 1);
});

test('audio segments keep 2 s of padding inside the source', async () => {
  const wav = readWav(Buffer.from(await (await fetch(url('audio?source=s1&in=2.5&out=3'))).arrayBuffer()));
  expect(wav.frames / wav.sampleRate).toBeCloseTo(3.5, 1);   // [0.5, 4]
});

test('stills honour w, square and strip', async () => {
  expect(await jpegSize(await fetch(url('still?source=s1&t=1&w=160')))).toEqual({ width: 160, height: 90 });
  expect(await jpegSize(await fetch(url('still?source=s1&t=1&square=100')))).toEqual({ width: 100, height: 100 });
  expect(await jpegSize(await fetch(url('still?source=s1&t=0.5&n=4&dur=2')))).toEqual({ width: 360, height: 120 });
});

test('two identical requests at once both get the whole file', async () => {
  const [a, b] = await Promise.all([fetch(url('still?source=s1&t=3&w=200')), fetch(url('still?source=s1&t=3&w=200'))]);
  const [x, y] = [Buffer.from(await a.arrayBuffer()), Buffer.from(await b.arrayBuffer())];
  expect([a.status, b.status]).toEqual([200, 200]);
  const f = join(mkdtempSync(join(tmpdir(), 'img-')), 'x.jpg');
  writeFileSync(f, x);
  expect((await probeSize(f)).width).toBe(200);   // a complete, decodable JPEG (the frame is flat blue, so it is tiny)
  expect(x.equals(y)).toBe(true);
});

test('requests outside the source or with bad numbers get 400 with a reason', async () => {
  for (const q of ['still?source=s1&t=9', 'still?source=s1&t=abc', 'still?source=s1', 'audio?source=s1&in=5&out=6', 'audio?source=s1&in=2&out=1', 'still?source=zz&t=1']) {
    const r = await fetch(url(q));
    expect([400, 404]).toContain(r.status);
    expect((await r.json()).error).toBeTruthy();
  }
  expect((await fetch(url('still?source=s1&t=9'))).status).toBe(400);
  expect((await fetch(url('still?source=zz&t=1'))).status).toBe(404);
});

test('offline sources are listed by analyze and answer 404 { offline }', async () => {
  const p = demoProject();
  p.sources.gone = { path: 'gone.mp4', duration: 4, width: 320, height: 180 };
  await fetch(`${base}/api/projects/demo`, { method: 'PUT', body: JSON.stringify(p) });
  expect((await (await fetch(`${base}/api/projects/demo/analyze`, { method: 'POST' })).json()).missing).toEqual(['gone']);
  const r = await fetch(url('proxy/gone'));
  expect([r.status, (await r.json()).offline]).toEqual([404, true]);
});

test('still sizes and strip counts are checked before ffmpeg runs', async () => {
  for (const q of ['w=0', 'w=99999', 'square=1', 'n=500&dur=1', 'n=2&dur=99']) {
    const r = await fetch(url(`still?source=s1&t=1&${q}`));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/must be|outside/);
  }
});

test('music outside the project folder is served by media id', async () => {
  mkdirSync(join(root, 'outside'), { recursive: true });
  await run(['-f', 'lavfi', '-i', 'sine=duration=1', join(root, 'outside', 'tone.wav')]);
  const p = demoProject({ media: { tone: { path: '../outside/tone.wav' }, gone: { path: '../outside/nope.wav' } } });
  writeFileSync(join(root, 'demo', 'project.json'), JSON.stringify(p, null, 2));
  try {
    const ok = await fetch(url('music/tone'));
    expect([ok.status, (await ok.arrayBuffer()).byteLength > 1000]).toEqual([200, true]);
    expect((await fetch(url('music/gone'))).status).toBe(404);
    expect((await fetch(url('music/zz'))).status).toBe(404);
  } finally { writeFileSync(join(root, 'demo', 'project.json'), JSON.stringify(demoProject(), null, 2)); }
});

test('a source without sound gives silence instead of an error', async () => {
  mkdirSync(join(root, 'quiet'), { recursive: true });
  await makeSource(join(root, 'quiet/src.mp4'), { audio: false });
  writeFileSync(join(root, 'quiet/project.json'), JSON.stringify(demoProject()));
  const r = await fetch(`${base}/api/projects/quiet/media/audio?source=s1&in=0.5&out=1.5`);
  expect(r.status).toBe(200);
  const wav = readWav(Buffer.from(await r.arrayBuffer()));
  expect(wav.frames / wav.sampleRate).toBeCloseTo(3.5, 1);   // [0, 3.5]: the usual 2 s of padding
}, 60000);

test('a test server analyses without the extras (contact sheets, transcripts load Whisper)', async () => {
  const r = await (await fetch(`${base}/api/projects/demo/analyze`, { method: 'POST' })).json();
  expect(r.extras).toEqual([]);
  expect(app.queue.list().filter((j) => j.kind === 'extras')).toEqual([]);
}, 120000);

test('cut audio segments are kept under the cap: the oldest go first, the one just made stays', () => {
  const d = mkdtempSync(join(tmpdir(), 'audcache-'));
  const make = (name: string, size: number, age: number) => { const p = join(d, name); writeFileSync(p, Buffer.alloc(size)); utimesSync(p, new Date(Date.now() - age * 1000), new Date(Date.now() - age * 1000)); return p; };
  make('old.wav', 400, 300); make('mid.wav', 400, 200); const fresh = make('new.wav', 400, 0); make('still.jpg', 5000, 400);
  pruneAudioCache(d, fresh, 1000);                     // 1200 bytes of wav > 1000: down to ≤ 500, keeping new.wav
  expect(readdirSync(d).sort()).toEqual(['new.wav', 'still.jpg']);
  pruneAudioCache(d, fresh, 1000);                     // under the cap: nothing happens
  expect(readdirSync(d).sort()).toEqual(['new.wav', 'still.jpg']);
});

test('a segment used in the last minute is not pruned (it may be on its way to a client)', () => {
  const d = mkdtempSync(join(tmpdir(), 'audcache-'));
  for (const [n, age] of [['a.wav', 10], ['b.wav', 5], ['c.wav', 0]] as const) {
    const p = join(d, n); writeFileSync(p, Buffer.alloc(400)); utimesSync(p, new Date(Date.now() - age * 1000), new Date(Date.now() - age * 1000));
  }
  pruneAudioCache(d, join(d, 'c.wav'), 500);
  expect(readdirSync(d).sort()).toEqual(['a.wav', 'b.wav', 'c.wav']);
});

test('titles of downloaded media, by source or music id (none when nothing was downloaded)', async () => {
  expect(await (await fetch(url('titles'))).json()).toEqual({});
  mkdirSync(join(root, 'demo', 'media'), { recursive: true });
  const rec = { author: 'a', page: 'p', license: 'l', quality: 'original', downloaded: '' };
  writeFileSync(join(root, 'demo', 'media', 'assets.json'), JSON.stringify({ version: 1, items: [
    { ...rec, source: 'pixabay', id: 'video-1', title: 'rice field', path: 'media/pixabay/v1.mp4', sourceId: 'pixabay-video-1' },
    { ...rec, source: 'tunes', id: 'm', title: 'calm piano', path: 'media/tunes/m.mp3', mediaId: 'tunes-m' },
    { ...rec, source: 'x', id: 'y', title: '', path: 'media/x/y.mp4', sourceId: 'x-y' },
  ] }));
  expect(await (await fetch(url('titles'))).json()).toEqual({ 'pixabay-video-1': 'rice field', 'tunes-m': 'calm piano' });
});

test('a source or music id that is an Object property name (constructor, toString) is no such id: 404, not a 500', async () => {
  for (const p of ['proxy/constructor', 'thumbs/toString', 'transcript/hasOwnProperty', 'image/constructor', 'audio?source=constructor&in=0&out=1', 'still?source=valueOf&t=0',
    'music/constructor', 'music-peaks/toString', 'beats/constructor']) {
    const r = await fetch(url(p));
    expect([p, r.status]).toEqual([p, 404]);
  }
});
