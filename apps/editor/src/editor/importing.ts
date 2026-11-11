// The media panel's Import (spec 2026-10-29-media-import), out of editor.ts: the server looks at the files, the editor adds
// them as one undoable edit and saves it like any other, and only then (analysis reads project.json on disk) are they analysed.
// Files dropped from this PC (spec 2026-11-10-media-panel-visual §4) take the same way after their bytes are copied into the
// project's media/import (a page is never told where a dropped file is): those the project has already are not sent again, and
// once imported they are placed where they were let go, in the same undo step.
import { addSources, type Project, type Registry } from '@tellcut/engine';
import { IMPORT_MAX, mediaKindOfName, type ImportResult } from '@tellcut/protocol';
import type { Api } from '../api.ts';
import { errText, t, tn } from '../i18n/index.ts';
import type { EditorState, Store } from '../store.ts';
import { placeImported, type DropTarget } from '../timeline/drop.ts';

export interface ImportHost {
  id: string;
  api: Api;
  store: Store<EditorState>;
  apply(recipe: (d: Project) => unknown): boolean;
  /** true once the latest edit is on disk */
  settle(): Promise<boolean>;
  analyze(only: string[]): Promise<void>;
  /** saves are held (another tab or the Agent wrote the file): analyse these once a save goes through */
  later(ids: string[]): void;
  /** a proposal waits: no edit now (says so itself) */
  blocked?(): boolean;
  /** what placing a dropped file needs: the registry, and the editor's analysis so far */
  reg?: Registry;
}

const fileName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]+/).pop() || p;
const key = (p: string) => p.replace(/\\/g, '/').toLowerCase();

/** the import's new and already-there ids in the order of `paths` (a new one's path is relative to the project, so it is found as
 *  the end of the path given; a converted photo, renamed on the way, comes last) */
function inOrder(paths: string[], r: ImportResult, added: string[]): string[] {
  const out: string[] = [], add = (id?: string) => { if (id && !out.includes(id)) out.push(id); };
  const fresh = added.map((id) => ({ id, rel: key((r.sources[id] ?? r.media[id])?.path ?? '').replace(/^(\.\.\/)+/, '') }));
  for (const p of paths) {
    const k = key(p);
    add(r.same.find((s) => key(s.path) === k)?.id);
    add(fresh.find((f) => f.rel && (k === f.rel || k.endsWith(`/${f.rel}`)))?.id);
  }
  added.forEach(add);
  return out;
}

/** Each editor's import under way: the upload's Cancel, and a turn that the project opened again (Reload, a history version) or
 *  the editor closed moves on. An import of an earlier turn that ends late writes nothing: its project is not the one shown. */
const runs = new WeakMap<Store<EditorState>, { turn: number; cancel: AbortController | null }>();
const runOf = (store: Store<EditorState>) => { let r = runs.get(store); if (!r) runs.set(store, (r = { turn: 0, cancel: null })); return r; };
/** a store setter that goes quiet once the turn it was made in is over */
function turnOf(store: Store<EditorState>) {
  const r = runOf(store), turn = r.turn, gone = () => r.turn !== turn;
  return { gone, set: (patch: Partial<EditorState>) => { if (!gone()) store.set(patch); } };
}
/** The project went away (opened again, or the editor closed): the upload stops, Importing is cleared, what comes back is dropped. */
export function endImports(store: Store<EditorState>) {
  const r = runOf(store);
  r.turn++;
  r.cancel?.abort();
  r.cancel = null;
  if (store.get().importing) store.set({ importing: null });
}

/** Imports `paths` into the project as one undoable edit; `place` puts what was imported (and what was there already) on the
 *  timeline in that same edit. Says what happened in importNote. */
export async function importPaths(h: ImportHost, paths: string[], place?: (d: Project, ids: string[], r: ImportResult) => string[], notes: string[] = []): Promise<void> {
  const p = h.store.get().project, { gone, set } = turnOf(h.store);
  // a dropped file's Importing ends here too, project or not
  if (!p || !paths.length) { set(notes.length ? { importing: null, importNote: notes.join(' ') } : { importing: null }); return; }
  const entries = [...Object.entries(p.sources), ...Object.entries(p.media)];
  set({ importing: { done: 0, total: 0 } });
  let r: ImportResult;
  try {
    r = await h.api.importMedia(h.id, { paths, taken: entries.map(([id]) => id), have: entries.map(([id, x]) => ({ id, path: x.path })) },
      (done, total) => set({ importing: { done, total } }));
  } catch (e) {
    set({ importing: null, importNote: [...notes, t('ed.importFailed', { why: errText(e) })].join(' ') });
    return;
  }
  if (gone()) return;
  const ids = [...Object.keys(r.sources), ...Object.keys(r.media)];
  let added: string[] = [], unplaced: string[] = [];
  const edit = !!(ids.length || (place && r.same.length));
  // a proposal came meanwhile: no edit (blocked() says so); dropped files stay copied, found again by a later drop
  if (edit && h.blocked?.()) { set({ importing: null, importNote: notes.join(' ') }); return; }
  if (edit) h.apply((d) => {
    added = addSources(d, { sources: r.sources, media: r.media });
    // what no track took (let go past the end of the film) is named, by its file
    unplaced = (place?.(d, inOrder(paths, r, added), r) ?? []).map((id) => fileName((d.sources[id] ?? d.media[id])?.path ?? id));
  });
  const note = [
    added.length ? tn('ed.imported', added.length) : '',
    // a file dropped on the timeline that the project had already is placed: nothing to say about it
    r.same.length && !place ? t('ed.importSame', { list: r.same.map((x) => fileName(x.path)).join(', ') }) : '',
    r.skipped.length ? t('ed.importSkipped', { list: r.skipped.map((x) => `${fileName(x.path)} (${errText(x)})`).join(', ') }) : '',
    r.others ? tn('ed.importOthers', r.others) : '',
    unplaced.length ? t('ed.dropNotPlaced', { list: unplaced.join(', ') }) : '',
    ...notes,
  ].filter(Boolean).join(' ');
  const shown = note || (place && r.same.length ? '' : t('ed.importNothing'));
  set({ importing: null, importNote: shown });
  // a plain "added 3" goes by itself; what was left out stays until the next import
  if (!notes.length && !unplaced.length && !(r.same.length && !place) && !r.skipped.length && added.length) setTimeout(() => { if (h.store.get().importNote === shown) set({ importNote: '' }); }, 8000);
  if (!added.length) return;
  const saved = await h.settle();
  if (gone()) return;
  if (saved) await h.analyze(added);
  else h.later(added);
}

/** the media panel's Import: paths on this PC */
export function importMedia(h: ImportHost, paths: string[]): Promise<void> {
  if (h.store.get().importing) return Promise.resolve();
  h.store.set({ importNote: '' });
  return importPaths(h, paths);
}

/** Cancel in the media panel: the file being copied stops; those already copied are still imported and placed */
export function cancelImport(store: Store<EditorState>) { runOf(store).cancel?.abort(); }

/** Files dropped from this PC: on the media panel (no `at`: added only) or on the timeline (placed where let go). */
export async function dropFiles(h: ImportHost, files: File[], at?: DropTarget): Promise<void> {
  if (!h.store.get().project || !files.length) return;
  if (h.store.get().importing) { h.store.set({ notice: t('ed.importBusy') }); return; }
  if (h.blocked?.()) return;
  const media = files.filter((f) => mediaKindOfName(f.name)), notes: string[] = [];
  const not = files.filter((f) => !media.includes(f));
  if (not.length) notes.push(t('ed.dropNotMedia', { list: not.map((f) => f.name).join(', ') }));
  h.store.set({ importNote: '' });
  if (!media.length) { h.store.set({ importNote: notes.join(' ') }); return; }
  // the server would refuse them all once they were copied: say so before copying any
  if (media.length > IMPORT_MAX) { h.store.set({ importNote: t('err.import.tooMany', { n: media.length, max: IMPORT_MAX }) }); return; }
  const total = media.length, bytes = media.reduce((n, f) => n + f.size, 0) || 1, run = runOf(h.store), { gone, set } = turnOf(h.store);
  set({ importing: { done: 0, total, pct: 0 } });
  const ctl = new AbortController();
  run.cancel = ctl;
  const paths: Array<string | null> = media.map(() => null);
  try {
    const { found } = await h.api.uploadCheck(h.id, media.map((f) => ({ name: f.name, size: f.size, mtime: f.lastModified })));
    let sent = 0, done = 0;
    media.forEach((_, i) => { if (found[i]) { paths[i] = found[i]; done++; sent += media[i].size; } });
    set({ importing: { done, total, pct: Math.round((sent / bytes) * 100) } });
    for (const [i, f] of media.entries()) {
      if (paths[i]) continue;
      if (ctl.signal.aborted) break;
      try {
        paths[i] = await h.api.upload(h.id, f, (n) => set({ importing: { done, total, pct: Math.round(((sent + n) / bytes) * 100) } }), ctl.signal);
      } catch (e) {
        if (ctl.signal.aborted) break;
        notes.push(t('ed.importSkipped', { list: `${f.name} (${errText(e)})` }));
      }
      sent += f.size; done++;
      set({ importing: { done, total, pct: Math.round((sent / bytes) * 100) } });
    }
  } catch (e) {
    set({ importing: null, importNote: [...notes, t('ed.importFailed', { why: errText(e) })].join(' ') });
    return;
  } finally { if (run.cancel === ctl) run.cancel = null; }
  if (gone()) return;
  if (ctl.signal.aborted) notes.push(t('ed.uploadCancelled'));
  const s = h.store.get(), ctx = { locked: new Set(s.locked), lengths: {} as Record<string, number>, reg: h.reg, peaks: s.peaks, beats: s.beats };
  await importPaths(h, paths.filter((p): p is string => !!p), at ? (d, ids, r) => placeImported(d, ids, at, { ...ctx, lengths: r.lengths ?? {} }) : undefined, notes);
}
