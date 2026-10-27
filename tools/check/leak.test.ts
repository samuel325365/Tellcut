import { parseProject, resolveTimes, type Transcript } from '@tellcut/engine';
import { leakFindings, leakProbes, leakUnchecked, shows } from './leak.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
// a clip showing source 10–20 s at film 0–10 s; the sentence 大家好我們出發 is said at source 12–15 s (film 2–5)
const tr: Transcript = { language: 'zh', segments: [{ start: 12, end: 15, text: '大家好我們出發', words: [
  { start: 12, end: 12.6, word: '大家' }, { start: 12.6, end: 13, word: '好' }, { start: 13, end: 14, word: '我們' }, { start: 14, end: 15, word: '出發' }] }] };
const project = (extra: any[]) => parseProject({ version: 1, meta: { name: 't', width: 1080, height: 1920, fps: 30, duration: 10, plugins: [], mix: MIX },
  sources: { v: { path: 'v.mp4', duration: 60, width: 1920, height: 1080 } }, media: {}, grids: [],
  tracks: [{ id: 'v1', kind: 'video', items: [{ id: 'c', source: 'v', in: 10, speed: 1, start: 0, end: 10, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] }, ...extra] });

test('a bleeped word is looked for over the whole sentence it is in; its caption and its beep make one probe', () => {
  const p = project([
    { id: 'text', kind: 'overlay', items: [{ id: 'cap', type: 'common.caption', start: 2, end: 5, params: { text: '{大家}好我們出發' } }] },
    { id: 'sfx', kind: 'sfx', items: [{ id: 'b', type: 'common.beep', start: 2, end: 2.6, params: {}, gain: -10 }, { id: 'b2', type: 'common.beep', start: 4, end: 5, params: {}, gain: -10 }] },
  ]);
  const probes = leakProbes(p, resolveTimes(p), { v: tr });
  expect(probes.map((x) => [x.word, x.at[0], x.at.at(-1)])).toEqual([['大家', 2, 5], ['出發', 2, 5]]);
  expect(probes[0].at).toEqual([2, 2.5, 3, 3.5, 4, 4.5, 5]);
});

test('a warning only where the finished frame shows the word (spaces aside); nothing bleeped, nothing to read', () => {
  const p = project([{ id: 'sfx', kind: 'sfx', items: [{ id: 'b', type: 'common.beep', start: 2, end: 2.6, params: {}, gain: -10 }] }]);
  const probes = leakProbes(p, resolveTimes(p), { v: tr });
  expect(leakFindings(probes, new Map([[2, '好 我 們'], [3.5, '大 家 好 我 們 出 發']])).map((f) => [f.level, f.t])).toEqual([['warn', [3.5, 3.5]]]);
  expect(leakFindings(probes, new Map([[2, '我們出發']]))).toEqual([]);
  expect(leakProbes(project([]), resolveTimes(project([])), { v: tr })).toEqual([]);
});

test('English is matched as whole words, case aside; Chinese anywhere', () => {
  expect(shows('WHAT THE FUCK MAN', 'fuck')).toBe(true);
  expect(shows('This class is boring', 'ass')).toBe(false);
  expect(shows('what, the hell', 'what the')).toBe(true);
  expect(shows('你 這個 他媽的', '他媽')).toBe(true);
});

test('a beep over part of a Chinese word looks for the characters it covers', () => {
  const t2: Transcript = { language: 'zh', segments: [{ start: 12, end: 15, text: '你這個他媽的混蛋', words: [
    { start: 12, end: 12.9, word: '你這個' }, { start: 12.9, end: 13.8, word: '他媽的' }, { start: 13.8, end: 15, word: '混蛋' }] }] };
  // the beep is on 媽 only (film 3.2–3.5 = source 13.2–13.5, the middle third of 他媽的)
  const p = project([{ id: 'sfx', kind: 'sfx', items: [{ id: 'b', type: 'common.beep', start: 3.2, end: 3.5, params: {}, gain: -10 }] }]);
  expect(leakProbes(p, resolveTimes(p), { v: t2 }).map((x) => x.word)).toEqual(['媽']);
});

test('a bleep over a clip whose source has no transcript is named as not checked, rather than passing in silence', () => {
  const p = project([{ id: 'sfx', kind: 'sfx', items: [{ id: 'b', type: 'common.beep', start: 2, end: 2.6, params: {}, gain: -10 }] }]);
  expect(leakUnchecked(p, resolveTimes(p), { v: null }).map((f) => [f.level, f.t])).toEqual([['note', [2, 2.6]]]);
  expect(leakUnchecked(p, resolveTimes(p), { v: tr })).toEqual([]);
});
