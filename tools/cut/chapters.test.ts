import { chapters, chronological } from './chapters.ts';

const at = (id: string, taken?: string, takenGuess?: boolean) => ({ id, taken, takenGuess });

test('one day: chapters split at gaps over 2 hours, named by date and morning/afternoon; guessed times go last', () => {
  expect(chapters([at('b', '2026-03-07T10:40:00'), at('a', '2026-03-07T10:00:00'), at('c', '2026-03-07T14:00:00'), at('z', '2026-03-09T08:00:00', true)]))
    .toEqual([{ title: '3/7 上午', ids: ['a', 'b'] }, { title: '3/7 下午', ids: ['c'] }, { title: '未知時間', ids: ['z'] }]);
});

test('several days: 第 N 天, with morning/afternoon only when a day has more than one chapter', () => {
  expect(chapters([at('a', '2026-03-07T10:00:00'), at('b', '2026-03-08T09:00:00'), at('c', '2026-03-08T15:00:00')]).map((c) => c.title))
    .toEqual(['第 1 天', '第 2 天 上午', '第 2 天 下午']);
  expect(chronological([at('x', '2026-03-08T09:00:00'), at('g', undefined), at('w', '2026-03-07T09:00:00')]).map((x) => x.id)).toEqual(['w', 'x', 'g']);
});

test('a flight east across the date line: order by the real moment (zones kept), dates and morning/afternoon by local time', () => {
  // Taipei 10:19 (+08:00) is earlier than Seattle 05:24 (-07:00) on the same date
  const xs = [
    { id: 'arrive', taken: '2025-07-14T06:23:56', takenOffset: '-07:00' }, { id: 'plane', taken: '2025-07-14T05:24:01', takenOffset: '-07:00' },
    { id: 'depart', taken: '2025-07-14T10:19:30', takenOffset: '+08:00' }, { id: 'city', taken: '2025-07-14T09:11:40', takenOffset: '-07:00' },
  ];
  expect(chronological(xs).map((x) => x.id)).toEqual(['depart', 'plane', 'arrive', 'city']);
  // three mornings of one date: each says when it starts, in its own local time
  expect(chapters(xs)).toEqual([{ title: '7/14 上午 10:19', ids: ['depart'] }, { title: '7/14 上午 5:24', ids: ['plane', 'arrive'] }, { title: '7/14 上午 9:11', ids: ['city'] }]);
});

test('chapters that would share a name (three mornings of one day) also say when they start', () => {
  expect(chapters([at('a', '2026-03-07T06:00:00'), at('b', '2026-03-07T08:30:00'), at('c', '2026-03-07T11:05:00'), at('d', '2026-03-07T15:00:00')]).map((c) => c.title))
    .toEqual(['3/7 上午 6:00', '3/7 上午 8:30', '3/7 上午 11:05', '3/7 下午']);
  expect(chapters([at('a', '2026-03-07T06:00:00'), at('b', '2026-03-07T09:00:00'), at('c', '2026-03-08T10:00:00')]).map((c) => c.title))
    .toEqual(['第 1 天 上午 6:00', '第 1 天 上午 9:00', '第 2 天']);
});
