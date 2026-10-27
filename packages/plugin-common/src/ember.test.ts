// The modes and looks promoted from the seoul-bbq short (2026-10-28, group D): common.chart's ranking revealed from the last place up
// with tie brackets, and the ember (charcoal-fire) look of common.tag and common.stamp. Their defaults leave the blocks as they were.
import { resolveTheme } from '@tellcut/engine';
import { chart, chartPlan, chartRows, ranks, rankStarts, textW, tieRuns, type ChartP } from './chart.ts';
import { emberLetter, emberTimes, tag } from './tag.ts';
import { emberLand, stamp } from './stamp.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)!.default;
const opts = (t: { params: Array<{ key: string }> }, key: string) => (t.params.find((p) => p.key === key) as unknown as { options: string[] }).options;
const defaults = Object.fromEntries(chart.params.map((d) => [d.key, d.default])) as unknown as ChartP;
const BAKERY = 'Garlic cream||1\nMatcha roll||2\nCurry bun||2\nMelon pan||3\nBaguette||4';
const plan = (over: Partial<ChartP>, local: number, W = 1080, H = 1920) => chartPlan({ ...defaults, kind: 'rank', ...over }, W, H, resolveTheme(undefined, { width: W, height: H }), local);

test('opt-in: chart reveals down, tag is a pill, stamp a box by default; the new options are there', () => {
  expect([def(chart, 'reveal'), def(tag, 'look'), def(stamp, 'shape')]).toEqual(['down', 'pill', 'box']);
  expect(opts(chart, 'reveal')).toEqual(['down', 'up']);
  expect(opts(tag, 'look')).toContain('ember');
  expect(opts(stamp, 'shape')).toContain('ember');
});

test('ties: rows given the same place share it, and the runs of them are found (gaps and single rows are not runs)', () => {
  const rk = ranks(chartRows(BAKERY));
  expect(rk).toEqual([1, 2, 2, 3, 4]);
  expect(tieRuns(rk)).toEqual([[1, 2]]);
  expect(tieRuns([1, 2, 0, 0, 5, 5, 5])).toEqual([[4, 6]]);
  expect(tieRuns(ranks(chartRows('a|5\nb|4\nc|3')))).toEqual([]);
});

test('reveal up: the last place first, tied rows together, the winner last at at + grow; down is the old top-to-bottom step', () => {
  const up = rankStarts([1, 2, 2, 3, 4], 'up', 0.3, 1.4);
  expect(up[4]).toBeCloseTo(0.3);
  expect(up[3]).toBeGreaterThan(up[4]);
  expect(up[1]).toBe(up[2]);
  expect(up[0]).toBeCloseTo(0.3 + 1.4);
  expect(up[0] - up[1]).toBeCloseTo((up[1] - up[3]) * 1.5);  // a half step more before the winner
  expect(rankStarts([1, 2, 3], 'down', 0.3, 1.4)).toEqual([0.3, 0.42, 0.54].map((x) => expect.closeTo(x, 9)));
  expect(rankStarts([1], 'up', 0.3, 1.4)).toEqual([0.3]);
});

test('reveal up in the plan: early on only the bottom rows show; at the end every row, the tie bracket and its word', () => {
  const shown = (local: number) => plan({ data: BAKERY, reveal: 'up', tie: 'TIED', hl: '1', note: 'No. 1', unit: '', source: '' }, local).texts.filter((t) => (t.a ?? 1) > 0).map((t) => t.id);
  const early = shown(0.5);
  expect(early).toContain('l4');
  expect(early).not.toContain('l0');
  expect(early).not.toContain('tie0');
  const end = plan({ data: BAKERY, reveal: 'up', tie: 'TIED', hl: '1', note: 'No. 1', unit: '', source: '' }, 2.8);
  expect(end.texts.filter((t) => (t.a ?? 1) > 0).map((t) => t.id)).toEqual(expect.arrayContaining(['l0', 'l1', 'l2', 'l3', 'l4', 'tie0', 'note']));
  expect(end.marks.some((m) => m.t === 'path')).toBe(true);
  // no tie word = no bracket, and the bracket's column stays inside the card
  expect(plan({ data: BAKERY, tie: '' }, 2.8).texts.some((t) => t.id.startsWith('tie'))).toBe(false);
  const tw = end.texts.find((t) => t.id === 'tie0')!, card = end.card!;
  expect(tw.x - textW(tw.text, tw.size)).toBeGreaterThan(card.x);
  expect(tw.x).toBeLessThan(card.x + card.w);
});

test('tag ember: the plate slides in within 0.28 s, the bar glows down, letters burn on 0.03 s apart and cool over 0.7 s', () => {
  expect(emberTimes(0, 3).slide).toBe(0);
  expect(emberTimes(0.28, 3).slide).toBeCloseTo(1);
  expect(emberTimes(2.75, 3).out).toBeCloseTo(1);
  expect(emberTimes(3, 3).out).toBe(0);
  expect(emberTimes(0.2, 3).glow).toBe(1);
  expect(emberTimes(1.4, 3).glow).toBe(0);
  expect(emberLetter(0, 0.16).a).toBe(0);
  expect(emberLetter(0, 0.22).a).toBeCloseTo(1);
  expect(emberLetter(2, 0.22).a).toBe(0);
  expect(emberLetter(0, 0.86).cool).toBeCloseTo(1);
});

test('stamp ember: lands from 1.45× with an overshoot, shows within 0.08 s, cools from 0.15 s over 0.9 s', () => {
  expect(emberLand(0).scale).toBeCloseTo(1.45);
  expect(emberLand(0.22).scale).toBeCloseTo(1);
  expect(Math.min(...[0.1, 0.13, 0.16, 0.19].map((t) => emberLand(t).scale))).toBeLessThan(1);
  expect(emberLand(0.08).alpha).toBe(1);
  expect(emberLand(0.15).cool).toBe(0);
  expect(emberLand(1.05).cool).toBe(1);
});
