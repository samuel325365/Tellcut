// common.progress mode osd (the camcorder to-do counter) and common.token: the pure parts.
import { expect, test } from 'vitest';
import { osdState, osdTyped, progress } from './progress.ts';
import token from './token.ts';

test('osd: the count, the last tick and the all-done blink follow the fill times', () => {
  const fills = [0.5, 1, null, 2];
  expect(osdState(fills, 0.2)).toMatchObject({ done: 0, blink: false });
  expect(osdState(fills, 1.1)).toMatchObject({ done: 2, last: 1 });
  // a box without a time never ticks, so the count never reaches all done
  expect(osdState(fills, 9)).toMatchObject({ done: 3, blink: false });
  const all = [0.5, 1];
  expect(osdState(all, 1.05).blink).toBe(false);   // the first fifth of a second after the last tick shows
  expect(osdState(all, 1.25).blink).toBe(true);    // then it blinks
  expect(osdState(all, 2.5).blink).toBe(false);    // and settles
});

test('osd: only the item ticked last is typed, for hold seconds; hold 0 types none', () => {
  const fills = [0.4, 0.9, null, 1.9];
  expect(osdTyped(fills, 0.3, 1.8)).toBe(-1);
  expect(osdTyped(fills, 0.5, 1.8)).toBe(0);
  expect(osdTyped(fills, 1.0, 1.8)).toBe(1);   // a newer tick replaces the one still showing
  expect(osdTyped(fills, 1.8, 0.5)).toBe(-1);  // past its hold
  expect(osdTyped(fills, 2.0, 1.8)).toBe(3);
  expect(osdTyped(fills, 2.0, 0)).toBe(-1);
});

test('osd is one of the modes, with the hold parameter', () => {
  const mode = progress.params.find((d) => d.key === 'mode') as { options: string[] };
  expect(mode.options).toContain('osd');
  expect(progress.params.find((d) => d.key === 'hold')).toMatchObject({ default: 1.8 });
});

test('common.token: a mark sticker whose steps default walks a miss into a made', () => {
  const [t] = token;
  expect(t).toMatchObject({ type: 'common.token', category: 'mark', kind: 'overlay' });
  const steps = String((t.params.find((d: { key: string }) => d.key === 'steps') as { default: string }).default).split('\n');
  expect(steps.map((l) => l.split('|')[3])).toEqual(['none', 'miss', 'none', 'made']);
});
