// What git keeps (spec 2026-10-22-external-sources §9): the sources code is in git; the user's own footage folder and the
// personal switch file (keys, contact) are not.
import { execFileSync } from 'node:child_process';
import { TELLCUT_ROOT } from '@tellcut/media-node';

/** git check-ignore: exit 0 = ignored, 1 = not ignored */
function ignored(path: string): boolean {
  try { execFileSync('git', ['check-ignore', '-q', path], { cwd: TELLCUT_ROOT, stdio: 'ignore' }); return true; }
  catch (e) { if ((e as { status?: number }).status === 1) return false; throw e; }
}

test('the sources code is in git, the personal switch file and root sources/ are not', () => {
  expect(ignored('packages/media-node/src/sources/index.ts')).toBe(false);
  expect(ignored('packages/media-node/src/sources/bbc/card.md')).toBe(false);
  expect(ignored('sources.json')).toBe(false);
  expect(ignored('sources.local.json')).toBe(true);
  expect(ignored('sources/input_x/a.mp4')).toBe(true);
});
