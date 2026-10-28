import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject, expandInputs, ingestFiles, sourceId } from './ingest.ts';
import { makeClicks, makeHeic, makePhoneVideo, makePhoto } from './test-media.ts';

const root = mkdtempSync(join(tmpdir(), 'ingest-')), src = join(root, 'trip'), projects = join(root, 'projects');

beforeAll(async () => {
  mkdirSync(join(src, 'day2'), { recursive: true });
  await makePhoneVideo(join(src, 'clip.mp4'), { created: '2026-03-07T01:12:00Z' });
  await makePhoto(join(src, '京都.jpg'), { w: 1200, h: 900, orientation: 6, taken: '2026:03:07 10:30:00', gps: [35, 135.7] });
  await makePhoto(join(src, '大阪.jpg'), { w: 800, h: 600, taken: '2026:03:08 09:00:00' });
  await makeHeic(join(src, 'day2', 'IMG_0001.HEIC'), { w: 600, h: 800, taken: '2026:03:08 11:00:00' });
  await makeClicks(join(src, 'song.wav'), { seconds: 4 });
  writeFileSync(join(src, 'notes.txt'), 'x');
}, 180000);

test('source ids are plain, unique and valid whatever the file names', () => {
  const used = new Set<string>();
  expect([sourceId('IMG_0001.JPG', used), sourceId('img_0001.jpg', used), sourceId('京都.jpg', used), sourceId('大阪.jpg', used), sourceId('-x.mp4', used)])
    .toEqual(['img_0001', 'img_0001-2', 'src', 'src-2', 'x']);
});

test('a folder and a URL become a project: photos (HEIC converted), videos, music, four empty tracks; portrait wins', async () => {
  const download = async (_url: string, dir: string) => { const f = join(dir, 'downloaded.wav'); copyFileSync(join(src, 'song.wav'), f); return f; };
  const r = await createProject({ id: 'trip', inputs: [src, 'https://example.com/v'], projectsDir: projects, download });
  const p = r.project;
  expect(Object.keys(p.sources).sort()).toEqual(['clip', 'img_0001', 'src', 'src-2']);
  expect(p.sources.clip).toMatchObject({ kind: 'video', width: 360, height: 640, audio: true, path: '../../trip/clip.mp4' });
  expect(p.sources.src).toMatchObject({ kind: 'image', width: 900, height: 1200, taken: '2026-03-07T10:30:00', gps: [35, 135.7], duration: 3600 });
  expect(p.sources.img_0001).toMatchObject({ kind: 'image', path: 'media/IMG_0001.jpg', taken: '2026-03-08T11:00:00' });
  expect(Object.keys(p.media).sort()).toEqual(['downloaded', 'song']);
  expect([p.meta.width, p.meta.height, p.meta.fps]).toEqual([1080, 1920, 30]);
  expect(p.tracks.map((t) => [t.id, t.kind])).toEqual([['v1', 'video'], ['text', 'overlay'], ['music', 'music'], ['orig', 'audio']]);
  expect(r.skipped.some((s) => s.includes('notes.txt'))).toBe(true);
  expect(existsSync(join(projects, 'trip', 'media', 'IMG_0001.jpg'))).toBe(true);
}, 180000);

test('ingestFiles registers the same entries as a new project, with ids clear of the taken ones', async () => {
  const used = new Set(['clip']);
  const r = await ingestFiles(join(projects, 'x'), expandInputs([src]).files, used);
  expect(Object.keys(r.sources).sort()).toEqual(['clip-2', 'img_0001', 'src', 'src-2']);
  expect(r.music.song).toEqual({ path: '../../trip/song.wav' });
  expect(r.sources['clip-2']).toMatchObject({ kind: 'video', width: 360, height: 640, audio: true, path: '../../trip/clip.mp4' });
  expect(r.sources.src).toMatchObject({ kind: 'image', width: 900, height: 1200, taken: '2026-03-07T10:30:00', gps: [35, 135.7], duration: 3600 });
  expect(r.skipped.map((s) => s.code)).toEqual(['import.notMedia']);
  expect(r.skipped[0].message).toContain('notes.txt');
  expect(used.has('clip-2')).toBe(true);
}, 180000);

test('expandInputs walks folders once, drops repeats and reports missing paths', () => {
  const clip = join(src, 'clip.mp4');
  const r = expandInputs([src, process.platform === 'win32' ? clip.toUpperCase() : clip, join(src, 'nope.mp4')]);
  expect(r.files.filter((f) => f.toLowerCase() === clip.toLowerCase())).toHaveLength(1);
  expect(r.files.some((f) => f.endsWith('IMG_0001.HEIC'))).toBe(true);
  expect(r.skipped.map((s) => s.code)).toEqual(['import.notFound']);
});

test('an existing project is kept unless --force; then the old one goes to .history', async () => {
  await expect(createProject({ id: 'trip', inputs: [src], projectsDir: projects })).rejects.toThrow(/already exists/);
  await createProject({ id: 'trip', inputs: [join(src, '大阪.jpg')], projectsDir: projects, force: true, size: [1920, 1080] });
  expect(readdirSync(join(projects, 'trip', '.history')).some((f) => f.endsWith('_new.json'))).toBe(true);
  await expect(createProject({ id: 'bad id', inputs: [src], projectsDir: projects })).rejects.toThrow(/Invalid project id/);
  await expect(createProject({ id: 'empty', inputs: [join(src, 'notes.txt')], projectsDir: projects })).rejects.toThrow(/No usable media/);
}, 180000);

test('a blank project has no footage: an animated explainer made from blocks, narration and a score (R3-H4)', async () => {
  const r = await createProject({ id: 'explainer', inputs: [], projectsDir: projects, blank: true, size: [1080, 1920], name: '解說' });
  expect(r.project.sources).toEqual({});
  expect([r.project.meta.width, r.project.meta.height, r.project.meta.name]).toEqual([1080, 1920, '解說']);
  expect((await createProject({ id: 'explainer2', inputs: [], projectsDir: projects, blank: true })).project.meta.width).toBe(1920);
  await expect(createProject({ id: 'nothing', inputs: [], projectsDir: projects })).rejects.toThrow(/No usable media/);
});
