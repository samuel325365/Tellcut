// tools/py/meta.py on photos whose EXIF is written oddly: each still comes in, with what it cannot read left out
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { photoMeta, runPy } from '@tellcut/media-node';

const dir = mkdtempSync(join(tmpdir(), 'py-meta-'));
/** a 64×48 JPG with `taken` written as given and, with nofix, GPS of 0/0 rationals (tools/py/fixtures.py) */
const jpg = async (name: string, taken: string, nofix = false) => {
  const f = join(dir, name);
  await runPy('fixtures.py', ['jpg', f, '64', '48', '1', taken, ...(nofix ? ['nofix'] : [])]);
  return f;
};

test('photo meta: an ISO-style date is read, a blank or all-zero one is no date, and a GPS of 0/0 is no place (not NaN in the JSON)', async () => {
  expect(await photoMeta(await jpg('iso.jpg', '2023-05-01T12:00:00'))).toMatchObject({ width: 64, height: 48, taken: '2023-05-01T12:00:00' });
  expect((await photoMeta(await jpg('blank.jpg', '    :  :     :  :  '))).taken).toBeNull();
  expect((await photoMeta(await jpg('zero.jpg', '0000:00:00 00:00:00'))).taken).toBeNull();
  expect(await photoMeta(await jpg('nofix.jpg', '2023:05:01 12:00:00', true))).toMatchObject({ taken: '2023-05-01T12:00:00', gps: null });
}, 120000);
