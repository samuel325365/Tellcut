import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '@tellcut/media-node';
import { demoProject, makeProjects, startApp } from './test-utils.ts';

test('serves the editor at /editor/ and redirects / to it', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'ed-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>editor</title>');
  const { app, base } = await startApp({ projectsDir: makeProjects(), editorDist: dist });
  try {
    const r = await fetch(`${base}/`, { redirect: 'manual' });
    expect([r.status, r.headers.get('location')]).toEqual([302, '/editor/']);
    const e = await fetch(`${base}/editor/`);
    expect([e.status, e.headers.get('content-type')]).toEqual([200, 'text/html; charset=utf-8']);
    expect((await fetch(`${base}/editor/..%2f..%2fpackage.json`)).status).toBe(404);
    // the genre table page is gone (the genres are guides/genres/*.md for the agent)
    expect((await fetch(`${base}/genres/`)).status).toBe(404);
  } finally { await app.close(); }
});

test('music peaks are computed once per media file', async () => {
  const root = makeProjects();
  mkdirSync(join(root, 'demo', 'media'), { recursive: true });
  await run(['-f', 'lavfi', '-i', 'sine=duration=2', join(root, 'demo', 'media', 'tone.wav')]);
  writeFileSync(join(root, 'demo', 'project.json'), JSON.stringify(demoProject({ media: { m1: { path: 'media/tone.wav' }, gone: { path: 'media/x.mp3' } } })));
  const { app, base } = await startApp({ projectsDir: root });
  try {
    const p = await (await fetch(`${base}/api/projects/demo/media/music-peaks/m1`)).json();
    expect(p.rate).toBe(100);
    expect(Math.abs(p.peaks.length - 200)).toBeLessThanOrEqual(2);
    expect(Math.max(...p.peaks)).toBeCloseTo(0.125, 1);
    expect((await fetch(`${base}/api/projects/demo/media/music-peaks/nope`)).status).toBe(404);
    const g = await fetch(`${base}/api/projects/demo/media/music-peaks/gone`);
    expect([g.status, (await g.json()).offline]).toEqual([404, true]);
  } finally { await app.close(); }
}, 60000);
