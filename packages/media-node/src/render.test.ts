// render.ts without Chrome: the encoder's stop and the export's mastering steps (the whole export runs in tools/render.test.ts).
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './ffmpeg.ts';
import { encoder, masterExport, masterFilter, type MixSteps } from './render.ts';

/** fake mastering steps: records what was muxed and encoded; `level(gain)` is what an encode at that gain measures */
function steps(o: { excerpt?: number | 'silent'; out: (gain: number) => number; whole?: (gain: number) => number }) {
  const muxed: Array<string | undefined> = [], encoded: string[] = [];
  let lastMux = 0, lastWhole = 0;
  const gainOf = (af: string) => Number(/volume=(-?[\d.]+)dB/.exec(af)![1]);
  const s: MixSteps = {
    mux: async (af) => { muxed.push(af); lastMux = af ? gainOf(af) : 0; },
    measureOut: async () => ({ lufs: o.out(lastMux), peak: -3 }),
    ...(o.excerpt !== undefined ? { range: {
      excerpt: async () => (o.excerpt === 'silent' ? { lufs: -70, peak: -Infinity } : { lufs: o.excerpt as number, peak: -20 }),
      encode: async (af: string) => { encoded.push(af); lastWhole = gainOf(af); },
      measure: async () => ({ lufs: o.whole!(lastWhole), peak: -3 }),
    } } : {}),
  };
  return { s, muxed, encoded };
}

test('a range export keeps the whole film\'s gain: a quiet passage stays as quiet as it is in the film', async () => {
  // the film's mix at -18 LUFS (target -14), the range a quiet passage at -30; the encode adds nothing of its own
  const f = steps({ excerpt: -30, out: (g) => -30 + g, whole: (g) => -18 + g });
  const m = await masterExport(-14, -18, f.s);
  expect(m).toMatchObject({ gain: 4, passes: 1 });
  expect(f.encoded).toEqual([masterFilter(4, -1.5)]);
  expect(f.muxed).toEqual([masterFilter(4, -1.5)]);   // once, with the film's gain (normalised alone it got +16 dB)
});

test('a range export\'s gain is corrected on the whole mix, then the range is muxed once with it', async () => {
  const f = steps({ excerpt: -25, out: (g) => -25 + g, whole: (g) => -19 + g * 0.9 });   // the whole encode lands short
  const m = await masterExport(-14, -18, f.s);
  expect(f.encoded.length).toBe(m!.passes);
  expect(m!.passes).toBeGreaterThan(1);
  expect(f.muxed).toEqual([masterFilter(m!.gain, m!.ceiling)]);
});

test('a silent range is muxed as it is, without the correction loop', async () => {
  const f = steps({ excerpt: 'silent', out: () => -70, whole: (g) => -18 + g });
  expect(await masterExport(-14, -18, f.s)).toBeNull();
  expect([f.muxed, f.encoded]).toEqual([[undefined], []]);
});

test('the whole film is still corrected by what its own muxed file measures', async () => {
  const f = steps({ out: (g) => -19 + g });
  const m = await masterExport(-14, -18, f.s);
  expect(m!.passes).toBe(2);
  expect(f.muxed).toEqual([masterFilter(4, -1.5), masterFilter(5, -1.5)]);
});

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
