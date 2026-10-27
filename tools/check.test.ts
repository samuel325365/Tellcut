// The check command end to end on its model layer (--quick: no player, no Chrome): the edge check reads the analysis's
// cuts.json (review3, the only wiring edges.test.ts cannot see).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analysisFiles, TELLCUT_ROOT } from '@tellcut/media-node';

const id = '_test-check-edges', dir = join(TELLCUT_ROOT, 'projects', id);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('check --quick reports a clip edge running into the shot change cuts.json has for its source', () => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'src.mp4'), 'not decoded: --quick only needs the file to exist (the analysis is keyed by size and time)');
  const crop = { x: 0.5, y: 0.5, zoom: 1 };
  writeFileSync(join(dir, 'project.json'), JSON.stringify({
    version: 1, meta: { name: 't', width: 1080, height: 1920, fps: 30, duration: 2, plugins: [],
      mix: { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } } },
    sources: { s: { path: 'src.mp4', duration: 30, width: 1280, height: 720 } }, media: {}, grids: [],
    tracks: [{ id: 'v1', kind: 'video', items: [{ id: 'c', source: 's', in: 9.9, speed: 1, start: 0, end: 2, crop: { from: crop, to: crop } }] }],
  }));
  const f = analysisFiles(dir, join(dir, 'src.mp4'));
  mkdirSync(f.dir, { recursive: true });
  writeFileSync(f.cuts, JSON.stringify([10, 20]));
  let out: string;
  try { out = execFileSync(process.execPath, [join(TELLCUT_ROOT, 'node_modules/tsx/dist/cli.mjs'), join(TELLCUT_ROOT, 'tools/check.ts'), id, '--quick'], { cwd: TELLCUT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = String((e as { stdout?: string }).stdout ?? e); }   // exit 1 on an unrelated error still prints the report
  expect(out).toContain('在 0:10.00 換鏡頭');
});
