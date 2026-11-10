import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeSize, run } from './ffmpeg.ts';
import { grabFrame } from './grab.ts';

test('grabFrame writes the frame at a time, full size, in the format its name asks for', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'grab-')), src = join(dir, 'v.mp4'), out = join(dir, 'still.png');
  try {
    await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src]);
    await grabFrame(src, 1, out);
    expect(existsSync(out)).toBe(true);
    expect(await probeSize(out)).toEqual({ width: 320, height: 180 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60000);
