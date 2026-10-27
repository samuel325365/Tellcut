import { existsSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listExports, nextExportBase } from './exports.ts';

test('every film goes to exports/<name>-<time>: a second one in the same minute gets -2; the list is newest first, without intermediates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exps-')), at = new Date(2026, 9, 20, 21, 5);
  const first = nextExportBase(dir, '京都:一日', 'kyoto', at);
  expect(first).toBe(join(dir, 'exports', '京都_一日-20261020-2105'));
  expect(readFileSync(`${first}.log`, 'utf8')).toBe('');                         // reserved at once: a render writes its .video.mp4 for minutes
  expect(nextExportBase(dir, '京都:一日', 'kyoto', at)).toBe(`${first}-2`);      // a second render meanwhile (CLI and editor) gets its own
  writeFileSync(`${first}.mp4`, 'a');
  expect(nextExportBase(dir, ' . ', 'kyoto', at)).toBe(join(dir, 'exports', 'kyoto-20261020-2105'));
  writeFileSync(`${first}-2.mp4`, 'bb'); writeFileSync(`${first}-3.video.mp4`, 'x');
  writeFileSync(`${first}-4.mp4`, 'old'); utimesSync(`${first}-4.mp4`, new Date(500), new Date(500));   // a film whose log was deleted
  expect(nextExportBase(dir, '京都:一日', 'kyoto', at)).toBe(`${first}-5`);   // -3: an intermediate in the way
  expect(nextExportBase(dir, '京都:一日', 'kyoto', at)).toBe(`${first}-6`);
  utimesSync(`${first}.mp4`, new Date(1000), new Date(1000));
  expect(listExports(dir).map((e) => e.name)).toEqual(['京都_一日-20261020-2105-2.mp4', '京都_一日-20261020-2105.mp4', '京都_一日-20261020-2105-4.mp4']);
  expect(existsSync(join(dir, 'exports'))).toBe(true);
  expect(listExports(join(dir, 'none'))).toEqual([]);
});
