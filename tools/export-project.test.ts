import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPlan, exportProject, importProject } from './export-project.ts';

/** a tellcut/ with one project whose footage is partly inside it and partly on another folder */
function world() {
  const root = mkdtempSync(join(tmpdir(), 'exp-')), tellcut = join(root, 'tellcut'), dir = join(tellcut, 'projects', 'trip');
  for (const d of ['fx', 'score', 'media/voice', '.history/chat', 'cache', 'exports']) mkdirSync(join(dir, d), { recursive: true });
  mkdirSync(join(root, 'footage'), { recursive: true });
  const project = { version: 1, meta: { name: '旅行' }, sources: { a: { path: '../../../footage/a.mp4' }, b: { path: 'media/b.mp4' } }, media: { v: { path: 'media/voice/1.wav' } }, tracks: [] };
  const put = (f: string, s = f) => writeFileSync(join(dir, f), s);
  put('project.json', JSON.stringify(project)); put('cut.ts'); put('narration.json'); put('storyboard.md'); put('fx/ring.js'); put('score/waltz.js');
  put('media/b.mp4'); put('media/voice/1.wav'); put('.history/chat/chat.json'); put('.history/chat/chat.json.lock'); put('.history/chat/chat.json.123.tmp'); put('cache/proxy.mp4'); put('cache/cut-state.json'); put('exports/film.mp4');   // the lock and .tmp: a chat turn running as it was zipped
  writeFileSync(join(root, 'footage', 'a.mp4'), 'footage a');
  return { root, tellcut, dir };
}

test('what an export holds: the project\'s own files and history; --media adds media/ and footage from outside, rewritten to sit inside', () => {
  const { dir } = world(), project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const own = exportPlan(dir, project, { media: false });
  // cut-state.json goes too: without it the imported project's next cut wrote over the editor's edits without asking
  expect(own.files.map((f) => f.to).sort()).toEqual(['.history/chat/chat.json', 'cache/cut-state.json', 'cut.ts', 'fx/ring.js', 'narration.json', 'score/waltz.js', 'storyboard.md']);
  expect(own.project).toEqual(project);                                       // paths untouched: the footage is not in the zip
  expect(own.outside).toEqual(['a']);
  const all = exportPlan(dir, project, { media: true });
  expect(all.files.map((f) => f.to)).toEqual(expect.arrayContaining(['media/b.mp4', 'media/voice/1.wav', 'media/linked/a-a.mp4']));
  expect(all.files.map((f) => f.to).some((t) => (t.startsWith('cache/') && t !== 'cache/cut-state.json') || t.startsWith('exports/'))).toBe(false);   // remade / the films themselves
  expect(all.project.sources!.a.path).toBe('media/linked/a-a.mp4');
  expect(all.project.sources!.b.path).toBe('media/b.mp4');
});

test('export then import: the project comes back whole under its id or a new one; an existing project is never overwritten', () => {
  const { root, tellcut, dir } = world();
  const zip = exportProject(dir, { media: true, out: join(root, 'trip.zip') });
  expect(existsSync(zip)).toBe(true);
  const other = join(root, 'other-tellcut', 'projects');
  mkdirSync(other, { recursive: true });
  const back = importProject(zip, other);
  expect(back).toBe(join(other, 'trip'));
  expect(JSON.parse(readFileSync(join(back, 'project.json'), 'utf8')).sources.a.path).toBe('media/linked/a-a.mp4');
  expect(readFileSync(join(back, 'media/linked/a-a.mp4'), 'utf8')).toBe('footage a');
  expect(readFileSync(join(back, 'storyboard.md'), 'utf8')).toBe('storyboard.md');
  expect(() => importProject(zip, other)).toThrow('trip');
  expect(importProject(zip, other, 'trip-2')).toBe(join(other, 'trip-2'));
  expect(() => importProject(zip, join(tellcut, 'projects'), 'bad id!')).toThrow();
});

test('a project not edited since its last cut is still unedited after export and import (--media rewrites its paths); an edited one stays edited', async () => {
  const { editedSinceCut } = await import('./cut/cut.ts');
  const { createHash } = await import('node:crypto');
  const { root, dir } = world();
  // as the cut leaves it: project.json written with its newline and cut-state.json holding that text's hash
  const text = JSON.stringify(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')), null, 2) + '\n';
  writeFileSync(join(dir, 'project.json'), text);
  writeFileSync(join(dir, 'cache/cut-state.json'), JSON.stringify({ hash: createHash('sha1').update(text).digest('hex') }));
  expect(editedSinceCut(dir)).toBe(false);
  for (const media of [false, true]) {
    const back = importProject(exportProject(dir, { media, out: join(root, `clean-${media}.zip`) }), join(root, `clean-${media}`));
    expect(editedSinceCut(back)).toBe(false);
  }
  writeFileSync(join(dir, 'project.json'), text.replace('旅行', '旅行（改過）'));
  expect(editedSinceCut(dir)).toBe(true);
  const back = importProject(exportProject(dir, { media: true, out: join(root, 'edited.zip') }), join(root, 'edited'));
  expect(editedSinceCut(back)).toBe(true);
});
