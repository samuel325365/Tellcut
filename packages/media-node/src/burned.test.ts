import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BURN_H, BURN_W, captionProfile, detectBurned, isCaption, summarizeBurned, type CaptionProfile } from './burned.ts';
import { run } from './ffmpeg.ts';
import { extrasFiles, readBurned } from './extras.ts';

const frame = (fill = 128) => new Uint8Array(BURN_W * BURN_H).fill(fill);
/** a line of "lettering": white and black 3 px bars across x in [x0, x1) on rows [y0, y1) */
const lettering = (g: Uint8Array, y0: number, y1: number, x0 = 120, x1 = 360) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * BURN_W + x] = Math.floor(x / 3) % 2 ? 255 : 0; return g; };

test('a centred line of strokes near the bottom is a caption', () => {
  const p = captionProfile(lettering(frame(), 240, 255));
  expect(isCaption(p)).toBe(true);
  expect(p.at).toBeGreaterThan(0.88);
  expect(p.at).toBeLessThan(0.98);
  expect(Math.abs(p.cx - 0.5)).toBeLessThan(0.05);
});

test('what is not lettering is not a caption: flat, noise, a lone block, lettering high up, lettering off to one side', () => {
  expect(isCaption(captionProfile(frame()))).toBe(false);
  const noise = frame();
  let s = 7; for (let i = 0; i < noise.length; i++) { s = (s * 16807) % 2147483647; noise[i] = s & 255; }
  expect(isCaption(captionProfile(noise))).toBe(false);
  const block = frame(); for (let y = 220; y < 262; y++) for (let x = 200; x < 300; x++) block[y * BURN_W + x] = 255; for (let y = 218; y < 264; y++) { block[y * BURN_W + 199] = 0; block[y * BURN_W + 300] = 0; }
  expect(isCaption(captionProfile(block))).toBe(false);
  expect(isCaption(captionProfile(lettering(frame(), 120, 135)))).toBe(false);          // outside the bottom band: not looked at
  expect(isCaption(captionProfile(lettering(frame(), 240, 255, 0, 90)))).toBe(false);   // pinned to the left edge
});

test('black pillar-box bars do not read as strokes', () => {
  const g = frame(220);
  for (let y = 0; y < BURN_H; y++) for (let x = 0; x < BURN_W; x++) if (x < 100 || x >= 380) g[y * BURN_W + x] = 0;
  expect(isCaption(captionProfile(g))).toBe(false);
});

const P = (caption: boolean, at = 0.93): CaptionProfile => (caption ? { dens: 30, peak: 0.8, at, cx: 0.5, sd: 0.12 } : { dens: 0, peak: 0, at: 0.5, cx: 0.5, sd: 0 });

test('the summary gives the caption row and the stretches of time, bridges a short gap, and ignores a few lone hits', () => {
  const profiles = [...[1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1].map((x) => P(!!x)), ...Array.from({ length: 6 }, () => P(false))];
  const b = summarizeBurned(profiles, 1);
  expect(b.frames).toBe(20);
  expect(b.caption?.spans).toEqual([[0, 6], [11, 14]]);
  expect(b.caption?.share).toBeCloseTo(0.4, 2);
  // the box is centred on the busiest rows (at 0.93 here) with ~0.02 to spare: [0.885, 0.975]
  expect(b.caption?.rect).toEqual([0.08, 0.885, 0.84, 0.09]);
  expect(summarizeBurned([P(true), P(false), P(true), ...Array.from({ length: 50 }, () => P(false))], 1).caption).toBeNull();
  expect(summarizeBurned([], 1).caption).toBeNull();
});

test('detectBurned reads a real file: lettering drawn on the bottom of a video is found, a plain video is not', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'burned-'));
  try {
    await run(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=10:duration=6', '-vf', 'format=yuv420p', '-c:v', 'libx264', join(dir, 'plain.mp4')]);
    // bars standing in for lettering (drawtext needs a font file): white and black 4 px stripes across the middle of the lower band
    await run(['-f', 'lavfi', '-i', 'color=c=gray:size=640x360:rate=10:duration=6', '-vf', "format=yuv420p,drawbox=x=160:y=330:w=320:h=20:color=black:t=fill,drawgrid=x=160:y=330:w=8:h=20:t=4:c=white", '-c:v', 'libx264', join(dir, 'lettered.mp4')]);
    expect((await detectBurned(join(dir, 'lettered.mp4'))).caption?.share).toBeGreaterThan(0.8);
    expect((await detectBurned(join(dir, 'plain.mp4'))).caption).toBeNull();
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60000);

test('a result saved before phase 5 is still read, its box moved onto the text line; the new file wins when there is one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'burned-')), src = join(dir, 'v.mp4');
  try {
    writeFileSync(src, 'x');
    const f = extrasFiles(dir, src).burned, old = join(dirname(f), 'burned.json');
    expect(readBurned(dir, src)).toBeNull();
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(old, JSON.stringify({ version: 1, step: 1, frames: 10, caption: { share: 0.5, rect: [0.08, 0.86, 0.84, 0.12], spans: [[0, 5]] } }));
    expect(readBurned(dir, src)?.caption?.rect).toEqual([0.08, 0.885, 0.84, 0.09]);   // the line at 0.93, as v2 boxes it
    writeFileSync(f, JSON.stringify({ version: 1, step: 1, frames: 10, caption: null }));
    expect(readBurned(dir, src)?.caption).toBeNull();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
