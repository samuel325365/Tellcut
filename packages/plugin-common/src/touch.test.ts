// Group A1 (2026-10-23): common.touch's gestures, common.headline's type-in, common.film's vhs tracking bands.
import { fingersAt, parseTouches, pathAt } from './touch.ts';
import { typedSplit } from './headline.ts';
import { parseTracking } from './film.ts';

test('touch: tap, drag, pinch and press lines parse with their times and points; junk is dropped', () => {
  const g = parseTouches('0.5|tap|0.5,0.4\n1.1-1.9|drag|0.3,0.6>0.5,0.5>0.7,0.6\n2.2-2.8|pinch|0.5,0.5|0.4>0.15\n1|press|0.2,0.3\nnope\n3|wave|0.1,0.1\n4|tap|x');
  expect(g.map((x) => x.kind)).toEqual(['tap', 'drag', 'pinch', 'press']);
  expect(g[0]).toMatchObject({ t0: 0.5, t1: 0.5, pts: [[0.5, 0.4]] });
  expect(g[1]).toMatchObject({ t0: 1.1, t1: 1.9 });
  expect(g[1].pts).toHaveLength(3);
  expect(g[2].span).toEqual([0.4, 0.15]);
  expect(g[3].t1).toBeCloseTo(1.8, 9);                   // a press without an end is held 0.8 s
  expect(parseTouches(['0.2|tap|0.1,0.2'])).toHaveLength(1);   // an array of lines works too
  expect(parseTouches('0.2|tap|0.1,0.2\\n0.6|tap|0.3,0.4')).toHaveLength(2);   // a typed \n too
});

test('touch: a drag goes through its points evenly in time; a pinch closes its two fingers about the point', () => {
  expect(pathAt([[0, 0], [1, 0], [1, 1]], 0)).toEqual([0, 0]);
  expect(pathAt([[0, 0], [1, 0], [1, 1]], 0.5)).toEqual([1, 0]);
  expect(pathAt([[0, 0], [1, 0], [1, 1]], 1)).toEqual([1, 1]);
  const [p] = parseTouches('0-1|pinch|0.5,0.5|0.4>0.1');
  const spread = (t: number) => { const [a, b] = fingersAt(p, t, 1080, 1920); return Math.hypot((a[0] - b[0]) * 1080, (a[1] - b[1]) * 1920); };
  expect(spread(0)).toBeCloseTo(0.4 * 1080, 3);
  expect(spread(1)).toBeCloseTo(0.1 * 1080, 3);
  const [a, b] = fingersAt(p, 0.5, 1080, 1920);
  expect((a[0] + b[0]) / 2).toBeCloseTo(0.5, 9);
  expect((a[1] + b[1]) / 2).toBeCloseTo(0.5, 9);
});

test('headline: the type-in fills the lines in order, the rest kept to hold their place', () => {
  expect(typedSplit(['那年夏天', '我們去了'], 0)).toEqual([['', '那年夏天'], ['', '我們去了']]);
  expect(typedSplit(['那年夏天', '我們去了'], 6)).toEqual([['那年夏天', ''], ['我們', '去了']]);
  expect(typedSplit(['ab'], 99)).toEqual([['ab', '']]);
});

test('film vhs: tracking bands are start:length:strength, strength 0.6 when left out, bad ones dropped', () => {
  expect(parseTracking('0.2:1.5:0.8, 3:0.5, x:1, 4:0')).toEqual([[0.2, 1.5, 0.8], [3, 0.5, 0.6]]);
  expect(parseTracking('')).toEqual([]);
  expect(parseTracking('1:1:7')).toEqual([[1, 1, 1]]);
});
