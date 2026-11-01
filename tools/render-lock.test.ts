// The command line's render takes the project's export lock as the server's export does (media-node exports.ts exportLock):
// one held by another live process (a server exporting the project) refuses the render and batch:render before they write
// anything. No Chrome: the project's source is missing, so a render that does start fails in its prepare step.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportLock, TELLCUT_ROOT } from '@tellcut/media-node';

const id = `_render-lock-${process.pid}`, dir = join(TELLCUT_ROOT, 'projects', id);
const tsx = (...args: string[]) => spawnSync(process.execPath, [join(TELLCUT_ROOT, 'node_modules/tsx/dist/cli.mjs'), ...args], { cwd: TELLCUT_ROOT, encoding: 'utf8' });
let other: ChildProcess;

beforeAll(() => {
  mkdirSync(join(dir, 'cache'), { recursive: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify({
    version: 1,
    meta: { name: 'lock', width: 320, height: 180, fps: 30, duration: 1, plugins: [], cut: { crf: 23, preset: 'ultrafast' },
      mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } } },
    sources: { s1: { path: 'missing.mp4', duration: 4, width: 320, height: 180 } }, media: {}, grids: [],
    tracks: [{ id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 1, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] }],
  }));
  other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)']);   // "the server exporting it": a live process, not this one
});
afterAll(() => { other.kill(); rmSync(dir, { recursive: true, force: true }); });

const held = () => writeFileSync(exportLock(dir), JSON.stringify({ pid: other.pid, started: Date.now() }));

test('render and batch:render refuse a project another process is exporting, before writing anything', () => {
  held();
  const r = tsx('tools/render.ts', '--project', id);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('正在別處輸出');
  expect(r.stderr).toContain(String(other.pid));
  const b = tsx('tools/batch/render.ts', id);
  expect(b.status).toBe(2);
  expect(b.stderr).toContain('正在別處輸出');
  expect(existsSync(join(dir, 'exports'))).toBe(false);
  expect(JSON.parse(readFileSync(exportLock(dir), 'utf8')).pid).toBe(other.pid);   // the other one's lock stays
}, 60000);

test('a render takes over a stale lock (its process is gone) and lets it go when it ends', () => {
  writeFileSync(exportLock(dir), JSON.stringify({ pid: 999999, started: 1 }));   // its process is gone
  const r = tsx('tools/render.ts', '--project', id);
  expect(r.status).toBe(1);                       // the prepare step fails: the source is missing
  expect(r.stderr + r.stdout).toMatch(/missing\.mp4/);
  expect(existsSync(exportLock(dir))).toBe(false);
}, 60000);
