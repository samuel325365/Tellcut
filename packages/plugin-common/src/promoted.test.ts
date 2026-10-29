// The blocks promoted from the simulated-user shorts (2026-10-18/19): progress tabs, scoreboard, tripclock, card, receipt.
import { activeStep } from './progress.ts';
import { clockAt, clockText, hm, parseClock, routeAt, sinceText } from './tripclock.ts';
import { cardLayout } from './card.ts';
import { feed, parseReceipt } from './receipt.ts';

test('tabs: a fixed step lights that chapter from the item start; -1 walks through them with the time', () => {
  expect(activeStep(2, 5, 0.3, 4)).toEqual({ active: 2, since: 0.3 });
  expect(activeStep(9, 5, 0.3, 4).active).toBe(4);
  expect(activeStep(-1, 4, 2.5, 4)).toEqual({ active: 2, since: 0.5 });
  expect(activeStep(-1, 4, 4, 4).active).toBe(3);
});

test('scoreboard: text shrinks to its room, never below 40 %', () => {
  expect(fitPx('12', 60, 500)).toBe(60);
  expect(fitPx('東洋鱸東洋鱸', 60, 180)).toBe(30);
  expect(fitPx('一二三四五六七八九十', 60, 10)).toBe(24);
});

test('tripclock: times parsed and sorted, the clock rolls to each stop, junk left out', () => {
  expect(hm('06:26')).toBe(386);
  expect(hm('6.26')).toBeNaN();
  const stops = parseClock('3=09:24, 0=06:26, x=1:00, 5=nope');
  expect(stops).toEqual([[0, 386], [3, 564]]);
  expect(clockAt(stops, 2.9, 1)).toBe(386);
  expect(clockAt(stops, 3.5, 1)).toBeGreaterThan(386);
  expect(clockAt(stops, 4.1, 1)).toBe(564);
  expect(clockAt(stops, 3, 0)).toBe(564);
});

test('tripclock: the since line uses the words given, and is empty without an arrival time', () => {
  expect(sinceText(564, '06:26', '落地後', '降落中')).toBe('落地後  2h 58m');
  expect(sinceText(380, '06:26', '落地後', '降落中')).toBe('降落中');
  expect(sinceText(564, '', 'since', 'before')).toBe('');
});

test('tripclock: midnight — the clock rolls the short way round, the since line keeps counting past 00:00', () => {
  const fwd = parseClock('0=23:50, 1=00:10');
  expect(clockAt(fwd, 1.5, 1)).toBeGreaterThan(1430);   // 23:50 → 00:10 goes forward 20 minutes, not back through the day
  expect(clockText(clockAt(fwd, 2, 1))).toBe('00:10');
  const back = parseClock('0=00:10, 1=23:50');
  expect(clockAt(back, 1.5, 1)).toBeLessThan(10);
  expect(clockText(clockAt(back, 2, 1))).toBe('23:50');
  expect(hm('6：26')).toBe(386);   // typed with a CJK IME
  // landed 23:00; the clock started at 22:30
  expect(sinceText(1350, '23:00', '落地後', '降落中', 1350)).toBe('降落中');
  expect(sinceText(1530, '23:00', '落地後', '降落中', 1350)).toBe('落地後  2h 30m');   // 01:30 the next day
  expect(sinceText(90, '23:00', '落地後', '降落中')).toBe('落地後  2h 30m');
  // a long day: 13 h after landing is still after it, and landing before the clip starts is in the past
  expect(sinceText(1200, '06:26', '落地後', '降落中', 386)).toBe('落地後  13h 34m');
  expect(sinceText(600, '06:26', '落地後', '降落中', 540)).toBe('落地後  3h 34m');
});

test('tripclock: the route eases into each station at its time and stops at the last', () => {
  const at = [0, 1, 2];
  expect(routeAt(at, 3, 0.5)).toBe(0);
  expect(routeAt(at, 3, 1.45)).toBeGreaterThan(0.5);
  expect(routeAt(at, 3, 1.95)).toBeCloseTo(1, 5);
  expect(routeAt(at, 3, 9)).toBe(2);
});

test('card: the picture window takes what the text rows leave; a short card shrinks the rows so the picture keeps 40 %', () => {
  const a = cardLayout(768, 821);
  expect(a.k).toBe(1);
  expect(a.win).toEqual({ x: 26, y: 34, w: 716, h: 473 });
  expect(a.lineTop).toBe(521);
  const low = cardLayout(768, 400);
  expect(low.k).toBeCloseTo((400 * 0.6) / 348, 6);
  expect(low.win.h).toBeCloseTo(160, 6);
});

test('card: on 16:9 (defaults: 1459 × 562 px) the rows fit inside the card; 9:16 keeps k = width / 768', () => {
  const cw = 0.76 * 1920, ch = 0.52 * 1080, c = cardLayout(cw, ch);
  expect(c.lineTop + 224 * c.k + 19 * c.k).toBeLessThan(ch);   // the tip's bottom
  expect(c.win.h).toBeGreaterThanOrEqual(ch * 0.4 - 1e-6);
  expect(c.k).toBeLessThan(1.1);   // about the 9:16 card's size, not 1.9 (k from the width)
  expect(cardLayout(0.76 * 1080, 0.52 * 1920).k).toBe((0.76 * 1080) / 768);
});

test('receipt: lines parsed with defaults for missing fields, blanks dropped', () => {
  expect(parseReceipt('0.5|✈|機票|×1|n\n\n 2 |🐟|釣到\nx|||')).toEqual([
    { t: 0.5, icon: '✈', name: '機票', value: '×1', tone: 'n' },
    { t: 2, icon: '🐟', name: '釣到', value: '', tone: 'n' },
    { t: 0, icon: '', name: '', value: '', tone: 'n' },
  ]);
});

test('receipt: 【word】 marks the emphasised part of the total', () => {
  expect(emParts('這輩子【最貴】的魚')).toEqual([['這輩子', false], ['最貴', true], ['的魚', false]]);
  expect(emParts('合計')).toEqual([['合計', false]]);
});

test('receipt: the paper feeds one line per item, and only `room` lines stay in view', () => {
  const lines = parseReceipt('0|a|a|1\n1|b|b|2\n2|c|c|3');
  expect(feed(lines, -0.1, 5).fed).toBe(0);
  expect(feed(lines, 1.5, 5)).toEqual({ fed: 2, visible: 2, scroll: 0 });
  const f = feed(lines, 3, 2);
  expect(f.fed).toBe(3); expect(f.visible).toBe(2); expect(f.scroll).toBe(1);
});

// promoted from a food-review hook short (2026-10-19): route, outro, mystery, caption pop
import { reachAt, routeBox } from './route.ts';
import { parsePairs, snake } from './inkline.ts';
import { outroLayout, outroLines } from './outro.ts';
import { tapeText } from './mystery.ts';
import { popAt } from './caption.ts';
import { emParts, fitPx } from './text.ts';

test('route: the promises are number|words pairs, blanks dropped', () => {
  expect(parsePairs('1|條商圈, 10|分鐘走完，6|家')).toEqual([['1', '條商圈'], ['10', '分鐘走完'], ['6', '家']]);
  expect(parsePairs(' , ')).toEqual([]);
  expect(parsePairs('9')).toEqual([['9', '']]);
});

test('route: the stops snake along the top and back along the bottom', () => {
  const pts = snake(7);
  expect(pts).toHaveLength(7);
  expect(pts.slice(0, 4).every(([, y]) => y < 0.6)).toBe(true);
  expect(pts.slice(4).every(([, y]) => y > 0.6)).toBe(true);
  expect(pts[0][0]).toBeCloseTo(0.14); expect(pts[3][0]).toBeCloseTo(0.84); expect(pts[6][0]).toBeCloseTo(0.24);
  expect(snake(3)).toHaveLength(3);
  expect(snake(1)).toHaveLength(2);
});

test('route: the card keeps inside the safe area, and the last stop is reached at the end of the drawing', () => {
  const safe = { top: 0.115, bottom: 0.22, side: 0.12 };
  const tall = routeBox({ x: 0.5, y: -1, w: 0.8, h: 1 }, 1080, 1920, safe);
  expect(tall.w).toBeLessThanOrEqual(1080 * 0.76 + 1e-6);
  expect(tall.y0).toBeGreaterThan(0.115 * 1920);
  expect(tall.y0 + tall.h).toBeLessThan(0.78 * 1920);
  const wide = routeBox({ x: 0.5, y: -1, w: 0.8, h: 1 }, 1920, 1080, { top: 0.06, bottom: 0.12, side: 0.05 });
  expect(wide.h).toBeCloseTo(1080 * 0.82);
  expect(reachAt(6, 6, 1, 3)).toBeCloseTo(2.95);
  expect(reachAt(3, 6, 1, 3)).toBeCloseTo(1.95);
});

test('outro: lines break on real or typed newlines, and a long stack shrinks to fit a wide frame', () => {
  expect(outroLines('完整路線\n和【6 家】\n\n都在原片')).toEqual(['完整路線', '和【6 家】', '都在原片']);
  const tall = outroLayout(3, 1080, 1920, { top: 0.115, bottom: 0.22 });
  expect(tall.u).toBe(1);
  const wide = outroLayout(3, 1920, 1080, { top: 0.06, bottom: 0.12 });
  expect(wide.u).toBeLessThan(1);
  expect(wide.dotsY).toBeLessThan(1080 * 0.88);
});

test('mystery: the tape word repeats, none when empty', () => {
  expect(tapeText('揭曉', 3)).toBe('揭曉　・　揭曉　・　揭曉');
  expect(tapeText('')).toBe('');
});

test('caption pop: characters come in one after another, all in by the end', () => {
  expect(popAt(0, 10, 0).opacity).toBe(0);
  expect(popAt(0, 10, 0.2).opacity).toBeGreaterThan(popAt(5, 10, 0.2).opacity);
  expect(popAt(9, 10, 1)).toEqual({ opacity: 1, rise: 0, scale: 1 });
  expect(popAt(29, 30, 0.08 + 29 * 0.02 + 0.18).opacity).toBe(1);
});
