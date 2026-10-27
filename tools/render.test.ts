import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { applyOps, createRegistry, parseProject } from '@tellcut/engine';
import { prepareProject, renderStills, run, ffmpeg, probeDuration, probeHasAudio, probeSize, master, maxRateKbps } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { TELLCUT_ROOT, renderVideo, openPage, playerPath, projectTarget } from './render.ts';

const dir = join(TELLCUT_ROOT, 'projects/_test');
const target = projectTarget('_test', 'cache');

beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=3', '-c:v', 'libx264', join(dir, 'src.mp4')]);
  writeFileSync(join(dir, 'project.json'), JSON.stringify({
    version: 1,
    meta: { name: 't', width: 320, height: 180, fps: 30, duration: 1, plugins: [], cut: { crf: 23, preset: 'ultrafast' },
      mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } } },
    sources: { s1: { path: 'src.mp4', duration: 3, width: 320, height: 180 } }, media: {}, grids: [],
    tracks: [
      { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0.5, speed: 1, start: 0, end: 1, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.2 } } }] },
      { id: 'o', kind: 'overlay', items: [{ id: 'f', type: 'core.flash', start: 0.5, end: 0.8, params: { peak: 1, rise: 0, hold: 0, fall: 0.3, power: 1, color: '#fff' } }] },
    ],
  }));
  await prepareProject(dir, createRegistry(plugins));
}, 120000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('renders a 1 s project to mp4 with audio, reports progress and cleans intermediates', async () => {
  const out = join(dir, 'output/t.mp4');
  const seen: Array<[number, number]> = [];
  const lines: string[] = [];
  await renderVideo({ target, out, onProgress: (f, n) => seen.push([f, n]), log: (l) => lines.push(l) });
  expect(await probeDuration(out)).toBeCloseTo(1, 1);
  expect(await probeHasAudio(out)).toBe(true);
  expect(seen.length).toBe(30);
  expect(seen[29]).toEqual([30, 30]);
  expect(lines[0]).toMatch(/^chrome \d+\./);
  expect(existsSync(out.replace(/\.mp4$/, '.video.mp4'))).toBe(false);
  expect(existsSync(out.replace(/\.mp4$/, '.mix.wav'))).toBe(false);
}, 180000);

test('a range render keeps the audio of that range', async () => {
  const out = await renderVideo({ target, from: 0.5, to: 1, out: join(dir, 'output/part.mp4'), log: () => {} });
  expect(await probeDuration(out)).toBeCloseTo(0.5, 1);
  expect(await probeHasAudio(out)).toBe(true);
}, 180000);

test('an aborted render rejects with AbortError and leaves no files', async () => {
  const ac = new AbortController();
  const out = join(dir, 'output/abort.mp4');
  const p = renderVideo({ target, out, signal: ac.signal, log: () => {}, onProgress: (f) => { if (f === 3) ac.abort(); } });
  await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  for (const f of [out, out.replace(/\.mp4$/, '.video.mp4'), out.replace(/\.mp4$/, '.mix.wav')]) expect(existsSync(f)).toBe(false);
}, 180000);

test('an encoder failure rejects with its exit code (M-8)', async () => {
  const out = join(dir, 'output/enc.mp4');
  mkdirSync(out.replace(/\.mp4$/, '.video.mp4'), { recursive: true });   // a directory where the encoder must write
  await expect(renderVideo({ target, out, log: () => {} })).rejects.toThrow(/ffmpeg \(encoder\) exit \d+/);
  rmSync(out.replace(/\.mp4$/, '.video.mp4'), { recursive: true, force: true });
}, 180000);

test('screenshots cover the whole stage for full-HD projects', async () => {
  const hd = join(TELLCUT_ROOT, 'projects/_test_hd');
  mkdirSync(join(hd, 'cache'), { recursive: true });
  writeFileSync(join(hd, 'cache/index.json'), JSON.stringify({ videos: {}, stills: {}, audio: {} }));
  writeFileSync(join(hd, 'project.json'), JSON.stringify({
    version: 1,
    meta: { name: 'hd', width: 1920, height: 1080, fps: 30, duration: 1, plugins: [],
      mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } } },
    sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'f', type: 'core.flash', start: 0, end: 1, params: { peak: 1, rise: 0, hold: 1, fall: 0, power: 1, color: '#fff' } }] }],
  }));
  try {
    const s = await openPage(playerPath('_test_hd', 'cache'), '__tellcut');
    await s.frame(0);
    const png = await s.png();
    await s.close();
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1920, 1080]);
  } finally {
    rmSync(hd, { recursive: true, force: true });
  }
}, 120000);

test('frame(n) draws the flash at its peak', async () => {
  const s = await openPage(playerPath('_test', 'cache'), '__tellcut');
  await s.frame(15);
  expect((await s.png()).length).toBeGreaterThan(100);
  await s.close();
}, 120000);

test('cancelling while the player is still loading stops the render (a clip that never arrives)', async () => {
  const hang = createServer(() => {});   // accepts requests and never answers
  await new Promise<void>((r) => hang.listen(0, '127.0.0.1', () => r()));
  const idx = JSON.parse(readFileSync(join(dir, 'cache/index.json'), 'utf8'));
  for (const k of Object.keys(idx.videos)) idx.videos[k] = `http://127.0.0.1:${(hang.address() as any).port}/clip.mp4`;
  writeFileSync(join(dir, 'cache/index-hang.json'), JSON.stringify(idx));
  const ac = new AbortController();
  let abortedAt = 0;
  setTimeout(() => { abortedAt = Date.now(); ac.abort(); }, 3000);
  try {
    await expect(renderVideo({ target: { ...target, index: 'cache/index-hang.json' }, out: join(dir, 'output/hang.mp4'), signal: ac.signal, log: () => {} }))
      .rejects.toMatchObject({ name: 'AbortError' });
    // timed from the cancel, not from the start: under a full parallel run Chrome alone can take seconds to come up
    expect(Date.now() - abortedAt).toBeLessThan(8000);
  } finally {
    hang.closeAllConnections(); hang.close();
  }
}, 90000);

test('the capture size is the loaded stage, not the empty stage before the project arrives', async () => {
  // a page whose stage is an empty block (full width, no height) until its project "loads" a moment later
  const slow = join(dir, 'slow');
  mkdirSync(slow, { recursive: true });
  writeFileSync(join(slow, 'index.html'), `<!doctype html><body style="margin:0"><div id="stage"></div><script>
    window.__app = { fps: 30, duration: 1, ready: new Promise((res) => setTimeout(() => {
      const s = document.getElementById('stage'); s.style.width = '320px'; s.style.height = '180px'; s.style.background = '#f00'; res();
    }, 1500)) };
  </script></body>`);
  const page = await openPage('/projects/_test/slow/index.html', '__app');
  try {
    const png = await page.png();
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([320, 180]);
  } finally {
    await page.close();
  }
}, 60000);

test('an export is normalised to the project loudness', async () => {
  const d = join(TELLCUT_ROOT, 'projects/_test-loud');
  mkdirSync(d, { recursive: true });
  try {
    await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(d, 'src.mp4')]);
    writeFileSync(join(d, 'project.json'), JSON.stringify({
      version: 1,
      meta: { name: 'l', width: 320, height: 180, fps: 30, duration: 3, plugins: [], loudness: -24, cut: { crf: 23, preset: 'ultrafast' },
        mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0 } } },
      sources: { s1: { path: 'src.mp4', duration: await probeDuration(join(d, 'src.mp4')), width: 320, height: 180 } }, media: {}, grids: [],
      tracks: [
        { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 3, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] },
        { id: 'a', kind: 'audio', items: [{ id: 'x', source: 's1', in: 0, rate: 1, start: 0, end: 3, gain: 0, fadeIn: 0, fadeOut: 0 }] },
      ],
    }));
    await prepareProject(d, createRegistry(plugins));
    const out = join(d, 'output/l.mp4');
    await renderVideo({ target: projectTarget('_test-loud', 'cache'), out, log: () => {} });
    const { stderr } = await ffmpeg(['-i', out, '-af', 'ebur128', '-f', 'null', '-'], { level: 'info' });
    const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(stderr.slice(stderr.lastIndexOf('Summary')))![1]);
    expect(Math.abs(I - -24)).toBeLessThan(2);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}, 180000);

test('a player that fails to load fails the export at once with its error (it never sizes its stage)', async () => {
  const broken = join(dir, 'broken');
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, 'index.html'), `<!doctype html><body style="margin:0"><div id="stage"></div><script>
    window.__app = { fps: 30, duration: 1, ready: new Promise((_, rej) => setTimeout(() => rej(new Error('404 cache/index.json')), 300)) };
    window.__app.ready.catch(() => {});
  </script></body>`);
  const t0 = Date.now();
  await expect(openPage('/projects/_test/broken/index.html', '__app')).rejects.toThrow(/404 cache\/index\.json/);
  expect(Date.now() - t0).toBeLessThan(60000);   // the point: its own error long before the 300 s load timeout (Chrome starts slowly under a full suite)
}, 120000);

test('rounded clip corners show the project background in an export', async () => {
  const d = join(TELLCUT_ROOT, 'projects/_test-radius');
  mkdirSync(d, { recursive: true });
  try {
    await run(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(d, 'src.mp4')]);
    writeFileSync(join(d, 'project.json'), JSON.stringify({
      version: 1,
      meta: { name: 'r', width: 320, height: 180, fps: 30, duration: 1, plugins: [], background: '#00ff00', cut: { crf: 23, preset: 'ultrafast' },
        mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0 } } },
      sources: { s1: { path: 'src.mp4', duration: await probeDuration(join(d, 'src.mp4')), width: 320, height: 180 } }, media: {}, grids: [],
      tracks: [{ id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 1, radius: 40, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] }],
    }));
    await prepareProject(d, createRegistry(plugins));
    const out = join(d, 'output/r.mp4');
    await renderVideo({ target: projectTarget('_test-radius', 'cache'), out, log: () => {} });
    const px = async (x: number, y: number) => {
      const { stdout } = await ffmpeg(['-ss', '0.5', '-i', out, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-'], { stdout: true });
      return [...stdout.subarray(0, 3)];
    };
    const [corner, centre] = [await px(3, 3), await px(160, 90)];
    expect(corner[1]).toBeGreaterThan(corner[0] + 80);      // green background in the cut-off corner
    expect(centre[0]).toBeGreaterThan(centre[1] + 80);      // the red clip inside
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}, 180000);

test('stills of a proposal show the proposal, not the saved project', async () => {
  const d = join(TELLCUT_ROOT, 'projects/_test-stills');
  mkdirSync(d, { recursive: true });
  try {
    await run(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(d, 'src.mp4')]);
    const base: any = { version: 1, meta: { name: 's', width: 320, height: 180, fps: 30, duration: 1, plugins: [], cut: { crf: 23, preset: 'ultrafast' },
      mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0 } } },
      sources: { s1: { path: 'src.mp4', duration: await probeDuration(join(d, 'src.mp4')), width: 320, height: 180 } }, media: {}, grids: [],
      tracks: [{ id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 1, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] },
        { id: 'o', kind: 'overlay', items: [] }] };
    writeFileSync(join(d, 'project.json'), JSON.stringify(base));
    const proposed = applyOps(parseProject(base), [{ op: 'addItem', track: 'o', item: { type: 'core.flash', start: 0, end: 1, params: { peak: 1, rise: 0, hold: 1, fall: 0, power: 1, color: '#ffffff' } } }]).project;
    const [png] = await renderStills({ dir: d, project: proposed, times: [0.5], registry: createRegistry(plugins), outDir: join(d, 'output'), tag: 'proposal' });
    const { stdout } = await ffmpeg(['-i', png, '-vf', 'crop=1:1:160:90,format=rgb24', '-f', 'rawvideo', '-'], { stdout: true });
    expect([...stdout.subarray(0, 3)].every((v) => v > 230)).toBe(true);
    // the chat's frames: scaled to the long side asked for, the full-size capture not left behind
    const [small] = await renderStills({ dir: d, project: proposed, times: [0.5], registry: createRegistry(plugins), outDir: join(d, 'output'), tag: 'small', maxSide: 160 });
    expect(await probeSize(small)).toEqual({ width: 160, height: 90 });
    expect(readdirSync(join(d, 'output')).filter((n) => n.endsWith('.full.png'))).toEqual([]);
  } finally { rmSync(d, { recursive: true, force: true }); }
}, 180000);

test('mastering: gain to the target, then corrected by what the encoded file measures; over -1 dBTP lowers the ceiling; at most 4 encodes', async () => {
  const run = async (results: Array<{ lufs: number; peak?: number } | null>) => {
    const calls: Array<[number, number]> = [];
    const used = await master(-14, -22, async (g, c) => { calls.push([g, c]); }, async () => results[calls.length - 1]);
    return { calls, used };
  };
  expect(await run([{ lufs: -14.2, peak: -1.4 }])).toEqual({ calls: [[8, -1.5]], used: { gain: 8, ceiling: -1.5, passes: 1 } });
  // the limiter took 0.9 LUFS: one more encode with that much more gain
  expect((await run([{ lufs: -14.9, peak: -1.4 }, { lufs: -14.1, peak: -1.3 }])).calls).toEqual([[8, -1.5], [8.9, -1.5]]);
  // the encoder overshot: a lower ceiling, and the gain it costs given back
  expect((await run([{ lufs: -14, peak: 0.3 }, { lufs: -14.7, peak: -1.8 }, { lufs: -14.1, peak: -1.6 }])).calls).toEqual([[8, -1.5], [8, -3], [8.7, -3]]);
  expect((await run(Array(6).fill({ lufs: -16, peak: 0 }))).used.passes).toBe(4);
  expect((await run([null])).used.passes).toBe(1);
});

test('a project sound file on the sound-effect track (c.sfxFile) is heard in the export at its time; a missing one stops prepare', async () => {
  const d = join(TELLCUT_ROOT, 'projects/_test-sfxfile');
  mkdirSync(join(d, 'media/sfx'), { recursive: true });
  try {
    await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(d, 'src.mp4')]);
    await run(['-f', 'lavfi', '-i', 'sine=frequency=660:duration=0.6', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', join(d, 'media/sfx/tone.wav')]);
    const project = (path: string) => ({
      version: 1,
      meta: { name: 's', width: 320, height: 180, fps: 30, duration: 2.5, plugins: [], cut: { crf: 23, preset: 'ultrafast' },
        mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0 } } },
      sources: { s1: { path: 'src.mp4', duration: 3, width: 320, height: 180, audio: false } }, media: {}, grids: [],
      tracks: [
        { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 2.5, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] },
        { id: 'sfx', kind: 'sfx', gain: 0, items: [{ id: 'f', type: 'core.file', label: 'tone', start: 1.2, end: 1.8, params: { path }, gain: 0 }] },
      ],
    });
    writeFileSync(join(d, 'project.json'), JSON.stringify(project('media/sfx/nope.wav')));
    await expect(prepareProject(d, createRegistry(plugins))).rejects.toThrow(/sound effect: media\/sfx\/nope\.wav/);
    writeFileSync(join(d, 'project.json'), JSON.stringify(project('media/sfx/tone.wav')));
    await prepareProject(d, createRegistry(plugins));
    const out = join(d, 'output/s.mp4');
    await renderVideo({ target: projectTarget('_test-sfxfile', 'cache'), out, log: () => {} });
    const level = async (a: number, b: number) => {
      const { stderr } = await ffmpeg(['-ss', String(a), '-t', String(b - a), '-i', out, '-af', 'volumedetect', '-f', 'null', '-'], { level: 'info' });
      return Number(/mean_volume:\s+(-?[\d.]+|-inf) dB/.exec(stderr)?.[1] ?? -120);
    };
    const before = await level(0.2, 1.0), during = await level(1.3, 1.7);
    expect(during).toBeGreaterThan(-35);
    expect(during - before).toBeGreaterThan(30);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}, 180000);

test('the video bitrate is capped by its pixels and, above 30 fps, its frame rate', () => {
  expect(maxRateKbps(1920, 1080, 30)).toBe(24000);
  expect(maxRateKbps(1080, 1920, 30)).toBe(24000);
  expect(maxRateKbps(3840, 2160, 60)).toBe(192000);
  expect(maxRateKbps(640, 360, 24)).toBe(4000);   // never below 4 Mbit/s
});
