import { corePlugin, createRegistry, deleteItems, findItem, moveEnvelopePoint, moveItems, resolveTimes } from '@tellcut/engine';
import { t } from './i18n/index.ts';
import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { ApiError } from './api.ts';
import { Editor } from './editor.ts';
import { setLang } from './i18n/lang.ts';
import { PARAMS_EN } from './i18n/params.ts';
import { BLOCKS_EN } from './i18n/blocks.ts';

function fakes(over: Record<string, any> = {}) {
  const saved: unknown[] = [], bridge: any = { calls: [] as any[] };
  for (const k of ['load', 'patch', 'seek', 'play', 'pause', 'cropMode', 'quality', 'select']) bridge[k] = (...a: any[]) => bridge.calls.push([k, ...a]);
  const api: any = { project: async () => fixture(), save: async (_: string, p: unknown) => { saved.push(p); }, history: async () => ['h1.json'],
    analyze: async () => ({ jobs: [], missing: [] }), thumbs: async () => { throw new ApiError(409, 'x'); }, peaks: async () => { throw new ApiError(409, 'x'); },
    musicPeaks: async () => ({ rate: 100, peaks: [] }), cuts: async () => [], waitJob: async () => 'done',
    exportStart: async () => ({ id: 'e1', label: 'x', status: 'queued', progress: 0, message: '', log: [] }), job: async () => ({ id: 'e1', label: 'x', status: 'done', progress: 1, message: '', log: [] }),
    jobs: async () => [], cancelJob: async () => ({ ok: true }), exports: async () => [],
    beats: async () => { throw new ApiError(409, 'x'); }, transcript: async () => { throw new ApiError(409, 'x'); }, ...over };
  return { api, bridge, saved };
}

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

test('crop mode: live drags preview without history, the release is one undo step; leaving and losing the clip exit', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']);
  ed.enterCrop('to');
  expect(bridge.calls.at(-1)).toEqual(['cropMode', { itemId: 'c1', which: 'to' }]);
  bridge.onCropChange({ itemId: 'c1', which: 'to', crop: { x: 0.6, y: 0.5, zoom: 2 }, final: false });
  expect((ed.store.get().project!.tracks[1].items[0] as any).crop.to.x).toBe(0.6);
  expect(ed.store.get().canUndo).toBe(false);
  bridge.onCropChange({ itemId: 'c1', which: 'to', crop: { x: 0.7, y: 0.5, zoom: 2 }, final: true });
  expect(ed.store.get().canUndo).toBe(true);
  ed.run('exitCrop');
  expect([ed.store.get().crop, bridge.calls.at(-1)]).toEqual([null, ['cropMode', null]]);
  ed.enterCrop('from');
  ed.run('delete');
  expect(ed.store.get().crop).toBeNull();
  ed.select(['m1']);
  ed.enterCrop('from');
  expect(ed.store.get().crop).toBeNull();
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

test('setTrack changes the bus and refuses solo on a video track', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.setTrack('mu', { solo: true })).toBe(true);
  expect((ed.store.get().project!.tracks[3] as any).solo).toBe(true);
  expect(ed.setTrack('v', { solo: true })).toBe(false);
});

test('export saves pending edits first, follows the job to the end and refreshes the history', async () => {
  const order: string[] = [];
  const states: any[] = [{ status: 'running', progress: 0.5, message: 'frame 5/10' }, { status: 'done', progress: 1, result: { file: 'exports/a.mp4', log: 'exports/a.log', seconds: 3 } }];
  const { api, bridge } = fakes({
    save: async () => { order.push('save'); },
    exportStart: async () => { order.push('export'); return { id: 'e1', label: 'x', status: 'queued', progress: 0, message: '', log: [] }; },
    job: async () => ({ id: 'e1', label: 'x', message: '', log: [], ...states.shift() }),
    exports: async () => [{ file: 'exports/a.mp4', url: '/x', size: 1, mtime: 1, log: null }],
  });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['c1'], dt: 1 }));   // not saved yet (1 s debounce)
  const done = ed.exportVideo();
  await vi.advanceTimersByTimeAsync(0);
  expect(order).toEqual(['save', 'export']);
  expect(ed.store.get().exportOpen).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  await done;
  expect(ed.store.get().exportJob!.status).toBe('done');
  expect(ed.store.get().exports.length).toBe(1);
});

test('a refused export (one already running) and a failed save show why, and nothing is started', async () => {
  const { api, bridge } = fakes({ exportStart: async () => { throw new ApiError(409, 'An export is already queued or running'); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await ed.exportVideo();
  expect([ed.store.get().exportJob, ed.store.get().exportError]).toEqual([null, '無法開始輸出：An export is already queued or running']);
  const started: string[] = [];
  const f = fakes({ save: async () => { throw new Error('disk full'); }, exportStart: async () => { started.push('x'); return {} as any; } });
  const ed2 = new Editor('demo', { api: f.api, bridge: f.bridge });
  await ed2.open();
  ed2.apply((d) => moveItems(d, { ids: ['c1'], dt: 1 }));
  await ed2.exportVideo();
  expect(started).toEqual([]);
  expect(ed2.store.get().exportError).toMatch(/^存檔失敗，無法輸出/);
});

test('reopening the editor picks up an export that is still running', async () => {
  const { api, bridge } = fakes({
    jobs: async () => [{ id: 'e7', kind: 'export', project: 'demo', label: 'x', status: 'running', progress: 0.3, message: 'frame 3/10', log: [] }],
    job: async () => ({ id: 'e7', label: 'x', status: 'running', progress: 0.4, message: 'frame 4/10', log: [] }),
  });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await vi.advanceTimersByTimeAsync(0);
  expect(ed.store.get().exportJob!.id).toBe('e7');
  await vi.advanceTimersByTimeAsync(1000);
  expect(ed.store.get().exportJob!.progress).toBe(0.4);
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

test('crop mode survives a player restart; playing leaves crop mode first', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']);
  ed.enterCrop('from');
  bridge.calls.length = 0;
  bridge.onReady(1);
  expect(bridge.calls).toContainEqual(['cropMode', { itemId: 'c1', which: 'from' }]);
  ed.play();
  expect(ed.store.get().crop).toBeNull();
  const i = bridge.calls.findIndex((c: any[]) => c[0] === 'cropMode' && c[1] === null);
  expect(i).toBeGreaterThan(-1);
  expect(i).toBeLessThan(bridge.calls.findIndex((c: any[]) => c[0] === 'play'));
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

// showcase films (spec 2026-10-30 part 2): no Chinese words in a block added from the English or Japanese UI
test('a block added or swapped in the English UI starts with its words in English; in Chinese it keeps its own defaults', async () => {
  const block = (type: string, keys: string[]) => ({ type, label: type, kind: 'overlay', params: keys.map((key) => ({ key, label: key, type: 'string', default: '' })), build: () => null, draw: () => {} });
  const registry = createRegistry([corePlugin, { id: 'x', items: [block('x.a', ['color'])] } as any]);
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  const added = () => ed.store.get().project!.tracks.flatMap((t) => t.items as any[]).find((x: any) => x.id === ed.store.get().selection[0]);
  try {
    setLang('en');
    ed.seek(1); ed.addOverlay('core.title');
    expect(added().params).toEqual({ text: 'Title' });
    ed.seek(4); ed.addOverlay('x.a');
    const id = ed.store.get().selection[0];
    ed.updateParam(id, 'color', '#f00');
    ed.replaceBlock(id, 'core.lowerThird');
    expect(added().params).toEqual({ text: 'Place', color: '#f00' });   // the colour both have stays
    setLang('zh');
    ed.seek(7); ed.addOverlay('core.title');
    expect(added().params).toEqual({});
  } finally { setLang('zh'); }
});

test('pressing export twice while it is starting starts one export and shows no error', async () => {
  let starts = 0;
  const { api, bridge } = fakes({
    exportStart: async () => { if (++starts > 1) throw new ApiError(409, 'An export is already queued or running'); return { id: 'e1', label: 'x', status: 'queued', progress: 0, message: '', log: [] }; },
    job: async () => ({ id: 'e1', label: 'x', status: 'running', progress: 0.2, message: '', log: [] }),
  });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  void ed.exportVideo();
  void ed.exportVideo();
  await vi.advanceTimersByTimeAsync(0);
  expect(starts).toBe(1);
  expect(ed.store.get().exportError).toBe('');
  expect(ed.store.get().exportJob!.id).toBe('e1');
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

test('a new export clears the last result; a job lost mid-way says so', async () => {
  const f = fakes({ save: async () => { throw new Error('disk full'); } });
  const ed = new Editor('demo', { api: f.api, bridge: f.bridge });
  await ed.open();
  ed.store.set({ exportJob: { id: 'old', label: 'x', status: 'done', progress: 1, message: '', log: [], result: { file: 'exports/a.mp4', log: 'exports/a.log', seconds: 1 } } });
  ed.apply((d) => moveItems(d, { ids: ['c1'], dt: 1 }));
  await ed.exportVideo();
  expect(ed.store.get().exportJob).toBeNull();
  const g = fakes({ job: async () => { throw new ApiError(404, 'No job "e1"'); } });
  const ed2 = new Editor('demo', { api: g.api, bridge: g.bridge });
  await ed2.open();
  const done = ed2.exportVideo();
  await vi.advanceTimersByTimeAsync(1000);
  await done;
  expect(ed2.store.get().exportError).toBe('輸出中斷：伺服器找不到這個工作（可能已重新啟動）');
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

test('the layout is remembered per browser; F toggles the large preview; selecting shows the properties tab', async () => {
  const mem: Record<string, string> = { 'tellcut.layout': JSON.stringify({ split: 0.7, trackSize: 'standard', maxPreview: true, sideTab: 'props', sideW: 380 }) };
  const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, storage });
  expect(ed.store.get().layout).toMatchObject({ split: { landscape: 0.7, portrait: null }, trackSize: 'standard', maxPreview: false, sideTab: 'library', sideW: 380 });   // not the transient bits; the panel width is kept
  ed.setLayout({ libClosed: true });
  expect(JSON.parse(mem['tellcut.layout'])).toEqual({ split: { landscape: 0.7, portrait: null }, previewW: { landscape: null, portrait: null }, libClosed: true, propsClosed: false, trackSize: 'standard', snap: true, sideW: 380, arrange: { landscape: 'auto', portrait: 'auto' } });
  ed.run('maxPreview');
  expect(ed.store.get().layout.maxPreview).toBe(true);
  await ed.open();
  ed.select(['c1']);
  expect(ed.store.get().layout.sideTab).toBe('props');
});

test('the timeline zoom first fits the whole project into the timeline as it is laid out (narrower in portrait)', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(1000);                     // fixture: 20 s
  expect([ed.store.get().pps, ed.store.get().scroll]).toEqual([50, 0]);
  ed.setView({ pps: 120 });
  ed.fitTimeline(600);                      // later resizes keep the user's zoom
  expect(ed.store.get().pps).toBe(120);
  await ed.open();
  ed.fitTimeline(600);
  expect(ed.store.get().pps).toBe(30);
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

test('a long project is not squeezed into the timeline: at least 20 px per second, and scrolling stops at the end', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(200);                      // 20 s would need 10 px/s
  expect(ed.store.get().pps).toBe(20);
  ed.setView({ scroll: 999 });
  expect(ed.store.get().scroll).toBe(11);   // 20 s − 200 px / 20 px/s + 1 s of air
});

test('while playing, the timeline turns the page when the playhead runs out of view', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(200);                      // 20 px/s: 10 s in view
  bridge.onTime(10.5);                      // not playing: the view stays
  expect(ed.store.get().scroll).toBe(0);
  ed.seek(9);
  ed.play();
  bridge.onTime(9);
  expect(ed.store.get().scroll).toBe(0);
  bridge.onTime(10.5);
  expect(ed.store.get().scroll).toBe(10.5);  // the playhead goes to the left edge
  ed.setView({ scroll: 0 });
  ed.pause(); ed.seek(15);
  ed.play();                                // play brings an off-screen playhead into view
  bridge.onTime(15);                        // further than the furthest scroll (11): the view stops at the end
  expect(ed.store.get().scroll).toBe(11);
});

const tracksOf = (p: any, kind: string) => p.tracks.filter((t: any) => t.kind === kind);
/** what the preview plays: an audition goes to the player only, the timeline keeps showing the real project */
const shown = (bridge: any): any => bridge.calls.filter((c: any) => c[0] === 'patch').at(-1)[1];

test('auditioning a video segment plays only that segment, with its own sound, at the playhead; the timeline keeps the real project; it ends by itself', async () => {
  const { api, bridge, saved } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const real = ed.store.get().project;
  ed.seek(5);
  bridge.calls.length = 0;
  expect(ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 })).toBe(true);
  const p = shown(bridge);
  expect(p.tracks.filter((t: any) => !t.muted).map((t: any) => [t.kind, t.items.map((i: any) => [i.source, i.in, i.start, i.end])]))
    .toEqual([['video', [['s', 1, 5, 7]]], ['audio', [['s', 1, 5, 7]]]]);
  expect(ed.store.get().project).toBe(real);                // no extra rows, no muted tracks on the timeline
  expect(ed.store.get().audition!.label).toContain('s');
  expect(bridge.calls.filter((c: any) => c[0] === 'play')).toEqual([['play', 5]]);
  bridge.onTime(4);                        // a late report of another position: ignored
  bridge.onTime(5); bridge.onTime(6.5);
  expect(ed.store.get().audition).not.toBe(null);
  bridge.onTime(7.02);
  expect(ed.store.get().audition).toBe(null);
  expect(shown(bridge)).toBe(real);
  expect([ed.store.get().playhead, ed.store.get().playing]).toEqual([5, false]);
  await vi.advanceTimersByTimeAsync(2000);
  expect([saved.length, ed.store.get().canUndo]).toEqual([0, false]);   // nothing saved, nothing to undo
});

test('auditioning music plays it alone from its start, at the playhead; the end of the project ends it', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(4);
  ed.audition({ kind: 'music', media: 'm' });
  const p = shown(bridge);
  expect(p.tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.media, i.in, i.start]))).toEqual([[['m', 0, 4]]]);
  expect(bridge.calls.filter((c: any) => c[0] === 'play').at(-1)).toEqual(['play', 4]);
  bridge.onEnded();
  expect([ed.store.get().audition, ed.store.get().playhead]).toEqual([null, 4]);
});

test('an effect or a sound effect is auditioned alone at the playhead (earlier if it would run past the end)', async () => {
  const { api, bridge } = fakes();
  const registry = createRegistry([corePlugin, { id: 'x', sfx: [{ type: 'x.tap', label: '點', params: [], duration: () => 0.3, synth() {} }] } as any]);
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  ed.seek(6);
  ed.audition({ kind: 'overlay', type: 'core.flash' });
  let p = shown(bridge);
  expect(p.tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.type, i.start, i.end]))).toEqual([[['core.flash', 6, 8]]]);
  ed.audition({ kind: 'sfx', type: 'x.tap' });           // a new audition replaces the running one
  p = shown(bridge);
  expect(p.tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.type, i.start, i.end]))).toEqual([[['x.tap', 6, 6.3]]]);
  ed.endAudition();
  expect(ed.store.get().playhead).toBe(6);                 // back where the first audition started
  ed.seek(19.5);
  ed.audition({ kind: 'overlay', type: 'core.flash' });
  expect(shown(bridge).tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.start, i.end]))).toEqual([[[18, 20]]]);
});

test('a type that may exist only once can still be auditioned (the one in the project is hidden meanwhile)', async () => {
  const registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.end', label: '片尾', kind: 'overlay', unique: true, params: [], build: () => null, draw: () => {} }] } as any]);
  const { api, bridge } = fakes({ project: async () => { const p: any = fixture(); p.tracks.push({ id: 'ov', kind: 'overlay', items: [{ id: 'e1', type: 'x.end', start: 0, end: 1, params: {} }] }); return p; } });
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  expect(ed.audition({ kind: 'overlay', type: 'x.end' })).toBe(true);
});

test('double-clicking a timeline item auditions its raw material alone, where the item is; there is nothing to add', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(15);
  expect(ed.auditionItem('c2')).toBe(true);              // 4–8 s at speed 2 from 10 s of source s
  const p = shown(bridge);
  expect(p.tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.source, i.in, i.start, i.end, i.speed ?? i.rate])))
    .toEqual([[['s', 10, 4, 10, 1]], [['s', 10, 4, 10, 1]]]);  // at the item's start; the source it shows: frozen after 3 s at speed 2
  expect(bridge.calls.filter((c: any) => c[0] === 'play').at(-1)).toEqual(['play', 4]);
  expect(ed.store.get().audition).toMatchObject({ addable: false, result: 4 });
  expect(ed.addAuditioned()).toBe(false);
  ed.run('exitCrop');                                    // Esc: the playhead waits at the item, Space plays the result there
  expect([ed.store.get().audition, ed.store.get().playhead, ed.store.get().playing]).toEqual([null, 4, false]);
  ed.auditionItem('m1');
  ed.playResult();                                       // the banner's "play the result"
  expect([ed.store.get().audition, ed.store.get().playing, bridge.calls.at(-1)]).toEqual([null, true, ['play', 0]]);
  expect(ed.store.get().project!.tracks.some((t) => t.muted)).toBe(false);
});

test('Space, Esc or any edit ends an audition; the edit goes to the real project', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(3);
  ed.audition({ kind: 'clip', source: 's', from: 0, len: 4 });
  ed.run('playPause');
  expect([ed.store.get().audition, ed.store.get().playing, ed.store.get().playhead]).toEqual([null, false, 3]);
  ed.audition({ kind: 'clip', source: 's', from: 0, len: 4 });
  ed.run('exitCrop');
  expect(ed.store.get().audition).toBe(null);
  ed.audition({ kind: 'clip', source: 's', from: 0, len: 4 });
  ed.select(['c1']);
  ed.run('delete');
  const p: any = ed.store.get().project;
  expect([ed.store.get().audition, p.tracks.length, p.tracks.some((t: any) => t.muted)]).toEqual([null, 6, false]);   // the fixture's 6 tracks, none left over
  expect(tracksOf(p, 'video')[0].items.map((i: any) => i.id)).toEqual(['c2']);
});

test('"add" puts the auditioned material at the playhead where the audition started; the library adds what is picked', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(9);
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  bridge.onTime(9); bridge.onTime(10);
  expect(ed.addAuditioned()).toBe(true);
  let p: any = ed.store.get().project;
  expect(ed.store.get().audition).toBe(null);
  expect(p.tracks.some((t: any) => t.muted)).toBe(false);
  expect(tracksOf(p, 'video').flatMap((t: any) => t.items).filter((i: any) => i.start === 9).map((i: any) => [i.in, i.end])).toEqual([[1, 11]]);
  expect(ed.addMaterial({ kind: 'music', media: 'm' })).toBe(true);
  p = ed.store.get().project;
  expect(tracksOf(p, 'music').flatMap((t: any) => t.items).filter((i: any) => i.start === 9).length).toBe(1);
});

test('the transport button ends an audition instead of playing the project', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(2);
  ed.audition({ kind: 'music', media: 'm' });
  ed.togglePlay();
  expect([ed.store.get().audition, ed.store.get().playing, ed.store.get().playhead]).toEqual([null, false, 2]);
});

test('scrolling away while playing is not undone: only crossing the right edge turns the page', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(200);                      // 10 s in view
  ed.play();
  bridge.onTime(0); bridge.onTime(2);
  ed.setView({ scroll: 5 });                // the user looks ahead
  bridge.onTime(2.1); bridge.onTime(6);
  expect(ed.store.get().scroll).toBe(5);
  bridge.onTime(14.9); bridge.onTime(15.1);  // crossed the edge of the view the user chose
  expect(ed.store.get().scroll).toBe(11);
});

test('during an audition, the library button, a seek or a play act on the real project and the real playhead', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(200);
  ed.setView({ scroll: 8 });                // 8–18 s in view
  ed.seek(17.6);
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  bridge.onTime(17.6); bridge.onTime(18.2); // the audition runs past the view: the page turned
  expect(ed.store.get().scroll).toBe(11);
  expect(ed.addMaterial({ kind: 'clip', source: 's', from: 1, len: 2 })).toBe(true);
  const p: any = ed.store.get().project;
  expect(p.tracks.filter((t: any) => t.kind === 'video').flatMap((t: any) => t.items).filter((i: any) => i.in === 1 && i.end - i.start === 2).map((i: any) => i.start)).toEqual([17.6]);
  expect([ed.store.get().audition, ed.store.get().scroll]).toEqual([null, 8]);   // the view came back too
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  ed.seek(12);                              // a click on the ruler or a double-click on the timeline
  ed.play();
  expect([ed.store.get().audition, ed.store.get().playing, bridge.calls.at(-1)]).toEqual([null, true, ['play', 12]]);
  expect(ed.store.get().project!.tracks.some((t) => t.muted)).toBe(false);
});

test('reports of the old position after "play the result" neither move the view nor the playhead', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(200);                      // 10 s in view
  ed.setView({ scroll: 3 });                // c2 (4–8 s) in view
  ed.auditionItem('c2');
  bridge.onTime(4); bridge.onTime(5);       // the audition plays the raw source where the item is
  ed.playResult();
  bridge.onTime(5); bridge.onTime(5);       // the player redraws the audition position while pausing and patching
  expect([ed.store.get().scroll, ed.store.get().playhead]).toEqual([3, 4]);
  bridge.onTime(4.02);
  expect([ed.store.get().scroll, ed.store.get().playhead, ed.store.get().playing]).toEqual([3, 4.02, true]);
});

test('a very short audition plays to its end', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(0.2);
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 0.12 });
  bridge.onTime(0.2); bridge.onTime(0.2);   // the player redraws while pausing and patching
  expect(ed.store.get().audition).not.toBe(null);
  bridge.onTime(0.33);
  expect(ed.store.get().audition).toBe(null);
});

test('during an audition every track looks muted, but M and S toggle the real track', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  expect(ed.toggleTrack('mu', 'muted')).toBe(true);
  const mu: any = ed.store.get().project!.tracks.find((t) => t.id === 'mu');
  expect([ed.store.get().audition, mu.muted]).toEqual([null, true]);
  expect(ed.toggleTrack('mu', 'solo')).toBe(true);
  expect((ed.store.get().project!.tracks.find((t) => t.id === 'mu') as any).solo).toBe(true);
});

test('a preview error raised by the audition does not outlive it', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  bridge.onError('v9: Video not available');
  expect(ed.store.get().playerError).not.toBe('');
  ed.endAudition();
  expect(ed.store.get().playerError).toBe('');
});

test('clicking an overlap: a video pair gets a dissolve as long as the overlap; a song pair toggles a crossfade', async () => {
  const p0: any = fixture(); p0.tracks[1].items[1].start = 3.5; delete p0.tracks[1].items[1].transitionIn;
  p0.tracks[3].items.push({ id: 'm2', media: 'm', in: 0, start: 8, end: 14, gain: 0, fadeIn: 0, fadeOut: 0 });
  const { api, bridge } = fakes({ project: async () => structuredClone(p0) });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const c2 = () => ed.store.get().project!.tracks[1].items[1] as any, mu = () => ed.store.get().project!.tracks[3].items as any[];
  expect(ed.overlapClick('c2')).toBe(true);
  expect(c2().transitionIn).toEqual({ type: 'dissolve', dur: 0.5 });
  expect(ed.overlapClick('c2')).toBe(true);                 // it has one now: selected for the properties panel
  expect([ed.store.get().selection, c2().transitionIn.dur]).toEqual([['c2'], 0.5]);
  ed.overlapClick('m2');
  expect([mu()[0].fadeOut, mu()[1].fadeIn]).toEqual([2, 2]);
  ed.overlapClick('m2');
  expect([mu()[0].fadeOut, mu()[1].fadeIn]).toEqual([0, 0]);
  expect(ed.overlapClick('c1')).toBe(false);               // nothing before c1
});

test('transition length from the timeline: live while dragging, one undo step, kept between a frame and the clip length', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const dur = () => (ed.store.get().project!.tracks[1].items[1] as any).transitionIn.dur;
  ed.previewTransitionDur('c2', 0.8);
  expect([dur(), ed.store.get().canUndo]).toEqual([0.8, false]);
  ed.commitLive();
  expect([dur(), ed.store.get().canUndo]).toEqual([0.8, true]);
  ed.previewTransitionDur('c2', 99); ed.commitLive();
  expect(dur()).toBe(4);                                   // c2 is 4 s long
  ed.previewTransitionDur('c2', 0); ed.commitLive();
  expect(dur()).toBe(0.04);                                // one frame at 25 fps
});

test('tracks: add, move inside the group, remove (undoable); Ctrl+] and Ctrl+[ restack the selected item', async () => {
  const p0: any = fixture(); p0.tracks[1].items[1].start = 3.5;
  const { api, bridge } = fakes({ project: async () => structuredClone(p0) });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const ids = () => ed.store.get().project!.tracks.map((t) => t.id);
  ed.addTrackOf('overlay');
  expect(ids()).toEqual(['sc', 'v', 'v2', 'overlay', 'mu', 'au', 'fx']);
  ed.moveTrack('overlay', 0);
  expect(ids()).toEqual(['overlay', 'sc', 'v', 'v2', 'mu', 'au', 'fx']);
  ed.removeTrack('overlay');
  expect(ids()).toEqual(['sc', 'v', 'v2', 'mu', 'au', 'fx']);
  ed.undo();
  expect(ids()[0]).toBe('overlay');
  const v = () => ed.store.get().project!.tracks.find((t) => t.id === 'v')!.items.map((i) => i.id);
  ed.select(['c2']);
  ed.run('lower');
  expect(v()).toEqual(['c2', 'c1']);
  ed.run('raise');
  expect(v()).toEqual(['c1', 'c2']);
  ed.run('raise');                                         // nothing above it: refused with a notice
  expect(ed.store.get().notice).toContain('上層');
});
test('F (the large preview) and other view keys do not end an audition; adding after a long audition keeps the project length', async () => {
  const { api, bridge, saved } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(2);
  ed.audition({ kind: 'clip', source: 's', from: 0, len: 26 });          // longer than the 20 s project
  ed.run('maxPreview');
  expect(ed.store.get().audition).not.toBe(null);
  expect(ed.addAuditioned()).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect([ed.store.get().project!.meta.duration, (saved.at(-1) as any).meta.duration]).toEqual([20, 20]);
});
test('F in a portrait project widens the preview column as far as the timeline allows, and back', async () => {
  const { api, bridge } = fakes({ project: async () => { const p: any = fixture(); p.meta.width = 180; p.meta.height = 320; return p; } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.run('maxPreview');
  expect(ed.store.get().layout.previewW).toEqual({ landscape: null, portrait: 10000 });
  ed.run('maxPreview');
  expect(ed.store.get().layout.previewW.portrait).toBe(null);
});
test('tracks collapse one by one or by kind (Shift), remembered per project; deleted tracks drop out of the memory', async () => {
  const mem = new Map<string, string>(), storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, storage });
  await ed.open();
  ed.toggleCollapse('mu');
  expect(ed.store.get().collapsed).toEqual(['mu']);
  ed.toggleCollapse('v', true);                                  // both video tracks
  expect([...ed.store.get().collapsed].sort()).toEqual(['mu', 'v', 'v2']);
  ed.toggleCollapse('v2', true);                                 // some of the kind collapsed: Shift opens them all
  expect(ed.store.get().collapsed).toEqual(['mu']);
  ed.removeTrack('mu');
  expect(ed.store.get().collapsed).toEqual([]);
  ed.toggleCollapse('au');
  const again = new Editor('demo', { api, bridge, storage });
  await again.open();
  expect(again.store.get().collapsed).toEqual(['au']);
});
test('loop: plays the selected clips over and over (the whole project when nothing is selected); an audition is not looped', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c2']);                                          // 4–8 s
  ed.toggleLoop();
  ed.play();
  expect(bridge.calls.filter((c: any) => c[0] === 'play').at(-1)).toEqual(['play', 4]);
  bridge.onTime(4); bridge.onTime(7.99);
  expect(ed.store.get().playhead).toBe(7.99);
  bridge.onTime(8);
  expect([bridge.calls.filter((c: any) => c[0] === 'play').at(-1), ed.store.get().playing]).toEqual([['play', 4], true]);
  ed.select([]);
  bridge.onEnded();                                           // the whole project ended: from the top
  expect([bridge.calls.filter((c: any) => c[0] === 'play').at(-1), ed.store.get().playing]).toEqual([['play', 0], true]);
  ed.pause();
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  bridge.onEnded();
  expect([ed.store.get().audition, ed.store.get().playing]).toEqual([null, false]);
});

test('zoom to fit (\\) shows the whole project however long; the snap switch turns snapping off and is remembered', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(100);                                        // 20 s at the 20 px/s minimum
  ed.setView({ pps: 100, scroll: 3 });
  ed.run('zoomFit');
  expect([ed.store.get().pps, ed.store.get().scroll]).toEqual([5, 0]);   // 100 px / 20 s, at the 5 px/s floor
  ed.setView({ pps: 50, scroll: 0 });
  const drag = () => { ed.beginDrag({ grip: 'body', id: 'c2', mods: { alt: false, ctrl: false, shift: false }, selection: ['c2'] }); ed.dragTo(5, { alt: false, ctrl: false, shift: false }); ed.endDrag(); };
  drag();                                                     // 0.1 s: snaps back onto c1's end
  expect((ed.store.get().project!.tracks[1].items[1] as any).start).toBe(4);
  ed.setLayout({ snap: false });
  drag();
  expect((ed.store.get().project!.tracks[1].items[1] as any).start).toBe(4.1);
});
test('help (? or F1) opens over the editor; while open, keys do nothing to the project and Esc only closes it', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']);
  ed.run('help');
  expect(ed.store.get().helpOpen).toBe(true);
  ed.run('delete'); ed.run('playPause');
  expect([ed.store.get().project!.tracks[1].items.length, ed.store.get().playing]).toEqual([2, false]);
  ed.run('exitCrop');
  expect(ed.store.get().helpOpen).toBe(false);
});

test('a loop that jumps back to its start brings the timeline view back to the playhead', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(80);                                        // 20 px/s: 4 s in view
  ed.select(['m1']);                                         // 0–10 s
  ed.toggleLoop();
  ed.play();
  for (const t of [0, 3.9, 4.1, 8, 8.2]) bridge.onTime(t);   // the view turned pages along
  expect(ed.store.get().scroll).toBe(8.2);
  bridge.onTime(10);                                         // back to 0
  bridge.onTime(0.01);
  expect(ed.store.get().scroll).toBe(0.01);
});

test('End (or ⏭) while playing stops at the end instead of starting over from 0 in the preview', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.play();
  bridge.onTime(0);
  ed.run('end');
  expect([ed.store.get().playing, ed.store.get().playhead, bridge.calls.at(-1)]).toEqual([false, 20, ['seek', 20]]);
});
const withPhoto = () => { const p: any = fixture(); p.sources.ph = { path: 'p.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' }; return p; };

test('adding a photo gives a 3 s clip with a gentle push-in; music with known beats brings its beat grid in the same step', async () => {
  const { api, bridge } = fakes({ project: async () => withPhoto(), beats: async () => ({ bpm: 120, offset: 0.25, beats: [0.25, 0.75] }) });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await ed.analyze();
  ed.seek(2);
  ed.addClip('ph', 0, 3600);
  const pic: any = ed.store.get().project!.tracks.flatMap((t) => t.items as any[]).find((i: any) => i.source === 'ph');
  expect([pic.start, pic.end, pic.crop.to.zoom]).toEqual([2, 5, 1.1]);
  ed.seek(4);
  ed.addMusic('m');
  expect(ed.store.get().project!.grids.at(-1)).toMatchObject({ at: 4.25, bpm: 120 });
  ed.undo();
  expect(ed.store.get().project!.grids.length).toBe(1);   // the fixture's grid only: music and grid went together
});

test('speech to captions: the clip\'s sentences become captions attached to it, in one undo step', async () => {
  const transcript = { language: 'zh', segments: [{ start: 2, end: 3, text: '大家好' }, { start: 3.5, end: 4.5, text: '出發' }] };
  const { api, bridge } = fakes({ transcript: async () => transcript });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(await ed.speechCaptions('c1')).toBe(true);                 // c1 shows media 1–5 s at 0–4 s
  const caps = ed.store.get().project!.tracks.flatMap((t) => t.items as any[]).filter((i: any) => i.type === 'core.caption') as any[];
  expect(caps.map((c) => [c.start, c.end, c.parent, c.params.text])).toEqual([[1, 2, 'c1', '大家好'], [2.5, 3.5, 'c1', '出發']]);
  ed.undo();
  expect(ed.store.get().project!.tracks.flatMap((t) => t.items as any[]).some((i: any) => i.type === 'core.caption')).toBe(false);
  const none = new Editor('demo', { api: { ...api, transcript: async () => { throw new ApiError(409, 'x'); } }, bridge });
  await none.open();
  expect(await none.speechCaptions('c1')).toBe(false);
  expect(none.store.get().notice).toContain('逐字稿');
});

test('music analysed after the editor opened: its tempo arrives once the beats job is done, not asked for before', async () => {
  let ready = false, early = 0;
  const { api, bridge } = fakes({
    analyze: async () => ({ jobs: [], missing: [], extras: [{ id: 'b1', kind: 'beats', label: 'm' }] }),
    waitJob: async (id: string) => { if (id === 'b1') ready = true; return 'done'; },
    beats: async () => { if (!ready) { early++; throw new ApiError(409, 'not yet'); } return { bpm: 96, offset: 0.1, beats: [0.1] }; },
  });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await ed.analyze();
  expect(ed.store.get().beats.m?.bpm).toBe(96);
  expect(early).toBe(0);
});

test('adding a crop keyframe at the playhead enters crop mode on it; deleting it leaves crop mode', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']);
  ed.seek(1);
  expect(ed.addCropKey()).toBe(true);
  const c1 = () => (ed.store.get().project!.tracks[1].items[0] as any);
  expect(c1().crop.keys.map((k: any) => k.t)).toEqual([1]);
  expect(ed.store.get().crop).toMatchObject({ itemId: 'c1', which: 0 });
  expect(bridge.calls.at(-1)).toEqual(['cropMode', { itemId: 'c1', which: 0 }]);
  bridge.onCropChange({ itemId: 'c1', which: 0, crop: { x: 0.2, y: 0.5, zoom: 1.5 }, final: true });
  expect(c1().crop.keys[0]).toEqual({ t: 1, x: 0.2, y: 0.5, zoom: 1.5 });
  expect(ed.removeCropKey(0)).toBe(true);
  expect(ed.store.get().crop).toBeNull();
  expect(c1().crop.keys).toBeUndefined();
  ed.undo();
  expect(c1().crop.keys).toHaveLength(1);
  ed.seek(0);
  expect(ed.addCropKey()).toBe(false);          // at the clip's start: refused, nothing changes
  expect(c1().crop.keys).toHaveLength(1);
});

test('crop mode on a keyframe ends when the keyframe goes away by undo or by deleting another one', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']);
  ed.seek(1);
  ed.addCropKey();
  ed.undo();
  expect(ed.store.get().crop).toBeNull();
  ed.seek(1); ed.addCropKey(); ed.seek(2); ed.addCropKey();
  expect(ed.store.get().crop).toMatchObject({ itemId: 'c1', which: 1 });
  ed.removeCropKey(0);                           // the edited keyframe moves to index 0: crop mode must not jump to another one
  expect(ed.store.get().crop).toBeNull();
});

test('crop mode follows a keyframe by its time: undo that removes it ends crop mode instead of landing on another key', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']);
  ed.seek(1); ed.addCropKey(); ed.exitCrop();               // A at 1 s
  ed.seek(0.5); ed.addCropKey();                            // B at 0.5 s takes index 0, A moves to 1
  expect(ed.store.get().crop).toMatchObject({ itemId: 'c1', which: 0 });
  expect(ed.store.get().crop!.t).toBeCloseTo(0.5, 1);       // seeking snaps to the 25 fps frame grid
  ed.undo();                                                // B is gone; index 0 is now A
  expect(ed.store.get().crop).toBeNull();
});

function live() {
  const results: any[] = [], states: any[] = [];
  let on: (m: any) => void = () => {};
  const over = { events: (_id: string, f: (m: any) => void) => { on = f; return () => {}; }, proposal: async () => null,
    proposalResult: async (_id: string, b: any) => { results.push(b); return {}; }, editorState: async (_id: string, b: any) => { states.push(b); return {}; } };
  return { over, results, states, send: (m: any) => on(m) };
}
const prop = (ops: any[]) => ({ id: 'p1', label: '剪短', ops, status: 'pending' });

test('a proposal shows as a preview: not saved, not undoable, edits refused until it is decided', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  expect((bridge.calls.at(-1)[1].tracks[1].items[0] as any).end).toBe(3);
  expect(ed.store.get().proposal).toMatchObject({ label: '剪短', changed: ['c1'] });
  expect(ed.store.get().canUndo).toBe(false);
  expect(ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }))).toBe(false);
  expect(ed.store.get().notice).toMatch(/提議待處理/);
  await vi.advanceTimersByTimeAsync(2000);
  expect(saved).toHaveLength(0);
});

test('accepting is one undo step, saved, and reported; undo brings back the project before it', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }, { op: 'moveItems', ids: ['c2'], dt: 1 }]) });
  expect(await ed.acceptProposal()).toBe(true);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'accepted' }]);
  expect((saved.at(-1) as any).tracks[1].items[0].end).toBe(3);
  expect(ed.store.get().proposal).toBeNull();
  ed.undo();
  expect((ed.store.get().project!.tracks[1].items[0] as any).end).toBe(4);
  expect((ed.store.get().project!.tracks[1].items[1] as any).start).toBe(4);
});

test('an accept from the chat lands on top of an edit still waiting to be saved', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['a1'], dt: 1 }));                 // autosave pending
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  L.send({ type: 'accept-request', id: 'p1' });
  await vi.advanceTimersByTimeAsync(10);
  const last: any = saved.at(-1);
  expect([last.tracks[1].items[0].end, last.tracks.find((t: any) => t.id === 'au').items[0].start]).toEqual([3, 2]);
});

test('a proposal that no longer fits the project is reported stale and nothing changes', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'gone', dt: -1 }]) });
  await vi.advanceTimersByTimeAsync(10);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'stale', reason: expect.stringContaining('gone') }]);
  expect(ed.store.get().proposal).toBeNull();
  expect(saved).toHaveLength(0);
});

test('rejecting puts the project back as it was', async () => {
  const L = live(), { api, bridge } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  L.send({ type: 'reject-request', id: 'p1' });
  await vi.advanceTimersByTimeAsync(10);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'rejected' }]);
  expect((bridge.calls.at(-1)[1].tracks[1].items[0] as any).end).toBe(4);
});

test('selection and playhead reach the server 300 ms after they settle; an outside change is announced', async () => {
  const L = live(), { api, bridge } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']); ed.seek(2);
  await vi.advanceTimersByTimeAsync(299);
  expect(L.states).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(L.states).toEqual([{ selection: ['c1'], playhead: 2 }]);
  L.send({ type: 'changed-on-disk' });
  expect(ed.store.get().diskChanged).toBe(true);
});

test('an edited fx module loads the preview again with a new registry; nothing is held or marked changed', async () => {
  const L = live(), { api, bridge } = fakes(L.over);
  let registries = 0;
  const ed = new Editor('demo', { api, bridge, registryFor: async () => { registries++; return createRegistry([corePlugin]); } });
  await ed.open();
  const loads = bridge.calls.filter((c: any[]) => c[0] === 'load').length;
  L.send({ type: 'fx-changed' });
  await vi.advanceTimersByTimeAsync(0);
  expect(registries).toBe(2);
  expect(bridge.calls.filter((c: any[]) => c[0] === 'load').length).toBe(loads + 1);
  expect(ed.store.get().diskChanged).toBe(false);
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

test('while a proposal waits, a timeline drag changes nothing and the proposal stays on screen', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  ed.beginDrag({ grip: 'body', id: 'c2', mods: { alt: false, ctrl: true, shift: false }, selection: [] });
  ed.dragTo(200, { alt: false, ctrl: true, shift: false });
  ed.endDrag();
  const shown = bridge.calls.filter((c: any) => c[0] === 'patch').at(-1)[1];
  expect([shown.tracks[1].items[0].end, shown.tracks[1].items[1].start]).toEqual([3, 4]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(saved).toHaveLength(0);
});

test('a proposal is applied once even when accept comes twice; a request for another proposal is ignored', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  L.send({ type: 'accept-request', id: 'p9' });
  await vi.advanceTimersByTimeAsync(10);
  expect([L.results, ed.store.get().proposal?.id]).toEqual([[], 'p1']);
  const [a, b] = await Promise.all([ed.acceptProposal(), ed.acceptProposal()]);
  expect([a, b]).toEqual([true, false]);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'accepted' }]);
  expect((saved.at(-1) as any).tracks[1].items[0].end).toBe(3);
});

test('a proposal accepted in another tab marks this one as changed outside', async () => {
  const L = live(), { api, bridge } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  L.send({ type: 'proposal', proposal: null, outcome: 'accepted' });
  expect([ed.store.get().proposal, ed.store.get().diskChanged]).toEqual([null, true]);
});

test('reloading drops the old unsaved edit; while an outside change waits, edits are held until 忽略', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));
  await ed.open();
  await vi.advanceTimersByTimeAsync(3000);
  expect(saved).toHaveLength(0);
  L.send({ type: 'changed-on-disk' });
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));
  await vi.advanceTimersByTimeAsync(3000);
  expect(saved).toHaveLength(0);
  ed.ignoreDisk();
  await vi.advanceTimersByTimeAsync(10);
  expect((saved.at(-1) as any).tracks[1].items[1].start).toBe(5);
});

test('Reload on the changed-on-disk bar asks first when edits made since are waiting, and keeps them when told no', async () => {
  const L = live(), { api, bridge } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const asked: string[] = [];
  L.send({ type: 'changed-on-disk' });
  expect(await ed.reload((m) => { asked.push(m); return false; })).toBe(true);   // nothing held: reloads without asking
  expect(asked).toEqual([]);
  L.send({ type: 'changed-on-disk' });
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));
  // it used to throw these away without a word
  expect(await ed.reload((m) => { asked.push(m); return false; })).toBe(false);
  expect([asked.length, ed.store.get().diskChanged, (ed.store.get().project!.tracks[1].items[1] as any).start]).toEqual([1, true, 5]);
  expect(await ed.reload(() => true)).toBe(true);
  expect([ed.store.get().diskChanged, (ed.store.get().project!.tracks[1].items[1] as any).start]).toEqual([false, 4]);
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

test('Ask Agent: a right-click on an unselected clip selects it alone; copying stores the request and the message', async () => {
  const copied: string[] = [], sent: any[] = [];
  const { api, bridge } = fakes({ request: async (_id: string, b: any) => { sent.push(b); return { id: 'r1', ...b, range: [4, 8] }; } });   // the server adds the range
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async (t: string) => { copied.push(t); } } });
  await ed.open();
  ed.select(['c1']);
  ed.openAsk('c2');
  expect([ed.store.get().selection, ed.store.get().ask?.selection]).toEqual([['c2'], ['c2']]);
  await ed.sendAsk('換一個"更亮"的\n鏡頭');
  expect(sent).toEqual([{ text: '換一個"更亮"的\n鏡頭', selection: ['c2'], playhead: 0 }]);
  expect(copied[0]).toContain('（選取 c2，4.00–8.00 秒；詳細：npm run tellcut -- request demo）');
  expect(ed.store.get().ask?.state).toBe('copied');
  await vi.advanceTimersByTimeAsync(2000);
  expect(ed.store.get().ask).toBeNull();
});

test('Ask Agent: a refused clipboard shows the text to copy by hand; a failed save keeps the dialog with the reason', async () => {
  const { api, bridge } = fakes({ request: async (_id: string, b: any) => ({ id: 'r1', ...b }) });
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async () => { throw new Error('denied'); } } });
  await ed.open();
  ed.openAsk();
  await ed.sendAsk('加字幕');
  expect(ed.store.get().ask).toMatchObject({ state: 'manual', message: expect.stringContaining('播放頭 0.00 秒附近') });
  const { api: api2 } = fakes({ request: async () => { throw new ApiError(400, '找不到項目 c9'); } });
  const ed2 = new Editor('demo', { api: api2, bridge, clipboard: { writeText: async () => {} } });
  await ed2.open();
  ed2.openAsk();
  await ed2.sendAsk('x');
  expect(ed2.store.get().ask).toMatchObject({ state: 'edit', error: '找不到項目 c9' });
});

test('Ask Agent on empty space hands over the playhead, not an old selection', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async () => {} } });
  await ed.open();
  ed.select(['c1']);
  ed.seek(12);
  ed.openAsk();
  expect([ed.store.get().ask?.selection, ed.store.get().ask?.playhead]).toEqual([[], 12]);
});

test('Ask Agent saves pending edits before sending (a fresh split exists on disk); closing while sending stays closed', async () => {
  const order: string[] = [];
  let release!: () => void;
  const copied: string[] = [];
  const { api, bridge } = fakes({
    save: async () => { order.push('save'); },
    request: async (_id: string, b: any) => { order.push('request'); await new Promise<void>((r) => (release = r)); return { id: 'r', ...b, range: [0, 4] }; },
  });
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async (t: string) => { copied.push(t); } } });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['a1'], dt: 1 }));
  ed.openAsk('c1');
  const sending = ed.sendAsk('x');
  await vi.advanceTimersByTimeAsync(0);
  expect(order).toEqual(['save', 'request']);
  ed.closeAsk();
  release();
  await sending;
  expect([ed.store.get().ask, copied]).toEqual([null, []]);
});

test('Ask Agent 送出: the request is stored, the chat tab opens and the message goes into the project chat', async () => {
  const chatSent: string[] = [];
  const { api, bridge } = fakes({ request: async (_i: string, b: any) => ({ id: 'r', ...b, range: [4, 8] }),
    chat: async () => ({ thread: { messages: [], sessionId: 's', started: false }, running: null }),
    chatSend: async (_t: string, text: string, on: (e: any) => void) => { chatSent.push(text); on({ type: 'done', status: 'done', text: '好' }); } });
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async () => {} } });
  await ed.open();
  ed.openAsk('c2');
  await ed.sendAskToChat('換亮一點');
  expect([ed.store.get().ask, ed.store.get().layout.sideTab]).toEqual([null, 'chat']);
  expect(chatSent[0]).toContain('（選取 c2，4.00–8.00 秒；詳細：npm run tellcut -- request demo）');
});

test('Ask Agent 送出 while the chat is still replying keeps the dialog with the reason (nothing is lost)', async () => {
  const sent: any[] = [];
  const { api, bridge } = fakes({ request: async (_i: string, b: any) => { sent.push(b); return { id: 'r', ...b, range: [4, 8] }; },
    chat: async () => ({ thread: { messages: [] }, running: null }), chatSend: async () => {} });
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async () => {} } });
  await ed.open();
  ed.chat.state = { ...ed.chat.state, running: true };
  ed.openAsk('c2');
  await ed.sendAskToChat('換亮一點');
  expect([sent, ed.store.get().ask?.state, ed.store.get().ask?.error]).toEqual([[], 'edit', expect.stringContaining('還在回覆中')]);
});

test('a crop keyframe on a clip that hangs on another one goes in at the playhead, in the clip\u2019s own time', async () => {
  const withChild = async () => {
    const p = fixture();
    (p.tracks[2].items as any[]).push({ id: 'b', source: 's', in: 0, speed: 1, start: 1, end: 3, parent: 'c2', crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
    return p;
  };
  const { api, bridge } = fakes({ project: withChild });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['b']);
  ed.seek(6);                                       // c2 starts at 4, b 1 s into it: 1 s into b
  expect(ed.addCropKey()).toBe(true);
  expect((ed.store.get().project!.tracks[2].items[0] as any).crop.keys.map((k: any) => k.t)).toEqual([1]);
});

test('a save refused because another tab or Claude wrote first (409) holds the edits as changed outside; 忽略 writes over it', async () => {
  let refuse = true, forgot = 0;
  const L = live(), saved: unknown[] = [];
  const { api, bridge } = fakes({ ...L.over, forgetVersion: () => { forgot++; refuse = false; },
    save: async (_: string, p: unknown) => { if (refuse) throw new ApiError(409, '專案在別的地方被改過'); saved.push(p); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));
  await vi.advanceTimersByTimeAsync(1100);
  expect(ed.store.get().diskChanged).toBe(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(saved).toHaveLength(0);                      // held: no retries over the other version
  ed.ignoreDisk();
  await vi.advanceTimersByTimeAsync(10);
  expect([forgot, (saved.at(-1) as any).tracks[1].items[1].start]).toEqual([1, 5]);
});

test('while the file was changed outside, accepting a proposal is refused (reported stale) and an export says why it cannot start', async () => {
  const L = live(), started: string[] = [];
  const { api, bridge, saved } = fakes({ ...L.over, exportStart: async () => { started.push('x'); return {} as any; } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));
  L.send({ type: 'changed-on-disk' });
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  expect(await ed.acceptProposal()).toBe(false);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'stale', reason: expect.stringMatching(/重新載入/) }]);
  expect(ed.store.get().notice).toMatch(/重新載入/);
  await ed.exportVideo();
  expect(started).toEqual([]);
  expect(ed.store.get().exportError).toMatch(/外面被改過/);
  expect(saved).toHaveLength(0);
});

test('an export being followed when the server goes away stops asking after a while and says so', async () => {
  let asked = 0;
  const { api, bridge } = fakes({ job: async () => { asked++; throw new TypeError('Failed to fetch'); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  void ed.exportVideo();
  await vi.advanceTimersByTimeAsync(15000);
  expect(ed.store.get().exportError).toMatch(/連不上伺服器/);
  const n = asked;
  await vi.advanceTimersByTimeAsync(30000);
  expect(asked).toBe(n);
});

test('editor notices follow the language', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(20);
  setLang('en');
  try {
    expect(ed.addOverlay('core.flash')).toBe(false);
    expect(ed.store.get().notice).toBe('The playhead is at the end of the project, so nothing can be added');
  } finally { setLang('zh'); }
});

test('a refused parameter or a second unique block is named as the editor shows it (English), not by its Chinese label', async () => {
  const registry = createRegistry([corePlugin, { id: 'x', items: [
    { type: 'x.block', label: '區塊', kind: 'scene', build: () => null, draw: () => {}, params: [{ key: 'n', label: '數量（個）', type: 'number', min: 0, max: 10, default: 1 }] },
    { type: 'x.end', label: '片尾', kind: 'overlay', unique: true, params: [], build: () => null, draw: () => {} }] } as any]);
  PARAMS_EN['x.block.n'] = { name: 'Count', hint: 'items' };
  BLOCKS_EN['x.end'] = { label: 'End card', doc: '' };
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  setLang('en');
  try {
    expect(ed.updateParam('blk', 'n', 11)).toBe(false);
    expect(ed.store.get().notice).toBe('"Count" must be between 0 and 10');
    expect(ed.addOverlay('x.end')).toBe(true);
    expect(ed.addOverlay('x.end')).toBe(false);
    expect(ed.store.get().notice).toBe('"End card" can only appear once in a project');
  } finally { setLang('zh'); delete PARAMS_EN['x.block.n']; delete BLOCKS_EN['x.end']; }
});

test('a refused command is told in the interface language (its code is translated; the English message is for agents)', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.restack('blk', 'up')).toBe(false);
  expect(ed.store.get().notice).toBe('沒有重疊在上層的片段');
  for (const [lang, text] of [['en', 'No overlapping item above'], ['ja', '上に重なっている項目がありません']] as const) {
    setLang(lang);
    try {
      expect(ed.restack('blk', 'up')).toBe(false);
      expect(ed.store.get().notice).toBe(text);
    } finally { setLang('zh'); }
  }
});

test('speech captions find an old 字幕 track too, and new ones are named Captions', async () => {
  const transcript = { language: 'zh', segments: [{ start: 2, end: 3, text: '大家好' }] };
  const old = async () => { const p: any = fixture(); p.tracks.push({ id: 'cap', kind: 'overlay', name: '字幕', items: [] }); return p; };
  const { api, bridge } = fakes({ project: old, transcript: async () => transcript });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(await ed.speechCaptions('c1')).toBe(true);
  const tracks = ed.store.get().project!.tracks;
  expect(tracks.filter((t) => t.kind === 'overlay').map((t) => t.id)).toEqual(['cap']);
  expect(tracks.find((t) => t.id === 'cap')!.items.length).toBe(1);
  const fresh = new Editor('demo', { api: { ...api, project: async () => fixture() }, bridge });
  await fresh.open();
  await fresh.speechCaptions('c1');
  expect(fresh.store.get().project!.tracks.find((t) => t.kind === 'overlay')!.name).toBe('Captions');
});

test('restoring a history version after an outside break writes over what is on disk (no If-Match) and shows a failure', async () => {
  const calls: string[] = [];
  let fail = false;
  const { api, bridge } = fakes({ project: async () => { throw new ApiError(422, 'Invalid project.json', ['meta.fps: Required']); },
    historyVersion: async () => fixture(), forgetVersion: () => { calls.push('forget'); },
    save: async () => { calls.push('save'); if (fail) throw new ApiError(409, '專案在別的地方被改過'); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await ed.restore('h1.json');
  expect(calls.slice(0, 2)).toEqual(['forget', 'save']);
  fail = true;
  await expect(ed.restore('h1.json')).resolves.toBe(false);
  expect(ed.store.get().restoreError).toMatch(/別的地方被改過/);
});

test('an accepted proposal whose save fails is not reported accepted: the agent hears why it is not on disk', async () => {
  const L = live();
  const { api, bridge } = fakes({ ...L.over, save: async () => { throw new ApiError(409, '專案在別的地方被改過'); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  expect(await ed.acceptProposal()).toBe(true);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'stale', reason: expect.stringMatching(/沒有存進/) }]);
  expect(ed.store.get().notice).toMatch(/還沒存檔/);
});

test('a changed-on-disk this page caused itself is ignored; one from another tab holds the edits', async () => {
  const L = live();
  const { api, bridge } = fakes({ ...L.over, clientId: 'me' });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'changed-on-disk', by: 'me' });
  expect(ed.store.get().diskChanged).toBe(false);
  L.send({ type: 'changed-on-disk', by: 'other' });
  expect(ed.store.get().diskChanged).toBe(true);
});

test('the chosen arrangement is remembered with the layout and read back by a new editor', () => {
  const mem: Record<string, string> = {};
  const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, storage });
  ed.setLayout({ arrange: { landscape: 'side', portrait: 'stacked' }, previewW: { landscape: 640, portrait: null } });
  const saved = JSON.parse(mem['tellcut.layout']);
  expect(saved.arrange).toEqual({ landscape: 'side', portrait: 'stacked' });
  expect(saved.previewW).toEqual({ landscape: 640, portrait: null });
  const again = new Editor('demo', { api, bridge, storage });
  expect(again.store.get().layout).toMatchObject({ arrange: { landscape: 'side', portrait: 'stacked' }, previewW: { landscape: 640, portrait: null } });
});

test('cycleLayout steps Auto → Stacked → Side → Auto for the project orientation only', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const seen = [1, 2, 3].map(() => { ed.run('layout'); return ed.store.get().layout.arrange.landscape; });
  expect(seen).toEqual(['stacked', 'side', 'auto']);
  expect(ed.store.get().layout.arrange.portrait).toBe('auto');
});

const magneticFixture = () => { const p: any = fixture(); p.tracks.find((t: any) => t.id === 'v').magnetic = true; return p; };

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

const ids = (ed: Editor, track: string) => (ed.store.get().project!.tracks.find((t) => t.id === track)!.items as any[]).map((i) => i.id);

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

describe('the media panel Import', () => {
  const clip = { path: '../in/new.mp4', duration: 5, width: 1920, height: 1080, kind: 'video', audio: true };
  const answer = (over: Record<string, unknown> = {}) => ({ sources: { new: clip }, media: { song: { path: '../in/song.wav' } }, skipped: [], same: [], ...over });

  test('adds the media in one undoable step, saves, then analyses only the new ones', async () => {
    const calls: string[] = [], asked: any[] = [];
    const { api, bridge, saved } = fakes({
      importMedia: async (_id: string, b: any, on: any) => { calls.push('import'); asked.push(b); on(1, 2); return answer(); },
      save: async (_: string, p: unknown) => { calls.push('save'); saved.push(p); },
      analyze: async () => { calls.push('analyze'); return { jobs: [], missing: [] }; },
      thumbs: async (_: string, src: string) => { calls.push(`thumbs:${src}`); throw new ApiError(404, 'x'); },
    });
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    await vi.runAllTimersAsync();
    calls.length = 0;
    await ed.importMedia(['D:/in']);
    expect(asked[0]).toEqual({ paths: ['D:/in'], taken: ['s', 'a', 'm'], have: [{ id: 's', path: 's.mp4' }, { id: 'a', path: 'a.wav' }, { id: 'm', path: 'm.mp3' }] });
    expect(calls).toEqual(['import', 'save', 'analyze', 'thumbs:new']);
    expect((saved.at(-1) as any).sources.new.path).toBe('../in/new.mp4');
    expect(ed.store.get().importNote).toBe(t('ed.imported', { n: 2 }));
    await vi.advanceTimersByTimeAsync(8000);
    expect(ed.store.get().importNote).toBe('');
    ed.undo();
    expect([ed.store.get().project!.sources.new, ed.store.get().project!.media.song]).toEqual([undefined, undefined]);
  });

  test('while saves are held by an outside change, the analysis waits for the save', async () => {
    let refuse = true, analysed = 0;
    const { api, bridge } = fakes({
      importMedia: async () => answer(),
      save: async () => { if (refuse) throw new ApiError(409, 'changed'); },
      analyze: async () => { analysed++; return { jobs: [], missing: [] }; },
    });
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    await vi.runAllTimersAsync();
    analysed = 0;
    await ed.importMedia(['D:/in']);
    expect([ed.store.get().diskChanged, analysed, !!ed.store.get().project!.sources.new]).toEqual([true, 0, true]);
    refuse = false;
    ed.ignoreDisk();
    await vi.advanceTimersByTimeAsync(10);
    expect(analysed).toBe(1);
  });

  test('nothing usable: no edit, and the note says what was left out and what was there already', async () => {
    const { api, bridge } = fakes({
      importMedia: async () => answer({ sources: {}, media: {}, skipped: [{ path: 'D:/in/notes.txt', code: 'import.notMedia', message: 'x' }], same: [{ path: 'D:/in/s.mp4', id: 's' }] }),
    });
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    await ed.importMedia(['D:/in']);
    expect(ed.store.get().canUndo).toBe(false);
    const note = ed.store.get().importNote;
    expect(note).toContain('notes.txt');
    expect(note).toContain(t('err.import.notMedia'));
    expect(note).toContain(t('ed.importSame', { list: 's.mp4' }));
    await vi.advanceTimersByTimeAsync(9000);
    expect(ed.store.get().importNote).toBe(note);   // what was left out stays
  });

  test('the other files of a folder are one line with their count; an unreadable folder is named', async () => {
    const { api, bridge } = fakes({
      importMedia: async () => answer({ sources: {}, media: {}, skipped: [{ path: 'D:\\System', code: 'import.unreadable', message: 'x' }], same: [], others: 37 }),
    });
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    await ed.importMedia(['D:\\']);
    expect(ed.store.get().importNote).toBe(`${t('ed.importSkipped', { list: `System (${t('err.import.unreadable')})` })} ${t('ed.importOthers', { n: 37 })}`);
  });
});

describe('timeline refresh minors (2026-10-29)', () => {
  const withCaption = async () => { const p: any = fixture(); p.tracks.push({ id: 'ov', kind: 'overlay', items: [{ id: 'cap', type: 'x.cap', start: 1, end: 2, params: {}, parent: 'c1' }] }); return p; };

  test('Ctrl+D leaves what Ctrl+C copied on the clipboard', async () => {
    const { api, bridge } = fakes();
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    ed.select(['blk']); ed.copy();
    const clip = ed.store.get().clipboard;
    ed.select(['c1']);
    expect(ed.duplicate()).toBe(true);
    expect(ed.store.get().clipboard).toBe(clip);
  });

  test('a paste that leaves part out past the end says how many; one that leaves out everything says why in the page language', async () => {
    const { api, bridge } = fakes();
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    ed.select(['c1', 'blk']); ed.copy();                          // c1 0–4, blk 2–6
    ed.seek(19);
    expect(ed.paste()).toBe(true);
    expect(ed.store.get().notice).toBe(t('ed.pastePartly', { n: 1 }));
    ed.seek(20);
    expect(ed.paste()).toBe(false);
    expect(ed.store.get().notice).toBe(t('err.cmd.pastePastEnd'));
  });

  test('without a magnetic track, Ctrl+D on a caption hung on a clip hangs the copy on the same clip', async () => {
    const { api, bridge } = fakes({ project: withCaption });
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    ed.select(['cap']);
    expect(ed.duplicate()).toBe(true);
    const copy: any = findItem(ed.store.get().project!, ed.store.get().selection[0]).item;
    expect([copy.parent, resolveTimes(ed.store.get().project!).get(copy.id)]).toEqual(['c1', { start: 2, end: 3 }]);
  });

  test('paste and Ctrl+D leave out a one-per-film block that is already there, and say so', async () => {
    const registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.end', label: '片尾', kind: 'overlay', unique: true, params: [], build: () => null, draw: () => {} }] } as any]);
    const { api, bridge } = fakes();
    const ed = new Editor('demo', { api, bridge, registry });
    await ed.open();
    ed.seek(1);
    ed.addOverlay('x.end');
    const end = ed.store.get().selection[0];
    expect(ed.duplicate()).toBe(false);
    expect(ed.store.get().notice).toBe('「片尾」在專案裡只能有一個');
    ed.select([end, 'blk']); ed.copy();
    ed.seek(8);
    expect(ed.paste()).toBe(true);
    expect(ed.store.get().selection).toEqual(['blk-2']);
    expect(ed.store.get().project!.tracks.flatMap((x) => x.items as any[]).filter((i) => i.type === 'x.end')).toHaveLength(1);
    expect(ed.store.get().notice).toBe('「片尾」在專案裡只能有一個');
  });

  test('Q / W with only blocks selected say the selection has no clip to cut, not that the playhead has none', async () => {
    const { api, bridge } = fakes();
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    ed.select(['blk']); ed.seek(3);
    expect(ed.deleteSide('left')).toBe(false);
    expect(ed.store.get().notice).toBe(t('ed.why.selectionNoClip'));
  });
});
