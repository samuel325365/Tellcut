import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correctBeats, EXTRAS_VERSION, extrasDone, extrasFiles, musicBeats, overviewSheets, overviewTimes, photoSheet, sheetTimes, sourceExtras, timecode, timecode1 } from './extras.ts';
import { analyzeSource } from './analysis.ts';
import { ffmpeg } from './ffmpeg.ts';
import { makeClicks, makePhoneVideo, makeTalkingVideo } from './test-media.ts';
import { fakeTranscribe } from './providers/fake.ts';

const dir = mkdtempSync(join(tmpdir(), 'extras-'));

test('sheet frames: one per short scene, every 3 s in long ones, at most `max`', () => {
  expect(sheetTimes([2, 10], 12)).toEqual([1, 3.5, 6.5, 11]);
  expect(sheetTimes([], 400, 4)).toHaveLength(4);
  expect([timecode(5), timecode(65.4)]).toEqual(['0:05', '1:05']);
  expect([timecode1(1.25), timecode1(65.04), timecode1(59.96)]).toEqual(['0:01.3', '1:05.0', '1:00.0']);
});

test('a talking video gets contact sheets and a transcript; a silent one only sheets', async () => {
  const talk = await makeTalkingVideo(join(dir, 'talk.mp4'), 'Hello studio. The birthday cake is ready.');
  await sourceExtras(dir, talk, { label: 'talk' });
  const f = extrasFiles(dir, talk);
  expect(JSON.parse(readFileSync(f.sheets, 'utf8')).pages).toBe(1);
  expect(existsSync(f.sheet(1))).toBe(true);
  const tr = JSON.parse(readFileSync(f.transcript, 'utf8'));
  expect(tr.language).toBe('en');
  expect(tr.segments.map((s: any) => s.text).join(' ').toLowerCase()).toContain('cake');
  expect(await extrasDone(dir, talk)).toBe(true);
}, 600000);

test('beats of a 120 BPM click track', async () => {
  const b = await musicBeats(dir, await makeClicks(join(dir, 'clicks.wav'), { bpm: 120, seconds: 12 }));
  expect(b.bpm).toBeGreaterThanOrEqual(118);
  expect(b.bpm).toBeLessThanOrEqual(122);
  const gaps = b.beats.slice(1).map((x, i) => x - b.beats[i]).sort((x, y) => x - y);
  expect(gaps[Math.floor(gaps.length / 2)]).toBeCloseTo(0.5, 1);
}, 300000);

test('a video with no sound is done after its sheets (nothing to transcribe)', async () => {
  const quiet = join(dir, 'quiet.mp4');
  const { ffmpeg } = await import('./ffmpeg.ts');
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=green:s=320x180:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', quiet]);
  await sourceExtras(dir, quiet, { label: 'quiet' });
  expect([existsSync(extrasFiles(dir, quiet).transcript), await extrasDone(dir, quiet)]).toEqual([false, true]);
}, 120000);

test('sheets, transcripts and beats run one at a time in the background slot, never in the heavy slots exports need', async () => {
  const { background, heavy } = await import('./limit.ts');
  const before = heavy.peak;
  let seen = 0;
  const p = musicBeats(dir, await makeClicks(join(dir, 'clicks2.wav'), { bpm: 100, seconds: 6 }));
  const t = setInterval(() => { seen = Math.max(seen, heavy.active); }, 5);
  await p;
  clearInterval(t);
  expect([background.peak, seen, heavy.peak]).toEqual([1, 0, before]);
}, 300000);

test('overview frames: scene middles; few scenes split the longest one, many are picked evenly', () => {
  expect(overviewTimes([2, 10], 12)).toEqual([1, 3, 5, 7, 9, 11]);
  const none = overviewTimes([], 12);
  expect(none).toHaveLength(6);
  expect(none.every((t, i) => t > 0 && t < 12 && (i === 0 || t > none[i - 1]))).toBe(true);
  const many = overviewTimes(Array.from({ length: 19 }, (_, i) => i + 1), 20);
  expect(many).toHaveLength(6);
  expect([many[0], many.at(-1)]).toEqual([0.5, 19.5]);
});

test('a contact sheet with fixed cells and row labels: its size follows the grid, blank cells allowed', async () => {
  const img = join(dir, 'cell.jpg');
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=green:s=90x160:d=0.1', '-frames:v', '1', img]);
  const out = join(dir, 'grid.jpg');
  const r = JSON.parse(await photoSheet(out, [{ img, label: '0:01' }, { img: null, label: '' }, { img, label: '0:03' }, { img, label: '0:04' }], undefined,
    { cols: 2, cellW: 160, cellH: 160, rowLabels: ['很長的素材名稱_abcdefghijklmnop 0:12', 'b 0:03'], rowLabelW: 180 }));
  // pad 6, label strip 28: width = 180 + 2 × (160 + 6) + 6, height = 2 × (160 + 28 + 6) + 6
  expect(r).toEqual({ width: 518, height: 394 });
  expect(existsSync(out)).toBe(true);
}, 120000);

test('overview sheets: one row per video, eight rows a page, made once and redone only when the material changes', async () => {
  const v = await makePhoneVideo(join(dir, 'ov.mp4'), { seconds: 3 });
  await analyzeSource(dir, v);
  const nine = Array.from({ length: 9 }, (_, i) => ({ id: `v${i}`, path: v, duration: 3 }));
  const pages = await overviewSheets(dir, nine);
  expect(pages).toHaveLength(2);
  expect(pages.every((p) => existsSync(p))).toBe(true);
  const t0 = statSync(pages[0]).mtimeMs;
  await new Promise((r) => setTimeout(r, 30));
  expect(await overviewSheets(dir, nine)).toEqual(pages);
  expect(statSync(pages[0]).mtimeMs).toBe(t0);
  const eight = await overviewSheets(dir, nine.slice(0, 8));
  expect(eight).toHaveLength(1);
  expect(statSync(eight[0]).mtimeMs).not.toBe(t0);
  writeFileSync(join(dir, 'cache', 'sheets', 'overview.json'), '{"key": "ab');   // torn: made again, not an error forever
  expect(await overviewSheets(dir, nine.slice(0, 8))).toEqual(eight);
  expect(JSON.parse(readFileSync(join(dir, 'cache', 'sheets', 'overview.json'), 'utf8')).pages).toBe(1);
}, 600000);

test('a transcript made by another tool or model is made again; one made before this was recorded is kept', async () => {
  const d = mkdtempSync(join(tmpdir(), 'extras-by-')), v = await makePhoneVideo(join(d, 'v.mp4'));
  const a = fakeTranscribe('一'), b = { ...fakeTranscribe('二'), id: 'other', model: 'big' };
  await sourceExtras(d, v, { label: 'v', stt: a });
  const f = extrasFiles(d, v);
  expect(readFileSync(f.transcriptBy, 'utf8')).toBe('fake');
  await sourceExtras(d, v, { label: 'v', stt: a });
  expect(a.calls).toHaveLength(1);                                                 // same tool: kept
  await sourceExtras(d, v, { label: 'v', stt: b });
  expect([b.calls.length, JSON.parse(readFileSync(f.transcript, 'utf8')).segments[0].text, readFileSync(f.transcriptBy, 'utf8')]).toEqual([1, '二', 'other:big']);
  expect([await extrasDone(d, v, b), await extrasDone(d, v, a)]).toEqual([true, false]);   // the server asks this before analysing again
  const c = fakeTranscribe('三');
  writeFileSync(f.transcriptBy, ''); (await import('node:fs')).rmSync(f.transcriptBy);   // an older analysis: nobody wrote down the maker
  await sourceExtras(d, v, { label: 'v', stt: c });
  expect(c.calls).toHaveLength(0);
}, 120000);

test('a new EXTRAS_VERSION makes the sheets and the burned-caption check again (the transcript has its own record)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'extras-ver-')), v = await makePhoneVideo(join(d, 'v.mp4')), stt = fakeTranscribe();
  await sourceExtras(d, v, { label: 'v', stt });
  const f = extrasFiles(d, v);
  expect(readFileSync(f.version, 'utf8')).toBe(EXTRAS_VERSION);
  writeFileSync(f.sheets, JSON.stringify({ pages: 99 }));
  await sourceExtras(d, v, { label: 'v', stt });
  expect(JSON.parse(readFileSync(f.sheets, 'utf8')).pages).toBe(99);               // same version: left alone
  writeFileSync(f.version, 'x0');
  await sourceExtras(d, v, { label: 'v', stt });
  expect([JSON.parse(readFileSync(f.sheets, 'utf8')).pages, readFileSync(f.version, 'utf8'), stt.calls.length]).toEqual([1, EXTRAS_VERSION, 1]);
}, 120000);

test('correctBeats halves a doubled tempo and fills in a halved one, and leaves a close one alone', () => {
  expect(correctBeats({ bpm: 240, offset: 0, beats: [0, 0.25, 0.5, 0.75, 1] }, 120)).toEqual({ bpm: 120, offset: 0, beats: [0, 0.5, 1] });
  expect(correctBeats({ bpm: 60, offset: 0.1, beats: [0.1, 1.1, 2.1] }, 120)).toEqual({ bpm: 120, offset: 0.1, beats: [0.1, 0.6, 1.1, 1.6, 2.1] });
  expect(correctBeats({ bpm: 118, offset: 0, beats: [0] }, 120)).toEqual({ bpm: 118, offset: 0, beats: [0] });
  expect(correctBeats({ bpm: 180, offset: 0, beats: [0] }, 120).bpm).toBe(180);   // 3:2 is not a doubling: left as detected
});
