// common.progress battery: how many cells are lit, which one is charging, low and full.
import { batteryState } from './battery.ts';

test('batteryState: empty, half and full', () => {
  expect(batteryState(0, 5, -1)).toMatchObject({ lit: 0, charging: 0, low: true, full: false, percent: 0 });
  expect(batteryState(0.5, 5, -1)).toMatchObject({ lit: 2, charging: 2, low: false, percent: 50 });
  expect(batteryState(1, 5, 0.1)).toMatchObject({ lit: 5, charging: -1, full: true, percent: 100 });
  expect(batteryState(0.19, 5, -1).low).toBe(true);
  expect(batteryState(0.2, 5, -1).low).toBe(false);
  // 100 only when full
  expect(batteryState(0.999, 5, -1).percent).toBe(99);
});

test('batteryState: the percentage and the lit cells only go up', () => {
  let pct = -1, lit = -1;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const s = batteryState(Math.min(1, p), 4, -1);
    expect(Number.isInteger(s.percent)).toBe(true);
    expect(s.percent).toBeGreaterThanOrEqual(pct);
    expect(s.lit).toBeGreaterThanOrEqual(lit);
    expect(s.lit).toBeLessThanOrEqual(4);
    pct = s.percent; lit = s.lit;
  }
});

test('batteryState: two blinks within 0.8 s of full, none before or after', () => {
  const at = (since: number) => batteryState(1, 5, since).blink;
  const seen = Array.from({ length: 81 }, (_, i) => at(i / 100));
  expect(seen).toContain(true);
  expect(seen).toContain(false);
  // two separate runs of blinking
  const runs = seen.filter((b, i) => b && !seen[i - 1]).length;
  expect(runs).toBe(2);
  for (const since of [-1, 0.85, 1, 1.5, 3]) expect(at(since)).toBe(false);
  expect(batteryState(0.5, 5, -1).blink).toBe(false);
});
