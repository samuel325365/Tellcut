import { CommandError } from './core.ts';
import { copyItems, pasteItems } from './clipboard.ts';
import { deleteItems } from './arrange.ts';
import { settle } from './magnetic.ts';
import { resolveTimes } from '../time.ts';
import { fixture, item } from './test-fixture.ts';
import type { Project } from '../schema.ts';

const ids = (p: Project, track: string) => (p.tracks.find((t) => t.id === track)!.items as any[]).map((i) => i.id);

test('copy then paste at t: new ids, same relative timing, children re-parented', () => {
  const p = fixture(), clip = copyItems(p, ['blk'], 'demo');
  expect(clip.project).toBe('demo');
  expect(clip.anchor).toBe(2);
  expect(clip.entries.map((e) => e.item.id)).toEqual(['blk', 'tap', 'tap2']);
  expect(pasteItems(p, { clip, t: 10 })).toEqual(['blk-2']);
  expect(item(p, 'blk-2')).toMatchObject({ start: 10, end: 14 });
  expect([item(p, 'tap-2').parent, item(p, 'tap-2').start, item(p, 'tap2-2').parent]).toEqual(['blk-2', 0.5, 'blk-2']);
  expect(item(p, 'blk')).toMatchObject({ start: 2, end: 6 });                       // the original stays
  expect(ids(p, 'sc')).toEqual(['blk', 'blk-2']);
});

test('a clip copied with its own sound pastes with it', () => {
  const p = fixture();
  (p.tracks.find((t) => t.id === 'au')!.items as any[]).push({ id: 'o1', source: 's', in: 1, rate: 1, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' });
  const clip = copyItems(p, ['c1'], 'demo');
  expect(clip.entries.map((e) => e.item.id)).toEqual(['c1', 'o1']);
  expect(pasteItems(p, { clip, t: 12 })).toEqual(['c1-2']);
  expect(item(p, 'c1-2')).toMatchObject({ start: 12, end: 16, in: 1 });
  expect(item(p, 'o1-2')).toMatchObject({ parent: 'c1-2', start: 0, end: 4 });
});

test('paste onto a deleted track goes to the first track of that kind, or a new one', () => {
  const p = fixture(), clip = copyItems(p, ['blk'], 'demo');
  p.tracks = p.tracks.filter((t) => t.id !== 'sc');
  pasteItems(p, { clip, t: 10 });
  const scene = p.tracks.filter((t) => t.kind === 'scene');
  expect(scene.length).toBe(1);                                                     // a new one
  expect((scene[0].items as any[])[0].id).toBe('blk');                              // the id is free again
  const q = fixture(), c2 = copyItems(q, ['blk'], 'demo');
  q.tracks = q.tracks.filter((t) => t.id !== 'sc');
  q.tracks.unshift({ id: 'bg', kind: 'scene', items: [] } as any);
  pasteItems(q, { clip: c2, t: 10 });
  expect(ids(q, 'bg')).toEqual(['blk']);                                            // the first scene track there is
});

test('paste after undoing the original still works (the clip holds copies)', () => {
  const p = fixture(), clip = copyItems(p, ['c1'], 'demo');
  deleteItems(p, { ids: ['c1'] });
  expect(pasteItems(p, { clip, t: 0 })).toEqual(['c1']);
  expect(item(p, 'c1')).toMatchObject({ start: 0, end: 4, in: 1 });
});

test('copying nothing that exists throws; unknown ids among real ones are skipped', () => {
  const p = fixture();
  expect(() => copyItems(p, ['nope'], 'demo')).toThrow(CommandError);
  expect(copyItems(p, ['nope', 'c1'], 'demo').entries.map((e) => e.item.id)).toEqual(['c1']);
});

test('past the end of a fixed-length film: trimmed to the end; starting at or after the end is skipped; nothing left throws', () => {
  const p = fixture(), clip = copyItems(p, ['blk'], 'demo');                        // 4 s, children at 0.5 and 3
  pasteItems(p, { clip, t: 18 });
  expect(item(p, 'blk-2')).toMatchObject({ start: 18, end: 20 });
  expect(item(p, 'tap-2').parent).toBe('blk-2');                                     // at 18.5: kept
  expect(() => item(p, 'tap2-2')).toThrow();                                         // at 21: past the end, not pasted
  expect(() => pasteItems(p, { clip, t: 20 })).toThrow(CommandError);
});

test('magnetic: pasted after the clip under the playhead, later clips pushed right, others keep their timing to it', () => {
  const clip = (id: string, s: number, e: number) => ({ id, source: 's', in: 0, speed: 1, start: s, end: e, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
  const p = fixture();
  p.tracks = [
    { id: 'v', kind: 'video', magnetic: true, items: [clip('c1', 0, 4), clip('c2', 4, 8), clip('c3', 8, 12)] } as any,
    { id: 'o', kind: 'overlay', items: [{ id: 'cap', type: 'x.cap', start: 1, end: 2, params: {} }] } as any,
  ];
  p.meta.duration = 12;
  const copied = copyItems(p, ['c1', 'cap'], 'demo'), before = structuredClone(p);
  expect(pasteItems(p, { clip: copied, t: 5 })).toEqual(['c1-2', 'cap-2']);        // the playhead is in c2
  settle(before, p);
  const times = resolveTimes(p);
  expect(ids(p, 'v')).toEqual(['c1', 'c2', 'c1-2', 'c3']);
  expect([times.get('c1-2'), times.get('c3')]).toEqual([{ start: 8, end: 12 }, { start: 12, end: 16 }]);
  expect(times.get('cap-2')).toEqual({ start: 9, end: 10 });
  expect(p.meta.duration).toBe(16);                                                  // the film got longer
});

test('skip: a paste passes over the listed (locked) tracks, onto another of the kind or a new one', () => {
  const p = fixture(), clip = copyItems(p, ['c1'], 'demo');
  pasteItems(p, { clip, t: 10, skip: new Set(['v']) });
  expect(ids(p, 'v2')).toEqual(['c1-2']);
  const q = fixture(), c2 = copyItems(q, ['c1'], 'demo');
  pasteItems(q, { clip: c2, t: 10, skip: new Set(['v', 'v2']) });
  expect(q.tracks.filter((t) => t.kind === 'video').length).toBe(3);
});
