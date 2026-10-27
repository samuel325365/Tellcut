import { linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renameRetry, replaceFile } from './fsutil.ts';

const busy = (code: string) => Object.assign(new Error(code), { code });

test('a rename blocked for a moment (Windows file lock) is retried until it works', () => {
  let calls = 0;
  renameRetry('a', 'b', () => { if (++calls < 3) throw busy('EPERM'); });
  expect(calls).toBe(3);
});

test('other errors and a lock that never clears are thrown', () => {
  expect(() => renameRetry('a', 'b', () => { throw busy('ENOENT'); })).toThrow('ENOENT');
  let calls = 0;
  expect(() => renameRetry('a', 'b', () => { calls++; throw busy('EBUSY'); }, 4)).toThrow('EBUSY');
  expect(calls).toBe(4);
});

test('replaceFile gives the path a new file: a hard link to the old one (another project sharing it) keeps what it had', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fsutil-')), a = join(dir, 'a', 'transcript.by'), b = join(dir, 'b.by');
  mkdirSync(join(dir, 'a'));
  writeFileSync(a, 'whisper-small');
  linkSync(a, b);
  replaceFile(a, 'whisper-large');
  expect([readFileSync(a, 'utf8'), readFileSync(b, 'utf8')]).toEqual(['whisper-large', 'whisper-small']);
  expect(readdirSync(join(dir, 'a'))).toEqual(['transcript.by']);   // no temporary file left
});
