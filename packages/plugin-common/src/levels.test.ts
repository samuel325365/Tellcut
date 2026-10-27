import { levelAt, levelFrac, parseLevels, parseStages, stageAt } from './levels.ts';
import { formatValue } from './meter.ts';
import { rampAt } from './ambient.ts';
import { toRgb } from './color.ts';

test('levels: sorted, eased from the last value over `ease` seconds, `:s` jumps; junk left out', () => {
  const l = parseLevels('4:70, 0:0，9:332:s, x:y');
  expect(l).toEqual([{ t: 0, v: 0, snap: false }, { t: 4, v: 70, snap: false }, { t: 9, v: 332, snap: true }]);
  expect(levelAt(l, 2, 0.8)).toBe(0);
  expect(levelAt(l, 4, 0.8)).toBe(0);                         // the move starts at the stop
  expect(levelAt(l, 4.4, 0.8)).toBeCloseTo(70 * 0.875, 5);    // ease-out: most of the way at half time
  expect(levelAt(l, 6, 0.8)).toBe(70);
  expect(levelAt(l, 9, 0.8)).toBe(332);                       // a jump
  expect(levelAt([], 1, 0.8)).toBe(0);
});

test('where a value sits on the ruler: straight or log; max 0 means the largest stop', () => {
  const l = parseLevels('0:0, 1:100, 2:10000');
  expect(levelFrac(5000, l, 0, 'linear')).toBe(0.5);
  expect(levelFrac(100, l, 0, 'log')).toBeCloseTo(Math.log1p(100) / Math.log1p(10000), 6);
  expect(levelFrac(20000, l, 0, 'linear')).toBe(1);
});

test('stages, numbers and the colour ramp', () => {
  const st = parseStages('0:透光帶, 200:暮光帶, 1000:半深海帶');
  expect([stageAt(st, 0), stageAt(st, 332), stageAt(st, 5000)]).toEqual(['透光帶', '暮光帶', '半深海帶']);
  expect([formatValue(11034.4, 0), formatValue(-3.14159, 2), formatValue(999, 0)]).toEqual(['11,034', '-3.14', '999']);
  expect(rampAt([[0, 0, 0], [200, 100, 50]], 0.5)).toEqual([100, 50, 25]);
});

test('stops on both sides of 0 make one ruler from the lowest to the highest; all below 0 keeps the size (a depth written −332)', () => {
  const t = parseLevels('0:-10, 1:30');
  expect([levelFrac(-10, t, 0, 'linear'), levelFrac(10, t, 0, 'linear'), levelFrac(30, t, 0, 'linear')]).toEqual([0, 0.5, 1]);
  expect(levelFrac(10, t, 0, 'log')).toBe(0.5);   // no log scale across 0
  const deep = parseLevels('0:0, 1:-332');
  expect(levelFrac(-166, deep, 0, 'linear')).toBe(0.5);
});

test('ambient colours: hex, rgb() and what the browser knows by name; unknown is black', () => {
  const names = (c: string) => ({ navy: '#000080' } as Record<string, string>)[c] ?? c;
  expect([toRgb('#0c4e80'), toRgb('#fff'), toRgb('rgb(12, 78, 128)'), toRgb('rgba(1 2 3 / 0.5)'), toRgb('navy', names), toRgb('nope', names)])
    .toEqual([[12, 78, 128], [255, 255, 255], [12, 78, 128], [1, 2, 3], [0, 0, 128], [0, 0, 0]]);
});

test('levels and stages typed with a CJK IME: full-width colons and commas', () => {
  expect(parseLevels('0：0，4：70：s')).toEqual([{ t: 0, v: 0, snap: false }, { t: 4, v: 70, snap: true }]);
  expect(parseLevels('0：0, 4:70：1.5')).toEqual([{ t: 0, v: 0, snap: false }, { t: 4, v: 70, snap: false, ease: 1.5 }]);
  expect(parseStages('0：透光帶，200:暮光帶')).toEqual([{ from: 0, name: '透光帶' }, { from: 200, name: '暮光帶' }]);
});
