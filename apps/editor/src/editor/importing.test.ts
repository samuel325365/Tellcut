// Files dropped from this PC (spec 2026-11-10-media-panel-visual §4): looked for in the project first, the rest copied into
// media/import, then imported and placed where they were let go, as one undoable edit.
import { resolveTimes } from '@tellcut/engine';
import { t } from '../i18n/index.ts';
import { Editor } from '../editor.ts';
import { fakes } from '../editor-test-kit.ts';

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
