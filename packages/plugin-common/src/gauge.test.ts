// common.gauge: a readout in words and a neutral look (acceptance films 2026-11-01, F1: a ranking, not a score)
import { gauge, gaugeLook, GUILT_ZONES, ledCells, neutralOf, readoutText } from './gauge.ts';

const P = Object.fromEntries(gauge.params.map((d) => [d.key, d.default])) as any;

test('readout: empty keeps the number; one word stays; several change at each hit, nothing before the first; {v} is the score', () => {
  expect(readoutText('', 2, 40)).toBeNull();
  expect(readoutText(' , ', 2, 40)).toBeNull();
  expect(readoutText('No.1', 0, 0)).toBe('No.1');
  const ranks = '第4, 並列第2, 並列第2, 第1';
  expect([0, 1, 2, 4, 6].map((n) => readoutText(ranks, n, 0))).toEqual(['', '第4', '並列第2', '第1', '第1']);
  expect(readoutText('{v} 分', 3, 27)).toBe('27 分');
});

test('look guilt keeps every param; neutral (the default) swaps only the guilt defaults the item did not set itself', () => {
  expect(P.look).toBe('neutral');
  const G = { ...P, look: 'guilt' };
  expect(gaugeLook(G)).toBe(G);
  const n = gaugeLook({ ...P, look: 'neutral' });
  expect([n.zones, n.halo, n.danger, n.boom]).toEqual(['0:, 25:, 50:, 75:', false, -1, -1]);
  expect(gaugeLook({ ...P, look: 'neutral', max: 40 }).zones).toBe(neutralOf(40).zones);
  expect(neutralOf(40).zones).toBe('0:, 10:, 20:, 30:');
  const own = gaugeLook({ ...P, look: 'neutral', zones: '0:開胃, 20:很香', boom: 3 }, { zones: '0:開胃, 20:很香', boom: 3 });
  expect([own.zones, own.halo, own.danger, own.boom]).toEqual(['0:開胃, 20:很香', false, -1, 3]);
});

test('the doc says how to make a neutral gauge and that the readout can be words', () => {
  expect(gauge.doc).toMatch(/look: neutral/);
  expect(gauge.doc).toMatch(/look: guilt/);
  expect(gauge.doc).toMatch(/halo: false、danger: -1、boom: -1/);
  expect(gauge.doc).toMatch(/readout/);
});

test('neutral: the guilt zones the English or Japanese UI writes into the item count as not set (2026-11-03)', () => {
  // that the English and Japanese ones are the editor's words is apps/editor/src/i18n/gauge-values.test.ts's to check
  expect([GUILT_ZONES.length, GUILT_ZONES[0]]).toEqual([3, P.zones]);
  for (const zones of GUILT_ZONES) expect(gaugeLook({ ...P, zones, look: 'neutral' }, { zones }).zones).toBe(neutralOf(100).zones);
  expect(gaugeLook({ ...P, zones: '0:Clean,20:Treat,40:Naughty,60:Sinful,85:Hell', look: 'neutral' }, { zones: '0:Clean,20:Treat,40:Naughty,60:Sinful,85:Hell' }).zones).toBe(neutralOf(100).zones);
  // a guilt look keeps them, and zones of the item's own stay in neutral
  expect(gaugeLook({ ...P, look: 'guilt', zones: GUILT_ZONES[1] }, { zones: GUILT_ZONES[1] }).zones).toBe(GUILT_ZONES[1]);
  expect(gaugeLook({ ...P, zones: '0:Mild, 50:Hot', look: 'neutral' }, { zones: '0:Mild, 50:Hot' }).zones).toBe('0:Mild, 50:Hot');
});

test('the LED has a cell for every digit of max, at least three', () => {
  expect([1, 100, 999, 1000, 25000, 100000].map(ledCells)).toEqual([3, 3, 3, 4, 5, 6]);
});
