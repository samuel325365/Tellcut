import { demoSeries, jolt, parseBars, parseWide, pchip, priceText, pctText, ymd } from './candles.ts';

test('ymd reads the usual date spellings and refuses the rest', () => {
  expect([ymd('2024-03-08'), ymd('2024/3/8'), ymd('2024.03.08'), ymd('20240308'), ymd('"2024-03-08"')]).toEqual([20240308, 20240308, 20240308, 20240308, 20240308]);
  expect(ymd('Date')).toBeNaN();
});

test('parseBars: Yahoo columns by name, oldest first, nulls skipped, highs and lows cover the open and close', () => {
  const s = parseBars('Date,Open,High,Low,Close,Adj Close,Volume\n2024-01-03,10,12,9,11,11,100\n2024-01-02,9,10,8,10,10,90\n2024-01-04,null,null,null,null,null,0\n2024-01-05,11,11,10,12,12,80\n');
  expect(Array.from(s.D)).toEqual([20240102, 20240103, 20240105]);
  expect(Array.from(s.C)).toEqual([10, 11, 12]);
  expect(s.H[2]).toBe(12);   // the close above the high given
});

test('parseBars: no header, and date,close alone makes flat candles from the previous close', () => {
  expect(Array.from(parseBars('2024-01-02,1,2,0.5,1.5').C)).toEqual([1.5]);
  const s = parseBars('date,close\n2024-01-02,100\n2024-01-03,"1,050.5"');
  expect([s.O[1], s.H[1], s.L[1], s.C[1]]).toEqual([100, 1050.5, 100, 1050.5]);
  const bare = parseBars('2024-01-02,100\n2024-01-03,90');
  expect([bare.O[1], bare.C[1]]).toEqual([100, 90]);
});

test('parseWide: names after the colon, empty cells are not listed yet', () => {
  const w = parseWide('date,AAPL:蘋果,MSFT\n2024-01-03,2,\n2024-01-02,1,5');
  expect(w.cols.map((c) => c.name)).toEqual(['蘋果', 'MSFT']);
  expect(Array.from(w.D)).toEqual([20240102, 20240103]);
  expect(Array.from(w.cols[1].v)).toEqual([5, 0]);
});

test('the made-up series is the same every time and only weekdays', () => {
  const a = demoSeries();
  expect(a.N).toBe(2600);
  expect(a.D[0]).toBe(20000103);
  const days = Array.from(a.D).map((d) => new Date(Date.UTC(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100)).getUTCDay());
  expect(days.every((d) => d > 0 && d < 6)).toBe(true);
});

test('pchip holds still on repeated keys and does not overshoot', () => {
  const f = pchip([0, 1, 2, 3], [0, 10, 10, 20]);
  expect(f(1.5)).toBe(10);
  for (let x = 0; x <= 1; x += 0.05) expect(f(x)).toBeLessThanOrEqual(10);
});

test('words: prices with thousands, signed percentages with a true minus; the shake is the same for the same second', () => {
  expect(priceText(26989.994)).toBe('26,989.99');
  expect([pctText(0.1877), pctText(-0.829)]).toEqual(['+18.77%', '−82.90%']);
  const shake = (t: number) => { const j = jolt('1.2', t, 1); return [j.shock, j.sx, j.sy]; };
  expect(shake(1.3)).toEqual(shake(1.3));
  expect(shake(1.3)[0]).toBeGreaterThan(0);
  expect(jolt('1.2', 1.1, 1).shock).toBe(0);
});
