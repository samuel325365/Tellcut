import { allItems } from '../schema.ts';
import { resolveTimes } from '../time.ts';
import { CommandError } from './core.ts';
import { deleteItems, moveItems, rippleDelete } from './arrange.ts';
import { fixture, item, run } from './test-fixture.ts';

test('moveItems shifts items and children ride along with their parent only once', () => {
  const p = run(fixture(), moveItems, { ids: ['blk', 'tap'], dt: 1.5 });
  expect([item(p, 'blk').start, item(p, 'blk').end]).toEqual([3.5, 7.5]);
  expect(item(p, 'tap').start).toBe(0.5);
  expect(resolveTimes(p).get('tap')!.start).toBe(4);
});

test('moveItems never moves anything before 0', () => {
  const p = run(fixture(), moveItems, { ids: ['a1', 'c2'], dt: -10 });
  expect(item(p, 'a1').start).toBe(0);
  expect(item(p, 'c2').start).toBe(3);
});

test('moveItems moves a single item to another track of the same kind only', () => {
  const p = run(fixture(), moveItems, { ids: ['c2'], dt: 0, toTrack: 'v2' });
  expect(p.tracks[2].items.map((i) => i.id)).toEqual(['c2']);
  expect(p.tracks[1].items.map((i) => i.id)).toEqual(['c1']);
  expect(() => run(fixture(), moveItems, { ids: ['c2'], dt: 0, toTrack: 'au' })).toThrow('Cannot move a video item onto track "au" (audio)');
  expect(() => run(fixture(), moveItems, { ids: ['c1', 'c2'], dt: 0, toTrack: 'v2' })).toThrow(CommandError);
});

test('deleteItems removes items together with their children', () => {
  const p = run(fixture(), deleteItems, { ids: ['blk'] });
  expect(allItems(p).map((x) => x.item.id)).toEqual(['c1', 'c2', 'm1', 'a1']);
  expect(() => run(fixture(), deleteItems, { ids: ['nope'] })).toThrow('No item "nope"');
});

test('rippleDelete closes the gap on the same track only', () => {
  const p = run(fixture(), rippleDelete, { ids: ['c1'] });
  expect(p.tracks[1].items.map((i: any) => [i.id, i.start, i.end])).toEqual([['c2', 0, 4]]);
  expect(item(p, 'a1').start).toBe(1);
});

test('rippleDelete keeps overlapping clips (dissolves) in order and never double-counts overlaps', () => {
  const p = fixture();
  const v = p.tracks[1].items as any[];
  v[1].start = 3;   // c2 dissolves in over c1 (3–4)
  v.push({ ...structuredClone(v[1]), id: 'c3', start: 9, end: 11, transitionIn: undefined });
  const a = run(p, rippleDelete, { ids: ['c1'] });
  expect(a.tracks[1].items.map((i: any) => [i.id, i.start])).toEqual([['c2', 0], ['c3', 5]]);
  const b = run(p, rippleDelete, { ids: ['c1', 'c2'] });   // union [0, 8], not 4 + 5
  expect(b.tracks[1].items.map((i: any) => [i.id, i.start])).toEqual([['c3', 1]]);
});
