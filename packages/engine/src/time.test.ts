import { activeAt, frameOf, resolveTimes, TIME_EPS } from './time.ts';

const proj = (items: any[]): any => ({ tracks: [{ id: 'o', kind: 'overlay', items }] });

test('items without parent keep their own times', () => {
  const t = resolveTimes(proj([{ id: 'a', start: 1, end: 3 }]));
  expect(t.get('a')).toEqual({ start: 1, end: 3 });
});

test('child times are relative to the parent start (nested)', () => {
  const t = resolveTimes(proj([
    { id: 'a', start: 10, end: 20 },
    { id: 'b', start: 2, end: 4, parent: 'a' },
    { id: 'c', start: 0.5, end: 1, parent: 'b' },
  ]));
  expect(t.get('b')).toEqual({ start: 12, end: 14 });
  expect(t.get('c')).toEqual({ start: 12.5, end: 13 });
});

test('throws on unknown parent', () => {
  expect(() => resolveTimes(proj([{ id: 'b', start: 0, end: 1, parent: 'x' }]))).toThrow('Unknown parent "x" for item "b"');
});

test('throws on parent cycles', () => {
  expect(() => resolveTimes(proj([
    { id: 'a', start: 0, end: 1, parent: 'b' },
    { id: 'b', start: 0, end: 1, parent: 'a' },
  ]))).toThrow('Parent cycle: a -> b -> a');
});

// stored times are 6 decimals and film times n/fps are not: 38/30 is stored as 1.266667 (up), 37/30 as 1.233333 (down)
const r6 = (t: number) => Math.round(t * 1e6) / 1e6;

test('frameOf: the frame a time lands on, a hair under a boundary (float noise, a 6-decimal start) still that frame', () => {
  expect(frameOf(42 / 30 - 0.4, 30)).toBe(30);           // 0.9999999999999999
  expect(frameOf(38 / 30 - r6(38 / 30), 30)).toBe(0);     // a start stored a hair late
  for (const fps of [24, 25, 30, 60]) for (let n = 0; n < 600; n++) expect(frameOf(r6(n / fps), fps)).toBe(n);
  expect(frameOf(0.5 / 30, 30)).toBe(0);                  // inside a frame: the one it is in
});

test('activeAt: from its start, to just before its end, at the stored precision', () => {
  const a = { start: 0, end: r6(38 / 30) }, b = { start: r6(38 / 30), end: 3 };
  // frame 38 is b's first: a (its end stored a hair late) used to show over it for that one frame
  expect([activeAt(a, 38 / 30), activeAt(b, 38 / 30)]).toEqual([false, true]);
  expect([activeAt(a, 37 / 30), activeAt(b, 37 / 30)]).toEqual([true, false]);
  const c = { start: r6(37 / 30), end: 2 };                // a start stored a hair early
  expect([activeAt(c, 37 / 30), activeAt(c, 36 / 30)]).toEqual([true, false]);
  expect(TIME_EPS).toBe(1e-6);
});
