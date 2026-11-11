// Timing of the words in a caption: `words` steps are [seconds, visible characters said by then].
import { clamp, eBack, eOut3, prog } from '@tellcut/engine';

/** character i of n popping in at `local`: the start is 0.08 s, then one every 0.04 s (closer when there are more than 15) */
export function charPopAt(i: number, n: number, local: number) {
  const step = Math.min(0.04, 0.6 / Math.max(1, n)), q = prog(local, 0.08 + i * step, 0.26 + i * step);
  return { opacity: clamp(q * 3), rise: 1 - eOut3(q), scale: 0.7 + 0.3 * eBack(q, 1.9) };
}

/** the characters of the word being said at `local`, or null before the first */
export function karaokeRange(words: Array<[number, number]>, local: number): [number, number] | null {
  let i = -1;
  for (let k = 0; k < words.length; k++) if (words[k][0] <= local + 1e-6) i = k;
  return i < 0 ? null : [i ? words[i - 1][1] : 0, words[i][1]];
}

/** `fill`: how lit visible character i is at `local` (0 dim, 1 said): it lights over 0.14 s from the step in `words` that says it */
export function saidLevel(words: Array<[number, number]>, i: number, local: number) {
  const step = words.find((w) => w[1] > i);
  return step ? prog(local, step[0] - 0.04, step[0] + 0.1) : 0;
}
