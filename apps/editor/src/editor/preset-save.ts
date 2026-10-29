// "Save as my preset" in the editor (spec 2026-10-29-my-library §3.5), out of editor.ts like the ask flow: the agent writes the
// film's draft (a chat task), the dialog opens on it once the turn is over, and saving sends what the user kept.
import type { Api } from '../api.ts';
import type { ChatSession } from '../chat.ts';
import type { Layout } from '../layout.ts';
import type { EditorState, Store } from '../store.ts';
import type { PresetDialogValue } from '../presets/SavePresetDialog.tsx';
import { errText, t as say } from '../i18n/index.ts';
import { getLang } from '../i18n/lang.ts';

/** the agent's draft as the server hands it: the points with their English lines, what the film used, its modules' block names */
export interface PresetDraftView { name: string; summary: string; points: Array<{ text: string; prompt: string }>; ratio?: string; length?: [number, number];
  theme?: { fonts?: Record<string, string>; palette?: Record<string, string> }; score?: string; fx?: string[]; blocks: Array<{ file: string; names: string[] }> }

export interface PresetSaveDeps { id: string; api: Pick<Api, 'presetDraft' | 'savePreset' | 'presetPoster' | 'projects'>; store: Store<EditorState>; chat: Pick<ChatSession, 'send' | 'state'>;
  setLayout: (patch: Partial<Layout>) => void; playhead: () => number }

const TOAST_MS = 8000;

export class PresetSaveFlow {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private c: PresetSaveDeps) {}
  private set(patch: Partial<EditorState['presetSave']>) { this.c.store.set((s) => ({ presetSave: { ...s.presetSave, ...patch } })); }
  private toast(text: string) {
    this.set({ toast: text });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.set({ toast: null }), TOAST_MS);
  }

  /** the chat writes the draft; the dialog opens on it when the turn is over (or says the agent wrote none) */
  async start() {
    if (this.c.chat.state.running) { this.toast(say('ed.askBusy')); return; }
    this.set({ drafting: true, draft: null });
    this.c.setLayout({ sideTab: 'chat', libClosed: false });
    try { await this.c.chat.send(say('preset.draftMsg'), undefined, { kind: 'preset-draft' }); } catch { /* the chat shows its own error */ }
    let draft: PresetDraftView | null = null;
    try { draft = await this.c.api.presetDraft(this.c.id) as PresetDraftView; } catch { /* none written */ }
    const poster = await this.c.api.projects().then((ps: any[]) => ps.find((p) => p.id === this.c.id)?.poster ?? null, () => null);
    this.set({ drafting: false, draft, poster: poster ? `/api/projects/${encodeURIComponent(this.c.id)}/media/still?source=${encodeURIComponent(poster.source)}&t=${poster.t}&w=270` : null });
    if (!draft) this.toast(say('preset.noDraft'));
  }
  close() { this.set({ draft: null }); }
  dismiss() { clearTimeout(this.timer); this.set({ toast: null }); }

  /** throws (worded) when the server refuses: the dialog stays open with the message */
  async save(v: PresetDialogValue) {
    try {
      const info = await this.c.api.savePreset({ from: 'project', project: this.c.id, name: v.name, summary: v.summary, points: v.points, include: v.include,
        ...(v.useFrame ? { posterAt: Math.round(this.c.playhead() * 100) / 100 } : {}), lang: getLang() });
      this.set({ draft: null });
      this.toast(say('preset.saved', { name: v.name || String(info.id) }));
    } catch (e) { throw new Error(errText(e)); }
  }
}
