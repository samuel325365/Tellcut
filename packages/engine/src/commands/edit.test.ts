import { resolveTimes } from '../time.ts';
import { CommandError, uniqueId } from './core.ts';
import { addCropKey, addItem, addSources, addTrack, removeCropKey, setCrop, setTrack, setTransform, updateItem } from './edit.ts';
import { rateStretch, trimEnd } from './trim.ts';
import { split } from './split.ts';
import { fixture, item, run } from './test-fixture.ts';

test('updateItem applies valid fields and refuses invalid ones with the reason', () => {
  expect(item(run(fixture(), updateItem, { id: 'c2', patch: { speed: 0.5, label: '慢動作' } }), 'c2')).toMatchObject({ speed: 0.5, label: '慢動作' });
  expect(() => run(fixture(), updateItem, { id: 'c2', patch: { speed: 0 } })).toThrow(/speed/);
  expect(() => run(fixture(), updateItem, { id: 'c2', patch: { end: 3 } })).toThrow('end: end must be greater than start');
  expect(() => run(fixture(), updateItem, { id: 'c2', patch: { source: 'nope' } })).toThrow('source: unknown source "nope"');
  expect(() => run(fixture(), updateItem, { id: 'c2', patch: { in: 30 } })).toThrow(/in: .*past the end of source/);
  expect(() => run(fixture(), updateItem, { id: 'c2', patch: { id: 'x' } })).toThrow(CommandError);
  expect(item(run(fixture(), updateItem, { id: 'c2', patch: { transitionIn: undefined } }), 'c2').transitionIn).toBeUndefined();
});

test('addSources adds footage and music, skips paths already there, refuses a taken id', () => {
  const clip = { path: 'n.mp4', duration: 5, width: 1920, height: 1080, kind: 'video' as const, audio: true };
  const d = structuredClone(fixture());
  expect(addSources(d, { sources: { n: clip }, media: { song: { path: 'song.wav' } } })).toEqual(['n', 'song']);
  expect([d.sources.n.path, d.media.song.path]).toEqual(['n.mp4', 'song.wav']);
  // the fixture's source s is s.mp4: the same file in another case is already there
  const again = structuredClone(fixture());
  expect(addSources(again, { sources: { n2: { ...clip, path: 'S.MP4' } } })).toEqual([]);
  expect(again).toEqual(fixture());
  expect(() => run(fixture(), addSources, { sources: { s: { ...clip, path: 'other.mp4' } } })).toThrow(CommandError);
});

test('changing a block length through updateItem scales its children', () => {
  const p = run(fixture(), updateItem, { id: 'blk', patch: { end: 10 } });
  expect(resolveTimes(p).get('tap2')!.start).toBe(8);
});

test('addItem validates, picks a free id and appends; addTrack adds an empty track', () => {
  const p = structuredClone(fixture());
  const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
  expect(addItem(p, { track: 'v2', item: { source: 's', in: 0, speed: 1, start: 5, end: 7, crop } })).toBe('clip');
  expect(addItem(p, { track: 'v2', item: { source: 's', in: 0, speed: 1, start: 7, end: 9, crop } })).toBe('clip-2');
  expect(() => addItem(p, { track: 'v2', item: { source: 's', in: 0, speed: 1, start: 7, end: 9 } })).toThrow(/crop/);
  expect(addTrack(p, { kind: 'overlay' })).toBe('overlay');
  expect(p.tracks.map((t) => t.id)).toEqual(['sc', 'v', 'v2', 'overlay', 'mu', 'au', 'fx']);
  expect(addTrack(p, { kind: 'sfx' })).toBe('sfx');
  expect(p.tracks.at(-1)!.id).toBe('sfx');
  expect(uniqueId(p, 'overlay')).toBe('overlay-2');
});

test('setTrack sets bus gain, mute and solo; gain and solo only on audio tracks', () => {
  const p = run(fixture(), setTrack, { id: 'mu', patch: { gain: -100, muted: true, solo: true } });
  expect(p.tracks[3]).toMatchObject({ gain: -60, muted: true, solo: true });
  expect(run(fixture(), setTrack, { id: 'v', patch: { muted: true } }).tracks[1].muted).toBe(true);
  expect(() => run(fixture(), setTrack, { id: 'v', patch: { solo: true } })).toThrow(CommandError);
});

test('setCrop clamps the focus point and zoom', () => {
  expect(item(run(fixture(), setCrop, { id: 'c1', which: 'to', crop: { x: 1.4, y: -0.2, zoom: 12 } }), 'c1').crop.to).toEqual({ x: 1, y: 0, zoom: 8 });
  expect(() => run(fixture(), setCrop, { id: 'm1', which: 'from', crop: { x: 0.5, y: 0.5, zoom: 1 } })).toThrow(CommandError);
});

test('the panel cannot set fades longer than the clip or run a clip past its source', () => {
  expect(() => run(fixture(), updateItem, { id: 'm1', patch: { fadeIn: 50 } })).toThrow(/fadeIn: fade-in plus fade-out/);
  expect(() => run(fixture(), updateItem, { id: 'c1', patch: { end: 40 } })).toThrow(/end: the clip runs past the end of source "s"/);
  expect(() => run(fixture(), updateItem, { id: 'a1', patch: { rate: 4, end: 30 } })).toThrow(/past the end of source "a"/);
  expect(item(run(fixture(), updateItem, { id: 'c2', patch: { end: 30 } }), 'c2').end).toBe(30);   // frozen: holds one frame
});

test('clips made by stretches, trims and splits stay editable in the panel', () => {
  // a rate stretch of a clip that ends at its source end rounds speed (r6): the source check must allow that
  const p = run(fixture(), trimEnd, { id: 'c1', dt: 100 });   // c1 now ends at the end of source "s"
  const bad: number[] = [];
  for (let len = 2; len <= 30; len += 0.5) {
    const q = run(p, rateStretch, { id: 'c1', edge: 'end', dt: len - 29 });
    try { run(q, updateItem, { id: 'c1', patch: { label: 'x' } }); } catch { bad.push(len); }
  }
  expect(bad).toEqual([]);
  // fades follow the clip: a split inside the fade-in, a trim shorter than both fades, a shorter end from the panel
  const m = structuredClone(fixture());
  item(m, 'm1').fadeIn = 3;
  split(m, { t: 2, ids: ['m1'] });
  expect(() => run(m, updateItem, { id: 'm1', patch: { gain: -3 } })).not.toThrow();
  const t = run(fixture(), trimEnd, { id: 'm1', dt: -9.5 });
  expect(item(t, 'm1').fadeIn + item(t, 'm1').fadeOut).toBeLessThanOrEqual(0.5);
  expect(() => run(t, updateItem, { id: 'm1', patch: { gain: -3 } })).not.toThrow();
  expect(item(run(fixture(), updateItem, { id: 'm1', patch: { end: 1 } }), 'm1')).toMatchObject({ fadeIn: 0.5, fadeOut: 0.5 });
});

test('setTransform moves and scales scene/overlay items within range; null resets', () => {
  const p = run(fixture(), setTransform, { id: 'blk', transform: { x: 1.5, y: -0.25, scale: 20, ox: 0.5, oy: 0.5 } });
  expect(item(p, 'blk').transform).toEqual({ x: 1, y: -0.25, scale: 10, ox: 0.5, oy: 0.5 });
  expect('transform' in item(run(p, setTransform, { id: 'blk', transform: null }), 'blk')).toBe(false);
  expect(() => run(fixture(), setTransform, { id: 'c1', transform: { x: 0, y: 0, scale: 1, ox: 0.5, oy: 0.5 } })).toThrow('Only scene and overlay items can be moved or scaled');
});

test("a moving layer given a new origin keeps every key's picture where it was (each by its own scale)", () => {
  const keys = [{ t: 0, x: 0, y: 0, scale: 1 }, { t: 1, x: 0.2, y: 0.1, scale: 0.5 }];
  const p = run(fixture(), setTransform, { id: 'blk', transform: { x: 0, y: 0, scale: 1, ox: 0.5, oy: 0.5, keys } });
  // origin 0.5 → 0.3 at scale 1 is the same picture (T' = T + (1 − 1)(…) = T); key 2 at scale 0.5 must move by 0.5·0.2
  const q = run(p, setTransform, { id: 'blk', transform: { x: 0, y: 0, scale: 1, ox: 0.3, oy: 0.5 } });
  expect(item(q, 'blk').transform.keys).toEqual([{ t: 0, x: 0, y: 0, scale: 1 }, { t: 1, x: 0.3, y: 0.1, scale: 0.5 }]);
});

test('a moving layer: moving or scaling it carries the whole path; new keys replace it; keys: [] stops it', () => {
  const keys = [{ t: 0, x: 0.1, y: 0.1, scale: 1 }, { t: 1, x: 0.3, y: 0.2, scale: 1 }];
  const p = run(fixture(), setTransform, { id: 'blk', transform: { x: 0.1, y: 0.1, scale: 1, ox: 0.5, oy: 0.5, keys } });
  expect(item(p, 'blk').transform.keys).toEqual(keys);
  const moved = run(p, setTransform, { id: 'blk', transform: { x: 0.2, y: 0, scale: 2, ox: 0.5, oy: 0.5 } });   // a drag: no keys given
  expect(item(moved, 'blk').transform.keys).toEqual([{ t: 0, x: 0.2, y: 0, scale: 2 }, { t: 1, x: 0.4, y: 0.1, scale: 2 }]);
  const panel = run(p, setTransform, { id: 'blk', transform: { ...item(p, 'blk').transform, x: 0.2 } });   // the panel passes the old keys along
  expect(item(panel, 'blk').transform.keys[1]).toEqual({ t: 1, x: 0.4, y: 0.2, scale: 1 });
  expect('keys' in item(run(p, setTransform, { id: 'blk', transform: { ...item(p, 'blk').transform, keys: [] } }), 'blk').transform).toBe(false);
});

test('crop keyframes: add at a time, edit, remove', () => {
  const p = fixture();
  const i = addCropKey(p, { id: 'c1', t: 1 });
  const c1 = item(p, 'c1');
  expect(i).toBe(0);
  expect(c1.crop.keys).toEqual([{ t: 1, x: 0.5, y: 0.5, zoom: 1.25 }]);
  expect(addCropKey(p, { id: 'c1', t: 3 })).toBe(1);
  expect(addCropKey(p, { id: 'c1', t: 2 })).toBe(1);                 // kept in time order
  setCrop(p, { id: 'c1', which: 1, crop: { x: 0.3, y: 0.4, zoom: 3 } });
  expect(c1.crop.keys[1]).toEqual({ t: 2, x: 0.3, y: 0.4, zoom: 3 });
  expect(() => addCropKey(p, { id: 'c1', t: 2 })).toThrow(/already/);
  expect(() => addCropKey(p, { id: 'c1', t: 4 })).toThrow(/inside/);
  expect(() => setCrop(p, { id: 'c1', which: 9, crop: { x: 0.5, y: 0.5, zoom: 1 } })).toThrow(/keyframe 9/);
  removeCropKey(p, { id: 'c1', index: 0 }); removeCropKey(p, { id: 'c1', index: 0 }); removeCropKey(p, { id: 'c1', index: 0 });
  expect(c1.crop.keys).toBeUndefined();
});

test("a new speed from the properties panel plays the clip's own sound at it; past 4× for the sound it is refused", () => {
  // c1 (in 1, 0–4 s) with its own sound and a tap 2 s into it
  const withOwn = () => {
    const p = fixture();
    addItem(p, { track: 'au', item: { id: 'snd', source: 's', in: 1, rate: 1, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' } });
    addItem(p, { track: 'fx', item: { id: 'hit', type: 'x.tap', start: 2, end: 2.1, params: {}, gain: 0, parent: 'c1' } });
    return p;
  };
  const p = run(withOwn(), updateItem, { id: 'c1', patch: { speed: 2 } });
  expect(item(p, 'snd')).toMatchObject({ start: 0, end: 4, in: 1, rate: 2 });
  expect(item(p, 'hit').start).toBe(2);
  // a new speed, in-point and length together: the sound starts at the picture's new source moment and spans the clip
  expect(item(run(withOwn(), updateItem, { id: 'c1', patch: { speed: 0.5, in: 3, end: 8 } }), 'snd')).toMatchObject({ start: 0, end: 8, in: 3, rate: 0.5 });
  expect(() => run(withOwn(), updateItem, { id: 'c1', patch: { speed: 5 } })).toThrow(CommandError);
  expect(() => run(withOwn(), updateItem, { id: 'c1', patch: { speed: 5 } })).toThrow(/own sound/);
});
