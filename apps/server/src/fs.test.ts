import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeProjects, startApp } from './test-utils.ts';

test('the import browser lists a folder: folders first, media marked by kind, hidden entries left out; places include the drives', async () => {
  const d = mkdtempSync(join(tmpdir(), 'fs-'));
  mkdirSync(join(d, 'Trip')); mkdirSync(join(d, '.secret'));
  writeFileSync(join(d, 'b.MP4'), 'xx'); writeFileSync(join(d, 'a.jpg'), 'x'); writeFileSync(join(d, 'song.mp3'), 'x'); writeFileSync(join(d, 'notes.txt'), 'x'); writeFileSync(join(d, '.DS_Store'), 'x');
  const { app, base } = await startApp({ projectsDir: makeProjects() });
  try {
    const r = await (await fetch(`${base}/api/fs/list?path=${encodeURIComponent(d)}`)).json();
    expect(r.path).toBe(d);
    expect(r.entries.map((e: any) => [e.name, e.kind])).toEqual([['Trip', 'dir'], ['a.jpg', 'image'], ['b.MP4', 'video'], ['notes.txt', 'other'], ['song.mp3', 'audio']]);
    expect(r.entries.find((e: any) => e.name === 'b.MP4').size).toBe(2);
    expect(r.parent).toBe(join(d, '..'));
    const gone = await fetch(`${base}/api/fs/list?path=${encodeURIComponent(join(d, 'nope'))}`);
    expect([gone.status, (await gone.json()).code]).toEqual([404, 'fs.notFound']);
    const rel = await fetch(`${base}/api/fs/list?path=relative/dir`);
    expect([rel.status, (await rel.json()).code]).toEqual([400, 'fs.notAbsolute']);
    const p = await (await fetch(`${base}/api/fs/places`)).json();
    expect(p.places.length).toBeGreaterThan(0);
    for (const x of p.places) expect(typeof x.path).toBe('string');
    if (process.platform === 'win32') expect(p.places.some((x: any) => /^[A-Z]:\\$/.test(x.path))).toBe(true);
  } finally { await app.close(); }
});

test('the project list says which frame to show as each project\'s thumbnail', async () => {
  const dir = makeProjects();
  writeFileSync(join(dir, 'demo', 'src.mp4'), '');   // the footage is there (a missing one gets no thumbnail)
  const { app, base } = await startApp({ projectsDir: dir });
  try {
    const list = await (await fetch(`${base}/api/projects`)).json();
    expect(list[0]).toMatchObject({ id: 'demo', poster: { source: 's1', t: expect.any(Number) } });
    expect(list[0].poster.t).toBeGreaterThanOrEqual(0.5);
  } finally { await app.close(); }
});

test('places carry a code (and the drive letter) so the page can word them in its own language', async () => {
  const { app, base } = await startApp({ projectsDir: makeProjects() });
  try {
    const p = await (await fetch(`${base}/api/fs/places`)).json();
    const codes = ['desktop', 'downloads', 'videos', 'pictures', 'documents', 'music', 'sources', 'drive', 'volume', 'root'];
    for (const x of p.places) { expect(codes).toContain(x.key); expect(typeof x.label).toBe('string'); }
    if (process.platform === 'win32') {
      const d = p.places.find((x: any) => x.key === 'drive');
      expect(d.drive).toMatch(/^[A-Z]$/);
    }
    // macOS: the startup disk's own entry in /Volumes (a link to /) is not listed twice
    if (process.platform === 'darwin') for (const v of p.places.filter((x: any) => x.key === 'volume')) expect(v.path).toMatch(/^\/Volumes\/[^/]+$/);
    if (process.platform === 'darwin' && existsSync(join(homedir(), 'Movies'))) expect(p.places.find((x: any) => x.key === 'videos')?.path).toBe(join(homedir(), 'Movies'));
  } finally { await app.close(); }
});

test('a place that does not answer (a network drive gone) is left out after a moment and not asked again while stuck', async () => {
  const { places } = await import('./fs.ts');
  const asked: string[] = [];
  const probe = (p: string) => { asked.push(p); return p.endsWith('Desktop') ? new Promise<string>(() => {}) : Promise.resolve(p); };
  const t0 = Date.now(), first = await places({ probe, ms: 200 });
  expect(Date.now() - t0).toBeLessThan(2000);
  expect(first.map((x) => x.key)).not.toContain('desktop');
  expect(first.map((x) => x.key)).toContain('downloads');
  await places({ probe, ms: 200 });
  expect(asked.filter((p) => p.endsWith('Desktop'))).toHaveLength(1);
});

test('a link to a folder (a junction on Windows) is listed as a folder to open', async () => {
  const { listFolder } = await import('./fs.ts');
  const { symlinkSync } = await import('node:fs');
  const d = mkdtempSync(join(tmpdir(), 'fs-'));
  mkdirSync(join(d, 'real'));
  symlinkSync(join(d, 'real'), join(d, 'linked'), 'junction');
  writeFileSync(join(d, 'clip.mp4'), 'xyz');
  expect((await listFolder(d)).entries).toEqual([{ name: 'linked', kind: 'dir' }, { name: 'real', kind: 'dir' }, { name: 'clip.mp4', kind: 'video', size: 3 }]);
});

test('listFolder does not block: a big folder comes back as a promise, every entry in order with its size; a file is not a folder', async () => {
  const { listFolder } = await import('./fs.ts');
  const d = mkdtempSync(join(tmpdir(), 'fs-'));
  for (let i = 0; i < 120; i++) writeFileSync(join(d, `clip${i}.mp4`), 'x'.repeat(i));
  mkdirSync(join(d, 'sub'));
  const pending = listFolder(d);
  expect(pending).toBeInstanceOf(Promise);
  const r = await pending;
  expect(r.entries.length).toBe(121);
  expect(r.entries[0]).toEqual({ name: 'sub', kind: 'dir' });
  expect(r.entries[1]).toEqual({ name: 'clip0.mp4', kind: 'video', size: 0 });
  expect(r.entries.at(-1)).toEqual({ name: 'clip119.mp4', kind: 'video', size: 119 });
  await expect(listFolder(join(d, 'clip3.mp4'))).rejects.toMatchObject({ status: 400, body: { code: 'fs.notDir' } });
});
