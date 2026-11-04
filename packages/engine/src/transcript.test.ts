import { splitAtPauses, type Transcript } from './transcript.ts';

test('a sentence the speech recogniser carried across a long pause (music between two lines) is split at the pause', () => {
  const w = (start: number, end: number, word: string) => ({ start, end, word });
  const long: Transcript = { language: 'en', segments: [
    { start: 429.7, end: 824.7, text: 'the hibiscus tree is lovely', words: [w(429.7, 430, ' the'), w(430, 430.3, ' hibiscus'), w(817.8, 818.2, ' tree'), w(818.2, 818.4, ' is'), w(818.4, 824.7, ' lovely')] },
    { start: 825, end: 826, text: 'ok', words: [w(825, 826, ' ok')] },
    { start: 830, end: 832, text: 'no words' },
  ] };
  expect(splitAtPauses(long).segments.map((s) => [s.start, s.end, s.text, s.words?.length])).toEqual([
    [429.7, 430.3, 'the hibiscus', 2], [817.8, 824.7, 'tree is lovely', 3], [825, 826, 'ok', 1], [830, 832, 'no words', undefined]]);
  // Chinese words carry no spaces; a pause under 3 s stays inside the sentence
  const zh: Transcript = { language: 'zh', segments: [{ start: 0, end: 5, text: '大家好今天', words: [w(0, 1, '大家好'), w(3.5, 5, '今天')] }] };
  expect(splitAtPauses(zh)).toEqual(zh);
});
