import { resolveTimes, settle, type Project } from '@tellcut/engine';
import { fixture } from '../../../../packages/engine/src/commands/test-fixture.ts';
import { t } from '../i18n/index.ts';
import { dropRecipe, planDrop, type DropKind, type DropTarget } from './drop.ts';

const NO_SNAP = { snap: false, threshold: 0.08, playhead: 0 };
/** the fixture with its first video track magnetic (c1 0–4, c2 4–8) and an overlay track with one item 1–3 */
function project(): Project {
  const p = fixture() as any;
  p.tracks.find((x: any) => x.id === 'v').magnetic = true;
  delete p.tracks.find((x: any) => x.id === 'v').items[1].transitionIn;
  p.tracks.push({ id: 'ov', kind: 'overlay', items: [{ id: 'o1', type: 'x.title', start: 1, end: 3, params: {} }] });
  return p;
}
const plan = (p: Project, kind: DropKind, len: number, at: DropTarget, o = NO_SNAP, locked: string[] = [], refuse?: string) =>
  planDrop(p, resolveTimes(p), { kind, len, at, locked: new Set(locked), refuse }, o);
/** the plan carried out the way the editor's history does it (the magnetic rules settle afterwards) */
function drop(p: Project, kind: DropKind, len: number, at: DropTarget, item: Record<string, unknown>) {
  const pl = plan(p, kind, len, at);
  if (!pl || !pl.ok) throw new Error('refused');
  const d = structuredClone(p);
  const id = dropRecipe(pl, kind, { ...item, start: pl.start, end: pl.end })(d);
  settle(p, d);
  return { d, id, times: resolveTimes(d) };
}
const clip = { source: 's', in: 0, speed: 1, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } };

test('magnetic: dropped before a clip middle lands before it, after the middle after it, past the last clip at the end', () => {
  let r = drop(project(), 'video', 2, { t: 5, row: 'v' }, clip);
  expect([r.times.get(r.id)!.start, r.times.get('c2')!.start]).toEqual([4, 6]);
  r = drop(project(), 'video', 2, { t: 7, row: 'v' }, clip);
  expect([r.times.get(r.id)!.start, r.times.get('c2')!.start]).toEqual([8, 4]);
  r = drop(project(), 'video', 2, { t: 15, row: 'v' }, clip);
  expect(r.times.get(r.id)!.start).toBe(8);
});

test('another track: placed at the pointer time, overlapping items share the track in another lane', () => {
  const r = drop(project(), 'overlay', 2, { t: 2, row: 'ov' }, { type: 'x.title', params: {} });
  const ov = r.d.tracks.find((x) => x.id === 'ov')!;
  expect(ov.items.map((i: any) => i.id)).toEqual(['o1', r.id]);
  expect([r.times.get(r.id)!.start, r.times.get('o1')!.start, r.times.get('o1')!.end]).toEqual([2, 1, 3]);
});

test('end of the film: cut at the end on a normal track, refused past it', () => {
  const p = project();
  expect(plan(p, 'overlay', 5, { t: 18, row: 'ov' })).toMatchObject({ ok: true, start: 18, end: 20 });
  expect(plan(p, 'overlay', 5, { t: 20, row: 'ov' })).toMatchObject({ ok: false, why: t('ed.dropAtEnd') });
  // the magnetic track makes the film longer instead
  expect(plan(p, 'video', 5, { t: 18, row: 'v' })).toMatchObject({ ok: true, start: 18, end: 23 });
});

test('refused: wrong kind, locked, a reason given by the caller', () => {
  const p = project();
  expect(plan(p, 'music', 2, { t: 1, row: 'v' })).toMatchObject({ ok: false, why: t('ed.dropWrongKind'), track: 'v' });
  expect(plan(p, 'overlay', 2, { t: 1, row: 'ov' }, NO_SNAP, ['ov'])).toMatchObject({ ok: false, why: t('ed.dropLocked') });
  expect(plan(p, 'overlay', 2, { t: 1, row: 'ov' }, NO_SNAP, [], 'only one')).toMatchObject({ ok: false, why: 'only one' });
});

test('snaps the start or the end to the playhead and item edges', () => {
  const p = project(), o = { snap: true, threshold: 0.08, playhead: 9.5 };
  expect(plan(p, 'overlay', 2, { t: 9.53, row: 'ov' }, o)).toMatchObject({ start: 9.5 });
  expect(plan(p, 'overlay', 2, { t: 1.96, row: 'ov' }, o)).toMatchObject({ start: 2 });   // the scene block starts at 2
  const end = plan(p, 'overlay', 1.4, { t: 5.88, row: 'ov' }, o) as any;                   // its end on the marker at 7.3
  expect([end.start, end.end].map((x: number) => +x.toFixed(6))).toEqual([5.9, 7.3]);
});

test('new track when the project has none of that kind', () => {
  const p = project();
  p.tracks = p.tracks.filter((x) => x.kind !== 'sfx');
  const pl = plan(p, 'sfx', 0.5, { t: 2, row: 'new' });
  expect(pl).toMatchObject({ ok: true, track: null, start: 2, end: 2.5 });
  const r = drop(p, 'sfx', 0.5, { t: 2, row: 'new' }, { type: 'x.tap', params: {}, gain: 0 });
  const tr = r.d.tracks.find((x) => x.kind === 'sfx')!;
  expect(tr.items.map((i: any) => i.id)).toEqual([r.id]);
});

test('off the timeline: no plan', () => {
  expect(plan(project(), 'video', 2, { t: 2, row: null })).toBeNull();
});
