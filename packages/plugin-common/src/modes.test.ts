// The modes, shapes and looks group A2 (2026-10-23) added to existing blocks: their defaults stay as they were, and their pure parts.
import { stamp } from './stamp.ts';
import { pinTimes, tag, tapeTimes } from './tag.ts';
import { pinCheckPts } from './geo.ts';
import { emoji, floaters, tapPose } from './emoji.ts';
import { formatValue, meter, niceStep, parsePins, pinAt } from './meter.ts';
import { levelAt, levelFrac, parseLevels } from './levels.ts';
import { dotRow, progress, timelineState } from './progress.ts';
import { parsePts, pen, resample, tracePose } from './pen.ts';
import { handPose, wipe } from './wipe.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)!.default;

test('stamp: double is offered, the default stays a plain box without a head line', () => {
  expect(def(stamp, 'shape')).toBe('box');
  expect(def(stamp, 'head')).toBe('');
  expect((stamp.params.find((p) => p.key === 'shape') as { options: string[] }).options).toContain('double');
});

test('tag: the default look stays pill; tape strips land 0.12 s apart and write 12 characters a second', () => {
  expect(def(tag, 'look')).toBe('pill');
  expect(tapeTimes(0, 6, 0).land).toBe(0);
  expect(tapeTimes(1, 6, 0.1).land).toBe(0);
  expect(tapeTimes(0, 6, 0.4).write).toBeCloseTo(0.5);
  expect(tapeTimes(0, 6, 0.8).write).toBe(1);
  expect(tapeTimes(0, 0, 0).write).toBe(1);
});

test('tag pin: the pin drops in 0.4 s, the label pops after it, and the head is ticked only when check is given', () => {
  expect(pinTimes(0, -1).drop).toBe(0);
  expect(pinTimes(0.4, -1).drop).toBeCloseTo(1);
  expect(pinTimes(0.1, -1).label).toBe(0);
  expect(pinTimes(0.6, -1).label).toBeCloseTo(1);
  expect(pinTimes(5, -1).check).toBe(0);
  expect(pinTimes(1, 1).check).toBe(0);
  expect(pinTimes(1.4, 1).check).toBeCloseTo(1);
});

test('map pin check: the short stroke first, then the long one; done, it ends up and to the right of the centre', () => {
  expect(pinCheckPts(0, 0, 10, 0.2)).toHaveLength(2);
  const done = pinCheckPts(0, 0, 10, 1);
  expect(done).toHaveLength(3);
  expect(done[2][0]).toBeCloseTo(3.2); expect(done[2][1]).toBeCloseTo(-2.2);
});

test('emoji float: reactions are born rate a second and rise from the start point; the same moment draws the same', () => {
  expect(def(emoji, 'mode')).toBe('sticker');
  const a = floaters(1.5, 3, 7, 11, ['♥'], 900, 1100, 100, 1), b = floaters(1.5, 3, 7, 11, ['♥'], 900, 1100, 100, 1);
  expect(a).toEqual(b);
  expect(a.length).toBeGreaterThan(5);
  for (const f of a) expect(f.y).toBeLessThan(1100);
  expect(floaters(0, 3, 7, 11, ['♥'], 0, 0, 100, 1).length).toBeLessThanOrEqual(1);
});

test('emoji tap: the heart overshoots to 1.15, settles, rises and is gone after 1.05 s', () => {
  expect(tapPose(0.28).scale).toBeCloseTo(1.15);
  expect(tapPose(0.6).scale).toBeCloseTo(1);
  expect(tapPose(0.9).rise).toBeGreaterThan(0);
  expect(tapPose(1.2).alpha).toBe(0);
});

test('meter: the default look stays center; a number after a stop is its own ease time, :s still jumps (ambient reads the same)', () => {
  expect(def(meter, 'look')).toBe('center');
  const lv = parseLevels('0:2026, 1:1241:2, 4:1257:s, 5:1300');
  expect(lv.map((l) => l.ease)).toEqual([undefined, 2, undefined, undefined]);
  expect(lv[2].snap).toBe(true);
  expect(levelAt(lv, 2, 0.5)).not.toBeCloseTo(1241, 0);            // still easing at 1 s of its 2
  expect(levelAt(lv, 3, 0.5)).toBeCloseTo(1241, 6);
  expect(levelAt(lv, 4, 0.5)).toBe(1257);
  expect(levelAt(lv, 5.5, 0.5)).toBeCloseTo(1300, 6);
});

test('meter: a ruler from min to max; min 0 keeps the old fractions', () => {
  const lv = parseLevels('0:1200, 1:2030');
  expect(levelFrac(1615, lv, 2030, 'linear', 1200)).toBeCloseTo(0.5);
  expect(levelFrac(1000, lv, 2030, 'linear', 1200)).toBe(0);
  expect(levelFrac(500, parseLevels('0:0, 1:1000'), 0, 'linear')).toBe(levelFrac(500, parseLevels('0:0, 1:1000'), 0, 'linear', 0));
});

test('meter pins: parsed with their kind, and the label shows once the number is at the flag', () => {
  const pins = parsePins('1241|accent|燒毀|0.5; 1257|hl|規劃|2.1|3; 1300|dashed|傳說|0; junk');
  expect(pins.map((p) => p.kind)).toEqual(['accent', 'hl', 'dashed']);
  expect(pinAt(pins, 1241.2, 1, 0.6)?.label).toBe('燒毀');
  expect(pinAt(pins, 1241.2, 0.3, 0.6)).toBeNull();                 // not shown yet
  expect(pinAt(pins, 1257, 3.5, 0.6)).toBeNull();                   // faded
  expect(pinAt(pins, 1250, 1, 0.6)).toBeNull();
});

test('meter: round tick steps, and years without the thousands comma', () => {
  expect(niceStep(830, 8)).toBe(100);
  expect(niceStep(30, 6)).toBe(5);
  expect(formatValue(1257, 0, false)).toBe('1257');
  expect(formatValue(1257, 0)).toBe('1,257');
});

test('progress timeline: drawn in, or slid from stop from to stop step; step -1 draws the whole line', () => {
  expect(def(progress, 'mode')).toBe('bar');
  expect(timelineState(7, 2, -1, 0)).toMatchObject({ intro: 0, dot: 2, full: false });
  const a = timelineState(7, 4, 3, 0), b = timelineState(7, 4, 3, 1);
  expect(a.intro).toBe(1); expect(a.dot).toBe(3); expect(b.dot).toBe(4);
  expect(timelineState(7, 4, 4, 0).text).toBe(1);                   // staying on the same stop: the words stay
  expect(timelineState(7, -1, -1, 0).reach).toBe(0);
  expect(timelineState(7, -1, -1, 1.2)).toMatchObject({ reach: 6, full: true });
});

test('pen trace: points parsed, resampled evenly; drawn before the cut, morphed to the next shape after it, flashing as it locks', () => {
  expect(def(pen, 'kind')).toBe('circle');
  expect(parsePts('0.2,0.8 0.5,0.2 x 0.8,0.8')).toEqual([[0.2, 0.8], [0.5, 0.2], [0.8, 0.8]]);
  const r = resample([[0, 0], [1, 0]], 5);
  expect(r.map((p) => p[0])).toEqual([0, 0.25, 0.5, 0.75, 1]);
  const A = parsePts('0,0 1,0'), B = parsePts('0,1 1,1');
  expect(tracePose(0.1, A, B, 1, 0.4, 0.3).drawn).toBe(0);           // drawing starts 0.52 s before the cut
  expect(tracePose(1, A, B, 1, 0.4, 0.3).drawn).toBeCloseTo(1);
  expect(tracePose(1, A, B, 1, 0.4, 0.3).pts[0][1]).toBe(0);
  expect(tracePose(1.3, A, B, 1, 0.4, 0.3).pts[0][1]).toBeCloseTo(1);
  expect(tracePose(1.31, A, B, 1, 0.4, 0.3).flash).toBeGreaterThan(0.9);
  expect(tracePose(0.9, A, B, 1, 0.4, 0.3).flash).toBe(0);
});

test('wipe hand: comes in from the lower right, covers the frame at the middle of the item, leaves to the lower left', () => {
  expect(def(wipe, 'mode')).toBe('band');
  const a = handPose(0, 0.8), m = handPose(0.4, 0.8), z = handPose(0.8, 0.8);
  expect(a.x).toBeGreaterThan(1); expect(a.y).toBeGreaterThan(1); expect(a.cover).toBe(0);
  expect(m.cover).toBeCloseTo(1); expect(handPose(0.42, 0.8).cover).toBe(1);
  expect(z.x).toBeLessThan(0); expect(z.cover).toBe(0);
});

test('progress dots: the current dot stays inside the side safe margins at either end; big icons shrink to keep air between them', () => {
  // the hook recipe's row on a 9:16 film: 1080 wide, side safe 0.12, thickness 12, emoji ×2.2
  const w = 1080 * 0.76, th = 12, fits = (n: number, k: number) => {
    const { base, inset, gap } = dotRow(n, w, th, k), big = base * 1.35;
    expect(inset).toBeGreaterThanOrEqual(big / 2 - 1e-9);                     // the last centre + half the current dot ≤ the safe edge
    if (n > 1) expect(gap - big / 2 - base / 2).toBeGreaterThan(0);           // the current dot never touches a neighbour
    return base;
  };
  expect(fits(5, 3.2 * 2.2)).toBeCloseTo(12 * 3.2 * 2.2, 6);                 // five fit at full size
  expect(fits(12, 3.2 * 2.2)).toBeLessThan(12 * 3.2 * 2.2);                  // twelve shrink
  const plain = dotRow(5, w, th, 1.8);                                         // plain dots: as they were
  expect([plain.base, plain.inset, plain.gap].map((v) => +v.toFixed(6))).toEqual([21.6, 16.2, +((w - 32.4) / 4).toFixed(6)]);
});
