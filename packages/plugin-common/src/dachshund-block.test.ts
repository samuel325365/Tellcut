import { expect, test } from 'vitest';
import { dachshund, dogPose, frameTimes } from './dachshund-block.ts';

test('the dachshund is a moment block the agent uses only on request', () => {
  expect(dachshund).toMatchObject({ type: 'common.dachshund', category: 'moment', kind: 'overlay', onRequest: true });
  expect(dachshund.params.map((p) => p.key)).toEqual(['action', 'x0', 'x1', 'y', 'size', 'facing', 'look', 'steps', 'source', 'times', 'scroll', 'cutAt']);
  expect(dachshund.doc).toMatch(/只有使用者要 Tellcut 臘腸狗時才用/);
});

test('it asks for five stills of its source, and none when there is no source', () => {
  expect(dachshund.media!({ params: { source: 'pic', times: '1,2' } } as any, {} as any).stills).toHaveLength(5);
  expect(dachshund.media!({ params: { source: '' } } as any, {} as any).stills).toEqual([]);
});

test('frame times: the given ones first, then on from the last every 1.5 s, five in all', () => {
  expect(frameTimes('1, 2')).toEqual([1, 2, 3.5, 5, 6.5]);
  expect(frameTimes('')).toEqual([0, 1.5, 3, 4.5, 6]);
  expect(frameTimes('9,8,7,6,5,4')).toEqual([9, 8, 7, 6, 5]);
});

test('walking swings the legs in opposite phase; sitting lowers the rear; a cut parts the body and closes again', () => {
  const walk = dogPose('walk', 0.115, { steps: 2.2, cutAt: 1 });
  expect(Math.sign(walk.frontLeg)).toBe(-Math.sign(walk.backLeg));
  expect(Math.abs(walk.frontLeg)).toBeGreaterThan(10);
  expect(dogPose('sit', 2, { steps: 2.2, cutAt: 1 })).toMatchObject({ body: -5, head: 5 });
  expect(dogPose('sit', 2, { steps: 2.2, cutAt: 1 }).fold).toBeLessThan(0.5);
  expect(dogPose('cut', 1.15, { steps: 2.2, cutAt: 1 }).split).toBeGreaterThan(3);
  expect(dogPose('cut', 2, { steps: 2.2, cutAt: 1 }).split).toBe(0);
  expect(dogPose('idle', 1, { steps: 2.2, cutAt: 1 })).toMatchObject({ frontLeg: 0, backLeg: 0, split: 0, body: 0, fold: 1 });
});
