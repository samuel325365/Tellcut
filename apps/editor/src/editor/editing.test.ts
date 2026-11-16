// The timeline edits in editing.ts that the editor-level tests do not reach.
import { corePlugin, createRegistry } from '@tellcut/engine';
import { Editor } from '../editor.ts';
import { fakes, ids } from '../editor-test-kit.ts';

test('paste of a one-per-film block already in the project leaves out what hangs on it too, and says why', async () => {
  // the fixture's blk (x.block, 2–6) has two sounds hung on it
  const registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.block', label: '片尾', kind: 'scene', unique: true, params: [], build: () => null, draw: () => {} }] } as any]);
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  ed.select(['blk']); ed.copy();
  ed.seek(8);
  expect(ed.paste()).toBe(false);
  expect(ids(ed, 'fx')).toEqual(['tap', 'tap2']);                       // no copy of its sounds on the original block
  expect(ed.store.get().notice).toBe('「片尾」在專案裡只能有一個');
});

// a combo (engine combos.ts) of two pictures, a sound and the shake, over blocks of this test's own
const comboEditor = async () => {
  const block = (type: string) => ({ type, label: type, kind: 'overlay', params: [{ key: 'n', label: 'n', type: 'number', default: 1 }], build: () => null, draw: () => {} });
  const registry = createRegistry([corePlugin, { id: 'x', items: [block('x.lines'), block('x.flash')],
    sfx: [{ type: 'x.hit', label: 'hit', params: [], duration: () => 1, synth: () => {} }] } as any]);
  const combos = [{ id: 'boom', label: '砰', doc: 'a hit', parts: [
    { name: 'lines', kind: 'effect' as const, type: 'x.lines', params: { n: 3 }, at: 0, len: 0.8 },
    { name: 'flash', kind: 'effect' as const, type: 'x.flash', at: 0, len: 0.5, layer: 'top' as const },
    { name: 'hit', kind: 'sfx' as const, type: 'x.hit', at: 0, len: 1.4, gain: -6 },
    { name: 'shake', kind: 'shake' as const, at: 0, len: 0.4, px: 28 },
  ] }];
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry, combos });
  await ed.open();
  return ed;
};
const all = (ed: Editor) => ed.store.get().project!.tracks.flatMap((t) => (t.items as any[]).map((i) => ({ ...i, track: t })));

test('a combo at the playhead: its layers as items on the tracks Cut uses, hung on the clip there with its shake; one undo takes it all back', async () => {
  const ed = await comboEditor(), before = ed.store.get().project!;
  ed.seek(5);   // inside c2 (4–8)
  expect(ed.insertCombo('boom')).toBe(true);
  const sel = ed.store.get().selection, made = all(ed).filter((i) => sel.includes(i.id));
  expect(made.map((i) => [i.type, i.track.kind, i.start, i.parent])).toEqual([['x.lines', 'overlay', 1, 'c2'], ['x.flash', 'overlay', 1, 'c2'], ['x.hit', 'sfx', 1, 'c2']]);
  expect(made[0].params).toEqual({ n: 3 });
  expect(made[1].track.id).not.toBe(made[0].track.id);   // the top layer over the captions' track
  expect(made[2]).toMatchObject({ end: 2.4, gain: -6 });
  expect(all(ed).find((i) => i.id === 'c2').shake).toEqual([{ at: 1, dur: 0.4, px: 28, hz: 18 }]);
  expect(ed.store.get().notice).toBe('');
  ed.undo();
  expect(ed.store.get().project).toEqual(before);   // items, new tracks and the shake: one step
});

test('a combo where no clip plays: the shake is left out and the notice says so; the items stay on nothing', async () => {
  const ed = await comboEditor();
  ed.seek(10);   // the main track ends at 8
  expect(ed.insertCombo('boom')).toBe(true);
  const made = all(ed).filter((i) => ed.store.get().selection.includes(i.id));
  expect(made.map((i) => [i.type, i.start, i.parent])).toEqual([['x.lines', 10, undefined], ['x.flash', 10, undefined], ['x.hit', 10, undefined]]);
  expect(all(ed).some((i) => i.shake)).toBe(false);
  expect(ed.store.get().notice).toBe('播放頭下沒有主軌片段：鏡頭晃動那一層沒有放（晃動是片段本身的效果）');
  expect(ed.insertCombo('nope')).toBe(false);
});
