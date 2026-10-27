// common.camcorder (group E): the status keys, the tape counter that runs with the state, tapes, dates without Date, the typed place,
// the zoom bar, spans, the box and the rewind's stills.
import { defaultSafe } from '@tellcut/engine';
import { camBox, camcorder, camWords, counterAt, dateAt, fmtClock, fmtWhen, parseDates, parseStatus, parseStills, parseWhen, placeAt, readClock, rewIndex, spanAt, statusAt, tapeAt, tapeLabel, zoomAt, CAM_WORDS } from './camcorder.ts';

test('status: "秒|狀態" lines, unknown states dropped, the first one before its time, rec without keys', () => {
  const st = parseStatus('0.5|REC\n2|stop\n3|dance\n1|stby');
  expect(st).toEqual([{ t: 0.5, s: 'rec' }, { t: 1, s: 'stby' }, { t: 2, s: 'stop' }]);
  expect(statusAt(st, 0)).toBe('rec');
  expect(statusAt(st, 1.5)).toBe('stby');
  expect(statusAt(st, 9)).toBe('stop');
  expect(statusAt([], 1)).toBe('rec');
});

test('counter: a key sets it, then it runs with the state (rec 1×, ff/rew spin×, the rest held), never below zero', () => {
  expect(readClock('0:15:06')).toBe(906);
  expect(readClock('2:03')).toBe(123);
  expect(readClock('12.5')).toBe(12.5);
  expect(readClock('x')).toBe(0);
  expect(fmtClock(906)).toBe('0:15:06');
  expect(fmtClock(3725.9)).toBe('1:02:05');
  expect(counterAt('0|0:15:06', '0|rec', 2.5)).toBeCloseTo(908.5);
  // wedding-short: each tape sets its own counter, STOP holds it
  expect(counterAt('0|0\n5|1380', '0|rec\n8|stop', 7)).toBeCloseTo(1382);
  expect(counterAt('0|0\n5|1380', '0|rec\n8|stop', 20)).toBeCloseTo(1383);
  // uk-dv: fast-forward and rewind move it spin times; rewinding stops at zero
  expect(counterAt('0|100', '0|rec\n1|ff\n2|rec', 3, 30)).toBeCloseTo(100 + 1 + 30 + 1);
  expect(counterAt('0|10', '0|rec\n1|rew', 5, 30)).toBe(0);
  expect(counterAt('', '0|stby', 4)).toBe(0);
});

test('tapes: the number in at t, how long since, which one; TAPE 01', () => {
  expect(tapeAt('', 1)).toBeNull();
  expect(tapeAt('0|1\n4|2', 5)).toEqual({ no: '2', since: 1, index: 1 });
  expect(tapeAt('0|1\n4|2', 1)).toEqual({ no: '1', since: 1, index: 0 });
  expect(tapeLabel('TAPE', '3')).toBe('TAPE 03');
  expect(tapeLabel('帶子', 'A2')).toBe('帶子 A2');
});

test('dates: parsed and formatted without Date, a running clock, a roll to another date, a held one, spans', () => {
  const a = parseWhen('2004-08-14 10:30')!;
  expect(a).toBe(Date.UTC(2004, 7, 14, 10, 30) / 1000);
  expect(parseWhen('2022-05-29T12:00:05')).toBe(Date.UTC(2022, 4, 29, 12, 0, 5) / 1000);
  expect(parseWhen('2000-02-29')).toBe(Date.UTC(2000, 1, 29) / 1000);
  expect(parseWhen('tomorrow')).toBeNull();
  const months = CAM_WORDS.months.split(' ');
  expect(fmtWhen(a + 5, 'MMM.DD YYYY|HH:mm:ss', months)).toBe('AUG.14 2004|10:30:05');
  expect(fmtWhen(a, 'YYYY年M月D日 H:mm', months)).toBe('2004年8月14日 10:30');
  expect(fmtWhen(a, 'YY/MM/DD', months)).toBe('04/08/14');
  const L = parseDates('0-2|2004-08-14 10:30\n2-4|2004-08-14 10:30|2004-08-21 10:30\n5|2004-08-21 10:30|0');
  expect(L.map((l) => [l.a, l.b, l.rate, l.to !== undefined])).toEqual([[0, 2, 1, false], [2, 4, 1, true], [5, undefined, 0, false]]);
  expect(dateAt(L, 1.5)).toBe(a + 1);
  expect(dateAt(L, 3)).toBe(a + 3.5 * 86400);   // half way (eased) through a week
  expect(dateAt(L, 4.5)).toBeNull();
  expect(dateAt(L, 50)).toBe(a + 7 * 86400);    // held
  expect(dateAt(parseDates(''), 1)).toBeNull();
  // a line without an end runs until the next one starts
  expect(dateAt(parseDates('0|2004-08-14 10:30\n3|2004-08-15 08:00'), 2)).toBe(a + 2);
});

test('place, zoom and spans', () => {
  expect(placeAt('1-3|塔林 TALLINN', 0.5)).toBe('');
  expect(placeAt('1-3|塔林 TALLINN', 1.0)).toBe('塔');
  expect(placeAt('1-3|塔林 TALLINN', 1.13)).toBe('塔林 ');
  expect(placeAt('1-3|塔林', 3)).toBe('');
  expect(zoomAt('1-2|0.1|0.7', 0.4)).toBeNull();
  expect(zoomAt('1-2|0.1|0.7', 0.6)).toBeCloseTo(0.1);
  expect(zoomAt('1-2|0.1|0.7', 1.5)).toBeCloseTo(0.4);
  expect(zoomAt('1-2|0.1|0.7', 2.2)).toBeCloseTo(0.7);
  expect(zoomAt('1-2|0.1|0.7', 2.4)).toBeNull();
  expect(spanAt('1-2, 4-5', 4.25)).toBeCloseTo(0.25);
  expect(spanAt('1-2', 3)).toBeNull();
});

test('the box: the safe area by default (9:16, 16:9), or fractions', () => {
  expect(camBox('', 1080, 1920, defaultSafe(1080, 1920))).toEqual([0.12 * 1080, 0.115 * 1920, 1080 * 0.76, 1920 * (1 - 0.115 - 0.22)]);
  const wide = camBox('', 1920, 1080, defaultSafe(1920, 1080));
  expect(wide[0]).toBeCloseTo(96); expect(wide[1]).toBeCloseTo(64.8);
  expect(camBox('0.022,0.177,0.956,0.5375', 1080, 1920, defaultSafe(1080, 1920))).toEqual([0.022 * 1080, 0.177 * 1920, 0.956 * 1080, 0.5375 * 1920]);
});

test('words: only the ones given are replaced', () => {
  expect(camWords({ rec: '錄影' }).rec).toBe('錄影');
  expect(camWords({ rec: '錄影' }).stop).toBe('STOP');
  expect(camWords(null)).toEqual(CAM_WORDS);
});

test('rewind: stills "source|seconds|x,y,zoom" (- a stand-in), slots shrinking as the spool spins up; media lists only real stills', () => {
  expect(parseStills('a|2|0.3,0.6,1.4\n-\nb')).toEqual([
    { source: 'a', t: 2, crop: { x: 0.3, y: 0.6, zoom: 1.4 } }, { source: '', t: 0, crop: { x: 0.5, y: 0.5, zoom: 1 } }, { source: 'b', t: 0, crop: { x: 0.5, y: 0.5, zoom: 1 } }]);
  expect(rewIndex(4, 0)).toBe(0);
  expect(rewIndex(4, 0.999)).toBe(3);
  const starts = [0, 1, 2, 3].map((i) => { let q = 0; while (rewIndex(4, q) < i) q += 0.001; return q; });
  expect(starts[1] - starts[0]).toBeGreaterThan(starts[3] - starts[2]);
  const item = { id: 'x', type: 'common.camcorder', start: 0, end: 3, params: { mode: 'rew', stills: 'a|2\n-\nb|1' } };
  expect(camcorder.media!(item as never, {} as never).stills).toEqual([{ source: 'a', t: 2, w: 1080 }, { source: 'b', t: 1, w: 1080 }]);
  expect(camcorder.media!({ ...item, params: { mode: 'osd', stills: 'a|2' } } as never, {} as never).stills).toEqual([]);
});
