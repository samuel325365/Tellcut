// Every command line takes a project the way the server does (media-node project-dir.ts): the folder's own spelling only.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TELLCUT_ROOT } from '@tellcut/media-node';
import { assetsCommand } from './assets.ts';
import { libraryCommand } from './library.ts';
import { projectArg } from './project-arg.ts';
import { Usage } from './usage.ts';

const win = process.platform === 'win32';

test('projectArg: no id is the usage; a wrong case names the real folder', () => {
  const root = mkdtempSync(join(tmpdir(), 'projarg-'));
  mkdirSync(join(root, 'Trip'));
  writeFileSync(join(root, 'Trip', 'project.json'), '{}');
  expect(() => projectArg(undefined, 'usage!', { projectsDir: root })).toThrow(Usage);
  expect(() => projectArg('--force', 'usage!', { projectsDir: root })).toThrow(Usage);
  expect(projectArg('Trip', 'usage!', { projectsDir: root })).toBe(join(root, 'Trip'));
  if (win) expect(() => projectArg('trip', 'usage!', { projectsDir: root })).toThrow(/資料夾叫「Trip」/);
});

test('library and assets refuse a project id spelled another way', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'projarg-'));
  mkdirSync(join(projects, 'Trip'));
  writeFileSync(join(projects, 'Trip', 'project.json'), '{}');
  if (!win) return;
  await expect(libraryCommand(['use', 'trip', 'x'], { projects, thumb: false })).rejects.toThrow(/資料夾叫「Trip」/);
  await expect(assetsCommand(['credits', 'TRIP'], { projectsDir: projects })).rejects.toThrow(/資料夾叫「Trip」/);
});

// the scripts run at their top level (cut, check, inspect, export-project…) exit 2 with the same words
test.runIf(win)('npm run cut / tellcut with the wrong case: refused, before anything runs', () => {
  const id = `_CaseTest-${process.pid}`, dir = join(TELLCUT_ROOT, 'projects', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'project.json'), '{}');
  writeFileSync(join(dir, 'cut.ts'), 'throw new Error("ran")');
  try {
    const run = (...args: string[]) => spawnSync(process.execPath, [join(TELLCUT_ROOT, 'node_modules/tsx/dist/cli.mjs'), ...args], { cwd: TELLCUT_ROOT, encoding: 'utf8' });
    const cut = run('tools/cut.ts', id.toLowerCase());
    expect(cut.status).toBe(2);
    expect(cut.stderr).toContain(`資料夾叫「${id}」`);
    const show = run('tools/tellcut.ts', 'show', id.toUpperCase());
    expect(show.status).toBe(1);
    expect(show.stderr).toContain(`資料夾叫「${id}」`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60000);
