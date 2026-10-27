import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from './ingest.ts';
import { PROJECT_HISTORY_KEEP, projectHash, updateProjectFile, writeProjectFile } from './projectfile.ts';

test('every write keeps the old version in .history (in write order, even within a millisecond) and only the newest 20 stay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-'));
  for (let i = 0; i < 25; i++) writeProjectFile(dir, { v: i }, 'cut');
  const hist = readdirSync(join(dir, '.history')).sort();
  expect(hist).toHaveLength(PROJECT_HISTORY_KEEP);
  expect(hist.map((f) => JSON.parse(readFileSync(join(dir, '.history', f), 'utf8')).v)).toEqual(Array.from({ length: 20 }, (_, i) => i + 4));
  expect(hist.every((f) => f.endsWith('_cut.json'))).toBe(true);
});

test('it hands back the hash of what it wrote', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-'));
  expect(writeProjectFile(dir, { v: 1 }, 'new')).toBe(projectHash(readFileSync(join(dir, 'project.json'), 'utf8')));
});

test('updateProjectFile starts over when project.json changed under it', async () => {
  const projectsDir = mkdtempSync(join(tmpdir(), 'pf-')), dir = join(projectsDir, 'p');
  await createProject({ id: 'p', inputs: [], projectsDir, blank: true });
  let first = true, calls = 0;
  updateProjectFile(dir, (p) => {
    calls++;
    if (first) { first = false; writeFileSync(join(dir, 'project.json'), JSON.stringify({ ...p, meta: { ...p.meta, name: 'by-editor' } })); }
    p.media.x = { path: 'media/x.wav', duration: 1 };
  }, 'assets');
  const now = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  expect([now.meta.name, now.media.x.path, calls]).toEqual(['by-editor', 'media/x.wav', 2]);
});
