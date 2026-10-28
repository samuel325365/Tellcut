import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpeg, measureLoudness } from '../ffmpeg.ts';
import { createProject } from '../ingest.ts';
import { makePhoto } from '../test-media.ts';
import type { SourcesConfig } from './config.ts';
import { formatCredits, getAsset, importAsset, readAssetRecords, refreshCredits } from './project.ts';
import { openSources } from './registry.ts';
import type { AssetMeta, Fetched, SourceAdapter } from './types.ts';

let root: string, dir: string, hot: string, song: string, photo: string, svgFile: string, clip: string;
const meta = (source: string, id: string): AssetMeta => ({ source, id, title: `t-${id}`, author: 'A', page: 'https://example.org', license: 'L', quality: 'preview' });
const readProject = () => JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'srcproj-'));
  // 3 s of sine (lavfi's is -18 dBFS) turned up to +6 dBFS, kept as float so its peak stays over 0 dBTP
  hot = join(root, 'hot.wav'); song = join(root, 'song.wav');
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=f=440:d=3', '-af', 'volume=24dB', '-c:a', 'pcm_f32le', hot]);
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=f=220:d=4', '-af', 'volume=-6dB', song]);
  photo = await makePhoto(join(root, 'p.jpg'), { w: 1200, h: 900 });
  svgFile = join(root, 'logo.svg'); writeFileSync(svgFile, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  // 4 s of footage with sound, 320×180
  clip = join(root, 'clip.mp4');
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=f=440:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(async () => {
  const projectsDir = mkdtempSync(join(root, 'p-'));
  dir = join(projectsDir, 'p1');
  await createProject({ id: 'p1', inputs: [], projectsDir, blank: true });
});

test('a hot sound effect lands under -1 dBTP in media/sfx and is not registered as music', async () => {
  expect((await measureLoudness(hot))!.peak!).toBeGreaterThan(0);
  const r = await importAsset(dir, { file: hot, kind: 'audio', meta: meta('fake', '0701') });
  expect(r.record.path).toBe('media/sfx/fake-0701.wav');
  expect((await measureLoudness(join(dir, r.record.path)))!.peak!).toBeLessThanOrEqual(-1);
  expect(r.record.peak!).toBeLessThanOrEqual(-1);
  expect(r.usage).toBe("c.sfxFile('media/sfx/fake-0701.wav', { at: 秒 })");
  expect(readProject().media).toEqual({});
  expect(readAssetRecords(dir)).toMatchObject([{ source: 'fake', id: '0701', path: 'media/sfx/fake-0701.wav', title: 't-0701' }]);
});

test('music is registered in media with its duration, and a segment gets its own file and id', async () => {
  const r = await importAsset(dir, { file: song, kind: 'music', meta: meta('fake', 'pamgaea'), bpm: 120 }, { from: 1, len: 1.5 });
  expect(r.record).toMatchObject({ path: 'media/music/fake-pamgaea-1s-1.5s.wav', mediaId: 'fake-pamgaea-1s-1.5s', from: 1, len: 1.5, bpm: 120 });
  expect(readProject().media['fake-pamgaea-1s-1.5s'].duration).toBeCloseTo(1.5, 1);
  expect(r.usage).toBe("c.music('fake-pamgaea-1s-1.5s')");
});

test('a segment past the end is refused before anything is registered', async () => {
  const f3s: Fetched = { file: hot, kind: 'audio', meta: meta('fake', 'x') };
  await expect(importAsset(dir, f3s, { from: 5 })).rejects.toThrow('--from 5 秒超過素材長度（3.0 秒）');
  await expect(importAsset(dir, f3s, { from: 1, len: 0 })).rejects.toThrow('--len 要大於 0');
  expect(readAssetRecords(dir)).toEqual([]);
  expect(existsSync(join(dir, 'media', 'sfx', 'fake-x-5s.wav'))).toBe(false);
});

test('a segment that starts in the last moment of the file is refused and leaves no file', async () => {
  const f: Fetched = { file: song, kind: 'music', meta: meta('fake', 'end') };
  await expect(importAsset(dir, f, { from: 3.9995 })).rejects.toThrow('--from 3.9995 秒超過素材長度（4.0 秒）');
  expect(existsSync(join(dir, 'media', 'music'))).toBe(false);
  expect(readProject().media).toEqual({});
});

test('an image goes into media/<source>/ and is registered as a photo source', async () => {
  const r = await importAsset(dir, { file: photo, kind: 'image', meta: meta('fake', '10279769') });
  expect(r.record).toMatchObject({ path: 'media/fake/fake-10279769.jpg', sourceId: 'fake-10279769' });
  expect(readProject().sources['fake-10279769']).toEqual({ path: 'media/fake/fake-10279769.jpg', duration: 3600, width: 1200, height: 900, kind: 'image' });
  expect(r.usage).toBe("c.photo('fake-10279769', { len: 3 })");
  expect(existsSync(photo)).toBe(true);   // the caller removes the download, not importAsset
});

test('an image with --from or in a format the player cannot read is refused', async () => {
  await expect(importAsset(dir, { file: photo, kind: 'image', meta: meta('fake', 'x') }, { from: 1 })).rejects.toThrow('圖片沒有 --from／--len');
  await expect(importAsset(dir, { file: svgFile, kind: 'image', meta: meta('fake', 'y') })).rejects.toThrow('圖片格式 .svg 不能用');
  expect(readAssetRecords(dir)).toEqual([]);
});

test('footage goes into media/<source>/ and is registered as a video source, for c.clip after inspect', async () => {
  const f: Fetched = { file: clip, kind: 'video', meta: meta('nasa', 'KSC-1') };
  const r = await importAsset(dir, f);
  expect(r.record).toMatchObject({ path: 'media/nasa/nasa-KSC-1.mp4', sourceId: 'nasa-KSC-1' });
  expect(r.usage).toBe("c.clip('nasa-KSC-1', { from: 秒, len: 秒 })（先跑 npm run inspect -- <專案> 分析這支影片，再挑段落）");
  expect(readProject().sources['nasa-KSC-1']).toMatchObject({ path: 'media/nasa/nasa-KSC-1.mp4', kind: 'video', width: 320, height: 180, audio: true, duration: expect.closeTo(4, 0) });
  // a segment is cut into an MP4 of its own
  const seg = await importAsset(dir, f, { from: 1, len: 2 });
  expect(seg.record).toMatchObject({ path: 'media/nasa/nasa-KSC-1-1s-2s.mp4', sourceId: 'nasa-KSC-1-1s-2s', from: 1, len: 2 });
  expect(readProject().sources['nasa-KSC-1-1s-2s'].duration).toBeCloseTo(2, 0);
  await expect(importAsset(dir, f, { from: 9 })).rejects.toThrow('--from 9 秒超過影片長度（4.0 秒）');
  await expect(importAsset(dir, { ...f, file: svgFile })).rejects.toThrow('影片格式 .svg 不能用');
});

test('credits list music, then images, then sound effects', () => {
  const rec = (id: string, extra: object) => ({ ...meta('fake', id), path: `p/${id}`, downloaded: '', ...extra });
  const fake = { credit: (r: { id: string }) => `- ${r.id}` } as unknown as SourceAdapter;
  expect(formatCredits([rec('S', {}), rec('I', { sourceId: 'x' }), rec('M', { mediaId: 'y' }), rec('S2', {})], { fake })).toEqual(['- M', '- I', '- S', '- S2']);
});

test('a credit line two assets share is written once', () => {
  const rec = (id: string, path: string) => ({ ...meta('fake', id), path, downloaded: '' });
  const fake = { credit: (r: { id: string }) => `- ${r.id}` } as unknown as SourceAdapter;
  expect(formatCredits([rec('hejnal', 'a.wav'), rec('pop', 'b.wav'), rec('hejnal', 'c.wav')], { fake })).toEqual(['- hejnal', '- pop']);
});

describe('getAsset', () => {
  let gets = 0;
  const fake: SourceAdapter = {
    id: 'fake', label: 'fake', category: 'sound', kinds: ['audio'], needsKey: false, limits: [{ n: 100, per: 60 }], summary: '', sample: 'x', card: () => '',
    search: async () => [], check: async () => 'ok', credit: (r) => `- SFX: fake ${r.id} "${r.title}"`,
    get: async (id, ctx) => { gets++; const file = join(ctx.tmpDir, `${id}.wav`); copyFileSync(hot, file); return { file, kind: 'audio', meta: meta('fake', id) }; },
  };
  const config: SourcesConfig = { contact: '', keys: {}, sources: { fake: { enabled: true, options: {} } } };
  const s = () => openSources({ root, config, adapters: { fake }, env: {}, fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
  beforeEach(() => { gets = 0; });

  test('the adapter is told the project frame (frame=WxH) unless --opt gives one', async () => {
    let seen: Record<string, unknown> = {};
    const s2 = () => openSources({ root, config, adapters: { fake: { ...fake, get: async (id, ctx) => { seen = { ...ctx.options }; return fake.get(id, ctx); } } }, env: {}, fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    const m = readProject().meta;
    await getAsset(s2(), dir, 'fake:0801');
    expect(seen.frame).toBe(`${m.width}x${m.height}`);
    await getAsset(s2(), dir, 'fake:0802', { opts: { frame: '640x480' } });
    expect(seen.frame).toBe('640x480');
  });

  test('getting the same asset twice reuses the file and the record', async () => {
    const first = await getAsset(s(), dir, 'fake:0701'), again = await getAsset(s(), dir, 'fake:0701');
    expect([first.reused, again.reused]).toEqual([false, true]);
    expect(again.usage).toBe(first.usage);
    expect(gets).toBe(1);
    expect(readAssetRecords(dir)).toHaveLength(1);
    expect(existsSync(join(dir, 'cache', 'sources', '0701.wav'))).toBe(false);
  });

  test('a segment that cannot be right is refused before anything is downloaded', async () => {
    await expect(getAsset(s(), dir, 'fake:0701', { len: 0 })).rejects.toThrow('--len 要大於 0');
    await expect(getAsset(s(), dir, 'fake:0701', { from: -2 })).rejects.toThrow('--from 不能是負的');
    expect(gets).toBe(0);
  });

  test('other --opt is another download; the same --opt, in any order, the same one', async () => {
    const a = await getAsset(s(), dir, 'fake:0701', { opts: { format: 'wav', q: '1' } });
    expect(a.record.opts).toEqual({ format: 'wav', q: '1' });
    expect((await getAsset(s(), dir, 'fake:0701', { opts: { q: '1', format: 'wav' } })).reused).toBe(true);
    expect((await getAsset(s(), dir, 'fake:0701')).reused).toBe(false);
    expect(gets).toBe(2);
  });

  test('music kept on disk but taken out of project.json is entered again when it is asked for again', async () => {
    const tunes: SourceAdapter = { ...fake, id: 'tunes', kinds: ['music'],
      get: async (id, ctx) => { gets++; const file = join(ctx.tmpDir, `${id}.wav`); copyFileSync(song, file); return { file, kind: 'music', meta: meta('tunes', id) }; } };
    const st = () => openSources({ root, config: { ...config, sources: { tunes: { enabled: true, options: {} } } }, adapters: { tunes }, env: {}, fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    const first = await getAsset(st(), dir, 'tunes:pamgaea');
    const p = readProject(); delete p.media[first.record.mediaId!];
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
    const again = await getAsset(st(), dir, 'tunes:pamgaea');
    expect([again.reused, gets]).toEqual([true, 1]);
    expect(readProject().media[first.record.mediaId!]).toMatchObject({ path: first.record.path });
    expect(readProject().media[first.record.mediaId!].duration).toBeCloseTo(4, 1);
  });

  test('credits are written between the markers and hand-written lines stay', async () => {
    mkdirSync(join(dir, 'media'), { recursive: true });
    writeFileSync(join(dir, 'media', 'CREDITS.md'), '# x credits\n\n- Font: LXGW WenKai\n');
    await getAsset(s(), dir, 'fake:0701');
    await getAsset(s(), dir, 'fake:0702');
    const md = readFileSync(join(dir, 'media', 'CREDITS.md'), 'utf8');
    expect(md).toContain('- Font: LXGW WenKai');
    expect(md).toMatch(/<!-- tellcut assets: begin -->\n下載了但片裡沒用到（不必署名）：\n- SFX: fake 0701 "t-0701"\n- SFX: fake 0702 "t-0702"\n<!-- tellcut assets: end -->/);
    expect(md.match(/tellcut assets: begin/g)).toHaveLength(1);
  });

  test('the credits list what the film uses first and the rest under their own heading; refreshCredits follows the tracks', async () => {
    await getAsset(s(), dir, 'fake:0701');
    await getAsset(s(), dir, 'fake:0702');
    const p = readProject();
    p.tracks.push({ id: 'sfx', kind: 'sfx', items: [{ id: 'x', type: 'core.soundFile', start: 0, end: 1, params: { path: './media/sfx/fake-0702.wav' } }] });
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
    const block = () => readFileSync(join(dir, 'media', 'CREDITS.md'), 'utf8').split('<!-- tellcut assets: begin -->\n')[1].split('<!--')[0];
    expect(block()).toMatch(/^下載了但片裡沒用到/);
    expect(refreshCredits(dir, { adapters: { fake } })).toBe(join(dir, 'media', 'CREDITS.md'));
    expect(block()).toBe('- SFX: fake 0702 "t-0702"\n\n下載了但片裡沒用到（不必署名）：\n- SFX: fake 0701 "t-0701"\n');
  });

  test('photos a block names in a comma list (the tiles of an fx, with @seconds) are used, not listed as unused', () => {
    mkdirSync(join(dir, 'media'), { recursive: true });
    const rec = (n: string) => ({ source: 'pix', ref: `pix:${n}`, sourceId: `pix-${n}`, kind: 'image', path: `media/pix/${n}.jpg`, title: `t-${n}`, author: 'a', page: `https://x/${n}`, license: 'L' });
    writeFileSync(join(dir, 'media', 'assets.json'), JSON.stringify({ version: 1, items: [rec('1'), rec('2'), rec('3')] }));
    const p = readProject();
    p.tracks.push({ id: 'o', kind: 'overlay', items: [{ id: 'w', type: 'fx.tiles', start: 0, end: 4, params: { tiles: 'pix-1@2.5, pix-2' } }] });
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
    refreshCredits(dir, { adapters: {} });
    const block = readFileSync(join(dir, 'media', 'CREDITS.md'), 'utf8').split('<!-- tellcut assets: begin -->\n')[1].split('<!--')[0];
    expect(block).toBe('- "t-1" by a (https://x/1), L\n- "t-2" by a (https://x/2), L\n\n下載了但片裡沒用到（不必署名）：\n- "t-3" by a (https://x/3), L\n');
  });

  test('refreshCredits leaves a project that downloaded nothing alone', () => {
    expect(refreshCredits(dir)).toBeNull();
    expect(existsSync(join(dir, 'media', 'CREDITS.md'))).toBe(false);
  });

  test('a get waits while another process is writing the project\'s records', async () => {
    mkdirSync(join(dir, 'media'), { recursive: true });
    const lock = join(dir, 'media', '.assets.lock');
    writeFileSync(lock, '');
    let done = false;
    const p = getAsset(s(), dir, 'fake:0703').then((r) => { done = true; return r; });
    await new Promise((r) => setTimeout(r, 1500));
    expect([done, readAssetRecords(dir)]).toEqual([false, []]);
    rmSync(lock);
    expect((await p).record.path).toBe('media/sfx/fake-0703.wav');
  });

  test('a ref without a source, or a source that is off, is a sentence', async () => {
    await expect(getAsset(s(), dir, '0701')).rejects.toThrow('編號要像 bbc-sfx:07043376');
    await expect(getAsset(s(), dir, 'nope:1')).rejects.toThrow('沒有「nope」這個來源');
  });
});
