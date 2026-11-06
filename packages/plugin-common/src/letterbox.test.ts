// common.letterbox's bars and where its words go.
import { letterboxBar, letterboxText } from './letterbox.ts';

test('auto ratio: 2.39 wide, 1.0 tall; a ratio wider than the frame gives no bars', () => {
  expect(letterboxBar(0, 1920, 1080)).toBeCloseTo((1080 - 1920 / 2.39) / 2, 6);
  expect(letterboxBar(0, 1080, 1920)).toBe(420);
  expect(letterboxBar(2.39, 1080, 1920)).toBeCloseTo((1920 - 1080 / 2.39) / 2, 6);
  expect(letterboxBar(1.5, 1920, 1080)).toBe(0);
});
test('tall: the title sits in the top bar below the safe line', () => {
  const t = letterboxText(1080, 1920, 420, { top: 0.115, bottom: 0.22 })!;
  expect(t.room).toBeCloseTo(420 - 220.8, 6);
  expect(t.titleY).toBeGreaterThan(220.8); expect(t.titleY).toBeLessThan(420);
  expect(t.subY).toBeGreaterThan(220.8); expect(t.subY).toBeLessThan(t.titleY);
});
test('tall: a bar no deeper than the safe area shows no words', () => {
  expect(letterboxText(1080, 1920, 230, { top: 0.115, bottom: 0.22 })).toBeNull();
});
test('wide: title centred in the bottom bar, sub in the top one', () => {
  const bar = letterboxBar(0, 1920, 1080), t = letterboxText(1920, 1080, bar, { top: 0.06, bottom: 0.12 })!;
  expect(t.titleY).toBeCloseTo(1080 - bar / 2, 6); expect(t.subY).toBeCloseTo(bar / 2, 6);
});
