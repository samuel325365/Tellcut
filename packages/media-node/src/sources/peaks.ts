// Downloaded sound is brought under a true-peak ceiling before it enters a project (spec 2026-10-22-external-sources §3): BBC files
// peaking over 0 dBTP held a whole film's loudness down (uk-transit, -15.2 LUFS after four encodes).
import { rmSync } from 'node:fs';
import { ffmpeg, measureLoudness, probeDuration } from '../ffmpeg.ts';
import { renameRetry } from '../fsutil.ts';

/** `input` (or its from/len segment) as a 48 kHz stereo 16-bit WAV whose true peak is at most `ceiling` dBTP. Peaks only: the level
 *  is not changed. `out` appears only once it passed: a failure leaves nothing behind. */
export async function limitPeaks(input: string, out: string, o: { from?: number; len?: number; ceiling?: number } = {}): Promise<{ peak: number; duration: number }> {
  const ceiling = o.ceiling ?? -1, seg = [...(o.from ? ['-ss', String(o.from)] : []), ...(o.len ? ['-t', String(o.len)] : [])];
  const tmp = out.replace(/\.wav$/i, '') + `.${process.pid}.tmp.wav`;
  let peak = Infinity;
  try {
    // the limiter at 4x the rate catches the peaks between samples; the 16-bit encode may still overshoot a little, so it is measured
    for (let pass = 0, limit = ceiling - 0.5; pass < 3; pass++, limit -= 1) {
      await ffmpeg([...seg, '-i', input, '-vn', '-af', `aresample=192000,alimiter=limit=${(10 ** (limit / 20)).toFixed(4)}:attack=3:release=60:level=0:latency=1,aresample=48000`,
        '-ac', '2', '-c:a', 'pcm_s16le', tmp]);
      const m = await measureLoudness(tmp);
      if (m?.peak === undefined) throw new Error(`量不到峰值：${input}`);
      peak = m.peak;
      if (peak > ceiling) continue;
      const duration = await probeDuration(tmp);
      if (!(duration > 0)) throw new Error(`輸出是空的（${input}${o.from ? ` 從 ${o.from} 秒` : ''}）`);
      renameRetry(tmp, out);
      return { peak, duration };
    }
    throw new Error(`壓不下峰值：${input} 還有 ${peak.toFixed(1)} dBTP`);
  } finally { rmSync(tmp, { force: true }); }
}
