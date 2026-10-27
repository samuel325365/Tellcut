// Group B2 (2026-10-23): common.reels, common.comments and common.story.
import { liveSpans } from './lockscreen.ts';
import { barParts, countAt, parseHook, popAt, reels, segAt, segFill, timeList } from './reels.ts';
import { commentLayout, comments, COMMENT_COLORS, parseComments } from './comments.ts';
import { clockText, pollOf, sliderAt, story, timerAt } from './story.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, k: string) => t.params.find((p) => p.key === k)!.default;

test('reels bars: each segment fills over its span; the slow one crawls and only finishes at its very end', () => {
  const segs = liveSpans('0-4, 4-8, 8-12');
  expect(segFill(segs, null, -1, 0, 2)).toBeCloseTo(0.5, 9);
  expect(segFill(segs, null, -1, 1, 2)).toBe(0);
  expect(segFill(segs, null, -1, 0, 5)).toBe(1);
  expect(segFill(segs, null, 1, 1, 4 + 4 * 0.5)).toBeLessThan(0.2);     // half way through the slow one: not a fifth full
  expect(segFill(segs, null, 1, 1, 4 + 4 * 0.89)).toBeLessThan(0.23);
  expect(segFill(segs, null, 1, 1, 8)).toBeCloseTo(1, 9);
  expect(segAt(segs, null, 5)).toEqual({ i: 1, since: 4 });
  expect(segAt(segs, null, -1)).toEqual({ i: 0, since: 0 });
});

test('reels cold open: a later segment plays first, then every bar runs back to empty in the last 0.5 s', () => {
  const segs = liveSpans('2-4, 4-6, 6-8'), hook = parseHook('0-2|2')!;
  expect(hook).toEqual({ a: 0, b: 2, seg: 2 });
  expect(parseHook('')).toBeNull();
  expect(parseHook('3-1|1')).toBeNull();
  expect(segFill(segs, hook, -1, 0, 1)).toBe(1);                        // the bars before it are full
  expect(segFill(segs, hook, -1, 2, 1.5)).toBeCloseTo(0.4, 9);           // its own fills to 0.4
  expect(segFill(segs, hook, -1, 0, 1.75)).toBeCloseTo(0.5, 9);          // half way back
  expect(segFill(segs, hook, -1, 0, 1.999)).toBeLessThan(0.01);
  expect(segAt(segs, hook, 1)).toEqual({ i: 2, since: 0 });
  expect(segAt(segs, hook, 2.5)).toEqual({ i: 0, since: 2 });            // then the film starts at the first segment
});

test('reels counts ease between keyframes; taps and blacked-out words read', () => {
  expect(countAt('0|100\n2|300', -1)).toBe(100);
  expect(countAt('0|100\n2|300', 1)).toBeCloseTo(200, 9);
  expect(countAt('0|100\n2|300', 5)).toBe(300);
  expect(countAt('', 1)).toBe(0);
  expect(countAt('0|1027', 1)).toBe(1027);
  expect(timeList('1.2, 3 4.5')).toEqual([1.2, 3, 4.5]);
  expect(timeList('')).toEqual([]);
  expect(popAt(1.175, 1)).toBeCloseTo(1.35, 9);
  expect(popAt(0.9, 1)).toBe(1);
  expect(barParts('去了████ 👉 長片')).toEqual([['去了', false], ['████', true], [' 👉 長片', false]]);
  expect(barParts('')).toEqual([]);
});

test('comments: one per line with extras; a colour by line when none is given; long words wrap on two lines and make the row taller', () => {
  const [a, b, c] = parseComments('0.2|mia|好美|color=#123456\nnope|x|y\n1|阿哲|哈哈|avatar=🌸\n2|Ken|求地點');
  expect(a).toEqual({ at: 0.2, name: 'mia', text: '好美', color: '#123456', avatar: '' });
  expect(b).toMatchObject({ at: 1, name: '阿哲', avatar: '🌸', color: COMMENT_COLORS[1] });
  expect(c.color).toBe(COMMENT_COLORS[2]);
  const short = commentLayout(a, 700), long = commentLayout({ ...a, text: '這一段留言很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長' }, 700);
  expect(short.lines).toEqual(['好美']);
  expect(long.lines.length).toBe(2);
  expect(long.h).toBeGreaterThan(short.h);
});

test('story: poll shares scale to 100 %, two answers at least; the slider eases to its value; the timer counts either way', () => {
  expect(pollOf('要|不要', '62,38')).toEqual({ opts: ['要', '不要'], shares: [0.62, 0.38] });
  expect(pollOf('A|B|C', '5,3,2').shares).toEqual([0.5, 0.3, 0.2]);
  expect(pollOf('A|B', '').shares).toEqual([0.5, 0.5]);
  expect(pollOf('', '').opts.length).toBe(2);
  expect(pollOf('1|2|3|4|5', '').opts.length).toBe(4);
  expect(sliderAt(0, 0.5, 2, 0.9)).toBe(0);
  expect(sliderAt(1.25, 0.5, 2, 0.9)).toBeCloseTo(0.45, 9);
  expect(sliderAt(3, 0.5, 2, 0.9)).toBeCloseTo(0.9, 9);
  expect(clockText(timerAt(1.5, 0.8, 2.2, 0, 600))).toBe('05:00');
  expect(clockText(timerAt(9, 0, 1, 600, 0))).toBe('00:00');
  expect(clockText(3725)).toBe('1:02:05');
});

test('the three blocks play out inside the 3 s gallery preview', () => {
  for (const [, s] of liveSpans(String(def(reels, 'segs')))) expect(s).toBeLessThanOrEqual(3);
  for (const k of ['saveAt', 'qAt', 'replyAt', 'sheetAt', 'tapAt']) expect(Number(def(reels, k))).toBeLessThan(2.8);
  for (const x of timeList(String(def(reels, 'taps')))) expect(x).toBeLessThan(2.8);
  const cs = parseComments(String(def(comments, 'items')));
  expect(cs.length).toBeGreaterThanOrEqual(3);
  for (const c of cs) expect(c.at).toBeLessThan(2.6);
  expect(Number(def(story, 'end'))).toBeLessThan(2.8);
});
