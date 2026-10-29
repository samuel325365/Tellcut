import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { makeClicks, makePhoto } from '@tellcut/media-node';
import { makeProjects, startApp } from './test-utils.ts';

let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, projects: string, src: string;

beforeAll(async () => {
  src = mkdtempSync(join(tmpdir(), 'imp-'));
  await makePhoto(join(src, 'pic.jpg'), { w: 640, h: 480 });
  await makeClicks(join(src, 'song.wav'), { seconds: 2 });
  writeFileSync(join(src, 'notes.txt'), 'x');
  projects = makeProjects();
  ({ app, base } = await startApp({ projectsDir: projects }));
}, 120000);
afterAll(async () => { await app?.close(); });

/** the import's NDJSON lines */
async function post(body: unknown): Promise<{ status: number; lines: any[]; json?: any }> {
  const r = await fetch(`${base}/api/projects/demo/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!(r.headers.get('content-type') ?? '').includes('ndjson')) return { status: r.status, lines: [], json: JSON.parse(text) };
  return { status: r.status, lines: text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) };
}
const projectFile = () => readFileSync(join(projects, 'demo', 'project.json'), 'utf8');

test('imports photos and sound without touching project.json; progress comes first, the other files are counted with the result', async () => {
  const before = projectFile();
  const { status, lines } = await post({ paths: [src], taken: ['src'], have: [] });
  expect(status).toBe(200);
  const last = lines.at(-1);
  expect(lines.filter((l) => l.progress !== undefined).at(-1)).toEqual({ progress: 2, total: 2 });
  expect(last.done).toBe(true);
  expect(last.sources.pic).toMatchObject({ kind: 'image', width: 640, height: 480, path: relative(join(projects, 'demo'), join(src, 'pic.jpg')).split('\\').join('/') });
  expect(Object.keys(last.media)).toEqual(['song']);
  expect([last.skipped, last.others]).toEqual([[], 1]);   // notes.txt
  expect(projectFile()).toBe(before);
}, 60000);

test('a file the project has (in any case on Windows) is reported as already there; ids stay clear of the taken ones', async () => {
  const rel = relative(join(projects, 'demo'), join(src, 'pic.jpg')).split('\\').join('/');
  const have = [{ id: 'pic', path: process.platform === 'win32' ? rel.toUpperCase() : rel }];
  const { lines } = await post({ paths: [join(src, 'pic.jpg'), join(src, 'song.wav')], taken: ['pic', 'song'], have });
  const last = lines.at(-1);
  expect(last.same).toEqual([{ path: join(src, 'pic.jpg'), id: 'pic' }]);
  expect(last.sources).toEqual({});
  expect(Object.keys(last.media)).toEqual(['song-2']);
}, 60000);

test('relative paths and too many files are refused before anything is read (the walk stops at the first one past the limit); a URL is left out', async () => {
  const rel = await post({ paths: ['rel/x.mp4'], taken: [], have: [] });
  expect([rel.status, rel.json.code]).toEqual([400, 'fs.notAbsolute']);
  const many = mkdtempSync(join(tmpdir(), 'imp-many-'));
  mkdirSync(join(many, 'side'));
  for (let i = 0; i < 201; i++) writeFileSync(join(many, `p${i}.jpg`), 'x');
  for (let i = 0; i < 50; i++) writeFileSync(join(many, 'side', `p${i}.xmp`), 'x');   // sidecar files do not count
  const tooMany = await post({ paths: [many], taken: [], have: [] });
  expect([tooMany.status, tooMany.json.code, tooMany.json.params]).toEqual([400, 'import.tooMany', { n: '200+', max: 200 }]);
  const url = await post({ paths: ['https://example.com/v.mp4'], taken: [], have: [] });
  expect(url.lines.at(-1)).toMatchObject({ done: true, sources: {}, media: {}, skipped: [{ code: 'import.url' }] });
  const bad = await post({ paths: 'x' });
  expect(bad.status).toBe(400);
}, 60000);

test('a drive root: its system and hidden folders are passed over, so what they hold neither counts nor is listed', async () => {
  const drive = mkdtempSync(join(tmpdir(), 'imp-drive-'));
  for (const sub of ['$RECYCLE.BIN', 'System Volume Information', '.trash']) {
    mkdirSync(join(drive, sub));
    for (let i = 0; i < 201; i++) writeFileSync(join(drive, sub, `p${i}.jpg`), 'x');
  }
  copyFileSync(join(src, 'pic.jpg'), join(drive, 'pic.jpg'));
  const { lines } = await post({ paths: [drive], taken: [], have: [] });
  expect(lines.at(-1)).toMatchObject({ done: true, skipped: [], others: 0 });
  expect(Object.keys(lines.at(-1).sources)).toEqual(['pic']);
}, 60000);
