import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpeg, parseLoudness } from '../ffmpeg.ts';
import { limitPeaks } from './peaks.ts';

test('a silent file has a true peak of -inf, not an unknown one', () => {
  expect(parseLoudness('Summary:\n  Integrated loudness:\n    I:         -70.0 LUFS\n  True peak:\n    Peak:       -inf dBFS')).toEqual({ lufs: -70, peak: -Infinity });
  expect(parseLoudness('Summary:\n    I:         -14.2 LUFS\n    Peak:       -1.3 dBFS')).toEqual({ lufs: -14.2, peak: -1.3 });
});

test('silence passes the ceiling', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'srcproj-'));
  try {
    await ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=d=1', join(dir, 'quiet.wav')]);
    expect((await limitPeaks(join(dir, 'quiet.wav'), join(dir, 'out.wav'))).peak).toBe(-Infinity);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
