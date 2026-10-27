// The blocks promoted from the podcast-quote and podcast-versus shorts (2026-10-19): the pull-quote kit and the he-says / she-says kit.
import { quote, quoteHit, quoteLines, quoteSizes, quoteTimes } from './quote.ts';
import { wipe, wipeEdges } from './wipe.ts';
import { duo, duoLayout, duoLevel, duoWindow, parseSegs } from './duo.ts';
import { tableLayout, versus, versusRows } from './versus.ts';
import { saidLevel } from './caption.ts';
import { caption } from './caption.ts';
import { header } from './header.ts';
import { panel } from './panel.ts';
import { stamp } from './stamp.ts';
import { backdrop } from './backdrop.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)!.default as any;

test('quote: lines and words, the hit line, word times spread over the item when not given, sizes by line', () => {
  const lines = quoteLines('但 如果 今天\n你/討厭/早起，\\n\n去睡吧');
  expect(lines).toEqual([['但', '如果', '今天'], ['你', '討厭', '早起，'], [], ['去睡吧']]);
  expect(quoteHit(lines, -1)).toBe(3);
  expect(quoteHit(lines, 1)).toBe(1);
  expect(quoteHit([[], []], -1)).toBe(-1);
  // given times win when there is one for every word
  expect(quoteTimes(lines, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.9], 3, 3)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.9]);
  // else: the six words before the hit spread from 0.25 s, the hit line at 62 % of the item
  const t = quoteTimes(lines, [], 3, 3);
  expect(t[0]).toBe(0.25);
  expect(t.slice(0, 6).every((x, i) => i === 0 || x > t[i - 1])).toBe(true);
  expect(t[5]).toBeLessThanOrEqual(0.55 * 3 + 1e-6);
  expect(t[6]).toBeCloseTo(Math.max(0.62 * 3, t[5] + 0.35), 6);
  expect(quoteSizes('60,118', 3, 2, false)).toEqual([60, 118, 232]);
  expect(quoteSizes('', 3, 1, true)).toEqual([64, 92, 64]);
  // the gallery's 3 s preview: the default quote slams inside it, and the defaults are the podcast-quote layout
  const d = quoteTimes(quoteLines(def(quote, 'text')), [], quoteHit(quoteLines(def(quote, 'text')), -1), 3);
  expect(d[d.length - 1]).toBeLessThan(2.5);
  expect(def(quote, 'sizes')).toBe('60,118,118,96,232');
});

test('wipe: the band grows from the left, covers everything at the middle, then leaves to the right', () => {
  const W = 1080, sl = 0.35 * W;
  expect(wipeEdges(0, W, sl)).toEqual([-sl, -sl]);
  const [l, r] = wipeEdges(0.5, W, sl);
  expect(l).toBe(-sl); expect(r).toBe(W + sl);   // the slanted band covers the whole frame (left foot off the left, right top off the right)
  expect(wipeEdges(1, W, sl)).toEqual([W + sl, W + sl]);
  expect(wipeEdges(0.25, W, sl)[1]).toBeGreaterThan(W / 2);   // easing out: past the middle at a quarter
  expect(def(wipe, 'dir')).toBe('right');
});

test('duo: the layout of the two panels and the band, who speaks when, the speaker lit with short ramps', () => {
  const L = duoLayout();
  expect(L.a.map((x) => Math.round(x * 1920))).toEqual([0, 200, 1920, 760]);
  expect(L.band[1] * 1920).toBeCloseTo(960, 0);
  expect(L.b[1] * 1920).toBeCloseTo(1110, 0);
  expect((L.b[1] + L.b[3]) * 1920).toBeCloseTo(1870, 0);
  expect(duoWindow('b')).toEqual(L.b);
  const H = duoLayout({ dir: 'h', top: 0.1, band: 0.2, foot: 0 });
  expect(H.a).toEqual([0, 0.1, 0.5, 0.7]);
  expect(H.b).toEqual([0.5, 0.1, 0.5, 0.7]);
  expect(H.band).toEqual([0, 0.8, 1, 0.2]);
  const segs = parseSegs('0-2|a, 2-4|2\n4-4.5|AB\nnonsense\n5-6|both');
  expect(segs).toEqual([[0, 2, 'a'], [2, 4, 'b'], [4, 4.5, 'ab'], [5, 6, 'ab']]);
  expect(duoLevel(segs, 'a', 1)).toBe(1);
  expect(duoLevel(segs, 'b', 1)).toBe(0);
  expect(duoLevel(segs, 'a', 4.2)).toBe(1);
  expect(duoLevel(segs, 'b', 4.2)).toBe(1);
  expect(duoLevel(segs, 'a', 1.93)).toBeCloseTo(0.5, 6);   // ramping down over its last 0.14 s
  // the gallery's 3 s preview shows both speakers in turn
  const d = parseSegs(def(duo, 'segs'));
  expect(d.some(([a, , w]) => w === 'a' && a < 1)).toBe(true);
  expect(d.some(([a, b, w]) => w === 'b' && b <= 3)).toBe(true);
});

test('versus: the table rows (with typed line breaks and tags), and its plan fits the safe area at any shape', () => {
  const rows = versusRows('Q1|甲\\n說|乙說\nQ2|a|b|他問|她答\n只有一欄');
  expect(rows).toEqual([{ q: 'Q1', a: '甲\n說', b: '乙說', at: '', bt: '' }, { q: 'Q2', a: 'a', b: 'b', at: '他問', bt: '她答' }]);
  expect(versusRows(def(versus, 'rows'))).toHaveLength(3);
  for (const [W, H] of [[1080, 1920], [1920, 1080], [1080, 1080]]) {
    const k = Math.min(W, H) / 1080, safe = H > W ? { top: 0.115, bottom: 0.22 } : { top: 0.06, bottom: 0.12 }, T = tableLayout(3, H, k, safe);
    expect(T.head).toBeGreaterThanOrEqual(safe.top * H);
    expect(T.first + 3 * T.pitch).toBeLessThanOrEqual(T.ask);
    expect(T.ask + 65 * k).toBeLessThanOrEqual((1 - safe.bottom) * H + 1);
  }
  expect(def(versus, 'mode')).toBe('round');
});

test('caption fill: each character lights from the step that says it and stays lit', () => {
  const words: Array<[number, number]> = [[0.5, 2], [1, 5]];
  expect(saidLevel(words, 0, 0.3)).toBe(0);
  expect(saidLevel(words, 1, 0.7)).toBe(1);
  expect(saidLevel(words, 3, 0.7)).toBe(0);
  expect(saidLevel(words, 3, 1.2)).toBe(1);
  expect(saidLevel(words, 3, 5)).toBe(1);
  expect(saidLevel(words, 9, 5)).toBe(0);   // past the last step: never said
});

test('the new looks are opt-in: the old defaults stay as they were', () => {
  expect(def(caption, 'fill')).toBe(false);
  expect(def(caption, 'align')).toBe('center');
  expect(def(caption, 'point')).toBe('none');
  expect(def(caption, 'role')).toBe('');
  expect(def(header, 'look')).toBe('chip');
  expect(def(panel, 'look')).toBe('panel');
  expect(def(stamp, 'shape')).toBe('box');
  expect(def(stamp, 'anchor')).toBe('center');
  expect(def(backdrop, 'pattern')).toBe('gingham');
  for (const t of [quote, wipe, duo, versus]) expect(t.doc, t.type).toBeTruthy();
});
