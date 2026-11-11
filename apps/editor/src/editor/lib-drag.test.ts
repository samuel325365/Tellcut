// Dragging a library card onto the timeline (spec 2026-11-10-media-panel-visual §5): a live preview while it moves, one undo step
// on release, nothing when let go off the timeline or on a place that refuses it.
import { resolveTimes } from '@tellcut/engine';
import { Editor } from '../editor.ts';
import { fakes, ids, live, magneticFixture, prop } from '../editor-test-kit.ts';
import { t } from '../i18n/index.ts';

const NO = { alt: false, ctrl: false, shift: false };
const registry = {
  item: (type: string) => ({ 'x.bg': { kind: 'scene', params: [] }, 'x.one': { kind: 'overlay', unique: true, label: 'One', params: [] }, 'x.title': { kind: 'overlay', params: [] } } as any)[type],
  sfx: () => undefined, itemTypes: () => [], sfxTypes: () => [],
};
async function editor(over: Record<string, any> = {}) {
  const { api, bridge } = fakes({ project: async () => magneticFixture(), ...over });
  const ed = new Editor('demo', { api, bridge, registryFor: async () => registry as any });
  await ed.open();
  return ed;
}
const scene = { kind: 'clip' as const, source: 's', from: 20, len: 2 };

test('a scene card dropped on the magnetic track: previewed live, one undo step on release, the new clip selected', async () => {
  const ed = await editor();
  const before = ed.store.get().project!;
  expect(ed.beginLibDrag(scene)).toBe(true);
  ed.libDragTo({ t: 5, row: 'v' }, NO);
  const shown = ed.store.get().project!, times = resolveTimes(shown);
  expect(ids(ed, 'v').length).toBe(3);                       // the preview already has it, before c2
  expect(times.get('c2')!.start).toBe(6);
  expect(ed.store.get().libDrag).toMatchObject({ kind: 'video', len: 2, line: 4, plan: { ok: true, track: 'v' } });
  expect(ed.store.get().canUndo).toBe(false);
  expect(ed.endLibDrag(true)).toBe(true);
  const added = ids(ed, 'v').find((i) => !['c1', 'c2'].includes(i))!;
  expect([ed.store.get().selection, ed.store.get().canUndo, ed.store.get().libDrag]).toEqual([[added], true, null]);
  ed.undo();
  expect(ed.store.get().project).toEqual(before);
});

test('endLibDrag outside the timeline restores the project', async () => {
  const ed = await editor();
  const before = ed.store.get().project!;
  ed.beginLibDrag(scene);
  ed.libDragTo({ t: 5, row: 'v' }, NO);
  ed.libDragTo({ t: 5, row: null }, NO);
  expect(ed.store.get().project).toEqual(before);
  expect(ed.endLibDrag(true)).toBe(false);
  expect([ed.store.get().project, ed.store.get().canUndo]).toEqual([before, false]);
});

test('no library drag while a proposal waits', async () => {
  const L = live();
  const ed = await editor(L.over);
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  await new Promise((r) => setTimeout(r, 0));
  const before = ed.store.get().project!;
  expect(ed.beginLibDrag(scene)).toBe(false);
  ed.libDragTo({ t: 5, row: 'v' }, NO);
  expect(ed.endLibDrag(true)).toBe(false);
  expect(ed.store.get().project).toEqual(before);
});

test('a refused place shows a red plan while dragging and its reason after the release, adding nothing', async () => {
  const ed = await editor();
  const before = ed.store.get().project!;
  ed.beginLibDrag({ kind: 'music', media: 'm' });
  ed.libDragTo({ t: 2, row: 'v' }, NO);
  expect(ed.store.get().libDrag!.plan).toMatchObject({ ok: false, why: t('ed.dropWrongKind') });
  expect(ed.store.get().project).toEqual(before);
  expect(ed.endLibDrag(true)).toBe(false);
  expect([ed.store.get().project, ed.store.get().notice]).toEqual([before, t('ed.dropWrongKind')]);
});

test('a scene block or a one-per-film block already used is refused wherever it goes', async () => {
  const ed = await editor();
  ed.beginLibDrag({ kind: 'overlay', type: 'x.bg' });
  ed.libDragTo({ t: 2, row: 'sc' }, NO);
  expect(ed.store.get().libDrag!.plan).toMatchObject({ ok: false, why: t('ed.sceneAdd') });
  ed.endLibDrag(false);
  ed.seek(1);
  ed.addOverlay('x.one');
  ed.beginLibDrag({ kind: 'overlay', type: 'x.one' });
  ed.libDragTo({ t: 12, row: 'new' }, NO);
  expect(ed.store.get().libDrag!.plan).toMatchObject({ ok: false });
  expect((ed.store.get().libDrag!.plan as any).why).toContain('One');
});

test('a block dropped on the new-track strip makes an overlay track holding it', async () => {
  const ed = await editor();
  const n = ed.store.get().project!.tracks.length;
  ed.beginLibDrag({ kind: 'overlay', type: 'x.title' });
  ed.libDragTo({ t: 3, row: 'new' }, NO);
  expect(ed.endLibDrag(true)).toBe(true);
  const p = ed.store.get().project!, tr = p.tracks.find((x) => x.kind === 'overlay')!;
  expect([p.tracks.length, (tr.items[0] as any).type, (tr.items[0] as any).start]).toEqual([n + 1, 'x.title', 3]);
});

test('files dragged in from the PC: a line where they will go in on the track under it (their lengths are not known yet), cleared after', async () => {
  const ed = await editor();
  // the magnetic track (c1 0–4, c2 4–8): the line is at the cut they will go in at, as for a card
  ed.fileDragTo({ t: 3, row: 'v' }, 'video');
  expect(ed.store.get().libDrag).toEqual({ kind: 'video', len: 0, files: true, line: 4, plan: { ok: true, track: 'v', start: 3, end: 3 } });
  ed.fileDragTo({ t: 1, row: 'v' }, 'video');
  expect(ed.store.get().libDrag!.line).toBe(0);
  ed.fileDragTo({ t: 7, row: 'v' }, 'video');
  expect(ed.store.get().libDrag!.line).toBe(8);
  ed.fileDragTo({ t: 2.5, row: 'mu' }, 'music');
  expect(ed.store.get().libDrag!.line).toBe(2.5);                // any other track: at the pointer
  ed.fileDragTo({ t: 1, row: 'new' }, 'music');
  expect(ed.store.get().libDrag).toMatchObject({ kind: 'music', files: true, plan: { track: null } });
  ed.fileDragTo({ t: 1, row: null }, 'music');
  expect(ed.store.get().libDrag).toMatchObject({ files: true, plan: null });
  ed.fileDragEnd();
  expect(ed.store.get().libDrag).toBeNull();
});

test('a drag that does not change where it would go sends nothing again: no new state, no new project to the player', async () => {
  const { api, bridge } = fakes({ project: async () => magneticFixture() });
  const ed = new Editor('demo', { api, bridge, registryFor: async () => registry as any });
  await ed.open();
  let sets = 0;
  ed.store.subscribe(() => sets++);
  const patches = () => bridge.calls.filter((c: any) => c[0] === 'patch').length;
  ed.beginLibDrag(scene);
  ed.libDragTo({ t: 5, row: 'v' }, NO);
  const [p0, s0, d0] = [patches(), sets, ed.store.get().libDrag];
  ed.libDragTo({ t: 5, row: 'v' }, NO);                 // the same place (a move of a pixel, a dragover of the same spot)
  expect([patches(), sets, ed.store.get().libDrag]).toEqual([p0, s0, d0]);
  ed.libDragTo({ t: 5, row: null }, NO);                // off the timeline: the project as it is, once
  const [p1, s1] = [patches(), sets];
  expect(p1).toBe(p0 + 1);
  for (const t of [1, 2, 3]) ed.libDragTo({ t, row: null }, NO);
  expect([patches(), sets]).toEqual([p1, s1]);
  ed.libDragTo({ t: 5, row: 'v' }, NO);                 // back on: previewed again, and still dropped there
  expect(patches()).toBe(p1 + 1);
  expect(ed.endLibDrag(true)).toBe(true);
  expect(ids(ed, 'v').length).toBe(3);
  // files from the PC: dragover comes many times a second on the same spot
  ed.fileDragTo({ t: 3, row: 'v' }, 'video');
  const s2 = sets, d2 = ed.store.get().libDrag;
  ed.fileDragTo({ t: 3, row: 'v' }, 'video');
  expect([sets, ed.store.get().libDrag]).toEqual([s2, d2]);
  ed.fileDragTo({ t: 1, row: null }, 'video');
  ed.fileDragTo({ t: 2, row: null }, 'video');
  expect(sets).toBe(s2 + 1);
});
