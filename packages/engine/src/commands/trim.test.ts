import { ProjectZ, type Project } from '../schema.ts';
import { resolveTimes } from '../time.ts';
import { addItem, checkItem, swapSource, updateItem } from './edit.ts';
import { CommandError, ownSounds, r6 } from './core.ts';
import { settle } from './magnetic.ts';
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
  expect(item(run(fixture(), trimStart, { id: 'm1', dt: 2 }), 'm1')).toMatchObject({ in: 2, envelope: [[-2, 0], [3, -6], [8, 0]] });
  expect(() => run(fixture(), trimEnd, { id: 'tap', dt: 1 })).toThrow('Sound effects have a fixed length');
});

test("trimming a clip's head keeps the envelope points before it: the level there stays on the ramp, and trimming back restores them", async () => {
  const { envelopeAt } = await import('../audio/mix.ts');
  const before = item(fixture(), 'm1').envelope, cut = run(fixture(), trimStart, { id: 'm1', dt: 2 });
  // the ramp 0 → -6 dB over 0–5 s was at -2.4 dB 2 s in; dropping the 0 s point made the new head jump to -6 dB
  expect(envelopeAt(item(cut, 'm1').envelope, 0)).toBeCloseTo(envelopeAt(before, 2), 6);
  expect(envelopeAt(item(cut, 'm1').envelope, 0)).toBeCloseTo(-2.4, 6);
  expect(item(run(cut, trimStart, { id: 'm1', dt: -2 }), 'm1').envelope).toEqual(before);
  // split after the trim: the first half keeps the point before its head, the second starts on the ramp's value
  const [b] = split(cut, { t: 4, ids: ['m1'] });
  expect([item(cut, 'm1').envelope, item(cut, b).envelope]).toEqual([[[-2, 0], [2, -4.8]], [[0, -4.8], [1, -6], [6, 0]]]);
});

test('music stops at the end of its file when its length is known (trimEnd, slip); an unknown length does not limit it', () => {
  const known = fixture(); (known.media as any).m.duration = 12;   // m1: in 0, 0–10 s
  expect(item(run(known, trimEnd, { id: 'm1', dt: 5 }), 'm1').end).toBe(12);
  expect(item(run(known, slip, { id: 'm1', dt: 5 }), 'm1').in).toBe(2);
  expect(item(run(fixture(), trimEnd, { id: 'm1', dt: 5 }), 'm1').end).toBe(15);
  // music already past its file's end (an older project) still parses; pulling its end in never leaves it shorter than a
  // frame, dragging it out leaves it as it is (it used to cut it to that frame)
  const over = fixture(); (over.media as any).m.duration = 1; item(over, 'm1').in = 3;
  expect(ProjectZ.safeParse(over).success).toBe(true);
  expect(item(run(over, trimEnd, { id: 'm1', dt: -1 }), 'm1').end).toBe(0.04);
  expect(item(run(over, trimEnd, { id: 'm1', dt: 1 }), 'm1').end).toBe(10);
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

test("slip and a new in-point from the panel never take the own sound's in below 0 (its in-point was earlier than the clip's)", () => {
  // c2 from 10 s; its own sound from 4 s: moving the picture 8 s earlier would want the sound from -4 s
  const own = () => {
    const p = fixture();
    addItem(p, { track: 'au', item: { id: 'snd2', source: 's', in: 4, rate: 2, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c2' } });
    return p;
  };
  const s = run(own(), slip, { id: 'c2', dt: -8 });
  expect([item(s, 'c2').in, item(s, 'snd2').in]).toEqual([2, 0]);
  expect(ProjectZ.safeParse(s).success).toBe(true);
  const u = run(own(), updateItem, { id: 'c2', patch: { in: 2 } });
  expect([item(u, 'c2').in, item(u, 'snd2').in]).toEqual([2, 0]);
  expect(ownSounds(u, 'c2').map((c) => c.id)).toEqual(['snd2']);
  expect(ProjectZ.safeParse(u).success).toBe(true);
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

test("a speed change or a block's new length moves a voice-over by its place but keeps its length (and its fades inside it)", () => {
  // c1 (0–4 s) with a 2 s voice-over 2 s in; c1 at 2× is 2 s long
  const p = withChildren();
  addItem(p, { track: 'au', item: { id: 'vo', source: 'a', in: 0, rate: 1, start: 2, end: 4, gain: 0, fadeIn: 0.5, fadeOut: 0.5, parent: 'c1' } });
  const fast = run(p, rateStretch, { id: 'c1', edge: 'end', dt: -2 });
  expect(item(fast, 'vo')).toMatchObject({ start: 1, end: 3, in: 0, rate: 1, fadeIn: 0.5, fadeOut: 0.5 });
  expect(item(fast, 'snd')).toMatchObject({ start: 0, end: 2, rate: 2 });   // its own sound still plays at the clip's speed
  expect(item(run(p, updateItem, { id: 'c1', patch: { speed: 2, end: 2 } }), 'vo')).toMatchObject({ start: 1, end: 3 });
  // a caption block with its recording (a1's source has 30 s; this one is cut 2.5 s from its end)
  const q = fixture();
  addItem(q, { track: 'au', item: { id: 'rec', source: 'a', in: 27.5, rate: 1, start: 0, end: 2.5, gain: 0, fadeIn: 1, fadeOut: 1, envelope: [[1, -6]], parent: 'blk' } });
  const long = run(q, trimEnd, { id: 'blk', dt: 2 });
  expect(item(long, 'rec')).toMatchObject({ start: 0, end: 2.5, envelope: [[1, -6]] });
  expect(ProjectZ.safeParse(long).success).toBe(true);
  // shorter, a stretched child's fades shrink with it: a music child, which has no source end, keeps its length too
  addItem(q, { track: 'mu', item: { id: 'bed', media: 'm', in: 0, start: 1, end: 3, gain: 0, fadeIn: 1, fadeOut: 1, parent: 'blk' } });
  expect(item(run(q, trimStart, { id: 'blk', dt: 2 }), 'bed')).toMatchObject({ start: 0.5, end: 2.5, fadeIn: 1, fadeOut: 1 });
});

test("trimming a clip's head keeps its own sound's envelope on the same sound", () => {
  const p = withChildren();
  item(p, 'snd').envelope = [[0, 0], [2, -12], [3, 0]];
  expect(item(run(p, trimStart, { id: 'c1', dt: 1 }), 'snd').envelope).toEqual([[-1, 0], [1, -12], [2, 0]]);
  expect(item(run(p, roll, { left: 'c1', right: 'c2', dt: -1 }), 'snd').envelope).toEqual([[0, 0], [2, -12], [3, 0]]);
  // the right side of a roll: c2's own sound loses its head with it
  const q = fixture();
  addItem(q, { track: 'au', item: { id: 's2', source: 's', in: 10, rate: 2, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, envelope: [[2, -6]], parent: 'c2' } });
  expect(item(run(q, roll, { left: 'c1', right: 'c2', dt: 1 }), 's2')).toMatchObject({ in: 12, end: 3, envelope: [[1, -6]] });
});

test('a clip frozen past the end of its source still stops at the source end (trimEnd and the left side of a roll)', () => {
  const p = fixture();
  item(p, 'c2').freezeAt = 12;   // in 10 at 2×: the 30 s source runs out 10 s in, before the freeze
  expect(item(run(p, trimEnd, { id: 'c2', dt: 100 }), 'c2').end).toBe(14);
  item(p, 'c1').in = 26; item(p, 'c1').freezeAt = 10;   // 0–4 s plays 26–30 s: no room left
  const q = run(p, roll, { left: 'c1', right: 'c2', dt: 1 });
  expect([item(q, 'c1').end, item(q, 'c2').start]).toEqual([4, 4]);
  expect(ProjectZ.safeParse(run(p, trimEnd, { id: 'c1', dt: 1 })).success).toBe(true);
  expect(item(run(p, trimEnd, { id: 'c1', dt: 1 }), 'c1').end).toBe(4);
});

test('slipping a clip frozen at its first frame keeps its in-point a frame short of the source end (health10 EC1)', () => {
  const p = fixture();
  item(p, 'c2').freezeAt = 0;   // as split leaves the half after a freeze: it needs no source time
  const q = run(p, slip, { id: 'c2', dt: 100 });
  expect(item(q, 'c2').in).toBe(29.96);   // 30 s source, one frame at 25 fps
  expect(ProjectZ.safeParse(q).success).toBe(true);
});

// health10 EC2 (the user's call): a video clip hung on an item whose length changes keeps its own length, like a sound;
// stretched at the same speed it showed footage nobody chose and ran past its source
test('a video clip hung on a stretched clip or a resized block keeps its length; only its start scales', () => {
  const broll = (parent: string) => ({ id: 'br', source: 's', in: 27, speed: 1, start: 1, end: 3, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, parent });
  const p = fixture();
  addItem(p, { track: 'v2', item: broll('c1') });
  const s = run(p, rateStretch, { id: 'c1', edge: 'end', dt: 4 });   // c1 0–4 → 0–8 at half speed
  expect(item(s, 'br')).toMatchObject({ start: 2, end: 4, speed: 1, in: 27 });
  const q = fixture();
  addItem(q, { track: 'v2', item: broll('blk') });
  const b = run(q, trimEnd, { id: 'blk', dt: 4 });   // blk 2–6 → 2–10
  expect(item(b, 'br')).toMatchObject({ start: 2, end: 4 });
  for (const r of [s, b]) for (const t of r.tracks) for (const it of t.items) expect(() => checkItem(r, t.kind, it as any)).not.toThrow();
});

test('a child scaled with a block made very short keeps a frame (health10)', () => {
  const p = fixture();
  addItem(p, { track: 'sc', item: { id: 'cap', type: 'x.cap', start: 1, end: 2, params: {}, parent: 'blk' } });
  const q = run(p, trimEnd, { id: 'blk', dt: -100 });   // blk 2–6 → one frame
  expect(item(q, 'cap').start).toBe(0.01);
  expect(r6(item(q, 'cap').end - item(q, 'cap').start)).toBe(0.04);
});

// health10 EC3: the magnetic track packs from 0 after every command, so "the start cannot pass 0" only stopped the first
// clip's trimmed head from being pulled back out
test("the first magnetic clip's head can be pulled back out after a trim, as far as its source goes", () => {
  const mag = () => { const p = fixture(); (p.tracks[1] as any).magnetic = true; return p; };
  const go = <A>(p: Project, cmd: (d: Project, a: A) => unknown, a: A) => { const d = run(p, cmd, a); settle(p, d); return d; };
  const cut = go(mag(), trimStart, { id: 'c1', dt: 1 });   // c1: in 1, 0–4
  expect(item(cut, 'c1')).toMatchObject({ start: 0, end: 3, in: 2 });
  expect(item(go(cut, trimStart, { id: 'c1', dt: -1 }), 'c1')).toMatchObject({ start: 0, end: 4, in: 1 });
  const out = go(cut, trimStart, { id: 'c1', dt: -10 });   // only 2 s of source before in 2
  expect(item(out, 'c1')).toMatchObject({ start: 0, end: 5, in: 0 });
  expect(item(out, 'c2').start).toBe(5);
  // a speed change from the start edge too: 4 s of picture over 8 s, packed back to 0
  expect(item(go(mag(), rateStretch, { id: 'c1', edge: 'start', dt: -4 }), 'c1')).toMatchObject({ start: 0, end: 8, speed: 0.5 });
});

// health10 EC11: an item already before 0 (a caption left there by a head trim of its clip) jumped its start to 0 on any
// edit of its head, and one wholly before 0 got a start past its end
test('editing the head of an item before 0 moves it only as asked', () => {
  const p = fixture();
  addItem(p, { track: 'sc', item: { id: 'cap', type: 'x.cap', start: -1.5, end: 1.5, params: {}, parent: 'c1' } });
  addItem(p, { track: 'sc', item: { id: 'gone', type: 'x.cap', start: -2, end: -1, params: {}, parent: 'c1' } });
  expect(item(run(p, trimStart, { id: 'cap', dt: 0.04 }), 'cap')).toMatchObject({ start: -1.46, end: 1.5 });
  expect(item(run(p, trimStart, { id: 'cap', dt: -1 }), 'cap')).toMatchObject({ start: -1.5 });
  const g = run(p, trimStart, { id: 'gone', dt: 0.04 });
  expect(item(g, 'gone')).toMatchObject({ start: -1.96, end: -1 });
  expect(ProjectZ.safeParse(g).success).toBe(true);
  // a clip before 0 made shorter from its start edge is not shortened further for it
  addItem(p, { track: 'v2', item: { id: 'br', source: 's', in: 5, speed: 1, start: -1, end: 1, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, parent: 'c1' } });
  expect(item(run(p, rateStretch, { id: 'br', edge: 'start', dt: 0.04 }), 'br')).toMatchObject({ start: -0.96, end: 1 });
});

test('trims, slip, roll and rateStretch refuse a missing or non-finite dt before writing NaN (health10 EC12)', () => {
  const bad = (f: () => unknown) => { try { f(); } catch (e) { expect(e).toBeInstanceOf(CommandError); expect((e as CommandError).params).toEqual({ field: 'dt' }); return; } throw new Error('not refused'); };
  for (const dt of [undefined, NaN, Infinity, '1']) {
    bad(() => run(fixture(), trimStart, { id: 'c1', dt } as any));
    bad(() => run(fixture(), trimEnd, { id: 'c1', dt } as any));
    bad(() => run(fixture(), slip, { id: 'c1', dt } as any));
    bad(() => run(fixture(), roll, { left: 'c1', right: 'c2', dt } as any));
    bad(() => run(fixture(), rateStretch, { id: 'c1', edge: 'end', dt } as any));
  }
  expect(() => run(fixture(), rateStretch, { id: 'c1', edge: 'middle', dt: 1 } as any)).toThrow(/edge: must be "start" or "end"/);
});

test('dragging out the end of a clip already past its source end leaves it there; pulling it in still stops at the source (health10)', () => {
  const p = fixture();
  (p.media.m as any).duration = 8;   // m1 0–10 plays a file of 8 s (an older project)
  expect(item(run(p, trimEnd, { id: 'm1', dt: 1 }), 'm1').end).toBe(10);
  expect(item(run(p, trimEnd, { id: 'm1', dt: -0.5 }), 'm1').end).toBe(8);
  item(p, 'c1').in = 28;   // c1 0–4 at 1× needs 32 s of a 30 s source
  const q = run(p, roll, { left: 'c1', right: 'c2', dt: 1 });
  expect([item(q, 'c1').end, item(q, 'c2').start]).toEqual([4, 4]);
  expect(item(run(p, trimEnd, { id: 'c1', dt: 1 }), 'c1').end).toBe(4);
});

test('a clip frozen on the last frame of its source keeps a valid in-point when its head is trimmed past the freeze (health10)', () => {
  const p = fixture();
  item(p, 'c2').in = 24;   // in 24 at 2×, freezeAt 3: it holds the frame at 30 s, the source's very end
  expect(ProjectZ.safeParse(p).success).toBe(true);
  const q = run(p, trimStart, { id: 'c2', dt: 3.5 });
  expect(item(q, 'c2')).toMatchObject({ in: 29.96, freezeAt: 0 });
  expect(ProjectZ.safeParse(q).success).toBe(true);
  expect(item(run(p, roll, { left: 'c1', right: 'c2', dt: 3.5 }), 'c2').in).toBe(29.96);
});
