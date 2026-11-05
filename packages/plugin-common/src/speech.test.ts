// The caption plan from speech (speech.ts): the parts that depend on the clip's speed.
import { captionPlan, type SpeechPiece } from './speech.ts';

test('a fast clip: a last piece shorter than 0.3 s of film joins the one before, though it lasts longer in the source', () => {
  // "I made" takes 0.44 s of the source, so the tail check (in source seconds) let it stand alone; at twice the speed it is up for
  // 0.22 s of film, and the plan dropped it (with its words) for being shorter than a caption may be
  const ws = 'I wanted to make it easy on us so I made'.split(' '), at = [0, 0.22, 0.48, 0.6, 0.72, 0.8, 0.98, 1.18, 1.4, 1.86, 1.96, 2.3];
  const tr = { language: 'en', segments: [{ start: 0, end: 2.3, text: ' ' + ws.join(' '), words: ws.map((w, k) => ({ start: at[k], end: at[k + 1], word: ' ' + w })) }] } as any;
  const piece: SpeechPiece = { id: 'c', source: 'v', in: 0, out: 3, start: 0, end: 1.5, rate: 2 };
  const plan = captionPlan(tr, [piece], { maxChars: 36 });
  expect(plan.map((x) => x.text).join(' ')).toBe('I wanted to make it easy on us so I made');
  // at normal speed the same tail is long enough to stay a caption of its own
  const slow = captionPlan(tr, [{ ...piece, end: 3, rate: 1 }], { maxChars: 36 });
  expect(slow.map((x) => x.text)).toEqual(['I wanted to make it easy on us so', 'I made']);
});
