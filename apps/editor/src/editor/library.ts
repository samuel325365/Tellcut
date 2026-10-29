// My blocks in the editor (spec 2026-10-29-my-library §3.2, §3.3), out of editor.ts like the ask flow: the library and what this
// project has from it, the "Save to My blocks" dialog (save as it is, or hand it to the Agent to make generic), and copying an
// entry into the project. Adding the copied block to the timeline is the editor's (it owns the registry and the edit).
import type { Api } from '../api.ts';
import { ApiError } from '../api.ts';
import type { ChatSession } from '../chat.ts';
import type { Layout } from '../layout.ts';
import type { EditorState, LibraryState, SaveDialog, Store } from '../store.ts';
import { errText, t as say } from '../i18n/index.ts';

type LibraryApi = Pick<Api, 'library' | 'projectLibrary' | 'saveBlockPreview' | 'saveBlock' | 'saveStyle' | 'useLibrary'>;
export interface LibraryDeps { id: string; api: LibraryApi; store: Store<EditorState>; chat: Pick<ChatSession, 'send' | 'state'>; setLayout: (patch: Partial<Layout>) => void }

const TOAST_MS = 6000;

export class LibraryFlow {
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(private c: LibraryDeps) {}
  private get lib() { return this.c.store.get().library; }
  private set(patch: Partial<LibraryState>) { this.c.store.set((s) => ({ library: { ...s.library, ...patch } })); }
  private dialog(patch: Partial<SaveDialog>) { const d = this.lib.saving; if (d) this.set({ saving: { ...d, ...patch } }); }

  /** the library and this project's copies; a failure leaves the panel without My blocks rather than in the way. The store changes
   *  only when an answer differs: every change re-renders the panels, and a re-render resets a number being typed */
  async load() {
    const [index, project] = await Promise.all([this.c.api.library().catch(() => null), this.c.api.projectLibrary(this.c.id).catch(() => null)]);
    this.setChanged({ index, project });
  }
  async loadProject() { this.setChanged({ project: await this.c.api.projectLibrary(this.c.id).catch(() => this.lib.project) }); }
  private setChanged(patch: Partial<Pick<LibraryState, 'index' | 'project'>>) {
    const now = this.lib, changed = (Object.keys(patch) as Array<keyof typeof patch>).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(now[k]));
    if (changed.length) this.set(Object.fromEntries(changed.map((k) => [k, patch[k]])));
  }

  async openBlock(type: string, d: { name: string; desc: string; category?: string }) {
    this.set({ saving: { kind: 'block', target: type, name: d.name, desc: d.desc, category: d.category ?? '', generalize: false, preview: null, conflict: null, busy: false, error: '' } });
    try {
      const preview = await this.c.api.saveBlockPreview({ project: this.c.id, type });
      if (this.lib.saving?.target === type) this.dialog({ preview, conflict: preview.conflict?.name ?? null });
    } catch (e) { if (this.lib.saving?.target === type) this.dialog({ error: errText(e) }); }
  }
  openStyle(id: string, name: string) {
    this.set({ saving: { kind: 'style', target: id, name, desc: '', category: '', generalize: false, preview: null, conflict: null, busy: false, error: '' } });
  }
  patch(p: Partial<Pick<SaveDialog, 'name' | 'desc' | 'category' | 'generalize'>>) { this.dialog(p); }
  close() { this.set({ saving: null }); }

  /** true when the dialog is done (saved, or handed to the Agent); false when it stays open (a conflict to settle, an error) */
  async save(onConflict?: 'replace' | 'keep-both'): Promise<boolean> {
    const d = this.lib.saving;
    if (!d || d.busy) return false;
    const name = d.name.trim() || d.target;
    if (d.kind === 'block' && d.generalize) {
      // the Agent makes it generic in this project, then saves it with these names (its task, apps/server/src/chat/tasks.ts)
      if (this.c.chat.state.running) { this.dialog({ error: say('ed.askBusy') }); return false; }
      this.close();
      this.c.setLayout({ sideTab: 'chat', libClosed: false });
      await this.c.chat.send(say('lib.generalizeMsg', { name }), undefined,
        { kind: 'library-save', type: d.target, name, desc: d.desc.trim(), ...(d.category ? { category: d.category } : {}) });
      return true;
    }
    this.dialog({ busy: true, error: '' });
    try {
      if (d.kind === 'block') await this.c.api.saveBlock({ project: this.c.id, type: d.target, name, desc: d.desc.trim(), ...(d.category ? { category: d.category } : {}), ...(onConflict ? { onConflict } : {}) });
      else await this.c.api.saveStyle({ project: this.c.id, id: d.target, name, desc: d.desc.trim(), ...(onConflict ? { onConflict } : {}) });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'library.conflict') this.dialog({ busy: false, conflict: String(e.params?.name ?? name) });
      else this.dialog({ busy: false, error: errText(e) });
      return false;
    }
    this.set({ saving: null, toast: { name } });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.set({ toast: null }), TOAST_MS);
    await this.load();
    return true;
  }
  dismissToast() { clearTimeout(this.toastTimer); this.set({ toast: null }); }

  /** copies an entry (or, with `style`, a music style) into the project; the editor puts it on the timeline */
  async use(slug: string, o: { style?: boolean } = {}) {
    const r = await this.c.api.useLibrary(this.c.id, o.style ? { style: slug } : { slug });
    await this.loadProject();
    return r;
  }
}
