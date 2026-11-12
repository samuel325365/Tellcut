import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from './ingest.ts';
import { PROJECT_HISTORY_KEEP, projectHash, updateProjectFile, writeProjectFile } from './projectfile.ts';

// another writer pruning at the same time: readdirSync names a version already gone, or one held open (EPERM on Windows)
const race = vi.hoisted(() => ({ gone: [] as string[], held: [] as string[] }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    readdirSync: ((p: any, o?: any) => { const r = real.readdirSync(p, o) as any[]; return race.gone.length && !o ? [...race.gone, ...r] : r; }) as typeof real.readdirSync,
    rmSync: ((p: any, o?: any) => { if (race.held.some((n) => String(p).endsWith(n))) throw Object.assign(new Error(`EPERM: ${p}`), { code: 'EPERM' }); return real.rmSync(p, o); }) as typeof real.rmSync,
  };
});
afterEach(() => { race.gone.length = 0; race.held.length = 0; });

test('a version another writer pruned first, or one held open, does not fail a save that happened', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-'));
  for (let i = 0; i < PROJECT_HISTORY_KEEP + 1; i++) writeProjectFile(dir, { v: i }, 'cut');
  race.gone.push('0000-already-pruned_cut.json');
  expect(() => writeProjectFile(dir, { v: 'gone' }, 'cut')).not.toThrow();
  race.gone.length = 0;
  race.held.push(readdirSync(join(dir, '.history')).sort()[0]);
  expect(() => writeProjectFile(dir, { v: 'held' }, 'cut')).not.toThrow();
  expect(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).v).toBe('held');
});

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
