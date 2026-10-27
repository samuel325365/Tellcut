// The blocks added with the library expansion (2026-10-18): countdown, list, rating, info card, polaroid.
import { countAt } from './countdown.ts';
import { listItems, shownItems } from './list.ts';
import { ratingRows, starFills } from './rating.ts';
import { infoBottom, infoRows } from './info.ts';
import { caption } from './caption.ts';
import { DEFAULT_THEME } from '@tellcut/engine';
import { polaroid } from './polaroid.ts';

test('countdown: the item is shared evenly from `from` to `to`; the last step can say a word instead', () => {
  expect(countAt(3, 0, 4, 0)).toEqual({ text: '3', step: 0, into: 0 });
  expect(countAt(3, 0, 4, 1.5)).toEqual({ text: '2', step: 1, into: 0.5 });
  expect(countAt(3, 0, 4, 3.9).text).toBe('0');
  expect(countAt(3, 0, 4, 3.5, 'GO!').text).toBe('GO!');
  expect(countAt(3, 0, 4, 10).text).toBe('0');                                     // past the end: the last step stays
  expect(countAt(10, 0, 11, 2.2).text).toBe('8');
});

test('list: one item a line; pros marks lines starting with - as cons; items come in one by one', () => {
  expect(listItems('先過篩\n小火慢煎\n翻一次就好', 'check').map((i) => [i.mark, i.text, i.good])).toEqual([['✓', '先過篩', true], ['✓', '小火慢煎', true], ['✓', '翻一次就好', true]]);
  expect(listItems('份量大|- 要排隊|便宜', 'pros').map((i) => [i.mark, i.text, i.good])).toEqual([['+', '份量大', true], ['−', '要排隊', false], ['+', '便宜', true]]);
  expect(listItems('a|b', 'number').map((i) => i.mark)).toEqual(['1', '2']);
  expect(listItems('先過篩，再加水', 'check')).toHaveLength(1);                         // a comma belongs to the sentence
  expect([shownItems(3, 0.2, 0.4, 0.3), shownItems(3, 0.75, 0.4, 0.3), shownItems(3, 5, 0.4, 0.3)]).toEqual([0, 2, 3]);
});

test('rating: rows of 項目:分數; each star filled by how much of it the score covers, growing in', () => {
  expect(ratingRows('口味:4.5, 份量：4,  CP值:5, 壞的')).toEqual([{ label: '口味', value: 4.5 }, { label: '份量', value: 4 }, { label: 'CP值', value: 5 }]);
  expect(starFills(3.5, 5, 1)).toEqual([1, 1, 1, 0.5, 0]);
  expect(starFills(4, 5, 0.5)).toEqual([1, 1, 0, 0, 0]);                           // half way in: half the score shown
});

test('info: rows of icon and text; a row without its own icon gets a dot', () => {
  expect(infoRows('📍 台北市中山區, 🕐 11:00–20:00\n價格便宜')).toEqual([{ icon: '📍', text: '台北市中山區' }, { icon: '🕐', text: '11:00–20:00' }, { icon: '•', text: '價格便宜' }]);
});

test('polaroid: it asks for the still of its source moment before drawing (exports prepare it)', () => {
  const m = polaroid.media!({ id: 'p', type: 'common.polaroid', start: 0, end: 2, params: { source: 'v', t: 12.3 } } as any, {} as any);
  expect(m).toEqual({ videos: [], stills: [{ source: 'v', t: 12.3, w: 720 }] });
  expect(polaroid.media!({ id: 'p', type: 'common.polaroid', start: 0, end: 2, params: {} } as any, {} as any)).toEqual({ videos: [], stills: [] });
});

test('info at the bottom sits above two lines of speech captions (they share the bottom safe line)', () => {
  const size = caption.params.find((p) => p.key === 'size')!.default as number, b = DEFAULT_THEME.safe.bottom;
  expect(infoBottom(b) - b).toBeGreaterThanOrEqual((2 * size * 1.25) / 100);
  expect(infoBottom(b)).toBeLessThan(0.45);
});
