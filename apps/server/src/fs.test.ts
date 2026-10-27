import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
    const codes = ['desktop', 'downloads', 'videos', 'pictures', 'documents', 'music', 'sources', 'drive', 'root'];
    for (const x of p.places) { expect(codes).toContain(x.key); expect(typeof x.label).toBe('string'); }
    if (process.platform === 'win32') {
      const d = p.places.find((x: any) => x.key === 'drive');
      expect(d.drive).toMatch(/^[A-Z]$/);
    }
  } finally { await app.close(); }
});
