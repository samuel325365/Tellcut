// The Editor: photos, speech captions, music beats, crop mode and crop keyframes, and the media panel’s Import.
import { t } from './i18n/index.ts';
import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { ApiError } from './api.ts';
import { Editor } from './editor.ts';
import { fakes, withPhoto } from './editor-test-kit.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

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
