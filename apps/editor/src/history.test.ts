import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { deleteItems, moveItems, parseProject, trimEnd } from '@tellcut/engine';
import { History } from './history.ts';

test('apply records one undoable step; undo and redo walk the stack', () => {
  const p0 = fixture(), h = new History(p0);
  const p1 = h.apply((d) => moveItems(d, { ids: ['c1'], dt: 1 }));
  const p2 = h.apply((d) => trimEnd(d, { id: 'c1', dt: -1 }));
  expect(h.canUndo).toBe(true);
  expect(h.undo()).toEqual(p1);
  expect(h.undo()).toEqual(p0);
  expect(h.undo()).toBeNull();
  expect(h.redo()).toEqual(p1);
  expect(h.redo()).toEqual(p2);
  expect(h.canRedo).toBe(false);
});

test('a new edit clears redo; a failing or empty recipe changes nothing', () => {
  const h = new History(fixture());
  h.apply((d) => moveItems(d, { ids: ['c1'], dt: 1 }));
  h.undo();
  h.apply((d) => deleteItems(d, { ids: ['a1'] }));
  expect(h.canRedo).toBe(false);
  const before = h.project;
  expect(() => h.apply((d) => deleteItems(d, { ids: ['nope'] }))).toThrow('No item "nope"');
  h.apply(() => {});
  expect(h.project).toBe(before);
  h.undo();
  expect(h.canUndo).toBe(false);
});

test('preview shows an edit without recording it', () => {
  const p0 = fixture(), h = new History(p0);
  const view = h.preview((d) => moveItems(d, { ids: ['c1'], dt: 2 }));
  expect((view.tracks[1].items[0] as any).start).toBe(2);
  expect(h.project).toBe(p0);
  expect(h.canUndo).toBe(false);
});

test('a recipe that also returns a value (e.g. a new id or index) is still applied and previewed', () => {
  const h = new History({ n: 1, tracks: [] } as any);   // History works on projects: relink reads the tracks
  const bump = (d: any) => (d.n += 1);   // returns the new value, like addItem/addEnvelopePoint
  expect((h.preview(bump as any) as any).n).toBe(2);
  expect((h.apply(bump as any) as any).n).toBe(2);
  expect(h.canUndo).toBe(true);
});

test('a move that changes a linked overlap carries the transition along, in the same undo step and in previews', () => {
  const p = fixture(); (p.tracks[1].items[1] as any).start = 3.5;   // c2: a 0.5 s dissolve over a 0.5 s overlap
  const h = new History(p);
  const next = h.apply((d) => moveItems(d, { ids: ['c2'], dt: -0.25 }));
  expect((next.tracks[1].items[1] as any).transitionIn.dur).toBe(0.75);
  expect((h.preview((d) => moveItems(d, { ids: ['c2'], dt: 0.25 })).tracks[1].items[1] as any).transitionIn.dur).toBe(0.5);
  const back = h.undo()!;
  expect([(back.tracks[1].items[1] as any).start, (back.tracks[1].items[1] as any).transitionIn.dur]).toEqual([3.5, 0.5]);
});
test('an edit on a magnetic track is packed in the same undo step', () => {
  const p: any = fixture(); p.tracks[1].magnetic = true;
  const h = new History(parseProject(p));
  h.apply((d) => trimEnd(d, { id: 'c1', dt: -1 }));
  expect((h.project.tracks[1].items[1] as any).start).toBe(3);
  h.undo();
  expect((h.project.tracks[1].items[1] as any).start).toBe(4);
});
