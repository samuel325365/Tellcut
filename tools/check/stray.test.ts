import { parseProject, resolveTimes } from '@tellcut/engine';
import { strayFindings, strayPlan, strayTimes, videoOnly } from './stray.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const clip = (id: string, start: number, end: number, o: object = {}) => ({ id, start, end, source: 'v', in: 0, speed: 1, crop, ...o });
// a 1000 × 1000 film: a panel clip in [0.1, 0.2, 0.8, 0.5] over a blurred full-screen copy, then a full-screen clip; a caption on top
const project = () => parseProject({ version: 1, meta: { name: 't', width: 1000, height: 1000, fps: 30, duration: 6, plugins: [], mix: MIX },
  sources: { v: { path: 'v.mp4', duration: 60, kind: 'video' }, ph: { path: 'p.jpg', duration: 3600, kind: 'image' } }, media: {}, grids: [],
  tracks: [
    { id: 'bg', kind: 'video', items: [clip('blur', 0, 3, { defocus: { from: 0, to: 0, px: 30 } })] },
    { id: 'v1', kind: 'video', magnetic: true, items: [clip('pan', 0, 3, { frame: [0.1, 0.2, 0.8, 0.5] }), clip('full', 3, 6)] },
    { id: 'text', kind: 'overlay', items: [{ id: 'cap', type: 'core.caption', start: 0, end: 6, params: { text: '我們的字' } }] },
  ] });

test('the film is read with its own video only: no overlays, no blurred backdrop', () => {
  const q = videoOnly(project());
  expect(q.tracks.map((t) => t.id)).toEqual(['bg', 'v1']);
  expect(q.tracks[0].items).toEqual([]);
  expect(project().tracks).toHaveLength(3);   // the project itself untouched
});

test('sample times: every second, and one frame inside both ends of each clip, within the film', () => {
  const p = project(), at = strayTimes(p, resolveTimes(p));
  // r3c-baking: a subtitle typing on in a clip's last 0.3 s showed "Cre" one frame before the cut and nothing 0.12 s before it;
  // both sides of a cut are read (the text may be on either)
  expect(at).toEqual([{ t: 0.05, edge: true }, { t: 0.5 }, { t: 1.5 }, { t: 2.5 }, { t: 2.95, edge: true }, { t: 3.05, edge: true }, { t: 3.5 }, { t: 4.5 }, { t: 5.5 }, { t: 5.95, edge: true }]);
  expect(strayTimes(p, resolveTimes(p), 4)).toHaveLength(4);
  // over the limit the clip ends stay and the seconds are thinned (CC7); clip ends alone over it are spread and counted
  const six = strayPlan(p, resolveTimes(p), 6);
  expect([six.at.filter((x) => x.edge).length, six.at.length, six.skipped]).toEqual([4, 6, 0]);
  const two = strayPlan(p, resolveTimes(p), 2);
  expect([two.at, two.skipped]).toEqual([[{ t: 0.05, edge: true }, { t: 5.95, edge: true }], 2]);
});

test('text read in a clip: against the frame edge a warning, whole text one note, readable only, the same text once over its span', () => {
  const p = project(), times = resolveTimes(p);
  const read = new Map([
    [0.5, [{ text: 'Raw sug', box: [0.1, 0.4, 0.12, 0.03] as [number, number, number, number] }, { text: 'l', box: [0.5, 0.5, 0.005, 0.005] as [number, number, number, number] }]],
    [1.5, [{ text: 'Raw sug', box: [0.1, 0.4, 0.12, 0.03] as [number, number, number, number] }]],
    [3.5, [{ text: '在家做生魚片', box: [0.3, 0.3, 0.2, 0.04] as [number, number, number, number] }]],
    [4.5, [{ text: '外面', box: [0.05, 0.05, 0.06, 0.02] as [number, number, number, number] }]],
  ]);
  const f = strayFindings(p, times, read);
  expect(f).toHaveLength(2);
  expect(f[0]).toMatchObject({ level: 'warn', t: [0.5, 1.5], ids: ['pan'], msg: expect.stringContaining('「Raw sug」') });
  expect(f[1]).toMatchObject({ level: 'note', ids: ['full'], msg: expect.stringContaining('0:03.5「在家做生魚片」') });
  expect(f[1].msg).toContain('0:04.5「外面」');
});

test('two CJK letters are readable; two private-use or symbol characters OCR made of texture are not', () => {
  const p = project(), times = resolveTimes(p), box = [0.3, 0.3, 0.2, 0.04] as [number, number, number, number];
  const at = (text: string) => strayFindings(p, times, new Map([[3.5, [{ text, box }]]]));
  // the Han range once ran on from U+8C48 to U+FAFF, through the private-use area
  expect(at('')).toEqual([]);
  expect(at('。。')).toEqual([]);
  for (const text of ['外面', 'ひと', '안녕', '豈更']) expect(at(text), text).toHaveLength(1);
});

test('text is the topmost shown clip\'s: a hidden track draws nothing, and its clips get no edge frames', () => {
  const p = project() as any;
  p.tracks.push({ id: 'hid', kind: 'video', muted: true, items: [clip('ghost', 0, 1.2, { frame: [0, 0, 1, 1] })] });
  p.tracks.push({ id: 'over', kind: 'video', items: [clip('pip', 3, 6, { frame: [0.25, 0.25, 0.5, 0.5] })] });
  const q = parseProject(p), times = resolveTimes(q);
  expect(strayTimes(q, times).some((x) => x.t === 1.15)).toBe(false);   // the hidden clip's tail
  const read = new Map([[3.5, [{ text: '在家做生魚片', box: [0.3, 0.45, 0.2, 0.04] as [number, number, number, number] }]], [0.5, [{ text: 'Raw sugar', box: [0.4, 0.75, 0.2, 0.04] as [number, number, number, number] }]]]);
  // at 3.5 the picture-in-picture is on top of the full clip; at 0.5 the text lies outside the panel and only the hidden clip covers it
  expect(strayFindings(q, times, read).map((f) => f.ids)).toEqual([['pip']]);
});

test('text against a clip\'s right or bottom edge is cut, within 1 % of it; a frame past the screen is cut by the screen\'s edge', () => {
  const p = project() as any;
  // a clip hanging off the bottom right of the screen from 3 s: [0.5, 0.5] to [1.2, 1.2], the screen's edge cuts it at 1
  p.tracks.push({ id: 'over', kind: 'video', items: [clip('big', 3, 6, { frame: [0.5, 0.5, 0.7, 0.7] })] });
  const q = parseProject(p), times = resolveTimes(q), b = (x: number, y: number, w: number, h: number) => [x, y, w, h] as [number, number, number, number];
  const read = new Map([
    // the panel clip [0.1, 0.2, 0.8, 0.5]: its right edge at 0.9, its bottom at 0.7
    [0.5, [{ text: 'right cut', box: b(0.7, 0.4, 0.195, 0.03) }, { text: 'right whole', box: b(0.7, 0.3, 0.17, 0.03) },
      { text: 'bottom cut', box: b(0.4, 0.66, 0.1, 0.035) }, { text: 'bottom whole', box: b(0.25, 0.64, 0.1, 0.03) }]],
    [3.5, [{ text: 'screen right', box: b(0.8, 0.7, 0.195, 0.03) }, { text: 'screen bottom', box: b(0.6, 0.9, 0.1, 0.095) }, { text: 'inside big', box: b(0.6, 0.6, 0.2, 0.03) }]],
  ]);
  const f = strayFindings(q, times, read);
  expect(f.filter((x) => x.level === 'warn').map((x) => [x.msg.match(/「(.+?)」/)![1], x.ids![0]])).toEqual([['right cut', 'pan'], ['bottom cut', 'pan'], ['screen right', 'big'], ['screen bottom', 'big']]);
  expect(f.filter((x) => x.level === 'note').map((x) => [...x.msg.matchAll(/「(.+?)」/g)].map((m) => m[1]))).toEqual([['right whole', 'bottom whole', 'inside big']]);
});

test('a still photo gets no clip-end frames (nothing types on in it), nor does a clip of under 0.4 s; text in a photo is read at the seconds', () => {
  const p = project() as any, before = strayTimes(project(), resolveTimes(project()));
  p.tracks.push({ id: 'top', kind: 'video', items: [clip('photo', 1, 2.5, { source: 'ph' }), clip('blip', 4, 4.3)] });
  const q = parseProject(p), times = resolveTimes(q);
  expect(strayTimes(q, times)).toEqual(before);
  const read = new Map([[1.5, [{ text: '在家做生魚片', box: [0.3, 0.45, 0.2, 0.04] as [number, number, number, number] }]]]);
  expect(strayFindings(q, times, read).map((f) => f.ids)).toEqual([['photo']]);
});
