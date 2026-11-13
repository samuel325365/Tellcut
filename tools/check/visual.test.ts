import { parseProject, resolveTimes } from '@tellcut/engine';
import { AudioCheck, audioChecks, canvasSizeChecks, captionSizeChecks, drawnText, fallingIds, layoutChecks, sampleTimes, settledWindows, sheetTimes } from './visual.ts';

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

test('with the registry, a block whose words are in params other than text is looked at too, a font param is not words (CC2)', () => {
  const p = proj([
    { id: 'list', start: 2, end: 6, type: 'common.list', params: { title: '三件事', items: 'a/b/c' } },
    { id: 'outro', start: 10, end: 14, type: 'common.outro', params: {} },                 // its default lines are drawn
    { id: 'deco', start: 16, end: 18, type: 'common.deco', params: { fontFamily: 'Noto Sans TC' } },
  ]);
  const defs: Record<string, any[]> = {
    'common.list': [{ key: 'title', type: 'string', default: '' }, { key: 'items', type: 'text', default: '' }, { key: 'size', type: 'number', default: 5 }],
    'common.outro': [{ key: 'lines', type: 'text', default: '謝謝收看' }],
    'common.deco': [{ key: 'fontFamily', type: 'string', default: '' }, { key: 'color', type: 'color', default: '#fff' }],
  };
  const times = resolveTimes(p), params = (t: string) => defs[t];
  expect(sampleTimes(p, times)).toEqual([]);                                 // without the registry: only `text`
  expect(sampleTimes(p, times, params)).toEqual([2.55, 4, 10.55, 12]);
  expect([...settledWindows(p, times, params).keys()]).toEqual(['list', 'outro']);
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

test('layout: each margin of a portrait film, the platform\'s right side, and a 4:5 film has no platform area (TT4)', () => {
  const p = proj([{ id: 't', start: 0, end: 4, type: 'core.caption', params: { text: 'x' } }]);
  const o = { W: 1080, H: 1920, spans: resolveTimes(p) };
  const judge = (x: number, y: number, w: number, h: number, oo: typeof o = o) => layoutChecks([{ t: 2, boxes: [{ id: 't', rects: [{ x, y, w, h }] }] }], oo).map((f) => `${f.level} ${f.msg}`);
  // past the 5 % margins (y 1824 at the bottom, 96 at the top, x 1026 on the right): an error, and not also a platform note
  expect(judge(200, 1850, 400, 60)).toEqual(['error 文字超出安全區（下方）（t）']);
  expect(judge(200, 40, 400, 60)).toEqual(['error 文字超出安全區（上方）（t）']);
  expect(judge(900, 900, 160, 60)).toEqual(['error 文字超出安全區（右邊）（t）']);
  // inside the margins but past the platform's right side (12 %: x 950.4), half way down: one note
  expect(judge(600, 900, 400, 60)).toEqual(['note 文字在短影音平台的介面區（右側），可能被按鈕或說明蓋住（t）']);
  // 4:5 sits in a feed with nothing over it: y 1200–1260 is inside its 5 % margin (1282.5) and judged no further
  const f45 = proj([{ id: 't', start: 0, end: 4, type: 'core.caption', params: { text: 'x' } }], 1080, 1350);
  expect(judge(200, 1200, 400, 60, { W: 1080, H: 1350, spans: resolveTimes(f45) })).toEqual([]);
});

test('a hidden overlay track is not sampled; popDur sets when a popping text stands still (TT4)', () => {
  const hidden = proj([{ id: 'a', start: 2, end: 6, type: 'core.caption', params: { text: '你好' } }]);
  hidden.tracks[0].muted = true;
  expect(sampleTimes(hidden, resolveTimes(hidden))).toEqual([]);
  const pop = proj([{ id: 'a', start: 2, end: 6, type: 'common.slam', params: { text: '好', popDur: 0.8 } }]);
  expect(settledWindows(pop, resolveTimes(pop)).get('a')).toEqual([2.8, 5.7]);
  expect(sampleTimes(pop, resolveTimes(pop))).toEqual([2.9, 4]);
});

test('sound: quiet is under −50 dBFS in the loudest channel, so a soft passage or one silent channel is not "no sound"', () => {
  const rate = 1000, n = 6 * rate, wave = (amp: number) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 3));
  // −30 dBFS RMS (peak 0.0447) for the whole film: soft, not silent
  expect(audioChecks([wave(0.0447)], rate)).toEqual([]);
  // −60 dBFS RMS is
  expect(audioChecks([wave(0.00141)], rate).map((f) => f.msg)).toEqual(['沒有聲音']);
  // left silent, right playing: the right channel is heard
  expect(audioChecks([new Float32Array(n), wave(0.3)], rate)).toEqual([]);
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

test('sound: the mix fed a slice of 16-bit PCM at a time gives what one pass over the whole gives', () => {
  const rate = 1000, wave = (i: number) => 0.3 * Math.sin(i / 3);
  // clipping across a slice edge, quiet that ends in a part-window, and a last part-window under and over half a second
  for (const n of [9400, 9600]) {
    const L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) { L[i] = wave(i); R[i] = 0.5 * wave(i + 7); }
    for (let i = 2995; i < 3105; i++) R[i] = 1;
    for (let i = 5000; i < 7500; i++) L[i] = R[i] = 0.0001;
    for (let i = 8000; i < n; i++) L[i] = R[i] = 0;          // quiet for 2 s only when the part-window at 9 s counts
    // the same samples as the page hands them over: 16-bit, interleaved
    const pcm = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) { pcm.writeInt16LE(Math.round(L[i] * 32767), i * 4); pcm.writeInt16LE(Math.round(R[i] * 32767), i * 4 + 2); }
    const asRead = [L, R].map((_, c) => Float32Array.from({ length: n }, (_, i) => pcm.readInt16LE(i * 4 + c * 2) / 32768));
    const whole = audioChecks(asRead, rate);
    expect(whole.map((x) => x.msg)).toEqual(['爆音（音量到頂）', '沒有聲音', ...(n === 9600 ? ['沒有聲音'] : [])]);
    for (const size of [1, 999, 1000, 4097]) {
      const a = new AudioCheck(2, rate);
      for (let o = 0; o < n; o += size) a.pcm(pcm.subarray(o * 4, Math.min(n, o + size) * 4));
      expect(a.done()).toEqual(whole);
    }
  }
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
  // the player's measured type size wins over the line box: 48 px Huninn has a line box of only about 56 px (1.17), which read
  // as 39 px; and a 40 px type in a tall line box is still too small
  const sized = (id: string, h: number, size: number) => ({ id, rects: [{ x: 100, y: 500, w: 400, h, size }] });
  expect(captionSizeChecks([{ t: 1, boxes: [sized('huninn', 56, 48)] }], { W: 1920, H: 1080, captions: new Set(['huninn']) })).toEqual([]);
  const tall = captionSizeChecks([{ t: 1, boxes: [sized('airy', 90, 40)] }], { W: 1920, H: 1080, captions: new Set(['airy']) });
  expect(tall.map((x) => [x.ids, x.msg.includes('約 40 px')])).toEqual([[['airy'], true]]);
});

test('words an fx reports drawing on a canvas: measured like DOM text (fx items sampled, safe area, overlap), too small, and what they say', () => {
  const p = proj([
    { id: 'cap', start: 0, end: 4, type: 'core.caption', params: { text: '字幕' } },
    { id: 'paint', start: 0.5, end: 4, type: 'fx.paint', params: {} },
    { id: 'tiny', start: 5, end: 7, type: 'fx.tiny', params: {} },
  ]);
  const spans = resolveTimes(p);
  // fx items are measured too; an fx up in a short's first second also at 0.9 s
  expect(sampleTimes(p, spans)).toEqual([0.55, 0.9, 1.05, 2, 2.25, 5.55, 6]);
  const canvas = (id: string, x: number, y: number, size: number, text: string) => ({ id, canvas: true as const, rects: [{ x, y, w: 600, h: size * 1.45, size, text }] });
  const samples = [
    { t: 0.9, boxes: [{ id: 'cap', rects: [{ x: 200, y: 1000, w: 400, h: 100 }] }, canvas('paint', 300, 1010, 80, '出門了')] },
    { t: 2.25, boxes: [canvas('paint', 20, 300, 80, '出門了 這次去海邊')] },
    { t: 6, boxes: [{ ...canvas('tiny', 200, 700, 30, '小字'), rects: [...canvas('tiny', 200, 700, 30, '小字').rects, ...canvas('tiny', 200, 800, 20, '更小').rects] }] },
  ];
  const f = layoutChecks(samples, { W: 1080, H: 1920, spans, settled: settledWindows(p, spans) }).map((x) => `${x.level} ${x.msg}`);
  // still coming in at 0.9 s, so it is not on top of the caption yet; standing at 2.25 s past the left margin
  expect(f).toEqual(['error 文字超出安全區（左邊）（paint）']);
  // judged by its largest words: 80 px is fine, 30 px is not
  const small = canvasSizeChecks(samples, { W: 1080, H: 1920 });
  expect(small).toHaveLength(1);
  expect(small[0]).toMatchObject({ level: 'warn', ids: ['tiny'] });
  expect(small[0].msg).toContain('約 30 px');
  // the floor is 48 px, not just "very small": 47 px is under it, 48 px is not
  expect(canvasSizeChecks([{ t: 6, boxes: [canvas('tiny', 200, 700, 47, '小字')] }], { W: 1080, H: 1920 }).map((x) => x.ids)).toEqual([['tiny']]);
  expect(canvasSizeChecks([{ t: 6, boxes: [canvas('tiny', 200, 700, 48, '小字')] }], { W: 1080, H: 1920 })).toEqual([]);
  const d = drawnText(samples);
  expect(d.words).toEqual(new Map([['paint', '出門了 這次去海邊'], ['tiny', '小字 更小']]));
  expect([...d.early]).toEqual(['cap', 'paint']);
});

test('a frame with no words, a box with no rects and a zero-size rect: nothing judged, measured or counted as early words', () => {
  const p = proj([
    { id: 'cap', start: 0, end: 4, type: 'core.caption', params: { text: 'x' } },
    { id: 'paint', start: 0, end: 4, type: 'fx.paint', params: {} },
  ]);
  const W = 1080, H = 1920, spans = resolveTimes(p);
  // a frame the player found no words in, and boxes with nothing measured in them (the caption not drawn yet)
  const empty = [{ t: 0.5, boxes: [] }, { t: 0.6, boxes: [{ id: 'cap', rects: [] }, { id: 'paint', canvas: true as const, rects: [] }] }];
  expect(layoutChecks(empty, { W, H, spans })).toEqual([]);
  expect(captionSizeChecks(empty, { W, H, captions: new Set(['cap']) })).toEqual([]);
  expect(canvasSizeChecks(empty, { W, H })).toEqual([]);
  const d = drawnText(empty);
  expect([d.words, d.early]).toEqual([new Map(), new Set()]);
  // the caption measured later at a big enough size: its empty frame does not make it "0 px"
  expect(captionSizeChecks([...empty, { t: 2, boxes: [{ id: 'cap', rects: [{ x: 200, y: 900, w: 400, h: 117 }] }] }], { W, H, captions: new Set(['cap']) })).toEqual([]);
  // a zero-size rect in the corner or at the bottom is no text past the margin
  expect(layoutChecks([{ t: 2, boxes: [{ id: 'cap', rects: [{ x: 0, y: 0, w: 0, h: 60 }, { x: 0, y: 1900, w: 400, h: 0 }] }] }], { W, H, spans })).toEqual([]);
});

test('early words: a box with rects before 1 s; an empty box before it, or words from 1 s on, are not', () => {
  const r = [{ x: 200, y: 900, w: 400, h: 100 }];
  const d = drawnText([
    { t: 0.5, boxes: [{ id: 'blank', rects: [] }, { id: 'seen', rects: r }] },
    { t: 1, boxes: [{ id: 'blank', rects: r }, { id: 'late', rects: r }] },
  ]);
  expect([...d.early]).toEqual(['seen']);
});

test('overlap is between two items: one item\'s DOM and canvas words over each other are not, each pair once over the time both show', () => {
  const p = proj([
    { id: 'a', start: 10, end: 12, type: 'core.caption', params: { text: 'x' } },
    { id: 'b', start: 11, end: 14, type: 'core.lowerThird', params: { text: 'x' } },
  ]);
  const o = { W: 1080, H: 1920, spans: resolveTimes(p) }, r = { x: 200, y: 1000, w: 400, h: 60 };
  // layoutBoxes hands an item's DOM text and what it reported drawing on its canvas as two boxes of the same id
  expect(layoutChecks([{ t: 11.5, boxes: [{ id: 'a', rects: [r] }, { id: 'a', canvas: true as const, rects: [{ ...r, x: 300 }] }] }], o)).toEqual([]);
  const f = layoutChecks([
    { t: 11.5, boxes: [{ id: 'b', rects: [r] }, { id: 'a', rects: [{ ...r, x: 300 }] }, { id: 'a', canvas: true as const, rects: [r] }] },
    { t: 11.8, boxes: [{ id: 'a', rects: [r] }, { id: 'b', rects: [{ ...r, y: 1030 }] }] },
  ], o);
  expect(f.map((x) => `${x.level} ${x.t!.join('-')} ${x.msg}`)).toEqual(['warn 11-12 文字互相重疊（a、b）']);
  // side by side, touching: not on top of each other
  expect(layoutChecks([{ t: 11.5, boxes: [{ id: 'a', rects: [r] }, { id: 'b', rects: [{ ...r, x: 600, w: 300 }] }] }], o)).toEqual([]);
});

test('the 0.9 s frame: only for an fx that starts before 0.9 s, in a portrait film of three minutes at most', () => {
  const at = (items: any[], w = 1080, h = 1920, duration = 20) => { const p = proj(items, w, h); p.meta.duration = duration; return sampleTimes(p, resolveTimes(p)); };
  const fx = (start: number) => ({ id: 'fx', start, end: start + 4, type: 'fx.paint', params: {} });
  expect(at([fx(0.5)])).toEqual([0.9, 1.05, 2.5]);
  expect(at([fx(0.85)])).toEqual([0.9, 1.4, 2.85]);
  expect(at([fx(0.9)])).toEqual([1.45, 2.9]);                                                   // from 0.9 s on: its own frames
  expect(at([{ id: 'cap', start: 0.5, end: 4.5, type: 'core.caption', params: { text: 'x' } }])).toEqual([1.05, 2.5]);   // a text, not an fx
  expect(at([fx(0.5)], 1920, 1080)).toEqual([1.05, 2.5]);                                       // landscape
  expect(at([fx(0.5)], 1080, 1080)).toEqual([1.05, 2.5]);                                       // square
  expect(at([fx(0.5)], 1080, 1920, 180)).toEqual([0.9, 1.05, 2.5]);
  expect(at([fx(0.5)], 1080, 1920, 181)).toEqual([1.05, 2.5]);                                  // longer than a short
});
