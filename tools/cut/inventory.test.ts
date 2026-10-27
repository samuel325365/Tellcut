import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeSource, createProject, extrasFiles, makeClicks, makePhoneVideo, makePhoto } from '@tellcut/media-node';
import { busyFromJobs, formatInventory, formatSource, imageBudget, inventory, type Inventory } from './inventory.ts';

const root = mkdtempSync(join(tmpdir(), 'inv-')), src = join(root, 'src');

test('inventory: kinds, orientation, sheets, segments, beats and chapters of a new project', async () => {
  mkdirSync(src, { recursive: true });
  await makePhoneVideo(join(src, 'walk.mp4'), { created: '2026-03-07T01:00:00Z' });
  await makePhoto(join(src, 'a.jpg'), { taken: '2026:03:07 10:30:00' });
  await makePhoto(join(src, 'b.jpg'), { taken: '2026:03:08 09:00:00' });
  await makeClicks(join(src, 'song.wav'), { bpm: 120, seconds: 10 });
  await createProject({ id: 'inv', inputs: [src], projectsDir: root });
  const inv = await inventory(join(root, 'inv'), { transcribe: false });
  const walk = inv.sources.find((s) => s.id === 'walk')!;
  expect([walk.kind, walk.orientation, walk.audio, walk.sheets.length, walk.segments.length > 0, walk.transcript]).toEqual(['video', 'portrait', true, 1, true, null]);
  expect(walk.burned).toMatchObject({ version: 1, caption: null });             // analysed (toolkit phase 2d): a phone clip with no lettering
  expect(inv.sources.find((s) => s.id === 'a')!).toMatchObject({ kind: 'image', orientation: 'landscape', segments: [], sheets: [] });
  expect(Math.round(inv.music[0].beats!.bpm)).toBeGreaterThanOrEqual(118);
  expect(inv.chapters.map((c) => c.title)).toEqual(['第 1 天', '第 2 天']);
  expect(inv.photoSheets).toHaveLength(1);
  expect(formatInventory(inv)).toContain('第 1 天');
  expect(inv.overview).toHaveLength(1);
  const text = formatInventory(inv);
  expect(text).toContain(`素材總覽：${inv.overview[0]}`);
  expect(text).toContain('npm run inspect -- inv --source <素材>');
  expect(text).toContain('看圖預算：約 13 張（總覽 2 ＋ 細看素材（--source、--range）至多 1 ＋ check 拼貼 2 ＋ frames 至多 8）；新寫的 fx 每個再加 2 張；超過要說得出為什麼');
  expect(text).not.toContain('sheet-1.jpg');
  // a second inventory keeps the photo sheet (nothing changed), so inspect and cut stay fast
  const made = statSync(inv.photoSheets[0]).mtimeMs;
  await inventory(join(root, 'inv'), { transcribe: false });
  expect(statSync(inv.photoSheets[0]).mtimeMs).toBe(made);
}, 600000);

test('generated narration and music are listed as such, not analysed for beats; a second inspect does not say it analyses again', async () => {
  const dir = join(root, 'inv'), pf = join(dir, 'project.json'), p = JSON.parse(readFileSync(pf, 'utf8'));
  mkdirSync(join(dir, 'media', 'voice'), { recursive: true });
  const song = p.media[Object.keys(p.media)[0]].path;
  copyFileSync(join(dir, song), join(dir, 'media', 'voice', 's1.wav'));
  copyFileSync(join(dir, song), join(dir, 'media', 'score-lofi.wav'));
  p.media['voice-s1'] = { path: 'media/voice/s1.wav' }; p.media['score-lofi'] = { path: 'media/score-lofi.wav' };
  writeFileSync(pf, JSON.stringify(p, null, 2));
  const logs: string[] = [], inv = await inventory(dir, { transcribe: false, log: (l) => logs.push(l) });
  expect(inv.music.filter((m) => m.generated).map((m) => [m.id, m.generated, m.beats])).toEqual([['voice-s1', 'voice', null], ['score-lofi', 'score', null]]);
  const text = formatInventory(inv);
  expect(text).toMatch(/旁白 voice-s1：0:10\n/);
  expect(text).toMatch(/配樂 score-lofi（產生的）：0:10\n/);
  expect(logs.filter((l) => l.startsWith('分析 '))).toEqual([]);
}, 120000);

test('a source that cannot be analysed is skipped with the reason; the others are still listed', async () => {
  const dir = join(root, 'inv'), pf = join(dir, 'project.json'), p = JSON.parse(readFileSync(pf, 'utf8'));
  writeFileSync(join(src, 'broken.mp4'), Buffer.alloc(4096, 7));
  p.sources.broken = { path: '../src/broken.mp4', duration: 5, width: 640, height: 360, kind: 'video' };
  writeFileSync(pf, JSON.stringify(p, null, 2));
  const logs: string[] = [], inv = await inventory(dir, { transcribe: false, log: (l) => logs.push(l) });
  expect(logs.some((l) => l.startsWith('分析 broken 失敗，略過'))).toBe(true);
  expect(inv.sources.map((x) => x.id)).toContain('walk');
  expect(inv.sources.map((x) => x.id)).not.toContain('broken');
  delete p.sources.broken; writeFileSync(pf, JSON.stringify(p, null, 2));
}, 120000);

test('one source in detail: its scenes, every sentence with times, its big sheets; long scene lists are cut short', () => {
  const inv = {
    id: 'Demo', dir: 'C:/p/demo', project: {} as any, music: [], chapters: [], photoSheets: [], overview: [],
    sources: [{ id: 'walk', kind: 'video', duration: 75, width: 1080, height: 1920, orientation: 'portrait', audio: true, speech: '', sheets: ['C:/p/s1.jpg'],
      segments: Array.from({ length: 70 }, (_, i) => [i, i + 1] as [number, number]).concat([[70, 75]]),
      transcript: { language: 'zh', segments: [{ start: 3.24, end: 5.9, text: ' 大家好 ' }, { start: 61, end: 62.5, text: '出發' }] } }],
  } as Inventory;
  const s = formatSource(inv, 'walk');
  expect(s).toContain('walk：影片 1:15，71 段，直式');
  expect(s).toContain('#1 0:00.0–0:01.0');
  expect(s).toContain('#60 0:59.0–1:00.0');
  expect(s).not.toContain('#61 ');
  expect(s).toContain('（還有 11 段沒列出）');
  expect(s).toContain('0:03.2–0:05.9 大家好');
  expect(s).toContain('1:01.0–1:02.5 出發');
  expect(s).toContain('大縮圖總覽：C:/p/s1.jpg');
  expect(() => formatSource(inv, 'nope')).toThrow('沒有素材「nope」；有：walk');
});

test('burned-in captions show in the overview as one line and in the detail with their stretches; a source without them shows nothing', () => {
  const burned = { version: 1, step: 1, frames: 100, caption: { share: 0.7, rect: [0.08, 0.86, 0.84, 0.12], spans: [[1, 8], [10, 13]] } };
  const mk = (b: unknown) => ({
    id: 'Demo', dir: 'C:/p/demo', project: { meta: { width: 1080, height: 1920 } } as any, music: [], chapters: [], photoSheets: [], overview: [],
    sources: [{ id: 'walk', kind: 'video', duration: 75, width: 1920, height: 1080, orientation: 'landscape', audio: true, speech: '', sheets: [], segments: [[0, 75]], transcript: null, burned: b }],
  }) as unknown as Inventory;
  const over = formatInventory(mk(burned));
  expect(over).toContain('燒字：畫面下方（約 86–98% 高度）有原片自己的字幕，約 70% 的時間');
  const det = formatSource(mk(burned), 'walk');
  expect(det).toContain('燒進畫面的字幕：畫面下方 86–98% 高度');
  expect(det).toContain('0:01.0–0:08.0、0:10.0–0:13.0');
  expect(det).toContain('avoidBurned');
  expect(formatInventory(mk(null))).not.toContain('燒字');
  expect(formatSource(mk({ version: 1, step: 1, frames: 10, caption: null }), 'walk')).not.toContain('燒進畫面');
});

test('a time range reads as m:ss or seconds; frames come every round step that fits 24', async () => {
  const { parseRange, rangeTimes } = await import('./inventory.ts');
  expect(parseRange('5:00-6:30')).toEqual([300, 390]);
  expect(parseRange('65-150')).toEqual([65, 150]);
  expect(parseRange('1:05.5-1:20')).toEqual([65.5, 80]);
  expect(parseRange('1:00:00-1:00:30')).toEqual([3600, 3630]);
  expect(parseRange('5:00–6:30')).toEqual([300, 390]);   // the dash inspect itself prints its ranges with
  expect(parseRange('5:00 ~ 6:30')).toEqual([300, 390]);
  for (const bad of ['6:30-5:00', 'abc', '5:00', '1:-2-3']) expect(() => parseRange(bad), bad).toThrow('5:00-6:30');
  expect(rangeTimes(60, 120)).toEqual({ step: 3, times: Array.from({ length: 20 }, (_, i) => 60 + i * 3) });
  expect(rangeTimes(0, 10).step).toBe(0.5);
  expect(rangeTimes(0, 3600).times).toHaveLength(20);                                      // every 3 minutes: the whole hour, not its first 24 minutes
  const long = rangeTimes(0, 3600);
  expect(long.times[long.times.length - 1] + long.step).toBeGreaterThanOrEqual(3600);   // the last frame's step reaches the end of the range
  expect(rangeTimes(0, 36000).step).toBe(1500);
});

test('a source the server is analysing is not analysed here: inspect says how far the server is and never waits for it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'invb-')), s2 = join(dir, 'src');
  mkdirSync(s2, { recursive: true });
  await makePhoneVideo(join(s2, 'walk.mp4'), { created: '2026-03-07T01:00:00Z' });
  await createProject({ id: 'busy', inputs: [s2], projectsDir: dir });
  const busy = busyFromJobs([
    { kind: 'analyze', project: 'busy', label: 'walk', status: 'running', progress: 0.25, message: 'thumbs' },
    { kind: 'extras', project: 'busy', label: 'walk', status: 'queued' },
    { kind: 'analyze', project: 'other', label: 'walk', status: 'running' },
    { kind: 'analyze', project: 'busy', label: 'old', status: 'done' },
  ], 'busy');
  expect(busy).toEqual({ walk: { analyze: '基本分析：縮圖 25%', extras: '縮圖總覽與逐字稿：排隊中' } });
  const t0 = Date.now(), inv = await inventory(join(dir, 'busy'), { transcribe: false, busy });
  expect(Date.now() - t0).toBeLessThan(15000);
  const walk = inv.sources.find((s) => s.id === 'walk')!;
  expect([walk.pending, walk.segments, inv.overview]).toEqual(['基本分析：縮圖 25%', [], []]);
  expect(formatInventory(inv)).toContain('伺服器正在分析這段素材（基本分析：縮圖 25%）');
  expect(formatSource(inv, 'walk')).toContain('伺服器正在分析');
}, 120000);

test('burned captions found by an older analysis (burned.json) are read the way check reads them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'invo-')), s2 = join(dir, 'src');
  mkdirSync(s2, { recursive: true });
  await makePhoneVideo(join(s2, 'walk.mp4'));
  await createProject({ id: 'old', inputs: [s2], projectsDir: dir });
  const pdir = join(dir, 'old'), path = join(s2, 'walk.mp4');
  await analyzeSource(pdir, path);
  const f = extrasFiles(pdir, path);
  writeFileSync(join(f.transcript, '..', 'burned.json'), JSON.stringify({ version: 1, caption: { rect: [0.1, 0.8, 0.8, 0.1], spans: [[0, 2]] } }));
  // the server is on the extras: inspect reads what is there and runs nothing
  const inv = await inventory(pdir, { transcribe: false, busy: { walk: { extras: '排隊中' } } });
  expect(inv.sources[0].burned?.caption?.rect[1]).toBeCloseTo(0.825, 3);         // moved onto the text line like v2 (readBurned)
}, 120000);

test('the picture budget follows the footage: sheets, the detail sheets of each video (more for a long one) up to 16, check and frames', () => {
  const vid = (duration: number, sheets = 1, scenes = 1) => ({ kind: 'video', duration, sheets: Array(sheets).fill('s.jpg'), segments: Array(scenes).fill([0, 1]) });
  const src = (...v: object[]) => v as Inventory['sources'];
  expect(imageBudget({ sources: [], overview: [], photoSheets: [] }).total).toBe(10);
  expect(imageBudget({ sources: src(vid(30), vid(40), vid(50)), overview: ['o1'], photoSheets: ['p1'] })).toEqual({ total: 15, sheets: 2, detail: 3 });
  expect(imageBudget({ sources: src(vid(37 * 60, 2, 94)), overview: ['o1'], photoSheets: [] })).toEqual({ total: 23, sheets: 1, detail: 12 });   // a podcast: 10 ranges
  expect(imageBudget({ sources: src(vid(20 * 60, 2, 268)), overview: ['o1'], photoSheets: [] }).detail).toBe(11);   // a food walk: 7 ranges + 2 for its many cuts
  expect(imageBudget({ sources: src(...Array.from({ length: 24 }, () => vid(20))), overview: ['o1', 'o2', 'o3'], photoSheets: [] }).detail).toBe(16);
});

test('music from a source with a listed bpm gets its beats checked against it', async () => {
  const projectsDir = mkdtempSync(join(root, 'bpm-')), dir = join(projectsDir, 'bpm');
  await createProject({ id: 'bpm', inputs: [], projectsDir, blank: true });
  mkdirSync(join(dir, 'media', 'music'), { recursive: true });
  await makeClicks(join(dir, 'media', 'music', 'song.wav'), { bpm: 120, seconds: 10 });
  const p = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  p.media.song = { path: 'media/music/song.wav', duration: 10 };
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  writeFileSync(join(dir, 'media', 'assets.json'), JSON.stringify({ version: 1, items: [{ source: 'x', id: 'song', title: 'Song', author: 'A', page: 'p', license: 'L', quality: 'original', path: 'media/music/song.wav', downloaded: '2026-10-22T00:00:00Z', bpm: 60, mediaId: 'song' }] }));
  const inv = await inventory(dir, { transcribe: false });
  expect(Math.round(inv.music[0].beats!.bpm)).toBe(60);
  expect(inv.music[0].beats!.beats.length).toBeLessThanOrEqual(11);
});
