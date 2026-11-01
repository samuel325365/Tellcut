import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lookupProject, projectDirOf } from './project-dir.ts';

const root = mkdtempSync(join(tmpdir(), 'projdir-'));
const make = (id: string) => { mkdirSync(join(root, id), { recursive: true }); writeFileSync(join(root, id, 'project.json'), '{}'); };
make('Demo');
make('_internal');
mkdirSync(join(root, 'empty'));

test('a project is its folder under the folder\'s own spelling only', () => {
  expect(lookupProject(root, 'Demo')).toEqual({ dir: join(root, 'Demo') });
  // NTFS finds Demo for demo: refused, naming the real folder (on a case-sensitive file system it is simply missing)
  expect(lookupProject(root, 'demo')).toEqual(process.platform === 'win32' ? { error: 'case', real: 'Demo' } : { error: 'missing' });
  expect(lookupProject(root, 'nope')).toEqual({ error: 'missing' });
  expect(lookupProject(root, 'empty')).toEqual({ error: 'missing' });   // a folder without project.json
});

test('ids that are no project id: paths, dots, and _ folders unless internal ones are asked for', () => {
  for (const id of ['..', '../x', 'a/b', 'a b', '', '-x', '_internal']) expect(lookupProject(root, id)).toEqual({ error: 'invalid' });
  expect(lookupProject(root, '_internal', { internal: true })).toEqual({ dir: join(root, '_internal') });
  expect(lookupProject(root, '../x', { internal: true })).toEqual({ error: 'invalid' });
});

test('the command line\'s words: the real folder\'s name on a wrong case', () => {
  if (process.platform === 'win32') expect(() => projectDirOf(root, 'DEMO')).toThrow(/資料夾叫「Demo」/);
  expect(() => projectDirOf(root, 'nope')).toThrow(/沒有專案「nope」/);
  expect(() => projectDirOf(root, '../x')).toThrow(/不是專案名稱/);
  try { projectDirOf(root, 'nope'); } catch (e) { expect((e as NodeJS.ErrnoException).code).toBe('ENOPROJECT'); }
});
