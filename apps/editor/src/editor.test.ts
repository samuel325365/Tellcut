// The Editor (editor.ts) without a page: opening, edits and undo, the transport, keys, the preview, the library, saving.
// Other topics are in editor-*.test.ts (export, audition, timeline, media, proposals, ask, tracks, lang); their shared fakes in editor-test-kit.ts.
import { corePlugin, createRegistry, deleteItems, moveEnvelopePoint, moveItems } from '@tellcut/engine';
import { ApiError } from './api.ts';
import { Editor } from './editor.ts';
import { fakes } from './editor-test-kit.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('open loads the project into the store and the preview', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.store.get().project!.meta.name).toBe('t');
  expect(bridge.calls[0][0]).toBe('load');
});

test('a project that fails validation lands in store.error with the history list', async () => {
  const { api, bridge } = fakes({ project: async () => { throw new ApiError(422, 'Invalid project.json', ['meta.fps: Required']); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.store.get().error).toEqual({ message: 'Invalid project.json', issues: ['meta.fps: Required'] });
  expect(ed.store.get().history).toEqual(['h1.json']);
});

test('apply updates the preview, enables undo and autosaves 1 s later; command errors are ignored', async () => {
  const { api, bridge, saved } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.apply((d) => moveItems(d, { ids: ['c1'], dt: 1 }))).toBe(true);
  expect(bridge.calls.at(-1)[0]).toBe('patch');
  expect(ed.store.get().canUndo).toBe(true);
  expect(ed.store.get().save).toBe('pending');
  await vi.advanceTimersByTimeAsync(1000);
  expect((saved[0] as any).tracks[1].items[0].start).toBe(1);
  expect(ed.apply((d) => moveItems(d, { ids: ['nope'], dt: 1 }))).toBe(false);
  ed.undo();
  expect((ed.store.get().project!.tracks[1].items[0] as any).start).toBe(0);
});

test('transport: seek while paused sends seek, while playing restarts playback there', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(3);
  expect(bridge.calls.at(-1)).toEqual(['seek', 3]);
  ed.togglePlay();
  expect(bridge.calls.at(-1)).toEqual(['play', 3]);
  ed.seek(5);
  expect(bridge.calls.at(-1)).toEqual(['play', 5]);
  ed.step(-25);
  expect(ed.store.get().playhead).toBe(4);
});

test('analyze marks offline sources and loads thumbnails and peaks when their jobs finish, without asking too early (a 409 in the console)', async () => {
  let ready = false, early = 0;
  const { api, bridge } = fakes({
    analyze: async () => ({ jobs: [{ id: 'j1', label: 's' }], missing: ['a'] }),
    waitJob: async () => { ready = true; return 'done'; },
    thumbs: async (_: string, src: string) => { if (!ready) { early++; throw new ApiError(409, 'not yet'); } return { interval: 1, width: 160, height: 90, cols: 10, count: 30, url: `/t/${src}` }; },
    peaks: async () => ({ rate: 100, peaks: [0.5] }),
  });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await vi.runAllTimersAsync();
  await ed.analyze();
  const s = ed.store.get();
  expect(s.offline).toEqual(['a']);
  expect(s.thumbs.s.url).toBe('/t/s');
  expect(s.peaks['source:s'].rate).toBe(100);
  expect(s.peaks['media:m'].rate).toBe(100);
  expect(s.analyzing).toBe(0);
  expect(early).toBe(0);
});

test('a drag previews live without history and commits as one undo step', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.setView({ pps: 50, scroll: 0 });
  ed.beginDrag({ grip: 'body', id: 'c2', mods: { alt: false, ctrl: true, shift: false }, selection: [] });
  ed.dragTo(25, { alt: false, ctrl: true, shift: false });
  expect((ed.store.get().project!.tracks[1].items[1] as any).start).toBe(4.5);
  expect(ed.store.get().canUndo).toBe(false);
  ed.dragTo(-1000, { alt: false, ctrl: true, shift: false });
  ed.endDrag();
  expect((ed.store.get().project!.tracks[1].items[1] as any).start).toBe(0);
  expect(ed.store.get().canUndo).toBe(true);
  ed.undo();
  expect((ed.store.get().project!.tracks[1].items[1] as any).start).toBe(4);
});

test('keyboard actions split at the playhead, delete and ripple-delete the selection', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(2);
  ed.select(['c1']);
  ed.run('split');
  const v = ed.store.get().project!.tracks[1].items.map((i: any) => [i.id, i.start, i.end]);
  expect(v).toEqual([['c1', 0, 2], ['c1-2', 2, 4], ['c2', 4, 8]]);
  expect(ed.store.get().selection).toEqual(['c1-2']);
  ed.run('rippleDelete');
  expect(ed.store.get().project!.tracks[1].items.map((i: any) => [i.id, i.start])).toEqual([['c1', 0], ['c2', 2]]);
  ed.select(['c2']);
  ed.run('delete');
  expect(ed.store.get().project!.tracks[1].items.map((i: any) => i.id)).toEqual(['c1']);
  ed.run('undo'); ed.run('undo');
  expect(ed.store.get().project!.tracks[1].items.length).toBe(3);
});

test('edits that change nothing do not save; vanished ids leave the selection; the preview error clears on the next edit', async () => {
  const { api, bridge, saved } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(19.9);
  ed.run('split');
  await vi.advanceTimersByTimeAsync(2000);
  expect(saved).toEqual([]);
  expect(ed.store.get().save).toBe('saved');
  ed.select(['c2', 'a1']);
  ed.apply((d) => deleteItems(d, { ids: ['a1'] }));
  expect(ed.store.get().selection).toEqual(['c2']);
  bridge.onError('boom');
  expect(ed.store.get().playerError).toBe('boom');
  ed.apply((d) => moveItems(d, { ids: ['c1'], dt: 1 }));
  expect(ed.store.get().playerError).toBe('');
});

test('seeking lands on a frame (spec §4.5)', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(1.01);
  expect(ed.store.get().playhead).toBe(1);
});

test('a key forwarded from the preview runs the same shortcut', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  bridge.onKey({ key: ' ', code: 'Space', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
  expect(bridge.calls.at(-1)[0]).toBe('play');
});

test('Ctrl-stretching still snaps (Ctrl is taken by the stretch)', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.setView({ pps: 50, scroll: 0 });
  ed.beginDrag({ grip: 'end', id: 'c2', mods: { alt: false, ctrl: true, shift: false }, selection: [] });
  ed.dragTo(98.5, { alt: false, ctrl: true, shift: false });   // end 8 → 9.97, m1 ends at 10
  ed.endDrag();
  expect((ed.store.get().project!.tracks[1].items[1] as any).end).toBe(10);
});

test('update applies a validated field edit; a refused one leaves a notice', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.update('c2', { speed: 1 })).toBe(true);
  expect(ed.update('c2', { speed: -1 })).toBe(false);
  expect(ed.store.get().notice).toMatch(/speed/);
  expect(ed.updateParam('blk', 'mode', 'b')).toBe(true);
  expect((ed.store.get().project!.tracks[0].items[0] as any).params).toEqual({ mode: 'b' });
  expect(ed.store.get().notice).toBe('');
});

test('the library adds clips, sound effects and overlays at the playhead', async () => {
  const registry = createRegistry([corePlugin, { id: 'x', sfx: [{ type: 'x.tap', label: '點', params: [{ key: 'n', label: 'n', type: 'number', default: 2 }], duration: (p: any) => p.n * 0.1, synth() {} }] } as any]);
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  ed.seek(12);
  ed.addClip('s', 25, 10);
  const clip = ed.store.get().project!.tracks[1].items.at(-1) as any;
  expect([clip.id, clip.in, clip.start, clip.end]).toEqual(['clip', 25, 12, 17]);
  expect(ed.store.get().selection).toEqual(['clip']);
  ed.addSfx('x.tap');
  const sfx = ed.store.get().project!.tracks.find((t) => t.kind === 'sfx')!.items.at(-1) as any;
  expect([sfx.type, sfx.start, sfx.end]).toEqual(['x.tap', 12, 12.2]);
  ed.addOverlay('core.flash');
  const ov = ed.store.get().project!.tracks.find((t) => t.kind === 'overlay')!;
  expect(ov.items.map((i: any) => [i.type, i.start, i.end])).toEqual([['core.flash', 12, 14]]);
});

test('live edits preview without history; commit records one step; cancel restores', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.livePreview((d) => moveEnvelopePoint(d, { id: 'm1', index: 1, t: 4, db: -3 }));
  ed.livePreview((d) => moveEnvelopePoint(d, { id: 'm1', index: 1, t: 6, db: -9 }));
  expect((ed.store.get().project!.tracks[3].items[0] as any).envelope[1]).toEqual([6, -9]);
  expect(ed.store.get().canUndo).toBe(false);
  ed.commitLive();
  expect(ed.store.get().canUndo).toBe(true);
  ed.livePreview((d) => moveEnvelopePoint(d, { id: 'm1', index: 1, t: 2, db: 0 }));
  ed.cancelLive();
  expect((ed.store.get().project!.tracks[3].items[0] as any).envelope[1]).toEqual([6, -9]);
});

test('preview quality is remembered and re-sent when the player (re)starts', async () => {
  const mem: Record<string, string> = { 'tellcut.quality': 'draft' };
  const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, storage });
  expect(ed.store.get().quality).toBe('draft');
  bridge.onReady(1);
  expect(bridge.calls).toContainEqual(['quality', 'draft']);
  ed.setQuality('full');
  expect([mem['tellcut.quality'], bridge.calls.at(-1)]).toEqual(['full', ['quality', 'full']]);
});

test('the library adds music at the playhead, as long as the track (from its waveform)', async () => {
  const { api, bridge } = fakes({ musicPeaks: async () => ({ rate: 100, peaks: new Array(400).fill(0.1) }) });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await ed.analyze();
  ed.seek(12);
  ed.addMusic('m');
  const mu = ed.store.get().project!.tracks.find((t) => t.kind === 'music')!.items.at(-1) as any;
  expect([mu.media, mu.in, mu.start, mu.end]).toEqual(['m', 0, 12, 16]);
});

test('items added from the library stop at the project end; at the very end nothing is added and the reason is shown', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(18);
  ed.addClip('s', 0, 10);
  expect((ed.store.get().project!.tracks[1].items.at(-1) as any).end).toBe(20);
  ed.seek(20);
  expect(ed.addOverlay('core.flash')).toBe(false);
  expect(ed.store.get().notice).toBe('播放頭在專案結尾，無法加入');
});

test('a block of My blocks at the very end is refused before anything is copied into the project', async () => {
  const used: unknown[] = [];
  const { api, bridge } = fakes({ useLibrary: async (_: string, b: unknown) => { used.push(b); return { file: 'fx/lib/box/_entry.js' }; },
    projectLibrary: async () => ({ links: [], savedFiles: [], savedStyles: [], styles: [] }) });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(20);
  expect(await ed.useLibraryBlock('box', 'fx.box')).toBe(false);
  expect(used).toEqual([]);
  expect(ed.store.get().notice).toBe('播放頭在專案結尾，無法加入');
});

test('the refusal notice clears when the selection changes or the field gets back a valid value', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.update('c2', { speed: -1 });
  ed.select(['c1']);
  expect(ed.store.get().notice).toBe('');
  ed.update('c1', { speed: -1 });
  ed.update('c1', { speed: 1 });          // same as before: nothing changes, but the value is fine
  expect(ed.store.get().notice).toBe('');
});

test('a unique overlay type cannot be added twice', async () => {
  const registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.end', label: '片尾', kind: 'overlay', unique: true, params: [], build: () => null, draw: () => {} }] } as any]);
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  expect(ed.addOverlay('x.end')).toBe(true);
  expect(ed.addOverlay('x.end')).toBe(false);
  expect(ed.store.get().notice).toBe('「片尾」在專案裡只能有一個');
});

test('replaceBlock swaps the type in place, keeps the shared parameters and refuses another kind', async () => {
  const block = (type: string, kind: string, keys: string[]) => ({ type, label: type, kind, params: keys.map((key) => ({ key, label: key, type: 'string', default: '' })), build: () => null, draw: () => {} });
  const registry = createRegistry([corePlugin, { id: 'x', items: [block('x.a', 'overlay', ['text', 'color']), block('x.b', 'overlay', ['text', 'size']), block('x.bg', 'scene', [])] } as any]);
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  ed.seek(2);
  expect(ed.addOverlay('x.a')).toBe(true);
  const id = ed.store.get().selection[0];
  ed.updateParam(id, 'text', 'Hi'); ed.updateParam(id, 'color', '#f00');
  expect(ed.replaceBlock(id, 'x.b')).toBe(true);
  const it: any = ed.store.get().project!.tracks.flatMap((t) => t.items as any[]).find((x: any) => x.id === id);
  expect([it.type, it.start, it.end, it.params]).toEqual(['x.b', 2, 4, { text: 'Hi' }]);
  expect(ed.replaceBlock(id, 'x.bg')).toBe(false);
  expect(ed.store.get().notice).toBe('只能換成同一類：畫面上的特效換特效、背景或框換背景或框、音效換音效');
});

test('setTransform moves an overlay and is one undo step', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.setTransform('blk', { x: 0.1, y: 0, scale: 1.2, ox: 0.5, oy: 0.5 })).toBe(true);
  expect((ed.store.get().project!.tracks[0].items[0] as any).transform.scale).toBe(1.2);
  ed.undo();
  expect('transform' in (ed.store.get().project!.tracks[0].items[0] as any)).toBe(false);
});

test('the preview picks, moves and retitles items; the selection goes back to it', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  bridge.onPick('blk');
  expect([ed.store.get().selection, bridge.calls.at(-1)]).toEqual([['blk'], ['select', 'blk']]);
  const tf = { x: 0.2, y: 0, scale: 1, ox: 0.5, oy: 0.5 };
  bridge.onTransformChange({ itemId: 'blk', transform: tf, final: false });
  expect([(ed.store.get().project!.tracks[0].items[0] as any).transform.x, ed.store.get().canUndo]).toEqual([0.2, false]);
  bridge.onTransformChange({ itemId: 'blk', transform: { ...tf, x: 0.3 }, final: true });
  expect([(ed.store.get().project!.tracks[0].items[0] as any).transform.x, ed.store.get().canUndo]).toEqual([0.3, true]);
  bridge.onParamEdit({ itemId: 'blk', key: 'title', value: '新標題' });
  expect((ed.store.get().project!.tracks[0].items[0] as any).params.title).toBe('新標題');
  bridge.onPick(null);
  expect(ed.store.get().selection).toEqual([]);
});

test('a preview drag once released leaves nothing to commit again (an undone drag stays undone)', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const tf = { x: 0.2, y: 0, scale: 1, ox: 0.5, oy: 0.5 };
  bridge.onTransformChange({ itemId: 'blk', transform: tf, final: false });
  bridge.onTransformChange({ itemId: 'blk', transform: { ...tf, x: 0.3 }, final: true });
  ed.undo();
  // a click on a transition's edge (or an envelope release) commits whatever drag is live: it brought the drag back
  ed.commitLive();
  expect(['transform' in (ed.store.get().project!.tracks[0].items[0] as any), ed.store.get().canRedo]).toEqual([false, true]);
});

test('plugin params outside their definition are refused with the allowed range', async () => {
  const registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.block', label: '區塊', kind: 'scene', build: () => null, draw: () => {},
    params: [{ key: 'n', label: '數量', type: 'number', min: 0, max: 10, default: 1 }, { key: 'mode', label: '模式', type: 'enum', options: ['a', 'b'], default: 'a' }] }] } as any]);
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  expect(ed.updateParam('blk', 'n', 11)).toBe(false);
  expect(ed.store.get().notice).toBe('「數量」須介於 0～10');
  expect(ed.updateParam('blk', 'mode', 'z')).toBe(false);
  expect(ed.store.get().notice).toBe('「模式」只能是：a、b');
  expect(ed.updateParam('blk', 'n', 3)).toBe(true);
});

test('clearing a number param puts its default back instead of refusing it', async () => {
  const registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.block', label: '區塊', kind: 'scene', build: () => null, draw: () => {},
    params: [{ key: 'n', label: '數量', type: 'number', min: 0, max: 10, default: 1 }] }] } as any]);
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  ed.updateParam('blk', 'n', 3);
  expect(ed.updateParam('blk', 'n', undefined)).toBe(true);
  expect('n' in (ed.store.get().project!.tracks[0].items[0] as any).params).toBe(false);
  expect(ed.store.get().notice).toBe('');
});

test('when an edit removes the selected item, the preview is told the selection is gone', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']);
  ed.apply((d) => deleteItems(d, { ids: ['c1'] }));
  expect(bridge.calls.filter((c: any[]) => c[0] === 'select').at(-1)).toEqual(['select', null]);
});

test('adding from the library keeps the library tab in front; a selection made elsewhere shows the properties', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(2);
  ed.addOverlay('core.flash');
  expect(ed.store.get().layout.sideTab).toBe('library');
  ed.select(['c1']);
  expect(ed.store.get().layout.sideTab).toBe('props');
});

test('jumpCut and stepFrames move the playhead by cuts and by frames', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(4);
  ed.jumpCut(1);
  expect(ed.store.get().playhead).toBe(5);
  ed.jumpCut(-1);
  expect(ed.store.get().playhead).toBe(4);
  ed.stepFrames(10);
  expect(ed.store.get().playhead).toBeCloseTo(4.4);             // 25 fps
});

test('a restarted preview (the Layout button moves it) is not ready until it says so, and goes on playing if Play was pressed meanwhile', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  bridge.onReady(1);
  bridge.onBoot();                                              // the iframe reloaded
  expect(ed.store.get().playerReady).toBe(false);
  ed.seek(0.5);
  ed.play();                                                    // the new player is not ready: the bridge drops this
  bridge.calls.length = 0;
  bridge.onReady(1);
  expect(ed.store.get().playerReady).toBe(true);
  const plays = bridge.calls.filter((c: any[]) => c[0] === 'play');
  expect(plays.length).toBe(1);
  expect(plays[0][1]).toBeCloseTo(0.5, 1);                     // from the playhead (the editor's clock may have moved it on a hair)
});
