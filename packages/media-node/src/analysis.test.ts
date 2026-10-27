import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { analysisFiles, analyzeSource, atomic, isAnalyzed, parseShowinfo, peaksOf } from './analysis.ts';
import { probeSize, run } from './ffmpeg.ts';
import { heavy } from './limit.ts';

test('peaksOf keeps the max |sample| of each window', () => {
  const b = Buffer.alloc(16);
  [0, 16384, -32768, 0, 100, -200, 0, 0].forEach((v, i) => b.writeInt16LE(v, i * 2));
  expect(peaksOf(b, 400, 100)).toEqual([1, 0.006]);
});

test('parseShowinfo reads pts_time values', () => {
  expect(parseShowinfo('[Parsed_showinfo_1 @ 0x1] n:   0 pts:  60 pts_time:2.002 duration:1\n[Parsed_showinfo_1 @ 0x1] n: 1 pts: 9 pts_time:5.5 x')).toEqual([2.002, 5.5]);
});

test('analyzes a source into proxy, thumbnail atlas, scene cuts and peaks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'an-'));
  const src = join(dir, 'src.mp4');
  await run(['-f', 'lavfi', '-i', 'color=red:s=320x180:d=2:r=30', '-f', 'lavfi', '-i', 'color=blue:s=320x180:d=2:r=30', '-f', 'lavfi', '-i', 'sine=duration=4',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', src]);
  const steps: string[] = [];
  const f = await analyzeSource(dir, src, { onStep: (s) => steps.push(s) });
  expect(steps).toEqual(['proxy', 'thumbs', 'cuts', 'peaks']);
  expect(isAnalyzed(f)).toBe(true);
  expect(f).toEqual(analysisFiles(dir, src));
  expect(await probeSize(f.proxy)).toEqual({ width: 960, height: 540 });
  expect(await probeSize(f.thumbs)).toEqual({ width: 1600, height: 90 });
  expect(JSON.parse(readFileSync(f.thumbIndex, 'utf8'))).toEqual({ interval: 1, width: 160, height: 90, cols: 10, count: 4 });
  const cuts: number[] = JSON.parse(readFileSync(f.cuts, 'utf8'));
  expect(cuts.length).toBe(1);
  expect(cuts[0]).toBeCloseTo(2, 1);
  const { rate, peaks } = JSON.parse(readFileSync(f.peaks, 'utf8'));
  expect(rate).toBe(100);
  expect(Math.abs(peaks.length - 400)).toBeLessThanOrEqual(3);
  expect(Math.max(...peaks)).toBeCloseTo(0.125, 1);
}, 120000);

test('a source without audio gets empty peaks; a finished analysis is not redone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'an-'));
  const src = join(dir, 'v.mp4');
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=2', '-c:v', 'libx264', src]);
  const f = await analyzeSource(dir, src);
  expect(JSON.parse(readFileSync(f.peaks, 'utf8'))).toEqual({ rate: 100, peaks: [] });
  const steps: string[] = [];
  const t0 = Date.now();
  await analyzeSource(dir, src, { onStep: (s) => steps.push(s) });
  expect(Date.now() - t0).toBeLessThan(1500);
}, 120000);

test('a portrait source gets a proxy 540 wide; a proxy made at the old 540 high is made again, the rest of the analysis kept', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'an-'));
  const src = join(dir, 'p.mp4');
  await run(['-f', 'lavfi', '-i', 'testsrc=size=270x480:rate=10:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src]);
  const f = await analyzeSource(dir, src);
  expect(await probeSize(f.proxy)).toEqual({ width: 540, height: 960 });
  // as it was before: 304×540, no stamp
  rmSync(f.proxy); rmSync(join(f.dir, 'proxy.v3'));
  await run(['-i', src, '-vf', 'scale=-2:540', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', f.proxy]);
  const cutsBefore = readFileSync(f.cuts, 'utf8');
  await analyzeSource(dir, src);
  expect(await probeSize(f.proxy)).toEqual({ width: 540, height: 960 });
  expect(readFileSync(f.cuts, 'utf8')).toBe(cutsBefore);
  expect(existsSync(join(f.dir, 'proxy.v3'))).toBe(true);
}, 120000);

test('a proxy made with the old, heavier settings (more than 4 Mbps) is made again once; one of a fitting size only gets the new stamp', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'an-'));
  const src = join(dir, 'v.mp4');
  await run(['-f', 'lavfi', '-i', 'testsrc2=size=960x540:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src]);
  const f = await analyzeSource(dir, src);
  expect(existsSync(join(f.dir, 'proxy.v3'))).toBe(true);
  // as an older Tellcut left it: a 20 Mbps proxy, stamped v2 only
  rmSync(f.proxy); rmSync(join(f.dir, 'proxy.v3'));
  await run(['-i', src, '-c:v', 'libx264', '-b:v', '20M', '-pix_fmt', 'yuv420p', f.proxy]);
  (await import('node:fs')).writeFileSync(join(f.dir, 'proxy.v2'), '');
  const heavy = statSync(f.proxy).size, cutsBefore = readFileSync(f.cuts, 'utf8');
  await analyzeSource(dir, src);
  expect(statSync(f.proxy).size).toBeLessThan(heavy / 3);
  expect(readFileSync(f.cuts, 'utf8')).toBe(cutsBefore);                       // only the proxy is made again
  expect(existsSync(join(f.dir, 'proxy.v3'))).toBe(true);
  // a fitting proxy without the new stamp is kept as it is
  rmSync(join(f.dir, 'proxy.v3'));
  const kept = statSync(f.proxy).mtimeMs;
  await analyzeSource(dir, src);
  expect([statSync(f.proxy).mtimeMs, existsSync(join(f.dir, 'proxy.v3'))]).toEqual([kept, true]);
}, 120000);

test('source analysis runs inside the heavy ffmpeg limiter', async () => {
  expect(heavy.peak).toBeGreaterThan(0);   // the analysis earlier in this file went through it
});

test("atomic makes the file under this process's own temporary name (two processes on one cache never write the same one)", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-')), final = join(dir, 'beats.json');
  let seen = '';
  await atomic(final, async (tmp) => { seen = tmp; writeFileSync(tmp, '{}'); });
  expect([basename(seen), readFileSync(final, 'utf8')]).toEqual([`beats.${process.pid}.tmp.json`, '{}']);
});
