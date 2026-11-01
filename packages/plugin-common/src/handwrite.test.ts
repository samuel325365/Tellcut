// common.handwrite: how long a "start-end" line stays in replace mode (acceptance films 2026-11-01, X2)
import { currentSentence, handwrite, parseSentences } from './handwrite.ts';

test('a line with an end time stays 1.2 s after it by default, then fades out over 0.25 s', () => {
  const s = parseSentences('0.1-1.3|今天的風很溫柔\n6|下一句');
  expect(currentSentence(s, 2.2, 10).alpha).toBe(1);
  expect(currentSentence(s, 2.5 - 0.125, 10).alpha).toBeCloseTo(0.5, 5);
  expect(currentSentence(s, 2.5, 10).alpha).toBe(0);
});

test('hold sets how long it stays after its end; the next line still takes over when it starts', () => {
  const s = parseSentences('0.1-1.3|今天的風很溫柔\n6|下一句');
  expect(currentSentence(s, 2.5, 10, 3).alpha).toBe(1);
  expect(currentSentence(s, 4.3, 10, 3).alpha).toBe(0);
  expect(currentSentence(s, 5.9, 10, 30).alpha).toBeCloseTo(0.4, 5);
  // never before it has been written (12 characters a second)
  expect(currentSentence(parseSentences('0-0.2|今天的風很溫柔，我們沿著河邊慢慢走'), 1.2, 10, 0).alpha).toBe(1);
});

test('the hold parameter and the doc say so', () => {
  expect(handwrite.params.find((p) => p.key === 'hold')).toMatchObject({ type: 'number', default: 1.2 });
  expect(handwrite.doc).toMatch(/hold 秒（預設 1.2）/);
});
