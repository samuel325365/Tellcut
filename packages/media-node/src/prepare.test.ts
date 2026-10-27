import { mkdtempSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRegistry, corePlugin, parseProject, type Plugin } from '@tellcut/engine';
import { cutSalt, prepareProject, runPool } from './prepare.ts';
import { run, probeSize } from './ffmpeg.ts';

const stillPlugin: Plugin = { id: 't', items: [{ type: 't.still', label: 's', kind: 'overlay', params: [], build: () => null, draw: () => {},
  media: () => ({ videos: [], stills: [{ source: 's1', t: 1, w: 160 }] }) }] };

function project(sources: Record<string, string>) {
  return {
    version: 1,
    meta: { name: 't', width: 320, height: 180, fps: 30, duration: 3, plugins: [], cut: { crf: 23, preset: 'ultrafast' },
      mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0.3 } } },
    sources: Object.fromEntries(Object.entries(sources).map(([k, p]) => [k, { path: p, duration: 4, width: 320, height: 180 }])),
    media: {}, grids: [],
    tracks: [
      { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0.5, speed: 1, start: 0, end: 1,
        crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] },
      { id: 'o', kind: 'overlay', items: [{ id: 'st', type: 't.still', start: 0, end: 1, params: {} }] },
      { id: 'a', kind: 'audio', items: [{ id: 'au', source: 's1', in: 1, start: 0, end: 1, rate: 1, gain: 0, fadeIn: 0, fadeOut: 0 }] },
    ],
  };
}

test('cuts every referenced clip, still and audio segment and writes the index', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=duration=4', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', join(dir, 'src.mp4')]);
  writeFileSync(join(dir, 'project.json'), JSON.stringify(project({ s1: 'src.mp4' })));
  const index = await prepareProject(dir, createRegistry([corePlugin, stillPlugin]));
  const all = [...Object.values(index.videos), ...Object.values(index.stills), ...Object.values(index.audio)];
  expect(all.length).toBe(3);
  for (const rel of all) expect(existsSync(join(dir, rel))).toBe(true);
  expect(JSON.parse(readFileSync(join(dir, 'cache/index.json'), 'utf8'))).toEqual(index);
});

test('clips keep the source aspect even when the project frame is portrait', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=4', '-c:v', 'libx264', join(dir, 'src.mp4')]);
  const p = project({ s1: 'src.mp4' });
  p.meta.width = 180; p.meta.height = 320;
  p.tracks = [p.tracks[0]];
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  const index = await prepareProject(dir, createRegistry([corePlugin]));
  const clip = join(dir, Object.values(index.videos)[0]);
  expect(await probeSize(clip)).toEqual({ width: 320, height: 180 });
});

test('a failed cut leaves no file behind, so the next run retries it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=4', '-c:v', 'libx264', join(dir, 'src.mp4')]);
  const p = project({ s1: 'src.mp4' });
  p.tracks = [p.tracks[0]];
  p.meta.cut.preset = 'no-such-preset';   // libx264 rejects it → ffmpeg fails
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  await expect(prepareProject(dir, createRegistry([corePlugin]))).rejects.toThrow(/ffmpeg exit/);
  const cuts = join(dir, 'cache/cuts');
  expect(existsSync(cuts) ? readdirSync(cuts) : []).toEqual([]);
});

test('changing encode settings or frame size re-cuts instead of reusing old clips', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=4', '-c:v', 'libx264', join(dir, 'src.mp4')]);
  const p = project({ s1: 'src.mp4' });
  p.tracks = [p.tracks[0]];
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  const a = await prepareProject(dir, createRegistry([corePlugin]));
  p.meta.cut.crf = 30;
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  const b = await prepareProject(dir, createRegistry([corePlugin]));
  expect(Object.values(b.videos)[0]).not.toBe(Object.values(a.videos)[0]);
});

test('declared source size or duration that does not match the file is rejected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=4', '-c:v', 'libx264', join(dir, 'src.mp4')]);
  const p = project({ s1: 'src.mp4' });
  (p.sources.s1 as any).width = 1920; (p.sources.s1 as any).height = 1080;
  p.tracks = [p.tracks[0]];
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  await expect(prepareProject(dir, createRegistry([corePlugin]))).rejects.toThrow(/s1: declared 1920×1080, 4\.00 s; file is 320×180, 4\.\d\d s/);
});

test('missing music files are listed with the missing sources', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  const p: any = project({ s1: 'nope1.mp4' });
  p.media = { bgm: { path: 'media/gone.mp3' } };
  p.tracks.push({ id: 'mus', kind: 'music', items: [{ id: 'm', media: 'bgm', in: 0, start: 0, end: 1, gain: 0, fadeIn: 0, fadeOut: 0 }] });
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  await expect(prepareProject(dir, createRegistry([corePlugin, stillPlugin]))).rejects.toThrow(/Missing files:\n  s1: nope1\.mp4\n  bgm: media\/gone\.mp3/);
});

test('lists every missing source before cutting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  const p = project({ s1: 'nope1.mp4', s2: 'nope2.mp4' });
  (p.tracks[2].items[0] as any).source = 's2';
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  await expect(prepareProject(dir, createRegistry([corePlugin, stillPlugin]))).rejects.toThrow(/Missing files:\n  s1: nope1\.mp4\n  s2: nope2\.mp4/);
  expect(existsSync(join(dir, 'cache'))).toBe(false);
});

test('refuses a project whose plugin params name an unknown source, naming the item', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  const bad: Plugin = { id: 't', items: [{ type: 't.still', label: 's', kind: 'overlay', params: [], build: () => null, draw: () => {},
    media: () => ({ videos: [], stills: [{ source: 'nope', t: 1 }] }) }] };
  writeFileSync(join(dir, 'project.json'), JSON.stringify(project({ s1: 'src.mp4' })));
  await expect(prepareProject(dir, createRegistry([corePlugin, bad]))).rejects.toThrow('Item "st" (t.still): unknown source "nope"');
});

test('media() gets the registry: a block hosting another (common.card) asks for its still, and that still is cut', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=4', '-c:v', 'libx264', join(dir, 'src.mp4')]);
  const host: Plugin = { id: 'h', items: [{ type: 'h.host', label: 'h', kind: 'overlay', params: [], build: () => null, draw: () => {},
    media: (item, p, types) => types?.('t.still')?.media?.(item, p, types) ?? { videos: [], stills: [] } }] };
  const p = project({ s1: 'src.mp4' });
  p.tracks = [{ id: 'o', kind: 'overlay', items: [{ id: 'hh', type: 'h.host', start: 0, end: 1, params: {} }] }] as any;
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  const index = await prepareProject(dir, createRegistry([corePlugin, stillPlugin, host]));
  expect(Object.keys(index.stills)).toHaveLength(1);
  expect(existsSync(join(dir, Object.values(index.stills)[0]))).toBe(true);
}, 120000);

test('prepares an in-memory snapshot into a named index, leaving cache/index.json alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=duration=4', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', join(dir, 'src.mp4')]);
  writeFileSync(join(dir, 'project.json'), JSON.stringify(project({ s1: 'src.mp4' })));
  const snap = parseProject(project({ s1: 'src.mp4' }));
  (snap.tracks[0].items[0] as any).in = 1;
  const seen: Array<[number, number]> = [];
  const index = await prepareProject(dir, createRegistry([corePlugin, stillPlugin]), { project: snap, indexFile: 'cache/index-job1.json', onProgress: (d, n) => seen.push([d, n]) });
  expect(existsSync(join(dir, 'cache/index.json'))).toBe(false);
  expect(JSON.parse(readFileSync(join(dir, 'cache/index-job1.json'), 'utf8'))).toEqual(index);
  expect(Object.keys(index.videos)[0]).toContain('|1.0000|');
  expect(seen[0]).toEqual([0, 3]);
  expect(seen.at(-1)).toEqual([3, 3]);
}, 120000);

test('after one cut fails, no new cuts start, the running ones are stopped and awaited, then the first error is thrown', async () => {
  const started: string[] = [];
  let slowSettled = false, slowAborted = false;
  const ac = new AbortController();
  const jobs = [
    async () => { started.push('fail'); throw new Error('cut failed'); },
    async () => {
      started.push('slow');
      await new Promise<void>((r) => { const t = setTimeout(r, 2000); ac.signal.addEventListener('abort', () => { slowAborted = true; clearTimeout(t); r(); }); });
      slowSettled = true;
    },
    async () => { started.push('later'); },
  ];
  await expect(runPool(jobs, 2, ac)).rejects.toThrow('cut failed');
  expect(started).toEqual(['fail', 'slow']);
  expect(slowAborted).toBe(true);
  expect(slowSettled).toBe(true);
});

test('stabilised cuts carry a salt of their own, so cuts made before the vidstab copy fix are re-cut', () => {
  const ref = { source: 's', in: 0, out: 1, speed: 1, interp: 'none' as const };
  expect(cutSalt(ref, '|18|medium|30')).toBe('|18|medium|30');
  expect(cutSalt({ ...ref, stab: { smoothing: 20, zoom: 3 } }, '|18|medium|30')).toBe('|18|medium|30|vs2');
});
