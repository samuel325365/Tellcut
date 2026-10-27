import { parseProject, resolveTimes } from '@tellcut/engine';
import { audioChecks, captionSizeChecks, fallingIds, layoutChecks, sampleTimes, settledWindows, sheetTimes } from './visual.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
const proj = (items: any[], w = 1080, h = 1920) => parseProject({ version: 1, meta: { name: 't', width: w, height: h, fps: 30, duration: 20, plugins: [], mix: MIX },
  sources: {}, media: {}, grids: [], tracks: [{ id: 'o', kind: 'overlay', items }] });

test('text items are looked at once their entrance is over and in their middle', () => {
  const p = proj([
    { id: 'a', start: 2, end: 6, type: 'core.caption', params: { text: '你好', animDur: 0.5 } },
    { id: 'b', start: 10, end: 10.4, type: 'core.title', params: { text: '短' } },
    { id: 'c', start: 0, end: 20, type: 'core.flash', params: {} },
  ]);
  expect(sampleTimes(p, resolveTimes(p))).toEqual([2.6, 4, 10.2]);
});

test('the check sheet: twelve frames across the film and the middle of each text item, sixteen at most', () => {
  const p = proj([{ id: 'a', start: 2, end: 8, type: 'core.caption', params: { text: 'x' } }]);
  const t = sheetTimes(p, resolveTimes(p));
  expect(t).toHaveLength(13);
  expect(t).toContain(5);
  expect(t.every((x, i) => x >= 0 && x < 20 && (i === 0 || x > t[i - 1]))).toBe(true);
  // a text's middle within a second of one of the twelve adds nothing
  const near = proj([{ id: 'a', start: 2, end: 3.2, type: 'core.caption', params: { text: 'x' } }]);
  expect(sheetTimes(near, resolveTimes(near))).toHaveLength(12);
  const many = proj(Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, start: i * 0.6, end: i * 0.6 + 0.5, type: 'core.caption', params: { text: 'x' } })));
  expect(sheetTimes(many, resolveTimes(many))).toHaveLength(16);
});

test('layout: text outside the 5% margin is an error, in a portrait film the platform corner is a note, two texts on top of each other a warning', () => {
  const p = proj([
    { id: 'out', start: 0, end: 4, type: 'core.title', params: { text: 'x' } },
    { id: 'corner', start: 5, end: 8, type: 'core.caption', params: { text: 'x' } },
    { id: 'a', start: 10, end: 12, type: 'core.caption', params: { text: 'x' } },
    { id: 'b', start: 10, end: 12, type: 'core.lowerThird', params: { text: 'x' } },
  ]);
  const spans = resolveTimes(p), box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  const f = layoutChecks([
    { t: 1, boxes: [{ id: 'out', rects: [box(30, 900, 500, 80)] }] },
    { t: 2, boxes: [{ id: 'out', rects: [box(30, 900, 500, 80)] }] },
    { t: 6, boxes: [{ id: 'corner', rects: [box(200, 1600, 600, 70)] }] },
    { t: 11, boxes: [{ id: 'a', rects: [box(200, 1000, 400, 60)] }, { id: 'b', rects: [box(500, 1030, 300, 60)] }] },
  ], { W: 1080, H: 1920, spans });
  expect(f.map((x) => `${x.level} ${x.t!.join('-')} ${x.msg}`)).toEqual([
    'error 0-4 文字超出安全區（左邊）（out）',
    'note 5-8 文字在短影音平台的介面區（下方），可能被按鈕或說明蓋住（corner）',
    'warn 10-12 文字互相重疊（a、b）',
  ]);
  // many texts in the platform area: one line per side, not one per text
  const many = proj(Array.from({ length: 12 }, (_, i) => ({ id: `cap${i}`, start: i, end: i + 1, type: 'core.caption', params: { text: 'x' } })));
  const g = layoutChecks(Array.from({ length: 12 }, (_, i) => ({ t: i + 0.5, boxes: [{ id: `cap${i}`, rects: [box(200, 1600, 600, 70)] }] })), { W: 1080, H: 1920, spans: resolveTimes(many) });
  expect(g.map((x) => `${x.level} ${x.t!.join('-')} ${x.msg}`)).toEqual(['note 0-12 12 個文字在短影音平台的介面區（下方），可能被按鈕或說明蓋住（cap0、cap1、cap2、cap3、cap4…）']);
  // landscape: no platform corner
  const q = proj([{ id: 'corner', start: 5, end: 8, type: 'core.caption', params: { text: 'x' } }], 1920, 1080);
  expect(layoutChecks([{ t: 6, boxes: [{ id: 'corner', rects: [box(1700, 900, 100, 50)] }] }], { W: 1920, H: 1080, spans: resolveTimes(q) })).toEqual([]);
});

test('sound: samples at full scale are clipping, two seconds and more of near silence are flagged', () => {
  const rate = 1000, n = 10 * rate, ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = 0.3 * Math.sin(i / 3);
  for (let i = 2000; i < 2010; i++) ch[i] = 1;           // a 10 ms spike at 2.0 s
  for (let i = 3000; i < 3100; i++) ch[i] = 1;           // 100 ms at full scale from 3.0 s
  for (let i = 5000; i < 8000; i++) ch[i] = 0.0001;      // 5–8 s near silence
  const f = audioChecks([ch, ch], rate);
  expect(f.map((x) => `${x.level} ${x.t!.join('-')} ${x.msg}`)).toEqual(['warn 2-2.01 瞬間爆音（音量到頂）', 'error 3-3.1 爆音（音量到頂）', 'warn 5-8 沒有聲音']);
  expect(audioChecks([new Float32Array(n).fill(0.2)], rate)).toEqual([]);
  // single-sample peaks 100 ms apart are one stretch of spikes, not 100 ms of distortion
  const sparse = new Float32Array(n).fill(0.2);
  sparse[2000] = 1; sparse[2100] = 1;
  expect(audioChecks([sparse], rate).map((x) => `${x.level} ${x.t!.join('-')} ${x.msg}`)).toEqual(['warn 2-2.101 瞬間爆音（音量到頂）']);
});

test('an emoji rain, the reels frame, the album, the chat and the search page are left out of the layout checks, a sticker and the comments are not', () => {
  const p = { tracks: [{ items: [{ id: 'a', type: 'common.emoji', params: { mode: 'rain' } }, { id: 'b', type: 'common.emoji', params: {} }, { id: 'c', type: 'common.slam', params: { mode: 'rain' } },
    { id: 'r', type: 'common.reels', params: { mode: 'end' } }, { id: 'm', type: 'common.comments', params: {} }, { id: 'al', type: 'common.album', params: { mode: 'viewer' } }, { id: 'ct', type: 'common.chat', params: {} }, { id: 'se', type: 'common.search', params: { mode: 'ask' } }] }] };
  expect([...fallingIds(p)]).toEqual(['a', 'r', 'al', 'ct', 'se']);
});

test('a text is judged only while it stands still: sliding in or out it may pass the margin or another text', () => {
  // seen on the Seattle sample: a header sliding in from the left was measured half way in, by another item's sample time
  const p = proj([
    { id: 'hdr', start: 2, end: 6, type: 'common.header', params: { text: '派克市場' } },
    { id: 'cap', start: 2.2, end: 6, type: 'core.caption', params: { text: 'x', animDur: 0.3 } },
  ]);
  const settled = settledWindows(p, resolveTimes(p));
  expect(settled.get('hdr')).toEqual([2.45, 5.7]);                       // no animDur of its own: 0.45 in, 0.3 out
  expect(settled.get('cap')).toEqual([2.5, 5.7]);
  const offLeft = { id: 'hdr', rects: [{ x: -200, y: 300, w: 400, h: 80 }] };
  const o = { W: 1080, H: 1920, spans: resolveTimes(p), settled };
  expect(layoutChecks([{ t: 2.3, boxes: [offLeft] }], o)).toEqual([]);    // still sliding in
  expect(layoutChecks([{ t: 4, boxes: [offLeft] }], o).map((f) => f.level)).toEqual(['error']);
});

test('caption text under 48 px (on a 1080 short side) is a warning with the size that is enough; its smaller name tags and glosses do not count (R3-H3)', () => {
  const box = (id: string, ...h: number[]) => ({ id, rects: h.map((x) => ({ x: 100, y: 500, w: 400, h: x })) });
  // measured in the player: a 4.2 % caption on 1920 × 1080 has a 66 px line box (45 px type), 4.6 % 72 px
  const samples = [{ t: 1, boxes: [box('small', 66, 30), box('ok', 72), box('title', 40)] }, { t: 2, boxes: [box('small', 66)] }];
  const f = captionSizeChecks(samples, { W: 1920, H: 1080, captions: new Set(['small', 'ok', 'gone']) });
  expect(f).toHaveLength(1);
  expect(f[0]).toMatchObject({ level: 'warn', ids: ['small'] });
  expect(f[0].msg).toContain('約 46 px');
  expect(f[0].msg).toContain('size 至少 4.5');
  // a portrait film: the short side is its width; a 4.2 % caption there (117 px box) is fine
  expect(captionSizeChecks([{ t: 1, boxes: [box('p', 117)] }], { W: 1080, H: 1920, captions: new Set(['p']) })).toEqual([]);
});
