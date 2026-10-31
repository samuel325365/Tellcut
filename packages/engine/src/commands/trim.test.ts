import { ProjectZ, type Project } from '../schema.ts';
import { resolveTimes } from '../time.ts';
import { addItem, swapSource, updateItem } from './edit.ts';
import { CommandError, ownSounds } from './core.ts';
import { split } from './split.ts';
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

/** c2 from 20 s of the 30 s source, frozen 1 s in (the picture needs 2 s); its own sound needs 4 × 2 = 8 s, to 28 s */
const frozen = () => {
  const p = fixture();
  updateItem(p, { id: 'c2', patch: { in: 20, freezeAt: 1 } });
  addItem(p, { track: 'au', item: { id: 'snd2', source: 's', in: 20, rate: 2, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c2' } });
  return p;
};
const end = (p: Project) => { const s = item(p, 'snd2'); return s.in + (s.end - s.start) * s.rate; };
/** The panel still takes edits of the clip and of its sound (none is refused for a sound past its source). */
const editable = (p: Project) => { run(p, updateItem, { id: 'c2', patch: { opacity: 0.5 } }); run(p, updateItem, { id: 'snd2', patch: { gain: -3 } }); return true; };

test("a frozen clip sped up: its own sound, which plays on past the freeze, stays inside the source", () => {
  // 3× from the panel: the picture needs only 3 s, the sound 12 s (to 32 s): refused, as a clip without freezeAt is
  expect(() => run(frozen(), updateItem, { id: 'c2', patch: { speed: 3 } })).toThrow(CommandError);
  try { run(frozen(), updateItem, { id: 'c2', patch: { speed: 3 } }); } catch (e) { expect(e).toMatchObject({ code: 'cmd.ownSoundPastEnd', params: { source: 's', need: 32, have: 30 } }); }
  expect(item(run(frozen(), updateItem, { id: 'c2', patch: { speed: 2.5 } }), 'snd2')).toMatchObject({ rate: 2.5, end: 4 });
  // a speed stretch keeps the sound's source range as it keeps the picture's: it never runs out
  for (const dt of [-3, -1, 2, 6]) {
    const p = run(frozen(), rateStretch, { id: 'c2', edge: 'end', dt });
    expect(end(p)).toBeCloseTo(28, 5);
  }
});

test("a frozen clip run on past its source: its own sound stops where the source does, and grows back when there is room", () => {
  // trimEnd: 10 s of clip, the sound plays the 10 s left from 20 s at 2× (5 s) and the picture holds its frame on
  const p = run(frozen(), trimEnd, { id: 'c2', dt: 6 });
  expect([item(p, 'c2').end, item(p, 'snd2').end, item(p, 'snd2').in, end(p)]).toEqual([14, 5, 20, 30]);
  expect(editable(p)).toBe(true);
  expect(item(run(p, trimEnd, { id: 'c2', dt: -2 }), 'snd2').end).toBe(5);
  expect(item(run(p, trimEnd, { id: 'c2', dt: -7 }), 'snd2').end).toBe(3);
  // the panel's end acts the same, and so does a head trim (the sound keeps playing the picture's moments)
  expect(item(run(frozen(), updateItem, { id: 'c2', patch: { end: 14 } }), 'snd2')).toMatchObject({ end: 5, in: 20 });
  expect(item(run(p, trimStart, { id: 'c2', dt: 2 }), 'snd2')).toMatchObject({ end: 3, in: 24 });
  // trimmed past where it stops, nothing of it is left
  expect(run(p, trimStart, { id: 'c2', dt: 6 }).tracks[4].items.map((x) => x.id)).toEqual(['a1']);
  // slip: the picture moves to 28 s, the sound plays the 2 s left; slipped back it spans the clip again
  const s = run(frozen(), slip, { id: 'c2', dt: 100 });
  expect([item(s, 'c2').in, item(s, 'snd2').in, item(s, 'snd2').end]).toEqual([28, 28, 1]);
  expect(editable(s)).toBe(true);
  expect(item(run(s, slip, { id: 'c2', dt: -8 }), 'snd2')).toMatchObject({ in: 20, end: 4 });
  expect(item(run(frozen(), updateItem, { id: 'c2', patch: { in: 27 } }), 'snd2')).toMatchObject({ in: 27, end: 1.5 });
  // another shot from 27 s: the same
  const w = run(frozen(), swapSource, { id: 'c2', source: 's', in: 27 });
  expect([item(w, 'snd2').in, item(w, 'snd2').end, end(w)]).toEqual([27, 1.5, 30]);
  expect(editable(w)).toBe(true);
  // roll with a clip after it
  const q = frozen();
  addItem(q, { track: 'v', item: { id: 'c3', source: 's', in: 0, speed: 1, start: 8, end: 12, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } } });
  const r = run(q, roll, { left: 'c2', right: 'c3', dt: 3 });
  expect([item(r, 'c2').end, item(r, 'snd2').end, end(r)]).toEqual([11, 5, 30]);
  expect(editable(r)).toBe(true);
  // still the clip's own sound: a split takes it along (cut, or left whole on the first half when it stops before the cut)
  const own = (q: Project, id: string) => ownSounds(q, id).map((c) => c.id);
  const sp = structuredClone(p); split(sp, { t: 6, ids: ['c2'] });
  expect([own(sp, 'c2'), own(sp, 'c2-2'), item(sp, 'snd2-2').end]).toEqual([['snd2'], ['snd2-2'], 3]);
  const sq = structuredClone(p); split(sq, { t: 11, ids: ['c2'] });
  expect([own(sq, 'c2'), own(sq, 'c2-2')]).toEqual([['snd2'], []]);
  // a speed stretch keeps the sound where it stops
  expect(end(run(p, rateStretch, { id: 'c2', edge: 'end', dt: 4 }))).toBeCloseTo(30, 5);
});

test("a head extended earlier never takes the own sound's in below 0, even when the sound plays faster than the clip", () => {
  // c2 from 10 s at 2×; its own sound from 4 s at 4×: two seconds more head want the sound 8 s earlier, from -4 s
  const p = fixture();
  addItem(p, { track: 'au', item: { id: 'snd2', source: 's', in: 4, rate: 4, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c2' } });
  const q = run(p, trimStart, { id: 'c2', dt: -2 });
  expect(item(q, 'c2')).toMatchObject({ start: 2, in: 6 });
  expect(item(q, 'snd2')).toMatchObject({ in: 0, start: 0, end: 6 });
  expect(ownSounds(q, 'c2').map((c) => c.id)).toEqual(['snd2']);
  expect(ProjectZ.safeParse(q).success).toBe(true);
});

test("a frozen clip whose own sound already runs past its source (an older project): editing the clip puts the sound back inside", () => {
  const p = frozen();
  item(p, 'snd2').end = 10;   // needs 40 s of the 30 s source
  (p.tracks[1].items[1] as any).end = 14;
  const q = run(p, updateItem, { id: 'c2', patch: { opacity: 0.5 } });
  expect([item(q, 'c2').opacity, item(q, 'snd2').end]).toEqual([0.5, 5]);
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
