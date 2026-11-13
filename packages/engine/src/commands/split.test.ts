import { CommandError } from './core.ts';
import { split } from './split.ts';
import { fixture } from './test-fixture.ts';

test('split cuts a clip at the playhead into two contiguous clips', () => {
  const p = structuredClone(fixture());
  expect(split(p, { t: 2, ids: ['c1'] })).toEqual(['c1-2']);
  const [a, b] = p.tracks[1].items as any[];
  expect([a.id, a.start, a.end, b.id, b.start, b.end, b.in]).toEqual(['c1', 0, 2, 'c1-2', 2, 4, 3]);
  expect([a.crop.to.zoom, b.crop.from.zoom, b.crop.to.zoom]).toEqual([1.5, 1.5, 2]);
});

test('split handles freeze frames and drops the incoming transition on the second half', () => {
  const p = structuredClone(fixture());
  split(p, { t: 6, ids: ['c2'] });
  const [, a, b] = p.tracks[1].items as any[];
  expect([a.freezeAt, b.freezeAt, b.in, b.transitionIn, a.transitionIn?.type]).toEqual([null, 1, 14, undefined, 'dissolve']);
  const q = structuredClone(fixture());
  split(q, { t: 7.5, ids: ['c2'] });
  const b2 = (q.tracks[1].items as any[])[2];
  expect([b2.in, b2.freezeAt]).toEqual([16, 0]);
});

test('split partitions audio envelopes and fades; nothing long enough to split gives []', () => {
  const p = structuredClone(fixture());
  expect(split(p, { t: 4 })).toEqual(['m1-2']);
  const [a, b] = p.tracks[3].items as any[];
  expect([a.end, a.fadeOut, b.start, b.in, b.fadeIn]).toEqual([4, 0, 4, 4, 0]);
  expect(a.envelope).toEqual([[0, 0], [4, -4.8]]);
  expect(b.envelope).toEqual([[0, -4.8], [1, -6], [6, 0]]);
  expect(split(structuredClone(fixture()), { t: 0.01 })).toEqual([]);
});

test('split refuses to cut inside a defocus ramp', () => {
  const p = structuredClone(fixture());
  (p.tracks[1].items[0] as any).defocus = { from: 1, to: 3, px: 8 };
  expect(() => split(p, { t: 2, ids: ['c1'] })).toThrow(CommandError);
  expect(() => split(p, { t: 2, ids: ['c1'] })).toThrow(expect.objectContaining({ code: 'cmd.splitInDefocus' }));
});

test('split refuses to cut inside a transition into the clip; at its end or with a plain cut it splits', () => {
  // c2 (4–8 s) dissolves in over 0.5 s: a cut at 4.2 s would leave a 0.2 s first half and shorten the dissolve to it
  const p = structuredClone(fixture());
  expect(() => split(p, { t: 4.2, ids: ['c2'] })).toThrow(expect.objectContaining({ code: 'cmd.splitInTransition' }));
  expect(p).toEqual(fixture());
  expect(split(structuredClone(fixture()), { t: 4.5, ids: ['c2'] })).toHaveLength(1);
  const q = structuredClone(fixture()); (q.tracks[1].items[1] as any).transitionIn = { type: 'cut', dur: 0.5 };
  expect(split(q, { t: 4.2, ids: ['c2'] })).toHaveLength(1);
});

test("splitting a clip moves what hangs after the cut onto the second half and cuts the clip's own sound with it", async () => {
  const { addItem } = await import('./edit.ts');
  const { findItem } = await import('./core.ts');
  const p = structuredClone(fixture());
  addItem(p, { track: 'au', item: { id: 'snd', source: 's', in: 1, rate: 1, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' } });
  addItem(p, { track: 'fx', item: { id: 'hit', type: 'x.tap', start: 2, end: 2.1, params: {}, gain: 0, parent: 'c1' } });
  const [b] = split(p, { t: 1, ids: ['c1'] });
  const it = (id: string) => findItem(p, id).item as any;
  expect([it('hit').parent, it('hit').start]).toEqual([b, 1]);
  expect([it('snd').parent, it('snd').end]).toEqual(['c1', 1]);
  const half = p.tracks.find((t) => t.id === 'au')!.items.find((i: any) => i.parent === b) as any;
  expect([half.start, half.end, half.in]).toEqual([0, 3, 2]);
});

test("a split on a frame that is not 6-decimal exact still moves the clip's sound half onto the second half", async () => {
  const { addItem } = await import('./edit.ts');
  const { findItem } = await import('./core.ts');
  const p = structuredClone(fixture());
  addItem(p, { track: 'au', item: { id: 'snd', source: 's', in: 1, rate: 1, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' } });
  // the editor's playhead is a frame, 37/30 = 1.2333333…; the sound half starts at 1.233333 and was left hanging on c1
  const [b] = split(p, { t: 37 / 30, ids: ['c1'] });
  const half = p.tracks.find((t) => t.id === 'au')!.items.find((i: any) => i.id !== 'snd' && i.id.startsWith('snd')) as any;
  expect([half.parent, half.start]).toEqual([b, 0]);
  expect((findItem(p, 'snd').item as any).parent).toBe('c1');
});

test('splitting at an envelope step starts the second half on the level after the step', () => {
  const p = structuredClone(fixture());
  (p.tracks[3].items[0] as any).envelope = [[0, 0], [5, 0], [5, -120], [6, -120], [6, 0], [10, 0]];
  split(p, { t: 5, ids: ['m1'] });
  const [a, b] = p.tracks[3].items as any[];
  expect(a.envelope).toEqual([[0, 0], [5, 0]]);
  expect(b.envelope).toEqual([[0, -120], [1, -120], [1, 0], [5, 0]]);
});

test('splitting after a finished defocus ramp keeps the second half blurred', async () => {
  const { videoState } = await import('../geometry.ts');
  const p = structuredClone(fixture());
  (p.tracks[1].items[0] as any).defocus = { from: 0.5, to: 1, px: 8 };
  split(p, { t: 2, ids: ['c1'] });
  const [a, b] = p.tracks[1].items as any[];
  expect(a.defocus).toEqual({ from: 0.5, to: 1, px: 8 });
  for (const t of [0, 1]) expect(videoState(b, 0, 2, t, 320, 180, {}).filter).toBe('blur(8.00px)');
});

test('split refuses a missing t instead of cutting every media item (health10 EC12)', () => {
  const p = fixture(), was = JSON.stringify(p);
  expect(() => split(p, {} as any)).toThrow(/t: must be a finite number/);
  expect(() => split(p, { t: NaN })).toThrow(CommandError);
  expect(JSON.stringify(p)).toBe(was);
});

// health10 EC5: a cut inside the overlap a linked dissolve or crossfade of the next clip makes over this one left that
// overlap to the second half: the dissolve shrank (normal track) or the film got longer (magnetic track)
test('split refuses a cut inside the next clip\'s linked dissolve or crossfade, and allows one before it', () => {
  const p = fixture();
  const v: any = p.tracks[1];
  v.items[1].start = 3.5; v.items[1].end = 7.5;   // c2 dissolves in over c1's last 0.5 s (its transitionIn is 0.5)
  for (const ids of [['c1'], undefined]) expect(() => split(p, { t: 3.75, ids })).toThrow(CommandError);
  expect(split(structuredClone(p), { t: 3.4, ids: ['c1'] })).toEqual(['c1-2']);
  const q = fixture();
  const au: any = q.tracks.find((t) => t.id === 'au');
  au.items.push({ id: 'a2', source: 'a', in: 10, rate: 1, start: 2.5, end: 5, gain: 0, fadeIn: 0.5, fadeOut: 0 });
  au.items[0].fadeOut = 0.5;   // a1 1–3 crossfades into a2 over 2.5–3
  expect(() => split(q, { t: 2.75, ids: ['a1'] })).toThrow(/transition into the next clip/);
  expect(split(structuredClone(q), { t: 2.25, ids: ['a1'] })).toEqual(['a1-2']);
});
