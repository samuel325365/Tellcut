// render.ts without Chrome: the encoder's stop and the export's mastering steps (the whole export runs in tools/render.test.ts).
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './ffmpeg.ts';
import { encoder } from './render.ts';

test('a stopped encoder has let go of its file: a cancelled export can remove its .video.mp4 at once (Windows held it open)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'enc-')), jpg = join(dir, 'f.jpg'), out = join(dir, 'x.video.mp4');
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180', '-frames:v', '1', jpg]);
  const frame = readFileSync(jpg), enc = encoder(out, 30, { w: 320, h: 180 });
  // write until ffmpeg has opened the output (it does once the input stream is known)
  for (let i = 0; i < 600 && !existsSync(out); i++) { await enc.write(frame); await new Promise((r) => setTimeout(r, 5)); }
  expect(existsSync(out)).toBe(true);
  await enc.stop();
  rmSync(out);   // no force: EPERM here is the leftover the export used to swallow
  expect(existsSync(out)).toBe(false);
}, 60000);
