// The block gallery opened from a project's editor (`?gallery&project=<id>`): the gallery lists that project's own blocks too,
// and its "Add to project" puts a block or sound at the playhead of the editor tab that opened it. The gallery is a page of its own
// in another tab, so it cannot drag onto that timeline; it asks the editor by postMessage through window.opener (the link keeps the
// opener: rel="opener"), and the editor answers with how it went. Both pages are this server's (same origin, checked both ways).
import { t } from './i18n/index.ts';

const ASK = 'tellcut:gallery-add', ANSWER = 'tellcut:gallery-added';

/** what the gallery asks to add: a block (shared or the project's own), a sound effect, or one of My blocks (copied in first) */
export type GalleryAdd = { kind: 'block' | 'sfx'; type: string; params?: Record<string, unknown> } | { kind: 'mine'; type: string; slug: string };
export type AddAnswer = { ok: boolean; notice?: string };

/** the gallery for one project, opened from its editor */
export const galleryUrl = (id: string) => `./?gallery&project=${encodeURIComponent(id)}`;

/** The gallery's side: asks the editor that opened it, and waits `timeout` ms for its answer (a closed or reloading tab never answers). */
export function askEditor(editor: Window | null | undefined, project: string, add: GalleryAdd, o: { self?: Window; timeout?: number } = {}): Promise<AddAnswer> {
  const self = o.self ?? window, gone: AddAnswer = { ok: false, notice: t('gallery.addNoEditor') };
  if (!editor || editor.closed) return Promise.resolve(gone);
  const req = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const done = (a: AddAnswer) => { clearTimeout(timer); self.removeEventListener('message', on); resolve(a); };
    const on = (e: MessageEvent) => {
      if (e.origin !== self.location.origin || e.data?.type !== ANSWER || e.data.req !== req) return;
      done({ ok: !!e.data.ok, ...(e.data.notice ? { notice: String(e.data.notice) } : {}) });
    };
    const timer = setTimeout(() => done(gone), o.timeout ?? 3000);
    self.addEventListener('message', on);
    try { editor.postMessage({ type: ASK, req, project, add }, self.location.origin); } catch { done(gone); }
  });
}

/** what the editor's side needs of the Editor */
export interface AddTarget {
  id: string;
  registry?: { item(type: string): { kind: string } | undefined; sfx(type: string): unknown };
  store: { get(): { notice: string } };
  addOverlay(type: string, params?: Record<string, unknown>): boolean;
  addSfx(type: string, params?: Record<string, unknown>): boolean;
  useLibraryBlock(slug: string, type: string): Promise<boolean>;
}

/** The editor's side: adds what the gallery asked for at the playhead, as the library's "Add at playhead" does (one undo step). */
export async function addFromGallery(ed: AddTarget, project: string, add: GalleryAdd): Promise<AddAnswer> {
  if (project !== ed.id) return { ok: false, notice: t('gallery.addOtherProject') };
  let ok: boolean;
  // one of My blocks this project already has a copy of is added as it is (copying again would update the copy)
  if (add.kind === 'mine' && !ed.registry?.item(add.type)) ok = await ed.useLibraryBlock(add.slug, add.type);
  else if (add.kind === 'mine') ok = ed.addOverlay(add.type);
  else if (add.kind === 'sfx') {
    if (!ed.registry?.sfx(add.type)) return { ok: false, notice: t('gallery.addUnknown', { type: add.type }) };
    ok = ed.addSfx(add.type, add.params);
  } else {
    const def = ed.registry?.item(add.type);
    if (!def) return { ok: false, notice: t('gallery.addUnknown', { type: add.type }) };
    // a background or frame sits under the video: it only replaces one already there (the library says the same)
    if (def.kind === 'scene') return { ok: false, notice: t('ed.sceneAdd') };
    ok = ed.addOverlay(add.type, add.params);
  }
  return ok ? { ok } : { ok, notice: ed.store.get().notice || undefined };
}

/** Installs the editor's side on its window; returns the remover. */
export function answerGallery(ed: AddTarget, self: Window = window): () => void {
  const on = (e: MessageEvent) => {
    const m = e.data;
    if (e.origin !== self.location.origin || m?.type !== ASK || typeof m.req !== 'string' || !m.add || typeof m.add.type !== 'string') return;
    const reply = (a: AddAnswer) => { try { (e.source as Window | null)?.postMessage({ type: ANSWER, req: m.req, ...a }, self.location.origin); } catch { /* the gallery closed */ } };
    addFromGallery(ed, String(m.project), m.add).then(reply, (err) => reply({ ok: false, notice: String((err as Error)?.message ?? err) }));
  };
  self.addEventListener('message', on);
  return () => self.removeEventListener('message', on);
}
