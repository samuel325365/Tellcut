// Right-click 「交給 Claude…」 (spec 2026-10-16-right-click-claude §2), out of editor.ts (review B3): the dialog's states, storing the
// request on the server, then handing the message to this project's chat (or the clipboard).
import { askMessage } from '../ask.ts';
import type { Api } from '../api.ts';
import type { ChatSession } from '../chat.ts';
import type { Layout } from '../layout.ts';
import type { EditorState, Store } from '../store.ts';
import { errText, t as say } from '../i18n/index.ts';

export interface AskDeps {
  id: string; api: Api; store: Store<EditorState>; chat: ChatSession;
  /** wait for the autosave (the server checks the request against the saved file) */
  settle: () => Promise<unknown>;
  select: (ids: string[]) => void;
  setLayout: (patch: Partial<Layout>) => void;
  clipboard?: { writeText(t: string): Promise<void> };
}

export class AskFlow {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private c: AskDeps) {}
  private get s() { return this.c.store.get(); }
  private set(patch: Partial<EditorState>) { this.c.store.set(patch); }

  /** On an item outside the selection it becomes the selection; empty space = the playhead. */
  open(itemId?: string) {
    if (itemId && !this.s.selection.includes(itemId)) this.c.select([itemId]);
    clearTimeout(this.timer);
    // on empty space the request is about the playhead, whatever was selected before
    this.set({ ask: { selection: itemId ? [...this.s.selection] : [], playhead: this.s.playhead, state: 'edit' } });
  }
  close() { clearTimeout(this.timer); this.set({ ask: null }); }

  /** 「送出」: the request is stored, then the same message goes into this project's chat (the 對話 tab opens). */
  async sendToChat(text: string) {
    const a = this.s.ask, p = this.s.project, t = text.trim();
    if (!a || !p || !t) return;
    // the chat takes one message at a time: keep the dialog (and the text) rather than lose it
    if (this.c.chat.state.running) { this.set({ ask: { ...a, state: 'edit', error: say('ed.askBusy') } }); return; }
    this.set({ ask: { ...a, state: 'sending', error: undefined } });
    await this.c.settle();
    if (this.s.ask?.state !== 'sending') return;
    let range: [number, number] | null;
    try { range = (await this.c.api.request(this.c.id, { text: t, selection: a.selection, playhead: a.playhead })).range; }
    catch (e) { if (this.s.ask?.state === 'sending') this.set({ ask: { ...a, state: 'edit', error: errText(e) } }); return; }
    if (this.s.ask?.state !== 'sending') return;
    this.close();
    this.c.setLayout({ sideTab: 'chat', libClosed: false });
    await this.c.chat.send(askMessage({ name: p.meta.name, id: this.c.id, text: t, selection: a.selection, playhead: a.playhead, range }));
  }

  /** Stores the request, then copies the message for the chat (or shows it to copy by hand). */
  async send(text: string) {
    const a = this.s.ask, p = this.s.project, t = text.trim();
    if (!a || !p || !t) return;
    this.set({ ask: { ...a, state: 'sending', error: undefined } });
    // the server checks the request against the file: an edit still waiting to be saved (a fresh split) goes first
    await this.c.settle();
    const live = () => this.s.ask?.state === 'sending';   // closed meanwhile: stays closed, nothing is copied
    if (!live()) return;
    let range: [number, number] | null;
    try { range = (await this.c.api.request(this.c.id, { text: t, selection: a.selection, playhead: a.playhead })).range; }
    catch (e) { if (live()) this.set({ ask: { ...a, state: 'edit', error: errText(e) } }); return; }
    if (!live()) return;
    const message = askMessage({ name: p.meta.name, id: this.c.id, text: t, selection: a.selection, playhead: a.playhead, range });
    try {
      const cb = this.c.clipboard ?? globalThis.navigator?.clipboard;
      if (!cb) throw new Error('no clipboard');
      await cb.writeText(message);
    } catch { this.set({ ask: { ...a, state: 'manual', message } }); return; }
    this.set({ ask: { ...a, state: 'copied', message } });
    this.timer = setTimeout(() => this.close(), 2000);
  }
}
