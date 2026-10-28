// The media panel's Import (spec 2026-10-29-media-import), out of editor.ts: the server looks at the files, the editor adds
// them as one undoable edit and saves it like any other, and only then (analysis reads project.json on disk) are they analysed.
import { addSources, type Project } from '@tellcut/engine';
import type { Api } from '../api.ts';
import { errText, t, tn } from '../i18n/index.ts';
import type { EditorState, Store } from '../store.ts';

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
}

const fileName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

export async function importMedia(h: ImportHost, paths: string[]): Promise<void> {
  const p = h.store.get().project;
  if (!p || !paths.length || h.store.get().importing) return;
  const entries = [...Object.entries(p.sources), ...Object.entries(p.media)];
  h.store.set({ importing: { done: 0, total: 0 }, importNote: '' });
  let r;
  try {
    r = await h.api.importMedia(h.id, { paths, taken: entries.map(([id]) => id), have: entries.map(([id, x]) => ({ id, path: x.path })) },
      (done, total) => h.store.set({ importing: { done, total } }));
  } catch (e) {
    h.store.set({ importing: null, importNote: t('ed.importFailed', { why: errText(e) }) });
    return;
  }
  const ids = [...Object.keys(r.sources), ...Object.keys(r.media)];
  let added: string[] = [];
  if (ids.length) h.apply((d) => { added = addSources(d, { sources: r.sources, media: r.media }); });
  const note = [
    added.length ? tn('ed.imported', added.length) : '',
    r.same.length ? t('ed.importSame', { list: r.same.map((x) => fileName(x.path)).join(', ') }) : '',
    r.skipped.length ? t('ed.importSkipped', { list: r.skipped.map((x) => `${fileName(x.path)} (${errText(x)})`).join(', ') }) : '',
  ].filter(Boolean).join(' ');
  const shown = note || t('ed.importNothing');
  h.store.set({ importing: null, importNote: shown });
  // a plain "added 3" goes by itself; what was left out stays until the next import
  if (!r.same.length && !r.skipped.length && added.length) setTimeout(() => { if (h.store.get().importNote === shown) h.store.set({ importNote: '' }); }, 8000);
  if (!added.length) return;
  if (await h.settle()) await h.analyze(added);
  else h.later(added);
}
