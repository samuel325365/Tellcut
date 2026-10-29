import { ProjectZ } from '../schema.ts';
import { resolveTimes } from '../time.ts';
import { addItem, updateItem } from './edit.ts';
import { rateStretch, roll, slip, trimEnd, trimStart } from './trim.ts';
import { fixture, item, run } from './test-fixture.ts';

test('trimStart moves the start and the media in-point together', () => {
  const p = run(fixture(), trimStart, { id: 'c2', dt: 1 });
  expect([item(p, 'c2').start, item(p, 'c2').in, item(p, 'c2').freezeAt]).toEqual([5, 12, 2]);
});

test('trimStart stops at time 0, at the source start and at one frame', () => {
  expect(item(run(fixture(), trimStart, { id: 'a1', dt: -5 }), 'a1')).toMatchObject({ start: 0, in: 1 });
  expect(item(run(fixture(), trimStart, { id: 'c1', dt: 10 }), 'c1')).toMatchObject({ start: 3.96, in: 4.96 });
});

test('trimEnd stops at the source end and at one frame', () => {
  expect(item(run(fixture(), trimEnd, { id: 'c1', dt: 100 }), 'c1').end).toBe(29);   // c1: in 1, speed 1, source 30 s
  expect(item(run(fixture(), trimEnd, { id: 'c2', dt: -100 }), 'c2').end).toBe(4.04);
});

test('stretching a block scales its children proportionally; sound effects keep their length', () => {
  const p = run(fixture(), trimEnd, { id: 'blk', dt: 4 });
  expect([item(p, 'tap').start, item(p, 'tap').end]).toEqual([1, 1.1]);
  expect(item(p, 'tap2').start).toBe(6);
  const q = run(fixture(), trimStart, { id: 'blk', dt: 2 });
  expect(resolveTimes(q).get('tap')!.start).toBe(4.25);
  expect(resolveTimes(q).get('tap2')!.start).toBe(5.5);
});

test('trimming keeps envelope points on the same moments and refuses sound effects', () => {
  expect(item(run(fixture(), trimStart, { id: 'm1', dt: 2 }), 'm1')).toMatchObject({ in: 2, envelope: [[3, -6], [8, 0]] });
  expect(() => run(fixture(), trimEnd, { id: 'tap', dt: 1 })).toThrow('Sound effects have a fixed length');
});

test('slip changes only the in-point, within the source', () => {
  expect(item(run(fixture(), slip, { id: 'c2', dt: 5 }), 'c2')).toMatchObject({ in: 15, start: 4, end: 8 });
  // c2 holds its frame from freezeAt 3: it plays 3 × 2 = 6 s of the 30 s source, not 4 × 2
  expect(item(run(fixture(), slip, { id: 'c2', dt: 50 }), 'c2').in).toBe(24);
  expect(item(run(fixture(), slip, { id: 'c1', dt: 50 }), 'c1').in).toBe(26);
  expect(item(run(fixture(), slip, { id: 'c2', dt: -50 }), 'c2').in).toBe(0);
  expect(() => run(fixture(), slip, { id: 'blk', dt: 1 })).toThrow('Only media items can be slipped');
});

test('roll moves the cut between two touching clips', () => {
  const p = run(fixture(), roll, { left: 'c1', right: 'c2', dt: 1 });
  expect([item(p, 'c1').end, item(p, 'c2').start, item(p, 'c2').in, item(p, 'c2').freezeAt]).toEqual([5, 5, 12, 2]);
  expect(item(run(fixture(), roll, { left: 'c1', right: 'c2', dt: 10 }), 'c1').end).toBe(7.96);
  expect(item(run(fixture(), roll, { left: 'c1', right: 'c2', dt: -10 }), 'c1').end).toBe(0.04);
  expect(() => run(fixture(), roll, { left: 'c1', right: 'a1', dt: 1 })).toThrow('Items are not adjacent');
});

test('rateStretch keeps the source range and changes the speed', () => {
  expect(item(run(fixture(), rateStretch, { id: 'c2', edge: 'end', dt: 4 }), 'c2')).toMatchObject({ start: 4, end: 12, speed: 1, in: 10, freezeAt: 6 });
  expect(item(run(fixture(), rateStretch, { id: 'a1', edge: 'start', dt: 1 }), 'a1')).toMatchObject({ start: 2, end: 3, rate: 2, in: 2 });
  expect(item(run(fixture(), rateStretch, { id: 'c2', edge: 'end', dt: -3.9 }), 'c2')).toMatchObject({ speed: 16, end: 4.5 });
  expect(() => run(fixture(), rateStretch, { id: 'm1', edge: 'end', dt: 1 })).toThrow('Only video and audio clips can change speed');
});

test('rateStretch from the start edge never stretches a clip before time 0', () => {
  expect(item(run(fixture(), rateStretch, { id: 'a1', edge: 'start', dt: -2 }), 'a1')).toMatchObject({ start: 0, end: 3, rate: 0.666667 });
});

test('a frozen clip can be extended past the end of its source', () => {
  expect(item(run(fixture(), trimEnd, { id: 'c2', dt: 100 }), 'c2').end).toBe(108);
});

/** c1 (in 1, 0–4 s) with its own sound and a tap 2 s into it */
function withChildren() {
  const p = fixture();
  addItem(p, { track: 'au', item: { id: 'snd', source: 's', in: 1, rate: 1, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' } });
  addItem(p, { track: 'fx', item: { id: 'hit', type: 'x.tap', start: 2, end: 2.1, params: {}, gain: 0, parent: 'c1' } });
  return p;
}

test("trimming a clip's head keeps its children on the same picture and trims its own sound with it", () => {
  const p = run(withChildren(), trimStart, { id: 'c1', dt: 1 });
  expect(item(p, 'snd')).toMatchObject({ start: 0, end: 3, in: 2 });
  expect([item(p, 'hit').start, item(p, 'hit').end]).toEqual([1, 1.1]);
});

test("trimming a clip's tail trims its own sound and leaves the other children where they are", () => {
  const p = run(withChildren(), trimEnd, { id: 'c1', dt: -1 });
  expect(item(p, 'snd')).toMatchObject({ start: 0, end: 3, in: 1 });
  expect(item(p, 'hit').start).toBe(2);
});

test("a speed change stretches the clip's own sound with it", () => {
  const p = run(withChildren(), rateStretch, { id: 'c1', edge: 'end', dt: 4 });
  expect(item(p, 'snd')).toMatchObject({ start: 0, end: 8, rate: 0.5 });
  expect(item(p, 'hit').start).toBe(4);
});

test("a speed stretch stops where the clip's own sound reaches its 4× limit (the project stays valid)", () => {
  const p = run(withChildren(), rateStretch, { id: 'c1', edge: 'end', dt: -3.9 });
  expect(item(p, 'c1')).toMatchObject({ speed: 4, end: 1 });
  expect(item(p, 'snd')).toMatchObject({ start: 0, end: 1, rate: 4 });
  expect(ProjectZ.safeParse(p).success).toBe(true);
  // without an own sound the clip still goes to 16×
  expect(item(run(fixture(), rateStretch, { id: 'c1', edge: 'end', dt: -3.9 }), 'c1').speed).toBe(16);
});

test("slipping a clip slips its own sound with it (the same stop at the source's ends)", () => {
  const p = run(withChildren(), slip, { id: 'c1', dt: 3 });
  expect([item(p, 'c1').in, item(p, 'snd').in]).toEqual([4, 4]);
  const q = run(withChildren(), slip, { id: 'c1', dt: -5 });
  expect([item(q, 'c1').in, item(q, 'snd').in]).toEqual([0, 0]);
});

test("a new in-point from the properties panel takes the clip's own sound along", () => {
  const p = run(withChildren(), updateItem, { id: 'c1', patch: { in: 5 } });
  expect(item(p, 'snd')).toMatchObject({ in: 5, start: 0, end: 4 });
});

test("a new end from the properties panel acts like a trim: own sound trimmed, the other children on the same picture", () => {
  const p = run(withChildren(), updateItem, { id: 'c1', patch: { end: 3 } });
  expect(item(p, 'snd')).toMatchObject({ start: 0, end: 3, in: 1 });
  expect(item(p, 'hit').start).toBe(2);
  // a block's children still keep their proportional place
  const q = run(fixture(), updateItem, { id: 'blk', patch: { end: 10 } });
  expect(item(q, 'tap2').start).toBe(6);
});

test('trimming a frozen clip past its freeze keeps the held frame (trimStart and the right side of a roll)', () => {
  // c2: in 10, speed 2, freezeAt 3 holds source 16 s
  expect(item(run(fixture(), trimStart, { id: 'c2', dt: 3.5 }), 'c2')).toMatchObject({ start: 7.5, in: 16, freezeAt: 0 });
  expect(item(run(fixture(), roll, { left: 'c1', right: 'c2', dt: 3.5 }), 'c2')).toMatchObject({ start: 7.5, in: 16, freezeAt: 0 });
  // already holding from its first frame: the head moves, the picture does not
  const p = run(fixture(), trimStart, { id: 'c2', dt: 3.5 });
  expect(item(run(p, trimStart, { id: 'c2', dt: 0.2 }), 'c2')).toMatchObject({ in: 16, freezeAt: 0 });
});
