import { thumbPct } from './thumbs.ts';

const info = { interval: 1, width: 160, height: 90, cols: 10, count: 25, url: '' };

test('thumbPct: one frame of the atlas placed by percentages, for a card of any width', () => {
  // second 13: column 3, row 1 of 3 rows
  const x = thumbPct(info, 13);
  expect(x.size).toBe('1000% auto');
  expect(x.bg).toBe(`${(3 / 9) * 100}% 50%`);
  expect(x.aspect).toBeCloseTo(160 / 90);
  // past the end: the last frame; a single row: y 0%
  expect(thumbPct(info, 99).bg).toBe(`${(4 / 9) * 100}% 100%`);
  expect(thumbPct({ ...info, count: 6 }, 2).bg).toBe(`${(2 / 9) * 100}% 0%`);
});
