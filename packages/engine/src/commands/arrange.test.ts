import { allItems } from '../schema.ts';
import { resolveTimes } from '../time.ts';
import { CommandError } from './core.ts';
import { deleteItems, moveItems, rippleDelete } from './arrange.ts';
import { addItem } from './edit.ts';
import { split } from './split.ts';
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

test('rippleDelete takes the deleted time out of what hangs on the clips left: nothing runs over the shots pulled back', () => {
  const p = fixture();
  addItem(p, { track: 'sc', item: { id: 'cap', type: 'x.block', start: 1.5, end: 3, params: {}, parent: 'c1' } });
  addItem(p, { track: 'sc', item: { id: 'long', type: 'x.block', start: 1.5, end: 5, params: {}, parent: 'c1' } });
  addItem(p, { track: 'au', item: { id: 'vo', source: 'a', in: 0, rate: 1, start: 1, end: 3, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' } });
  addItem(p, { track: 'fx', item: { id: 'hit', type: 'x.tap', start: 2.5, end: 2.6, params: {}, gain: 0, parent: 'c1' } });
  addItem(p, { track: 'fx', item: { id: 'hit2', type: 'x.tap', start: 1.9, end: 2, params: {}, gain: 0, parent: 'c1' } });
  split(p, { t: 2, ids: ['c1'] });   // cap, long, vo and hit2 start before the cut: they stay on the first half
  const q = run(p, rippleDelete, { ids: ['c1-2'] });
  const at = resolveTimes(q);
  expect(item(q, 'c2')).toMatchObject({ start: 2, end: 6 });
  // over the deleted half: cut where it starts; over the next shot as well: that part stays on it
  expect([at.get('cap'), at.get('long'), at.get('vo')]).toEqual([{ start: 1.5, end: 2 }, { start: 1.5, end: 3 }, { start: 1, end: 2 }]);
  expect(item(q, 'vo').in).toBe(0);
  // a sound effect keeps its length; one on the deleted time is gone with it
  expect(at.get('hit2')).toEqual({ start: 1.9, end: 2 });
  expect(at.has('hit')).toBe(false);
  // what hangs on a clip with nothing deleted inside it is left as it was
  expect(item(q, 'tap')).toEqual(item(fixture(), 'tap'));
});

test('rippleDelete trims the head of an item that starts on the deleted time, and its media in-point with it', () => {
  // vo hangs on c1 but plays from 5 s to 10 s, over c2 (4–8 s), which is deleted
  const p = fixture();
  addItem(p, { track: 'au', item: { id: 'vo', source: 'a', in: 5, rate: 1, start: 5, end: 10, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' } });
  const r = run(p, rippleDelete, { ids: ['c2'] });
  expect(resolveTimes(r).get('vo')).toEqual({ start: 4, end: 6 });
  expect(item(r, 'vo').in).toBe(8);
});

test("rippleDelete keeps what hangs on a clip that dissolved in over the deleted one (the clip keeps its length, so do they)", () => {
  const p = fixture();
  (p.tracks[1].items as any[])[1].start = 3;   // c2 dissolves in over c1 (3–4)
  addItem(p, { track: 'au', item: { id: 'snd', source: 's', in: 10, rate: 2, start: 0, end: 5, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c2' } });
  const r = run(p, rippleDelete, { ids: ['c1'] });
  expect(item(r, 'c2')).toMatchObject({ start: 0, end: 5 });
  expect(item(r, 'snd')).toMatchObject({ start: 0, end: 5, in: 10 });
});
