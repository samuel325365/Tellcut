// common.gauge: a readout in words and a neutral look (acceptance films 2026-11-01, F1: a ranking, not a score)
import { gauge, gaugeLook, neutralOf, readoutText } from './gauge.ts';

const P = Object.fromEntries(gauge.params.map((d) => [d.key, d.default])) as any;

test('readout: empty keeps the number; one word stays; several change at each hit, nothing before the first; {v} is the score', () => {
  expect(readoutText('', 2, 40)).toBeNull();
  expect(readoutText(' , ', 2, 40)).toBeNull();
  expect(readoutText('No.1', 0, 0)).toBe('No.1');
  const ranks = '第4, 並列第2, 並列第2, 第1';
  expect([0, 1, 2, 4, 6].map((n) => readoutText(ranks, n, 0))).toEqual(['', '第4', '並列第2', '第1', '第1']);
  expect(readoutText('{v} 分', 3, 27)).toBe('27 分');
});

test('look guilt (the default) keeps every param; neutral swaps only the guilt defaults the item did not set itself', () => {
  expect(P.look).toBe('guilt');
  expect(gaugeLook(P)).toBe(P);
  const n = gaugeLook({ ...P, look: 'neutral' });
  expect([n.zones, n.halo, n.danger, n.boom]).toEqual(['0:, 25:, 50:, 75:', false, -1, -1]);
  expect(gaugeLook({ ...P, look: 'neutral', max: 40 }).zones).toBe(neutralOf(40).zones);
  expect(neutralOf(40).zones).toBe('0:, 10:, 20:, 30:');
  const own = gaugeLook({ ...P, look: 'neutral', zones: '0:開胃, 20:很香', boom: 3 }, { zones: '0:開胃, 20:很香', boom: 3 });
  expect([own.zones, own.halo, own.danger, own.boom]).toEqual(['0:開胃, 20:很香', false, -1, 3]);
});

test('the doc says how to make a neutral gauge and that the readout can be words', () => {
  expect(gauge.doc).toMatch(/look: neutral/);
  expect(gauge.doc).toMatch(/halo: false、danger: -1、boom: -1/);
  expect(gauge.doc).toMatch(/readout/);
});
