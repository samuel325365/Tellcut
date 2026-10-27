import { CommandError } from './core.ts';
import { moveTrack, removeTrack, restackItem, restackTarget } from './layer.ts';
import { fixture, item, run } from './test-fixture.ts';

const ids = (p: any) => p.tracks.map((t: any) => t.id);
const still = { x: 0.5, y: 0.5, zoom: 1 };

test('moveTrack reorders a track inside its group (pictures or sound) only', () => {
  expect(ids(run(fixture(), moveTrack, { id: 'sc', to: 2 }))).toEqual(['v', 'v2', 'sc', 'mu', 'au', 'fx']);
  expect(ids(run(fixture(), moveTrack, { id: 'fx', to: 0 }))).toEqual(['sc', 'v', 'v2', 'fx', 'mu', 'au']);
  expect(() => run(fixture(), moveTrack, { id: 'sc', to: 3 })).toThrow(CommandError);    // 3 picture tracks: 0–2
  expect(() => run(fixture(), moveTrack, { id: 'nope', to: 0 })).toThrow(/No track/);
});

test('removeTrack removes the track, its items and their children on other tracks', () => {
  const p = run(fixture(), removeTrack, { id: 'sc' });
  expect(ids(p)).toEqual(['v', 'v2', 'mu', 'au', 'fx']);
  expect(p.tracks.find((t) => t.id === 'fx')!.items).toEqual([]);     // tap and tap2 were children of blk
  expect(ids(run(fixture(), removeTrack, { id: 'v2' }))).toEqual(['sc', 'v', 'mu', 'au', 'fx']);
});

test('restackItem steps over the nearest item that overlaps it; refuses when none does', () => {
  const p = fixture(); item(p, 'c2').start = 3.5;                     // c1 (0–4) and c2 (3.5–8) overlap; c2 is on top
  const down = run(p, restackItem, { id: 'c2', dir: 'down' });
  expect(down.tracks[1].items.map((i) => i.id)).toEqual(['c2', 'c1']);
  expect([restackTarget(down, 'c2', 'down'), restackTarget(down, 'c2', 'up')]).toEqual([-1, 1]);
  expect(run(down, restackItem, { id: 'c2', dir: 'up' }).tracks[1].items.map((i) => i.id)).toEqual(['c1', 'c2']);
  expect(() => run(fixture(), restackItem, { id: 'c1', dir: 'up' })).toThrow(/No overlapping item above/);   // c2 starts at 4
  // an item that does not overlap is skipped: one press always changes what is seen
  const q: any = fixture(); item(q, 'c2').start = 3.5;
  q.tracks[1].items.splice(1, 0, { id: 'x', source: 's', in: 0, speed: 1, start: 12, end: 14, crop: { from: still, to: still } });
  expect(run(q, restackItem, { id: 'c1', dir: 'up' }).tracks[1].items.map((i: any) => i.id)).toEqual(['x', 'c2', 'c1']);
});
