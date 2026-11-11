// One chat thread in the browser (spec 2026-10-16-in-editor-chat §2.3): its messages, the reply streaming in, stop/clear.
import type { AnalysisState, ChatEvent, ChatMessage, ChatTask, ChatThreadView, ChatTool, Lang, PresetChoice, SourceInfo, SourceKeySaved, Usage } from '@tellcut/protocol';
import { getLang } from './i18n/lang.ts';
import { errText } from './i18n/index.ts';
import { chatErrorText } from './i18n/format.ts';

export type { ChatEvent, ChatMessage, ChatTool, Usage };

export interface ChatApi {
  chat(thread: string): Promise<ChatThreadView>;
  /** sources: the APIs ticked on this page, sent with the message (left out: the server keeps the thread's last ones) */
  chatSend(thread: string, text: string, on: (e: ChatEvent) => void, from: 'home' | 'editor', preset?: PresetChoice, lang?: Lang, sources?: string[], task?: ChatTask): Promise<void>;
  chatAttach(thread: string, on: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void>;
  chatStop(thread: string): Promise<unknown>;
  chatClear(thread: string): Promise<unknown>;
  /** the API menu: every outside source (a page without it shows no menu) */
  sources?(): Promise<{ sources: SourceInfo[] }>;
  saveSourceKey?(id: string, key: string): Promise<SourceKeySaved>;
}

/** analyzing: the project's material is being analysed; the server tells Claude to go on when it is done */
/** sources: the outside sources ticked in the API menu on this page (sent with each message; the agent may use only those) */
export interface ChatState { sources?: string[]; messages: ChatMessage[]; running: boolean; partial: { text: string; tools: ChatTool[] } | null; error: string; /** words the server refused (a reply already running there): the chat box takes them back */ unsent?: string; /** what is being analysed now, in words */ analyzing?: string | null; /** the same as codes (a server too old to send them leaves it out): the page words it in its language */ analysis?: AnalysisState | null }

export class ChatSession {
  state: ChatState = { messages: [], running: false, partial: null, error: '' };
  /** called after every finished turn (the home page re-reads the project list) */
  onTurnEnd?: () => void;
  /** a project the running home turn has just made (the home page re-reads the project list without waiting for the turn's end) */
  onProject?: (id: string) => void;
  private subs = new Set<() => void>();
  /** this tab is already streaming the running turn (a second load must not attach to it again) */
  private following = false;
  /** the home page's chat box switched to a project (no editor open): told to the server with every message */
  constructor(readonly thread: string, private api: ChatApi, private from: 'home' | 'editor' = 'editor') {}
  static POLL = 4000;
  private poll: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private following$ = new AbortController();
  /** the page let go of this conversation: no more looking again, the reply it follows let go (each flip back to a running
   *  thread on the home page opened another stream, and the browser has six connections), its callbacks silent */
  close() { this.closed = true; clearTimeout(this.poll); this.following$.abort(); }
  /** the home chat handed its conversation over to a new project (the home page follows it there) */
  onMoved?: (project: string) => void;

  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private set(p: Partial<ChatState>) { this.state = { ...this.state, ...p }; for (const f of [...this.subs]) f(); }

  /** The thread as saved; a reply still running (the page came back) is followed to its end, then the thread is read again.
   *  quiet: a failed read keeps what is shown (the re-read after a turn); returns whether the thread was read. */
  async load(quiet = false): Promise<boolean> {
    let r: ChatThreadView;
    try { r = await this.api.chat(this.thread); }
    catch (e) { if (!this.closed && !quiet) this.set({ error: errText(e), running: false, partial: null }); return false; }
    // this tab streams the turn: the read after it shows the saved thread (and looks again while analysing)
    if (this.following || this.closed) return true;
    this.set({ messages: r.thread.messages, error: '', running: !!r.running, partial: r.running ? { text: r.running.text, tools: [...r.running.tools] } : null, analyzing: r.analyzing ?? null, analysis: r.analysis ?? null });
    // while the material is analysed and nobody replies, look again now and then: the reply the server starts when it is done shows up
    clearTimeout(this.poll);
    if (r.analyzing && !r.running) this.poll = setTimeout(() => void this.load(), ChatSession.POLL);
    if (!r.running) return true;
    this.following = true;
    try { await this.api.chatAttach(this.thread, (e) => this.on(e), this.following$.signal); }
    catch (e) { if (!this.closed) this.set({ error: errText(e), running: false, partial: null }); return true; }   // let go: its stream was aborted
    finally { this.following = false; }
    // what streamed between the two requests (or the whole end of a turn that ended in that gap) is only in the saved thread
    await this.reread();
    return true;
  }

  /** After a turn this tab followed: the saved thread (the earlier messages a send made before the first load hid, the
   *  analysis line, the poll re-armed, a moved conversation's note). A turn's error stays shown. */
  private async reread(): Promise<boolean> {
    if (this.closed) return false;
    const error = this.state.error;
    const read = await this.load(true);
    if (error && !this.state.error && !this.state.running) this.set({ error });
    return read;
  }

  /** preset: the one picked on the home page (a message may be the preset alone); task: what a button asks of the agent (its words stay off the thread) */
  async send(text: string, preset?: PresetChoice, task?: ChatTask) {
    const t = text.trim();
    if ((!t && !preset) || this.state.running) return;
    const sent: ChatMessage = { role: 'user', text: t, time: new Date().toISOString(), ...(preset ? { preset } : {}) };
    this.set({ messages: [...this.state.messages, sent], running: true, partial: { text: '', tools: [] }, error: '' });
    this.following = true;
    this.busy = false;
    let failed: unknown = null;
    try { await this.api.chatSend(this.thread, t, (e) => this.on(e), this.from, preset, getLang(), this.picksSources ? this.state.sources ?? [] : undefined, task); }
    catch (e) { failed = e; }
    finally { this.following = false; }
    if (this.closed) return;
    // the stream ended without its last event (the connection dropped, or the request was refused): the server has the truth
    const cut = this.state.running;
    if (cut) this.set({ running: false, partial: null });
    const busy = this.busy, read = await this.reread();
    // the server took the request but found another reply starting there: its words were not kept either
    if (busy && !cut) { this.set({ unsent: t }); return; }
    if (!cut || !failed) return;
    // Refused (an HTTP answer: a reply already running there, the project gone): nothing was saved. Dropped: saved only if the
    // thread read back has this message from now on; a same-words message from earlier ("ok", "go on") is not it.
    const refused = typeof (failed as { status?: unknown }).status === 'number';
    const kept = read && !refused && this.state.messages.some((m) => m.role === 'user' && m.text === t && m.time >= sent.time);
    if (!kept) this.set({ error: errText(failed), unsent: t, ...(read ? {} : { messages: this.state.messages.filter((m) => m !== sent) }) });
  }

  /** the refused words, once: the chat box puts them back */
  takeUnsent(): string | undefined { const x = this.state.unsent; if (x !== undefined) this.set({ unsent: undefined }); return x; }

  /** the turn ended at once with "a reply is still running" (another tab's turn started in between): nothing was saved */
  private busy = false;

  private on(e: ChatEvent) {
    const p = this.state.partial ?? { text: '', tools: [] };
    if (e.type === 'text') { this.set({ partial: { ...p, text: p.text + e.delta } }); return; }
    if (e.type === 'tool') { this.set({ partial: { ...p, tools: [...p.tools, e.tool] } }); return; }
    if (e.type === 'project') { if (!this.closed) this.onProject?.(e.id); return; }
    const msg: ChatMessage = { role: 'assistant', text: e.text || p.text, time: new Date().toISOString(), tools: p.tools, status: e.status, ...(e.error ? { error: e.error } : {}),
      ...(e.code ? { code: e.code } : {}), ...(e.detail !== undefined ? { detail: e.detail } : {}), ...(e.usage ? { usage: e.usage } : {}) };
    if (e.code === 'chat.busy') this.busy = true;
    this.set({ messages: [...this.state.messages, msg], running: false, partial: null, error: e.status === 'error' ? chatErrorText(e) : '' });
    if (this.closed) return;
    this.onTurnEnd?.();
    if (e.moved) this.onMoved?.(e.moved);
  }

  async stop() { if (this.state.running) await this.api.chatStop(this.thread).catch(() => {}); }

  /** whether this page can show the API menu */
  get picksSources() { return !!this.api.sources; }
  listSources() { return this.api.sources!(); }
  /** the API menu's key box: a pasted key, tried and kept by the server (left out: no key box) */
  get takesKeys() { return !!this.api.saveSourceKey; }
  saveSourceKey(id: string, key: string) { return this.api.saveSourceKey!(id, key); }
  /** the ticks the picked preset added (not ticked before it); the user's own ticks are never among them */
  private presetAdded: string[] = [];
  /** The user's ticks, kept only on this page (they go with each message; a reload starts with none). A source the user ticks
   *  or unticks is theirs from then on, even if a preset added it. */
  setSources(ids: string[]) {
    const before = this.state.sources ?? [];
    this.presetAdded = this.presetAdded.filter((id) => before.includes(id) === ids.includes(id));
    this.set({ sources: ids });
  }

  /** The picked preset's sources (none: the preset was taken off). The ticks the previous preset added come off, then this
   *  one's are added: only those installed here and not ticked yet. The user's own ticks stay. */
  async presetSources(ids: string[]) {
    if (!this.picksSources) return;
    const rows = ids.length ? (await this.listSources().catch(() => ({ sources: [] as SourceInfo[] }))).sources : [];
    const keep = (this.state.sources ?? []).filter((id) => !this.presetAdded.includes(id));
    this.presetAdded = ids.filter((id) => !keep.includes(id) && rows.some((r) => r.id === id && r.available));
    this.set({ sources: [...keep, ...this.presetAdded] });
  }
  /** after a message is sent: the conversation used the preset's ticks, so they stay as they are */
  keepPresetSources() { this.presetAdded = []; }

  async clear() {
    if (this.state.running) return;
    await this.api.chatClear(this.thread);
    this.set({ messages: [], error: '' });
  }
}
