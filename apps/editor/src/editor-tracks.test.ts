// The Editor: track settings, magnetic tracks, copy and paste, muting items, locked tracks.
import { findItem, moveItems, resolveTimes } from '@tellcut/engine';
import { t } from './i18n/index.ts';
import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { Editor } from './editor.ts';
import { fakes, magneticFixture, ids } from './editor-test-kit.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('setTrack changes the bus and refuses solo on a video track', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.setTrack('mu', { solo: true })).toBe(true);
  expect((ed.store.get().project!.tracks[3] as any).solo).toBe(true);
  expect(ed.setTrack('v', { solo: true })).toBe(false);
});

test('turning magnetic on asks before closing gaps; cancelling leaves the track alone', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));                 // a 1 s gap before c2
  const asked: string[] = [];
  expect(ed.toggleMagnetic('v', (m) => { asked.push(m); return false; })).toBe(false);
  expect(asked[0]).toMatch(/1 個空隙.*1(\.0+)? 秒/);
  expect((ed.store.get().project!.tracks[1] as any).magnetic).toBeUndefined();
  expect(ed.toggleMagnetic('v', () => true)).toBe(true);
  expect((ed.store.get().project!.tracks[1].items[1] as any).start).toBe(4);
});

test('on a magnetic track a shot can be added at the end of the film', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.toggleMagnetic('v', () => true)).toBe(true);
  ed.select(['c2']);
  ed.seek(ed.store.get().project!.meta.duration);
  expect(ed.addClip('s', 0, 2)).toBe(true);
  const v = ed.store.get().project!.tracks[1].items as any[];
  expect(v).toHaveLength(3);
});

test('deleteSide("left") on a magnetic clip: one undo step, the gap closes, the playhead lands on the new start', async () => {
  const { api, bridge } = fakes({ project: async () => magneticFixture() });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(5);                                                   // inside c2 (4–8)
  expect(ed.deleteSide('left')).toBe(true);
  const c2 = () => ed.store.get().project!.tracks.find((t) => t.id === 'v')!.items.find((i: any) => i.id === 'c2') as any;
  expect([c2().start, c2().end]).toEqual([4, 7]);               // its head is gone, the clip slid back to close the gap
  expect(ed.store.get().playhead).toBe(4);                      // the frame that was showing
  ed.undo();
  expect([c2().start, c2().end]).toEqual([4, 8]);
  ed.seek(5);
  expect(ed.deleteSide('right')).toBe(true);
  expect([c2().start, c2().end]).toEqual([4, 5]);
});

test('deleteSide with nothing to cut sets the "select a clip" notice and changes nothing', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const before = ed.store.get().project;
  ed.seek(15);
  expect(ed.deleteSide('left')).toBe(false);
  expect(ed.store.get().notice).toBe(t('ed.selectClip'));
  expect(ed.store.get().project).toBe(before);
});

test('copy / paste / duplicate: paste selects the new items; a clip from another project is refused with a notice', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.copy()).toBe(false);                                // nothing selected
  expect(ed.store.get().notice).toBe(t('ed.nothingToCopy'));
  ed.select(['blk']);
  expect(ed.copy()).toBe(true);
  ed.seek(10);
  expect(ed.paste()).toBe(true);
  expect(ed.store.get().selection).toEqual(['blk-2']);
  expect((findItem(ed.store.get().project!, 'blk-2').item as any).start).toBe(10);
  ed.select(['blk']);
  expect(ed.duplicate()).toBe(true);
  expect((findItem(ed.store.get().project!, ed.store.get().selection[0]).item as any).start).toBe(6);   // right after blk (2–6)
  const other = new Editor('other', { api, bridge });
  await other.open();
  other.store.set({ clipboard: ed.store.get().clipboard });
  expect(other.paste()).toBe(false);
  expect(other.store.get().notice).toBe(t('ed.pasteOtherProject'));
});

test('toggleItemMute: music, a video clip (its own sound) and a sound effect', async () => {
  const { api, bridge } = fakes({ project: async () => { const p: any = fixture(); p.tracks.find((x: any) => x.id === 'au').items.push({ id: 'o1', source: 's', in: 1, rate: 1, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' }); return p; } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const muted = (id: string) => !!(findItem(ed.store.get().project!, id).item as any).muted;
  ed.select(['m1']); ed.toggleItemMute();
  expect(muted('m1')).toBe(true);
  ed.toggleItemMute();
  expect(muted('m1')).toBe(false);
  ed.select(['c1']); ed.toggleItemMute();
  expect(muted('o1')).toBe(true);
  ed.select(['tap']); ed.toggleItemMute();
  expect(muted('tap')).toBe(true);
});

test('a locked track: its items cannot be selected (click, marquee, Ctrl+A), split, cut with Q/W or pasted onto', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']); ed.copy();
  ed.toggleLock('v');
  expect(ed.store.get().selection).toEqual([]);                     // locking let go of the selected clip
  ed.select(['c1', 'blk']);
  expect(ed.store.get().selection).toEqual(['blk']);
  ed.selectAll();
  expect(ed.store.get().selection.some((id) => id === 'c1' || id === 'c2')).toBe(false);
  ed.select([]); ed.seek(2); ed.run('split');
  expect(ids(ed, 'v')).toEqual(['c1', 'c2']);                       // the locked clip was not cut
  expect(ids(ed, 'au').length).toBe(2);                             // a1 (1–3) was
  expect(ed.deleteSide('left')).toBe(false);                        // nothing unlocked to cut under the playhead
  ed.seek(10);
  expect(ed.paste()).toBe(true);
  expect(ids(ed, 'v')).toEqual(['c1', 'c2']);
  expect(ids(ed, 'v2')).toEqual(['c1-2']);                          // onto the other video track instead
});

test('a locked track: a preview pick does not select it; a transform or text edit from the preview is not applied and shows the notice', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.toggleLock('sc');
  bridge.onPick('blk');
  expect(ed.store.get().selection).toEqual([]);
  const before = ed.store.get().project;
  bridge.onTransformChange({ itemId: 'blk', transform: { x: 0.2, y: 0, scale: 1 }, final: true });
  expect(ed.store.get().project).toBe(before);
  expect(ed.store.get().notice).toBe(t('ed.lockedNotice'));
  ed.store.set({ notice: '' });
  bridge.onParamEdit({ itemId: 'blk', key: 'text', value: 'x' });
  expect(ed.store.get().project).toBe(before);
  expect(ed.store.get().notice).toBe(t('ed.lockedNotice'));
});

test('a magnetic ripple still moves children hung on a locked track; an Agent-style edit still changes a locked item', async () => {
  const { api, bridge } = fakes({ project: async () => { const p: any = magneticFixture(); p.tracks.push({ id: 'o', kind: 'overlay', items: [{ id: 'cap', type: 'x.cap', start: 0, end: 1, params: {}, parent: 'c2' }] }); return p; } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.toggleLock('o');
  ed.select(['c1']); ed.run('rippleDelete');
  const p = ed.store.get().project!;
  expect([(findItem(p, 'cap').item as any).parent, resolveTimes(p).get('cap')!.start]).toEqual(['c2', 0]);
  expect(ed.apply((d) => { (findItem(d, 'cap').item as any).end = 0.5; })).toBe(true);   // what a proposal does: not blocked
});

test('locks are remembered per project and dropped when the track is deleted', async () => {
  const mem: Record<string, string> = {};
  const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, storage });
  await ed.open();
  ed.toggleLock('v2');
  const again = new Editor('demo', { api, bridge, storage });
  await again.open();
  expect(again.store.get().locked).toEqual(['v2']);
  again.removeTrack('v2');
  expect(again.store.get().locked).toEqual([]);
  expect(JSON.parse(mem['tellcut.locked.demo'])).toEqual([]);
});

test('a library add passes over locked tracks (onto another of the kind, else a new one)', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.toggleLock('v');
  ed.seek(10);
  expect(ed.addClip('s', 0, 2)).toBe(true);
  expect(ids(ed, 'v')).toEqual(['c1', 'c2']);
  expect(ids(ed, 'v2').length).toBe(1);
  expect(ed.store.get().selection).toEqual(ids(ed, 'v2'));            // and the new clip is selected
});

test('M with nothing that can be muted says so', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['blk']);
  expect(ed.toggleItemMute()).toBe(false);
  expect(ed.store.get().notice).toBe(t('ed.nothingToMute'));
});
