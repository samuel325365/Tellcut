// Files dropped from this PC (spec 2026-11-10-media-panel-visual §4): looked for in the project first, the rest copied into
// media/import, then imported and placed where they were let go, as one undoable edit.
import { resolveTimes } from '@tellcut/engine';
import { IMPORT_MAX } from '@tellcut/protocol';
import { t } from '../i18n/index.ts';
import { Editor } from '../editor.ts';
import { fakes, live, prop } from '../editor-test-kit.ts';
import { fixture } from '../../../../packages/engine/src/commands/test-fixture.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const file = (name: string, bytes = 'abc') => new File([bytes], name, { lastModified: 1_700_000_000_000 });
const clip = { path: 'media/import/new.mp4', duration: 5, width: 320, height: 180, kind: 'video', audio: true };
const IMP = 'D:/p/demo/media/import';

/** an editor whose server copies each upload into media/import and imports whatever it is given */
async function setup(over: Record<string, any> = {}) {
  const calls: any[] = [];
  const { api, bridge } = fakes({
    uploadCheck: async (_id: string, files: any[]) => { calls.push(['check', files.map((f) => f.name)]); return { found: files.map((f) => (f.name === 's.mp4' ? 'D:/p/demo/s.mp4' : null)) }; },
    upload: async (_id: string, f: File, onBytes: (n: number) => void) => { calls.push(['upload', f.name]); onBytes(f.size); return `${IMP}/${f.name}`; },
    importMedia: async (_id: string, b: any) => {
      calls.push(['import', b.paths]);
      const has = (n: string) => b.paths.includes(`${IMP}/${n}`);
      return { sources: has('new.mp4') ? { new: clip } : {}, media: has('song.wav') ? { song: { path: 'media/import/song.wav' } } : {},
        skipped: [], same: b.paths.includes('D:/p/demo/s.mp4') ? [{ path: 'D:/p/demo/s.mp4', id: 's' }] : [], lengths: { song: 6 } };
    },
    ...over,
  });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await vi.runAllTimersAsync();
  return { ed, calls };
}
const placed = (ed: Editor, src: string) => ed.store.get().project!.tracks.flatMap((tr) => (tr.items as any[]).map((i) => ({ ...i, track: tr.id }))).filter((i) => (i.source ?? i.media) === src);

test('dropped files: found ones are not uploaded, the rest are, then one undo step adds and places them', async () => {
  const { ed, calls } = await setup();
  await ed.dropFiles([file('new.mp4'), file('song.wav'), file('s.mp4')], { t: 1, row: 'v2' });
  expect(calls).toEqual([['check', ['new.mp4', 'song.wav', 's.mp4']], ['upload', 'new.mp4'], ['upload', 'song.wav'],
    ['import', [`${IMP}/new.mp4`, `${IMP}/song.wav`, 'D:/p/demo/s.mp4']]]);
  const p = ed.store.get().project!;
  expect([!!p.sources.new, !!p.media.song]).toEqual([true, true]);
  // in the order dropped: new from 1 s on the track let go over, then s after it; the song on a music track for its own 6 s
  const n = placed(ed, 'new')[0], s = placed(ed, 's').find((i) => i.track === 'v2')!, song = placed(ed, 'song')[0];
  expect([n.track, s.track, song.track]).toEqual(['v2', 'v2', 'mu']);
  const at = resolveTimes(p), span = (i: any) => [at.get(i.id)!.start, at.get(i.id)!.end];
  expect([...span(n), ...span(s), ...span(song)]).toEqual([1, 6, 6, 20, 1, 7]);   // s ends with the film (20 s)
  expect(ed.store.get().importing).toBeNull();
  ed.undo();
  const q = ed.store.get().project!;
  expect([q.sources.new, q.media.song, placed(ed, 's').some((i) => i.track === 'v2'), placed(ed, 'song').length]).toEqual([undefined, undefined, false, 0]);
});

test('cancel: the files already copied are still added and placed', async () => {
  let release: (() => void) | null = null;
  const { ed, calls } = await setup({
    upload: async (_id: string, f: File, _on: any, signal: AbortSignal) => {
      calls.push(['upload', f.name]);
      if (f.name === 'song.wav') await new Promise<void>((_ok, no) => { release = () => no(new DOMException('Aborted', 'AbortError')); signal.addEventListener('abort', () => release!()); });
      return `${IMP}/${f.name}`;
    },
  });
  const done = ed.dropFiles([file('new.mp4'), file('song.wav')], { t: 0, row: 'v2' });
  await vi.advanceTimersByTimeAsync(0);
  expect(ed.store.get().importing).toMatchObject({ done: 1, total: 2 });
  ed.cancelImport();
  await done;
  expect(calls.at(-1)).toEqual(['import', [`${IMP}/new.mp4`]]);
  expect(placed(ed, 'new').map((i) => i.track)).toEqual(['v2']);
  expect(ed.store.get().importNote).toContain(t('ed.uploadCancelled'));
});

test('a file drop while an import runs is refused', async () => {
  const { ed, calls } = await setup();
  ed.store.set({ importing: { done: 0, total: 3 } });
  await ed.dropFiles([file('new.mp4')], { t: 0, row: 'v2' });
  expect(calls).toEqual([]);
  expect(ed.store.get().notice).toBe(t('ed.importBusy'));
});

test('not media is left out before uploading and named in the note', async () => {
  const { ed, calls } = await setup();
  await ed.dropFiles([file('notes.txt'), file('new.mp4')]);
  expect(calls[0]).toEqual(['check', ['new.mp4']]);
  expect(calls.some((c) => c[1] === 'notes.txt')).toBe(false);
  expect(ed.store.get().importNote).toContain(t('ed.dropNotMedia', { list: 'notes.txt' }));
  // dropped on the media panel (no place): added, not placed
  expect([!!ed.store.get().project!.sources.new, placed(ed, 'new').length]).toEqual([true, 0]);
});

test('more files than one import takes are refused before any is copied', async () => {
  const { ed, calls } = await setup();
  await ed.dropFiles(Array.from({ length: IMPORT_MAX + 1 }, (_, i) => file(`p${i}.jpg`)), { t: 0, row: 'v2' });
  expect(calls).toEqual([]);
  expect(ed.store.get().importNote).toBe(t('err.import.tooMany', { n: IMPORT_MAX + 1, max: IMPORT_MAX }));
  expect(ed.store.get().importing).toBeNull();
});

test('a dropped file that cannot be placed (let go past the end of the film) is added, and the note says it was not placed', async () => {
  const { ed } = await setup();
  await ed.dropFiles([file('new.mp4')], { t: 500, row: 'v2' });
  expect(!!ed.store.get().project!.sources.new).toBe(true);
  expect(placed(ed, 'new').length).toBe(0);
  expect(ed.store.get().importNote).toContain(t('ed.dropNotPlaced', { list: 'new.mp4' }));
});

test('the project opened again (Reload, a history version) while files are copied: importing is cleared, the late upload writes nothing', async () => {
  let release: (() => void) | null = null;
  const { ed, calls } = await setup({
    upload: async (_id: string, f: File, _on: any, signal: AbortSignal) => {
      calls.push(['upload', f.name]);
      await new Promise<void>((ok, no) => { release = ok; signal.addEventListener('abort', () => no(new DOMException('Aborted', 'AbortError'))); });
      return `${IMP}/${f.name}`;
    },
  });
  const done = ed.dropFiles([file('new.mp4')], { t: 0, row: 'v2' });
  await vi.advanceTimersByTimeAsync(0);
  expect(ed.store.get().importing).toMatchObject({ done: 0, total: 1 });
  await ed.open();
  expect(ed.store.get().importing).toBeNull();
  (release as (() => void) | null)?.();   // aborted already: a late answer, if it came
  await done;
  expect(calls.some((c) => c[0] === 'import')).toBe(false);
  expect([ed.store.get().project!.sources.new, ed.store.get().importing, ed.store.get().importNote, ed.store.get().canUndo]).toEqual([undefined, null, '', false]);
});

test('the editor closed while the server imports: importing is cleared and the answer coming late adds nothing', async () => {
  let answer: ((r: any) => void) | null = null;
  let n = 0;
  const late = { sources: { new: clip }, media: {}, skipped: [], same: [] };
  const { ed } = await setup({ importMedia: () => (n++ ? Promise.resolve(late) : new Promise((ok) => { answer = ok; })) });
  const done = ed.importMedia(['D:/x/new.mp4']);
  await vi.advanceTimersByTimeAsync(0);
  expect(ed.store.get().importing).not.toBeNull();
  ed.close();
  expect(ed.store.get().importing).toBeNull();
  answer!(late);
  await done;
  expect([ed.store.get().project!.sources.new, ed.store.get().importNote, ed.store.get().canUndo]).toEqual([undefined, '', false]);
  // a new import goes again
  await ed.dropFiles([file('new.mp4')]);
  expect(!!ed.store.get().project!.sources.new).toBe(true);
});

test('files dropped while a proposal waits: nothing is copied or added, the note says to answer the proposal first', async () => {
  const L = live();
  const { ed, calls } = await setup(L.over);
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  await vi.advanceTimersByTimeAsync(0);
  const before = ed.store.get().project;
  await ed.dropFiles([file('new.mp4')], { t: 0, row: 'v2' });
  expect(calls).toEqual([]);
  expect([ed.store.get().project, ed.store.get().importing, ed.store.get().notice]).toEqual([before, null, t('ed.pending')]);
});

test('a proposal that comes while the files are copied: they are not added, and the note does not say nothing was there', async () => {
  const L = live();
  let release: (() => void) | null = null;
  const { ed, calls } = await setup({ ...L.over,
    upload: async (_id: string, f: File) => { calls.push(['upload', f.name]); await new Promise<void>((ok) => { release = ok; }); return `${IMP}/${f.name}`; } });
  const done = ed.dropFiles([file('new.mp4')], { t: 0, row: 'v2' });
  await vi.advanceTimersByTimeAsync(0);
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  await vi.advanceTimersByTimeAsync(0);
  release!();
  await done;
  // the copy is kept in media/import: dropped again once the proposal is answered, it is found there and not sent again
  expect(ed.store.get().project!.sources.new).toBeUndefined();
  expect([ed.store.get().importing, ed.store.get().importNote, ed.store.get().notice]).toEqual([null, '', t('ed.pending')]);
});

test('a project with no tracks at all: files dropped on the new-track strip make the tracks they need', async () => {
  const { ed } = await setup({ project: async () => { const p: any = fixture(); p.tracks = []; return p; } });
  await ed.dropFiles([file('new.mp4'), file('song.wav')], { t: 0, row: 'new' });
  const p = ed.store.get().project!;
  expect(p.tracks.map((tr) => [tr.kind, (tr.items as any[]).map((i) => i.source ?? i.media)])).toEqual([['video', ['new']], ['music', ['song']]]);
  expect(ed.store.get().importNote).not.toContain(t('ed.dropNotPlaced', { list: 'new.mp4' }));
  // let go where there is no row (no tracks to be under): added, not placed
  ed.undo();
  await ed.dropFiles([file('new.mp4')], { t: 0, row: null });
  expect([!!ed.store.get().project!.sources.new, ed.store.get().project!.tracks.length]).toEqual([true, 0]);
});
