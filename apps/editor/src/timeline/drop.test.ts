import { resolveTimes, settle, type Project } from '@tellcut/engine';
import { fixture } from '../../../../packages/engine/src/commands/test-fixture.ts';
import { t } from '../i18n/index.ts';
import { dropRecipe, placeImported, planDrop, type DropKind, type DropTarget } from './drop.ts';

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

// files dropped from this PC, placed once their copy and import are done (no snapping: the pointer is long gone)
const IMPORTED = { locked: new Set<string>(), lengths: { song: 12 }, peaks: {}, beats: {} };
/** the project after the import: two new clips and a song, then placed the way the editor's history does it */
function imported(at: DropTarget, ids: string[], c = IMPORTED, edit?: (d: any) => void) {
  const p: any = project();
  p.sources.n1 = { path: 'n1.mp4', duration: 3 }; p.sources.n2 = { path: 'n2.mp4', duration: 2 }; p.media.song = { path: 'song.wav' };
  edit?.(p);
  const d = structuredClone(p);
  placeImported(d, ids, at, c);
  settle(p, d);
  const times = resolveTimes(d), of = (src: string) => d.tracks.flatMap((t: any) => t.items.map((i: any) => ({ ...i, track: t.id }))).find((i: any) => (i.source ?? i.media) === src && !p.tracks.some((t: any) => t.items.some((x: any) => x.id === i.id)));
  return { d, of, times };
}

test('placeImported: two clips on the magnetic track go one after another from the drop point; music goes to a music track when dropped on video', () => {
  const r = imported({ t: 3, row: 'v' }, ['n1', 'n2', 'song']);
  // 3 s is before c1's middle? no: c1 is 0–4 (middle 2), so the two go after c1, before c2, in drop order
  const n1 = r.of('n1'), n2 = r.of('n2'), song = r.of('song');
  expect([n1.track, r.times.get(n1.id)!.start, r.times.get(n1.id)!.end]).toEqual(['v', 4, 7]);
  expect([n2.track, r.times.get(n2.id)!.start, r.times.get(n2.id)!.end]).toEqual(['v', 7, 9]);
  expect(r.times.get('c2')!.start).toBe(9);
  expect([song.track, r.times.get(song.id)!.start, r.times.get(song.id)!.end]).toEqual(['mu', 4, 16]);       // its own length; it hangs on the clip dropped with it, so it starts with it at the cut
  // on a track that is not magnetic each one follows the one before
  const o = imported({ t: 1, row: 'v2' }, ['n1', 'n2']);
  const span = (id: string) => [o.times.get(id)!.start, o.times.get(id)!.end];
  expect([o.of('n1').track, ...span(o.of('n1').id), ...span(o.of('n2').id)]).toEqual(['v2', 1, 4, 4, 6]);
});

test('placeImported: the target track was deleted meanwhile → the first open track of the kind', () => {
  const r = imported({ t: 2, row: 'gone' }, ['song'], { ...IMPORTED, locked: new Set(['mu']) }, (p) => p.tracks.push({ id: 'mu2', kind: 'music', items: [] }));
  expect(r.of('song').track).toBe('mu2');                                   // mu is locked
  // "+ New track": one new track for the kind, both clips on it
  const n = imported({ t: 0, row: 'new' }, ['n1', 'n2']);
  expect(n.of('n1').track).toBe(n.of('n2').track);
  expect(['v', 'v2']).not.toContain(n.of('n1').track);
});
