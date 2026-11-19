import { parseProject, type Project } from '../schema.ts';
import type { ComboPlacement } from '../combos.ts';
import { clipAt, placeCombo } from './combo.ts';
import { settle } from './magnetic.ts';
import { fixture, item } from './test-fixture.ts';

// a combo already expanded (expandCombo): a plain picture, one over the captions, one under the video, a sound and the shake
const LAYERS: ComboPlacement[] = [
  { name: 'lines', kind: 'effect', type: 'x.lines', at: 0, len: 0.8, params: { n: 1 } },
  { name: 'flash', kind: 'effect', type: 'x.flash', at: 0, len: 0.5, params: {}, layer: 'top' },
  { name: 'glow', kind: 'effect', type: 'x.glow', at: -0.2, len: 1, params: {}, layer: 'under' },
  { name: 'hit', kind: 'sfx', type: 'x.hit', at: 0, len: 1.4, params: {}, gain: -6 },
  { name: 'shake', kind: 'shake', at: 0, len: 0.4, params: {}, px: 28 },
];
const trackOf = (p: Project, id: string) => p.tracks.find((t) => (t.items as Array<{ id: string }>).some((i) => i.id === id))!;

test('each layer lands on the track Cut would use, hung on the clip playing at the moment; the shake goes on that clip in its seconds', () => {
  const p = fixture(), r = placeCombo(p, { layers: LAYERS, at: 5 });
  expect(Object.keys(r.items)).toEqual(['lines', 'flash', 'glow', 'hit']);   // the shake is the clip's, no item
  expect([r.clip, r.shaken]).toEqual(['c2', ['c2']]);
  const lines = trackOf(p, r.items.lines), flash = trackOf(p, r.items.flash);
  expect([lines.kind, flash.kind, flash.name]).toEqual(['overlay', 'overlay', 'Top']);
  expect(p.tracks.indexOf(flash)).toBeGreaterThan(p.tracks.indexOf(lines));   // over the captions' track
  expect(trackOf(p, r.items.glow).id).toBe('sc');                            // the scene track under the video
  expect(trackOf(p, r.items.hit).id).toBe('fx');
  // c2 starts at 4: every item in its seconds
  expect(item(p, r.items.lines)).toMatchObject({ type: 'x.lines', params: { n: 1 }, start: 1, end: 1.8, parent: 'c2' });
  expect(item(p, r.items.glow)).toMatchObject({ start: 0.8, end: 1.8, parent: 'c2' });
  expect(item(p, r.items.hit)).toMatchObject({ type: 'x.hit', gain: -6, start: 1, end: 2.4, parent: 'c2' });
  expect(item(p, 'c2').shake).toEqual([{ at: 1, dur: 0.4, px: 28, hz: 18 }]);
  expect(item(p, 'c1').shake).toBeUndefined();
  expect(() => parseProject(p)).not.toThrow();
});

test('a shake across a cut shakes both clips, as c.shake does; a layer ahead of a moment at the start of the film starts at 0', () => {
  const p = fixture(), r = placeCombo(p, { layers: LAYERS, at: 3.8 });
  expect([r.clip, r.shaken]).toEqual(['c1', ['c1', 'c2']]);
  expect(item(p, 'c2').shake).toEqual([{ at: -0.2, dur: 0.4, px: 28, hz: 18 }]);
  const q = fixture(), s = placeCombo(q, { layers: LAYERS, at: 0.1 });
  expect(item(q, s.items.glow)).toMatchObject({ start: 0, end: 0.9 });
});

test('with no clip at the moment the shake is left out and the items stay on nothing; at the end of the film they are cut, then refused', () => {
  const p = fixture(), r = placeCombo(p, { layers: LAYERS, at: 10 });
  expect([r.clip, r.shaken]).toEqual([undefined, []]);
  expect(item(p, r.items.lines)).toMatchObject({ start: 10, end: 10.8 });
  expect(item(p, r.items.lines).parent).toBeUndefined();
  expect([item(p, 'c1').shake, item(p, 'c2').shake]).toEqual([undefined, undefined]);
  const q = fixture(), s = placeCombo(q, { layers: LAYERS, at: 19.5 });
  expect([item(q, s.items.lines).end, item(q, s.items.hit).end]).toEqual([20, 20]);
  // at the very end only a layer ahead of the moment is left (the glow, 0.2 s before it)
  const t = fixture(), u = placeCombo(t, { layers: LAYERS, at: 20 });
  expect([Object.keys(u.items), item(t, u.items.glow).start]).toEqual([['glow'], 19.8]);
  expect(() => placeCombo(fixture(), { layers: LAYERS.filter((l) => l.name !== 'glow'), at: 20 })).toThrow(expect.objectContaining({ code: 'cmd.comboAtEnd' }));
});

test('locked tracks are passed over: another of the kind, a new one (a scene track goes under everything), no shake on a locked main track', () => {
  const p = fixture(), r = placeCombo(p, { layers: LAYERS, at: 5, skip: new Set(['sc', 'fx', 'v']) });
  const glow = trackOf(p, r.items.glow), hit = trackOf(p, r.items.hit);
  expect([glow.kind, p.tracks.indexOf(glow), hit.kind, hit.id === 'fx']).toEqual(['scene', 0, 'sfx', false]);
  expect([r.clip, r.shaken, item(p, r.items.lines).parent]).toEqual([undefined, [], undefined]);
  // a scene track made under the video, and the shake still reaches the clip
  const q = fixture(), s = placeCombo(q, { layers: LAYERS, at: 5, skip: new Set(['sc']) });
  expect([q.tracks.indexOf(trackOf(q, s.items.glow)), s.shaken, item(q, 'c2').shake?.length]).toEqual([0, ['c2'], 1]);
});

test('existing overlay tracks are used: the plain layers on the first, the top layer on the topmost one above it', () => {
  const p = fixture();
  p.tracks.push({ id: 'text', kind: 'overlay', items: [] }, { id: 'stickers', kind: 'overlay', items: [] });
  const r = placeCombo(p, { layers: LAYERS, at: 5 });
  expect([trackOf(p, r.items.lines).id, trackOf(p, r.items.flash).id]).toEqual(['text', 'stickers']);
  // only one overlay track: a Top track is made above it, and used again by the next combo
  const q = fixture();
  q.tracks.push({ id: 'text', kind: 'overlay', items: [] });
  const a = placeCombo(q, { layers: LAYERS, at: 5 }), b = placeCombo(q, { layers: LAYERS, at: 9 });
  expect(trackOf(q, a.items.flash).id).not.toBe('text');
  expect(trackOf(q, b.items.flash).id).toBe(trackOf(q, a.items.flash).id);
  expect(trackOf(q, b.items.lines).id).toBe('text');
});

test('clipAt: the main-track clip under a time, the magnetic track first', () => {
  const p = fixture();
  expect([clipAt(p, 0)?.id, clipAt(p, 4)?.id, clipAt(p, 7.99)?.id, clipAt(p, 8)]).toEqual(['c1', 'c2', 'c2', undefined]);
  p.tracks.find((t) => t.id === 'v2')!.items.push({ id: 'm', source: 's', in: 0, speed: 1, start: 0, end: 9, frame: [0, 0, 1, 1], crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, interp: 'none' } as any);
  (p.tracks.find((t) => t.id === 'v2') as any).magnetic = true;
  expect(clipAt(p, 8.5)?.id).toBe('m');
});

test('on the magnetic track, a layer ahead of a moment at a cut stays on the clip of the moment once the editor settles the edit', () => {
  const p = fixture(), v: any = p.tracks.find((t) => t.id === 'v')!;
  v.magnetic = true;
  delete v.items[1].transitionIn;
  // the editor runs the command on a draft, then the magnetic rules (history.ts): a new item that comes hung on a clip keeps it
  const d = structuredClone(p), r = placeCombo(d, { layers: LAYERS, at: 4 });
  settle(p, d);
  expect(r.clip).toBe('c2');
  expect(item(d, r.items.glow)).toMatchObject({ start: -0.2, end: 0.8, parent: 'c2' });
  for (const id of Object.values(r.items)) expect(item(d, id).parent).toBe('c2');
});
