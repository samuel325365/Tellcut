import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { RUN_DIR, startRun, sweepStale } from './test-cleanup.ts';

const VARS = ['TEMP', 'TMP', 'TMPDIR'] as const;

test('this very test runs in a run-private temp folder: the workers inherit what the global setup set', () => {
  expect(basename(tmpdir())).toMatch(RUN_DIR);
  for (const k of ['TEMP', 'TMP'] as const) expect(process.env[k]).toBe(tmpdir());
});

test('a run gets a temp folder of its own and removes only that one: another run’s folder and other programs’ stay', () => {
  const root = mkdtempSync(join(tmpdir(), 'tc-root-')), before = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  const other = join(root, 'tellcut-test-Other1'), loose = join(root, 'cut-a1B2c3');
  mkdirSync(other); writeFileSync(join(other, 'pid'), String(process.pid)); mkdirSync(loose);   // a live concurrent run; a stranger
  const end = startRun(root), dir = tmpdir();
  expect(dirname(dir)).toBe(root);
  expect(basename(dir)).toMatch(RUN_DIR);
  for (const k of VARS) expect(process.env[k]).toBe(dir);
  const work = mkdtempSync(join(tmpdir(), 'cut-'));                                  // what a test (or the code it runs) makes
  writeFileSync(join(work, 'blank.png'), 'x');
  const again = startRun(root);                                                     // a workspace runs the setup once per project
  expect(tmpdir()).toBe(dir);
  again();
  expect(existsSync(work)).toBe(true);                                              // still in use by the other project
  end();
  expect(existsSync(dir)).toBe(false);
  expect([existsSync(other), existsSync(loose)]).toEqual([true, true]);
  for (const k of VARS) expect(process.env[k]).toBe(before[k]);
});

test('a run that died before its teardown is swept by the next one; a live run’s folder never is', () => {
  const root = mkdtempSync(join(tmpdir(), 'tc-root-'));
  const run = (name: string, pid?: number) => { const d = join(root, name); mkdirSync(d); if (pid !== undefined) writeFileSync(join(d, 'pid'), String(pid)); mkdirSync(join(d, 'cut-x1y2z3')); return d; };
  const dead = run('tellcut-test-Dead01', 2 ** 30), live = run('tellcut-test-Live01', process.pid), young = run('tellcut-test-Young1'), other = run('cut-Dead01', 2 ** 30);
  expect(sweepStale(root)).toBe(1);
  expect(readdirSync(root).sort()).toEqual([basename(other), basename(live), basename(young)].sort());   // no pid yet: just made
  expect(existsSync(dead)).toBe(false);
});
