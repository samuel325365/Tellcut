// common.progress stamps (spec 2026-11-22, progress more modes): how the cells split into rows, the card's size and its cells'
// centres, and which stamps are down.
import { sinceAt } from './shared.ts';
import { stampCard, stampRows, stampStates } from './stamps.ts';

test('stampRows: one row up to six, else two with the upper holding the larger half', () => {
  expect(stampRows(5)).toEqual([5, 0]);
  expect(stampRows(6)).toEqual([6, 0]);
  expect(stampRows(7)).toEqual([4, 3]);
  expect(stampRows(10)).toEqual([5, 5]);
  expect(stampRows(12)).toEqual([6, 6]);
  expect(stampRows(2)).toEqual([2, 0]);
  // nonsense counts: at least one cell
  expect(stampRows(0)).toEqual([1, 0]);
  expect(stampRows(NaN)).toEqual([1, 0]);
});

test('stampCard: padding 0.35 of a cell, gaps 0.25; one row of five', () => {
  const c = stampCard(5, 46, 1000);
  expect(c.cell).toBe(46);
  expect(c.w).toBeCloseTo(5 * 46 + 4 * 11.5 + 2 * 16.1, 9);
  expect(c.h).toBeCloseTo(46 + 2 * 16.1, 9);
  expect(c.centres).toHaveLength(5);
  expect(new Set(c.centres.map((p) => p.y)).size).toBe(1);
  expect(c.centres[0].x).toBeCloseTo(16.1 + 23, 9);
  expect(c.centres[4].x).toBeCloseTo(c.w - 16.1 - 23, 9);
  for (let i = 1; i < 5; i++) expect(c.centres[i].x - c.centres[i - 1].x).toBeCloseTo(46 * 1.25, 9);
});

test('stampCard: twelve cells in a narrow card shrink to fit, in two rows', () => {
  const c = stampCard(12, 80, 400);
  expect(c.w).toBeLessThanOrEqual(400 + 1e-9);
  expect(c.cell).toBeLessThan(80);
  expect(c.centres).toHaveLength(12);
  const rows = [...new Set(c.centres.map((p) => p.y.toFixed(6)))];
  expect(rows).toHaveLength(2);
  expect(c.h).toBeCloseTo(2 * c.cell + 0.25 * c.cell + 0.7 * c.cell, 9);
  // every cell inside the card, padding and all
  for (const p of c.centres) {
    expect(p.x - c.cell / 2).toBeGreaterThanOrEqual(0.35 * c.cell - 1e-9);
    expect(p.x + c.cell / 2).toBeLessThanOrEqual(c.w - 0.35 * c.cell + 1e-9);
  }
});

test('stampCard: an uneven second row is centred under the first', () => {
  const c = stampCard(7, 40, 1000), top = c.centres.slice(0, 4), low = c.centres.slice(4);
  expect(low).toHaveLength(3);
  expect((low[0].x + low[2].x) / 2).toBeCloseTo((top[0].x + top[3].x) / 2, 9);
  expect(low[0].y).toBeGreaterThan(top[0].y);
});

test('stampCard: no cell size or no room gives no NaN', () => {
  for (const c of [stampCard(1, 0, 400), stampCard(5, 46, 0), stampCard(12, NaN, 400), stampCard(5, -3, 400)]) {
    for (const v of [c.cell, c.w, c.h, ...c.centres.flatMap((p) => [p.x, p.y])]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  }
});

test('stampStates: cell i is stamped once the progress reaches (i + 1) / n, the newest the last one down', () => {
  const only = stampStates(5, 0.39, () => 1);
  expect(only.map((s) => s.in > 0)).toEqual([true, false, false, false, false]);
  const two = stampStates(5, 0.4, () => 1);
  expect(two.map((s) => s.in > 0)).toEqual([true, true, false, false, false]);
  expect(two.map((s) => s.newest)).toEqual([false, true, false, false, false]);
  expect(stampStates(5, 0.19, () => 1).every((s) => s.in === 0 && !s.newest)).toBe(true);
  // 0.2 s to land
  expect(stampStates(4, 0.5, (i) => [1, 0.1, 0, 0][i]).map((s) => s.in)).toEqual([1, 0.5, 0, 0]);
  expect(stampStates(5, 1, () => Infinity).every((s) => s.in === 1)).toBe(true);
  expect(stampStates(2, 1, () => NaN).map((s) => s.in)).toEqual([1, 1]);
});

test('stampStates: the stamps down only ever grow with progress, one newest whenever any is down', () => {
  let before = 0;
  for (let k = 0; k <= 100; k++) {
    const p = k / 100, st = stampStates(7, p, () => 1), down = st.filter((s) => s.in > 0).length;
    expect(down).toBeGreaterThanOrEqual(before);
    before = down;
    expect(st.filter((s) => s.newest).length).toBe(down ? 1 : 0);
  }
  expect(before).toBe(7);
});

test('stampStates with sinceAt: a chapter has the stamps before it down from the start, its own landing at its end', () => {
  const dur = 4, span = 3, n = 5, step = 2, since = (local: number) => (i: number) => sinceAt(step, n, (i + 1) / n, local, dur);
  const start = stampStates(n, 2 / 5, since(0));
  expect(start.map((s) => s.in)).toEqual([1, 1, 0, 0, 0]);
  const mid = stampStates(n, (2 + 0.5) / 5, since(span / 2));
  expect(mid.map((s) => s.in)).toEqual([1, 1, 0, 0, 0]);
  const end = stampStates(n, 3 / 5, since(span + 0.1));
  expect(end[2].in).toBeCloseTo(0.5, 9);
  expect(end[2].newest).toBe(true);
});
