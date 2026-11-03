// The block gallery opened from a project's editor (`?gallery&project=<id>`): the gallery lists that project's own blocks too,
// and its "Add to project" puts a block or sound at the playhead of the editor tab that opened it. The gallery is a page of its own
// in another tab, so it cannot drag onto that timeline; it asks the editor by postMessage through window.opener (the link keeps the
// opener: rel="opener"), and the editor answers with how it went. Both pages are this server's (same origin, checked both ways).
import { t } from './i18n/index.ts';
import { liveLinks } from './editor/library.ts';
import type { EditorState } from './store.ts';

const ASK = 'tellcut:gallery-add', ANSWER = 'tellcut:gallery-added';

/** what the gallery asks to add: a block (shared or the project's own), a sound effect, or one of My blocks (copied in first;
 *  `blockKind`: whether it is a background, which the editor cannot know before the copy is loaded) */
export type GalleryAdd = { kind: 'block' | 'sfx'; type: string; params?: Record<string, unknown> } | { kind: 'mine'; type: string; slug: string; blockKind?: string };
export type AddAnswer = { ok: boolean; notice?: string };

/** the gallery for one project, opened from its editor */
export const galleryUrl = (id: string) => `./?gallery&project=${encodeURIComponent(id)}`;

/** The gallery's side: asks the editor that opened it, and waits `timeout` ms for it to answer (a closed or reloading tab never
 *  answers). The editor first says it has the request: from then on the wait is `working` ms, as copying one of My blocks in and
 *  loading it can take longer than the first wait, and a gallery that gave up early would have the user add it twice. */
export function askEditor(editor: Window | null | undefined, project: string, add: GalleryAdd, o: { self?: Window; timeout?: number; working?: number } = {}): Promise<AddAnswer> {
  const self = o.self ?? window, gone: AddAnswer = { ok: false, notice: t('gallery.addNoEditor') };
  if (!editor || editor.closed) return Promise.resolve(gone);
  const req = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const done = (a: AddAnswer) => { clearTimeout(timer); self.removeEventListener('message', on); resolve(a); };
    const on = (e: MessageEvent) => {
      if (e.origin !== self.location.origin || e.data?.type !== ANSWER || e.data.req !== req) return;
      if (e.data.received) { clearTimeout(timer); timer = setTimeout(() => done(gone), o.working ?? 120_000); return; }
      done({ ok: !!e.data.ok, ...(e.data.notice ? { notice: String(e.data.notice) } : {}) });
    };
    let timer = setTimeout(() => done(gone), o.timeout ?? 3000);
    self.addEventListener('message', on);
    try { editor.postMessage({ type: ASK, req, project, add }, self.location.origin); } catch { done(gone); }
  });
}

/** what the editor's side needs of the Editor */
export interface AddTarget {
  id: string;
  registry?: { item(type: string): { kind: string } | undefined; sfx(type: string): unknown };
  store: { get(): Pick<EditorState, 'notice' | 'project' | 'library'> };
  addOverlay(type: string, params?: Record<string, unknown>): boolean;
  addSfx(type: string, params?: Record<string, unknown>): boolean;
  useLibraryBlock(slug: string, type: string): Promise<boolean>;
}

/** The editor's side: adds what the gallery asked for at the playhead, as the library's "Add at playhead" does (one undo step). */
export async function addFromGallery(ed: AddTarget, project: string, add: GalleryAdd): Promise<AddAnswer> {
  if (project !== ed.id) return { ok: false, notice: t('gallery.addOtherProject') };
  let ok: boolean;
  if (add.kind === 'mine') {
    // one of My blocks this project already has a copy of (meta.fx loads it) is added as it is: copying again would update the
    // copy. A block of the project's own by the same name is no copy: the server refuses to copy over it, and says so
    const s = ed.store.get(), copied = s.library.project ? liveLinks(s).some((l) => l.types.includes(add.type)) : !!ed.registry?.item(add.type);
    const kind = copied ? ed.registry?.item(add.type)?.kind : add.blockKind;
    if (kind === 'scene') return { ok: false, notice: t('ed.sceneAdd') };
    ok = copied ? ed.addOverlay(add.type) : await ed.useLibraryBlock(add.slug, add.type);
  } else if (add.kind === 'sfx') {
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
    const reply = (a: AddAnswer | { received: true }) => { try { (e.source as Window | null)?.postMessage({ type: ANSWER, req: m.req, ...a }, self.location.origin); } catch { /* the gallery closed */ } };
    reply({ received: true });
    addFromGallery(ed, String(m.project), m.add).then(reply, (err) => reply({ ok: false, notice: String((err as Error)?.message ?? err) }));
  };
  self.addEventListener('message', on);
  return () => self.removeEventListener('message', on);
}
