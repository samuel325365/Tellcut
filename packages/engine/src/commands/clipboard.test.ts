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

test('what a paste leaves out past the end is listed; nothing left is refused with a code the editor words', () => {
  const p = fixture(), clip = copyItems(p, ['c1', 'blk'], 'demo');                  // c1 0–4, blk 2–6: anchor 0
  const dropped: string[] = [];
  expect(pasteItems(p, { clip, t: 19, dropped })).toEqual(['c1-2']);                 // blk would start at 21
  expect(dropped).toEqual(['blk']);
  let err: any;
  try { pasteItems(p, { clip, t: 20 }); } catch (e) { err = e; }
  expect([err instanceof CommandError, err?.code]).toEqual([true, 'cmd.pastePastEnd']);
});

test('magnetic: blocks pasted past the end of the film are cut there; the film only grows by the clips pasted on the magnetic track', () => {
  const clip = (id: string, s: number, e: number) => ({ id, source: 's', in: 0, speed: 1, start: s, end: e, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
  const p = fixture();
  p.tracks = [
    { id: 'v', kind: 'video', magnetic: true, items: [clip('c1', 0, 4), clip('c2', 4, 8), clip('c3', 8, 12)] } as any,
    { id: 'o', kind: 'overlay', items: [{ id: 'cap', type: 'x.cap', start: 1, end: 2, params: {} }] } as any,
  ];
  p.meta.duration = 12;
  const cap = copyItems(p, ['cap'], 'demo'), before = structuredClone(p);
  pasteItems(p, { clip: cap, t: 11.5 });
  settle(before, p);
  expect([resolveTimes(p).get('cap-2'), p.meta.duration]).toEqual([{ start: 11.5, end: 12 }, 12]);
  expect(() => pasteItems(p, { clip: cap, t: 12 })).toThrow(CommandError);
});

test('skip: a paste passes over the listed (locked) tracks, onto another of the kind or a new one', () => {
  const p = fixture(), clip = copyItems(p, ['c1'], 'demo');
  pasteItems(p, { clip, t: 10, skip: new Set(['v']) });
  expect(ids(p, 'v2')).toEqual(['c1-2']);
  const q = fixture(), c2 = copyItems(q, ['c1'], 'demo');
  pasteItems(q, { clip: c2, t: 10, skip: new Set(['v', 'v2']) });
  expect(q.tracks.filter((t) => t.kind === 'video').length).toBe(3);
});

/** three 4 s clips on a magnetic track (c1 with its own sound), a 12 s film; extra items on an overlay and a second video track */
function magFilm(over: (p: any) => void = () => {}): Project {
  const clip = (id: string, s: number, e: number, inp = 0) => ({ id, source: 's', in: inp, speed: 1, start: s, end: e, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
  const p: any = fixture();
  p.tracks = [
    { id: 'v', kind: 'video', magnetic: true, items: [clip('c1', 0, 4), clip('c2', 4, 8), clip('c3', 8, 12)] },
    { id: 'v2', kind: 'video', items: [clip('b', 2, 6, 10)] },
    { id: 'o', kind: 'overlay', items: [{ id: 'title', type: 'x.cap', start: 0.5, end: 1.5, params: {} }, { id: 'long', type: 'x.cap', start: 2, end: 6, params: {} }] },
    { id: 'fx', kind: 'sfx', items: [{ id: 'hit', type: 'x.tap', start: 3.9, end: 4.1, params: {}, gain: 0 }] },
  ];
  p.meta.duration = 12;
  over(p);
  return p;
}

test('magnetic: what is pasted with a clip that goes later than the playhead never lands before 0 — left out, or cut at 0', () => {
  // c3 (8–12) pastes after c1 (the playhead is in it), 4 s earlier than it was: the rest moves 4 s earlier with it
  const p = magFilm(), copied = copyItems(p, ['title', 'long', 'b', 'hit', 'c3'], 'demo'), dropped: string[] = [];
  expect(pasteItems(p, { clip: copied, t: 1, dropped })).toEqual(['c3-2', 'long-2', 'b-2']);
  expect(dropped).toEqual(['title', 'hit']);                                         // −3.5..−2.5: nothing after 0; a sound effect cannot be cut
  expect([item(p, 'long-2').start, item(p, 'long-2').end]).toEqual([0, 2]);         // −2..2 cut at 0
  expect(item(p, 'b-2')).toMatchObject({ start: 0, end: 2, in: 12 });                // a clip cut at 0 keeps its picture in time
});

test('a child whose parent the caller left out is not pasted (it would hang on the original)', () => {
  const p = fixture(), copied = copyItems(p, ['blk'], 'demo');                       // blk with tap and tap2
  const entries = copied.entries.filter((e) => e.item.id !== 'blk');                 // what the editor does with a one-per-film block
  expect(() => pasteItems(p, { clip: { ...copied, entries }, t: 8 })).toThrow(CommandError);
  expect(ids(p, 'fx')).toEqual(['tap', 'tap2']);
});

test('a paste leaves out what would be less than a frame long at the end of the film', () => {
  const p = fixture();
  (p.tracks.find((t) => t.id === 'au')!.items as any[]).push({ id: 'o1', source: 's', in: 1, rate: 1, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' });
  const copied = copyItems(p, ['c1'], 'demo'), dropped: string[] = [];
  expect(() => pasteItems(p, { clip: copied, t: 19.99, dropped })).toThrow(CommandError);   // 25 fps: 0.01 s is a quarter frame
  expect(dropped).toEqual(['c1']);
  expect(pasteItems(p, { clip: copied, t: 19.96 })).toEqual(['c1-2']);                       // one frame is kept
  expect([item(p, 'c1-2').end, item(p, 'o1-2').end]).toEqual([20, 0.04]);
});
