import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BURN_H, BURN_W, captionProfile, detectBurned, isCaption, readableWords, settleText, stillCells, summarizeBurned, summarizeText, type CaptionProfile } from './burned.ts';
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

test('a word or two of caption is a caption too: packed into one line, centred; a lone mark or a word off to the side is not', () => {
  const word = captionProfile(lettering(frame(), 240, 252, 220, 260));   // "no!": 40 px of a 480 px frame
  expect(word.sd).toBeLessThan(0.05);   // too narrow for a sentence's spread: missed before
  expect(isCaption(word)).toBe(true);
  expect(isCaption(captionProfile(lettering(frame(), 240, 252, 238, 242)))).toBe(false);   // one stroke, a pole
  expect(isCaption(captionProfile(lettering(frame(), 240, 252, 60, 100)))).toBe(false);    // a word at the left
});

test('black pillar-box bars do not read as strokes', () => {
  const g = frame(220);
  for (let y = 0; y < BURN_H; y++) for (let x = 0; x < BURN_W; x++) if (x < 100 || x >= 380) g[y * BURN_W + x] = 0;
  expect(isCaption(captionProfile(g))).toBe(false);
});

/** a moving picture: noise that changes every frame */
const noise = (seed: number) => { const g = frame(); let s = seed; for (let i = 0; i < g.length; i++) { s = (s * 16807) % 2147483647; g[i] = s & 255; } return g; };
const cellsIn = (cells: number[], x0: number, y0: number, x1: number, y1: number) => cells.every((c) => { const x = (c % 30) * 16, y = Math.floor(c / 30) * 16; return x + 16 > x0 && x < x1 && y + 16 > y0 && y < y1; });

test('stillCells: lettering that stays put over a moving picture is found where it is; a still shot tells nothing', () => {
  const a = lettering(noise(7), 20, 34, 300, 420), b = lettering(noise(11), 20, 34, 300, 420);   // a label top right, the picture moved
  const found = stillCells(b, a)!;
  expect(found.length).toBeGreaterThan(3);
  expect(cellsIn(found, 300, 20, 420, 34)).toBe(true);
  expect(stillCells(noise(11), noise(7))).toEqual([]);          // nothing stays: nothing found
  expect(stillCells(a, a)).toBeNull();                          // everything stays: a tripod shot or a freeze, not lettering
});

test('summarizeText follows a label across frames, drops a speck, and leaves the caption row to the caption', () => {
  const label = [31, 32, 33, 34], speck = [200], row = [14 * 30 + 13, 14 * 30 + 14, 14 * 30 + 15];   // row 1 near the top; row 14 near the bottom
  const cells: Array<number[] | null> = Array.from({ length: 20 }, (_, i) => [...(i >= 2 && i <= 8 ? label : []), ...(i === 12 ? speck : []), ...(i >= 10 && i <= 16 ? row : [])]);
  cells[5] = null;   // a still frame in the middle: the label is followed across it
  const t = summarizeText(cells, 0.5);
  expect(t).toEqual([
    { span: [0.5, 4.5], rect: [0.033, 0.059, 0.133, 0.059], band: 'top' },
    { span: [4.5, 8.5], rect: [0.433, 0.83, 0.1, 0.059], band: 'bottom' },
  ]);
  expect(summarizeText(Array.from({ length: 20 }, (_, i) => (i % 5 === 0 ? label : [])), 0.5)).toEqual([]);   // here and gone: no lettering
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
  // at two frames a second the limits are the same in seconds: 2.5 s of caption in all is noise, a 2 s miss is bridged
  expect(summarizeBurned([...Array.from({ length: 5 }, () => P(true)), ...Array.from({ length: 20 }, () => P(false))], 0.5).caption).toBeNull();
  expect(summarizeBurned([...[1, 1, 1, 0, 0, 0, 1, 1, 1].map((x) => P(!!x)), ...Array.from({ length: 30 }, () => P(false))], 0.5).caption?.spans).toEqual([[0, 4.5]]);
  // the other text found is only candidates: listed, not yet joined to the caption (settleText does that once it is read)
  const label = [31, 32, 33, 34], row = [14 * 30 + 13, 14 * 30 + 14, 14 * 30 + 15];
  const withRow = summarizeBurned(Array.from({ length: 40 }, (_, i) => P(i < 12, 0.85)), 0.5,
    Array.from({ length: 40 }, (_, i) => [...(i >= 2 && i <= 8 ? label : []), ...(i >= 22 && i <= 28 ? row : [])]));
  expect(withRow.caption?.spans).toEqual([[0, 6]]);
  expect(withRow.text?.map((t) => t.band)).toEqual(['top', 'bottom']);
  // read: the words stay on their piece; a piece on the caption row read as words is the caption's (its time joins the spans)
  const read = settleText(withRow, ['DAY 3', 'enjoy!']);
  expect(read.caption?.spans).toEqual([[0, 6], [10.5, 14.5]]);
  expect(read.text).toEqual([{ ...withRow.text![0], words: 'DAY 3' }]);
  expect(read.ocr).toEqual({ ok: true });
  // nothing read in it (a railing standing still beside a caption): kept as a guess, the caption's spans as they were
  const railing = settleText(withRow, ['DAY 3', ' l ']);
  expect([railing.caption?.spans, railing.text?.map((t) => t.words)]).toEqual([[[0, 6]], ['DAY 3', undefined]]);
  // no OCR here: every piece a guess, why said, nothing joined
  expect(settleText(withRow, null, 'no OCR language')).toMatchObject({ caption: { spans: [[0, 6]] }, ocr: { ok: false, why: 'no OCR language' } });
  expect([readableWords('6:00 AM'), readableWords('台北'), readableWords('l 。'), readableWords('11')]).toEqual([true, true, false, false]);
  // without the frames' cells there is no `text` (nothing was looked for); with them, there is
  expect(summarizeBurned([P(false)], 1)).not.toHaveProperty('text');
  expect(summarizeBurned([P(false)], 1, [[]]).text).toEqual([]);
});

test('detectBurned reads a real file: lettering drawn on the bottom of a video is found, a plain video is not', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'burned-'));
  try {
    await run(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=10:duration=6', '-vf', 'format=yuv420p', '-c:v', 'libx264', join(dir, 'plain.mp4')]);
    // bars standing in for lettering (drawtext needs a font file): white and black 4 px stripes across the middle of the lower band
    await run(['-f', 'lavfi', '-i', 'color=c=gray:size=640x360:rate=10:duration=6', '-vf', "format=yuv420p,drawbox=x=160:y=330:w=320:h=20:color=black:t=fill,drawgrid=x=160:y=330:w=8:h=20:t=4:c=white", '-c:v', 'libx264', join(dir, 'lettered.mp4')]);
    expect((await detectBurned(join(dir, 'lettered.mp4'))).caption?.share).toBeGreaterThan(0.8);
    const plain = await detectBurned(join(dir, 'plain.mp4'));
    expect(plain.caption).toBeNull();
    expect(plain.step).toBe(0.5);
    // a label held still at the top left of a moving picture (noise that changes every frame): text in the top band, there, all
    // along; the moving picture alone has none
    const moving = ['-f', 'lavfi', '-i', 'color=c=gray:size=640x360:rate=10:duration=6'], noise = 'noise=alls=80:allf=t+u,format=yuv420p';
    const bars = Array.from({ length: 16 }, (_, k) => `drawbox=x=${44 + 12 * k}:y=28:w=4:h=16:color=white:t=fill`).join(',');
    await run([...moving, '-vf', `${noise},drawbox=x=40:y=24:w=200:h=24:color=black:t=fill,${bars}`, '-c:v', 'libx264', join(dir, 'label.mp4')]);
    await run([...moving, '-vf', noise, '-c:v', 'libx264', join(dir, 'moving.mp4')]);
    const label = await detectBurned(join(dir, 'label.mp4'));
    expect(label.text?.length).toBe(1);
    expect(label.text?.[0]).toMatchObject({ band: 'top', span: [0, 6] });
    const [x, y, w, h] = label.text![0].rect;   // the label is 40–240 × 24–48 of 640×360: 0.06–0.38 × 0.07–0.13
    expect([x <= 0.07, x + w >= 0.37, y <= 0.07, y + h >= 0.13, h <= 0.2]).toEqual([true, true, true, true, true]);
    expect((await detectBurned(join(dir, 'moving.mp4'))).text).toEqual([]);
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
    writeFileSync(join(dirname(f), 'burned-v2.json'), JSON.stringify({ version: 1, step: 1, frames: 10, caption: { share: 0.5, rect: [0.08, 0.8, 0.84, 0.09], spans: [[0, 5]] } }));
    expect(readBurned(dir, src)?.caption?.rect[1]).toBe(0.8);   // v2 as it is, ahead of v1
    writeFileSync(join(dirname(f), 'burned-v3.json'), JSON.stringify({ version: 1, step: 0.5, frames: 20, caption: null, text: [] }));
    expect(readBurned(dir, src)).toEqual({ version: 1, step: 0.5, frames: 20, caption: null, text: [] });   // v3 ahead of both
    writeFileSync(f, JSON.stringify({ version: 1, step: 0.5, frames: 20, caption: null, text: [], ocr: { ok: true } }));
    expect(readBurned(dir, src)?.ocr).toEqual({ ok: true });   // v4 ahead of all
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
