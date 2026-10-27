// One chat thread in the browser (spec 2026-10-16-in-editor-chat §2.3): its messages, the reply streaming in, stop/clear.
import type { AnalysisState, ChatEvent, ChatMessage, ChatTool, Lang, PresetChoice, SourceInfo, Usage } from '@tellcut/protocol';
import { getLang } from './i18n/lang.ts';
import { errText, t } from './i18n/index.ts';
import { chatErrorText } from './i18n/format.ts';

export type { ChatEvent, ChatMessage, ChatTool, Usage };

export interface ChatApi {
  chat(thread: string): Promise<{ thread: { messages: ChatMessage[] }; running: { text: string; tools: ChatTool[] } | null; analyzing?: string | boolean | null; analysis?: AnalysisState | null }>;
  /** sources: the APIs ticked on this page, sent with the message (left out: the server keeps the thread's last ones) */
  chatSend(thread: string, text: string, on: (e: ChatEvent) => void, from: 'home' | 'editor', preset?: PresetChoice, lang?: Lang, sources?: string[]): Promise<void>;
  chatAttach(thread: string, on: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void>;
  chatStop(thread: string): Promise<unknown>;
  chatClear(thread: string): Promise<unknown>;
  /** the API menu: every outside source (a page without it shows no menu) */
  sources?(): Promise<{ sources: SourceInfo[] }>;
}

/** analyzing: the project's material is being analysed; the server tells Claude to go on when it is done */
/** sources: the outside sources ticked in the API menu on this page (sent with each message; the agent may use only those) */
export interface ChatState { sources?: string[]; messages: ChatMessage[]; running: boolean; partial: { text: string; tools: ChatTool[] } | null; error: string; /** words the server refused (a reply already running there): the chat box takes them back */ unsent?: string; /** what is being analysed now, in words */ analyzing?: string | null; /** the same as codes (a server too old to send them leaves it out): the page words it in its language */ analysis?: AnalysisState | null }

export class ChatSession {
  state: ChatState = { messages: [], running: false, partial: null, error: '' };
  /** called after every finished turn (the home page re-reads the project list) */
  onTurnEnd?: () => void;
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

  /** The thread as saved; a reply still running (the page came back) is followed to its end. */
  async load() {
    try {
      const r = await this.api.chat(this.thread);
      if (this.following) return;
      this.set({ messages: r.thread.messages, error: '', running: !!r.running, partial: r.running ? { text: r.running.text, tools: [...r.running.tools] } : null, analyzing: typeof r.analyzing === 'string' ? r.analyzing : r.analyzing ? t('chat.analyzingFallback') : null, analysis: r.analysis ?? null });
      // while the material is analysed and nobody replies, look again now and then: the reply the server starts when it is done shows up
      clearTimeout(this.poll);
      if (r.analyzing && !r.running && !this.closed) this.poll = setTimeout(() => void this.load(), ChatSession.POLL);
      if (r.running) { this.following = true; try { await this.api.chatAttach(this.thread, (e) => this.on(e), this.following$.signal); } finally { this.following = false; } await this.afterMove(); }
    } catch (e) { if (!this.closed) this.set({ error: errText(e), running: false, partial: null }); }   // let go: its stream was aborted
  }

  /** preset: the one picked on the home page (a message may be the preset alone) */
  async send(text: string, preset?: PresetChoice) {
    const t = text.trim();
    if ((!t && !preset) || this.state.running) return;
    this.set({ messages: [...this.state.messages, { role: 'user', text: t, time: new Date().toISOString(), ...(preset ? { preset } : {}) }], running: true, partial: { text: '', tools: [] }, error: '' });
    this.following = true;
    let failed: Error | null = null;
    try { await this.api.chatSend(this.thread, t, (e) => this.on(e), this.from, preset, getLang(), this.picksSources ? this.state.sources ?? [] : undefined); }
    catch (e) { failed = e as Error; }
    finally { this.following = false; }
    await this.afterMove();
    // the stream ended without its last event (the connection dropped, or the request failed): the server has the truth
    if (this.state.running) {
      this.set({ running: false, partial: null });
      await this.load();
      // refused (a reply already running there, the project gone): the thread has no such message, and the words were lost
      if (failed && !this.state.messages.some((m) => m.role === 'user' && m.text === t)) this.set({ error: errText(failed), unsent: t });
    }
  }

  /** the refused words, once: the chat box puts them back */
  takeUnsent(): string | undefined { const x = this.state.unsent; if (x !== undefined) this.set({ unsent: undefined }); return x; }

  /** the conversation went on in a new project's chat (server handOver): this thread now holds only a note */
  private moved = false;
  private async afterMove() { if (this.moved) { this.moved = false; await this.load(); } }

  private on(e: ChatEvent) {
    const p = this.state.partial ?? { text: '', tools: [] };
    if (e.type === 'text') { this.set({ partial: { ...p, text: p.text + e.delta } }); return; }
    if (e.type === 'tool') { this.set({ partial: { ...p, tools: [...p.tools, e.tool] } }); return; }
    const msg: ChatMessage = { role: 'assistant', text: e.text || p.text, time: new Date().toISOString(), tools: p.tools, status: e.status, ...(e.error ? { error: e.error } : {}),
      ...(e.code ? { code: e.code } : {}), ...(e.detail !== undefined ? { detail: e.detail } : {}), ...(e.usage ? { usage: e.usage } : {}) };
    this.set({ messages: [...this.state.messages, msg], running: false, partial: null, error: e.status === 'error' ? chatErrorText(e) : '' });
    if (e.moved) this.moved = true;
    if (this.closed) return;
    this.onTurnEnd?.();
    if (e.moved) this.onMoved?.(e.moved);
  }

  async stop() { if (this.state.running) await this.api.chatStop(this.thread).catch(() => {}); }

  /** whether this page can show the API menu */
  get picksSources() { return !!this.api.sources; }
  listSources() { return this.api.sources!(); }
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
