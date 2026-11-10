import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProblems } from './test-builds.ts';
import workspace from '../vitest.workspace.ts';

test('the browser tests stop on a missing or stale build and name the command, without building', () => {
  const root = mkdtempSync(join(tmpdir(), 'builds-')), old = new Date(Date.now() - 60_000), now = new Date(), later = new Date(Date.now() + 60_000);
  try {
    for (const d of ['apps/player/src', 'apps/player/dist', 'apps/editor/src', 'apps/editor/dist']) mkdirSync(join(root, d), { recursive: true });
    for (const f of ['apps/player/src/main.ts', 'apps/editor/src/main.tsx']) { writeFileSync(join(root, f), 'x'); utimesSync(join(root, f), old, old); }
    expect(buildProblems(root)).toEqual(['apps/player/dist is missing: run npm run build:player', 'apps/editor/dist is missing: run npm run build:editor']);
    for (const f of ['apps/player/dist/index.html', 'apps/editor/dist/index.html']) { writeFileSync(join(root, f), 'x'); utimesSync(join(root, f), now, now); }
    expect(buildProblems(root)).toEqual([]);
    utimesSync(join(root, 'apps/editor/src/main.tsx'), later, later);
    expect(buildProblems(root)).toEqual(['apps/editor/dist is older than its source: run npm run build:editor']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('only the browser group checks the builds, after the shared global setups', () => {
  const setups = (name: string) => {
    const p = (workspace as { test?: { name?: string; globalSetup?: string | string[] } }[]).find((w) => w.test?.name === name);
    return [p?.test?.globalSetup ?? []].flat();
  };
  expect(setups('fast')).not.toContain('tools/test-builds.ts');
  expect(setups('browser')).toEqual([...setups('fast'), 'tools/test-builds.ts']);
  expect(setups('browser')).toContain('tools/test-cleanup.ts');
});
