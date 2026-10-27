// The blocks promoted from the food-receipt and food-deep shorts (2026-10-19): the receipt printer kit and the queue-number board kit.
import { defaultSafe } from '@tellcut/engine';
import { marqueeX, typedChars, dotmatrix } from './dotmatrix.ts';
import { digits, digitsAt, parseSteps } from './digits.ts';
import { fedAt, printer, printerAdds, printerLines, stair, stampSpot, totalNumber, userLine } from './printer.ts';
import { doorAt, rolldoor } from './rolldoor.ts';
import { callout, calloutLabel } from './callout.ts';
import { slip, slipRows } from './slip.ts';
import { rayAt } from './burst.ts';
import { charPop } from './slam.ts';
import { F57, SEG, segsOf } from './dots.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)!.default as any;

test('dots: the VFD font has every digit as 7 rows of 5, and the seven segments light the right bars', () => {
  for (const ch of '0123456789NT$-+?') { expect(F57[ch], ch).toHaveLength(7); expect(F57[ch].every((r) => r.length === 5), ch).toBe(true); }
  expect(SEG['8']).toHaveLength(7);
  expect(segsOf('1')).toBe('bc');
  expect(segsOf('-')).toBe('g');
  expect(segsOf('?')).toBe('');
});

test('dotmatrix: typing reaches every character by its time, the marquee enters from the right and wraps', () => {
  expect(typedChars(10, 0, 1.2)).toBe(0);
  expect(typedChars(10, 0.01, 1.2)).toBe(1);
  expect(typedChars(10, 1.2, 1.2)).toBe(10);
  expect(typedChars(10, 5, 1.2)).toBe(10);
  expect(marqueeX(0, 100, 50, 80)).toBe(50);              // starts just off the right edge
  expect(marqueeX(1.3, 100, 50, 80)).toBeCloseTo(50, 6);  // one full pass later it is back
  expect(marqueeX(0.65, 100, 50, 80)).toBeLessThan(0);
  expect(def(dotmatrix, 'mode')).toBe('marquee');
});

test('digits: steps add up (+n), show text as is (02, --), count up over 0.55 s, and a later set starts again', () => {
  const st = parseSteps('1|+95, 0|--|叫號, 2|+?, 3|02|下一位, 4|+5');
  expect(st.map((s) => [s.t, s.v, s.add, s.n, s.label])).toEqual([[0, '--', false, null, '叫號'], [1, '+95', true, 95, ''], [2, '+?', true, null, ''], [3, '02', false, 2, '下一位'], [4, '+5', true, 5, '']]);
  expect(digitsAt(st, -1, 2, '0').text).toBeNull();
  expect(digitsAt(st, 0.5, 2, '0').text).toBe('--');
  expect(digitsAt(st, 1.2, 3, ' ').text).not.toBe(' 95');   // still counting up
  expect(digitsAt(st, 1.6, 3, ' ').text).toBe(' 95');
  expect(digitsAt(st, 2.5, 3, ' ').text).toBe(' 95');       // +? only flashes
  expect(digitsAt(st, 3.2, 2, '0').text).toBe('02');
  expect(digitsAt(st, 5, 2, '0').text).toBe('07');
  expect(digitsAt(st, 5, 2, '0').last?.v).toBe('+5');
  // the defaults count to 195 and turn into the total inside the 3 s gallery preview
  const d = parseSteps(def(digits, 'steps'));
  expect(digitsAt(d, 2.9, 5, ' ').text).toBe('  195');
  expect(def(digits, 'totalAt')).toBeLessThan(3);
});

test('printer: lines laid out down the paper, the motor feeds in steps, amounts become subtotal steps', () => {
  const L = printerLines('0|title|這一圈\n0.5|shop|01 阿桃\n1|item|湯圓|95\n1.5|item|土雞|秤重計價\n2|weird|x');
  expect(L.lines.map((l) => [l.kind, l.y])).toEqual([['title', 30], ['shop', 130], ['item', 200], ['item', 256], ['item', 312]]);
  expect(L.len).toBe(368);
  expect(stair(0)).toBe(0);
  expect(stair(1)).toBe(1);
  expect(stair(0.33)).toBeCloseTo(stair(0.38), 6);           // a pause between two moves
  expect(fedAt(L.lines, -1)).toBe(30);
  expect(fedAt(L.lines, 10)).toBe(L.len);
  expect(printerAdds('', L.lines).map((s) => [s.t, s.v])).toEqual([[1.2, '+95']]);   // 秤重計價 is not a number
  expect(printerAdds('3|+5|+5 試吃', L.lines).map((s) => s.label)).toEqual(['+5 試吃']);
  // the defaults finish printing (and stamp) inside the 3 s preview
  const D = printerLines(def(printer, 'lines'));
  expect(Math.max(...D.lines.map((l) => l.t))).toBeLessThan(2.5);
  expect(def(printer, 'stampAt')).toBeLessThan(3);
});

test('rolldoor: down closes over its time and stays shut; up starts shut and opens', () => {
  expect(doorAt(0, 0.3, 0.6, 'down')).toBe(0);
  expect(doorAt(0.9, 0.3, 0.6, 'down')).toBe(1);
  expect(doorAt(0.6, 0.3, 0.6, 'down')).toBeGreaterThan(0.5);
  expect(doorAt(0, 0.3, 0.6, 'up')).toBe(1);
  expect(doorAt(2, 0.3, 0.6, 'up')).toBe(0);
  expect(def(rolldoor, 'at') + def(rolldoor, 'dur')).toBeLessThan(3);
});

test('callout: the label goes to the roomier side and never leaves the safe area', () => {
  const W = 1080, H = 1920, safe = defaultSafe(W, H);
  const r = calloutLabel(0.8, 0.3, -1, -1, 300, 60, W, H, safe);
  expect(r.ax).toBeLessThan(0.8 * W);                        // target on the right: label on the left
  expect(r.fromLeft).toBe(false);
  const far = calloutLabel(0.95, 0.05, 1, 0, 500, 60, W, H, safe);
  expect(far.left).toBeGreaterThanOrEqual(W * safe.side - 1e-6);
  expect(far.left + 500).toBeLessThanOrEqual(W * (1 - safe.side) + 1e-6);
  expect(far.top).toBeGreaterThanOrEqual(H * safe.top - 1e-6);
  expect(def(callout, 'kind')).toBe('circle');
});

test('slip: board rows from lines or |; burst rays fly out and fade; slam chars pop one after another', () => {
  expect(slipRows('a\nb | c\n\n')).toEqual(['a', 'b', 'c']);
  expect(def(slip, 'mode')).toBe('stub');
  const a = rayAt(0, 14, 0), b = rayAt(0, 14, 0.3);
  expect(b.r0).toBeGreaterThan(a.r0);
  expect(rayAt(3, 14, 0.6).alpha).toBe(0);
  expect(charPop(0, 0.5).q).toBe(1);
  expect(charPop(3, 0.2).opacity).toBe(0);
  expect(charPop(3, 0.6).scale).toBeCloseTo(1, 6);
});

test('printer stamp: on the signature line, else in a strip left under the total (never on it); the display ends on the total', () => {
  const text = '0|item|湯圓|95\n0.3|total|合計|NT$355起\n0.5|note|＊註';
  const bare = printerLines(text, true), total = bare.lines.find((l) => l.kind === 'total')!;
  expect(bare.lines.map((l) => l.kind)).toEqual(['item', 'total', 'stamp', 'note']);
  const spot = stampSpot(bare.lines, -1)!;
  expect(spot.line.kind).toBe('stamp');
  expect(spot.y - 70).toBeGreaterThanOrEqual(total.y + total.h);   // half the stamp's height clears the total
  expect(userLine(bare.lines, 2)?.kind).toBe('note');                // indices as written skip the strip
  const signed = printerLines(`${text}\n0.7|sign|簽章：`, true);
  expect(signed.lines.some((l) => l.kind === 'stamp')).toBe(false);
  expect(stampSpot(signed.lines, -1)!.line.kind).toBe('sign');
  expect(printerLines(text, false).lines).toHaveLength(3);
  expect(totalNumber(bare.lines)).toBe(355);
  const steps = printerAdds('', bare.lines, 2);
  expect(digitsAt(steps, 1.5, 5, ' ').text).toBe('   95');
  expect(digitsAt(steps, 2.1, 5, ' ').text?.trim()).toBe('355');
});
