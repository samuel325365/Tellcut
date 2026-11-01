// The Agent's proposals (spec 2026-10-15-proposals-magnetic §3, §5), out of editor.ts (review 2026-10-17): a proposal from the
// chat is shown as a preview drawn on the undo history's project (not saved, not undoable), then accepted as one undo step and
// saved, or rejected; either way the outcome is reported to the server for the agent. While one waits, the editor's own edits
// are refused (blocked()).
import { runOps, summarize, type Project } from '@tellcut/engine';
import type { Proposal } from '@tellcut/protocol';
import type { Api } from '../api.ts';
import type { History } from '../history.ts';
import type { EditorState, Store } from '../store.ts';
import { errText, t as say } from '../i18n/index.ts';

/** what the editor needs of a proposal (the server sends the whole Proposal) */
export type ProposalView = Pick<Proposal, 'id' | 'label' | 'ops' | 'summary' | 'warnings'> & { status?: string };
/** All a proposal touches of the undo history: the project it is drawn on, a preview of it and the one recorded step. */
export type ProposalHistory = Pick<History, 'project' | 'preview' | 'apply'>;

export interface ProposalDeps {
  id: string;
  api: Pick<Api, 'proposalResult'>;
  store: Store<EditorState>;
  /** the undo history (null until the project opens) */
  history: () => ProposalHistory | null;
  /** shows a project in the store and the preview; commit = a recorded edit that must be saved (Editor.changed) */
  show: (p: Project, commit: boolean) => void;
  /** ends an audition and drops a live preview: a proposal is drawn on the real project */
  stopPreviews: () => void;
  /** waits for the autosave; false when the project could not be saved (true without one) */
  settle: () => Promise<boolean>;
  /** project.json changed outside this tab: saves are held */
  outside: () => void;
}

export class ProposalFlow {
  private prop: ProposalView | null = null;
  /** the proposal's preview: while it waits, the timeline and the player show this, not the project */
  private view: Project | null = null;
  private accepting = false;
  constructor(private c: ProposalDeps) {}
  private get s() { return this.c.store.get(); }
  private set(patch: Partial<EditorState>) { this.c.store.set(patch); }

  /** whether a proposal waits to be decided */
  get pending(): boolean { return !!this.prop; }

  /** A (re)opened project: whatever was shown is forgotten (the live stream's hello brings a waiting one back). */
  reset() { this.prop = null; this.view = null; this.set({ proposal: null }); }

  /** While a proposal waits, edits are refused (the preview shows the proposal, not the project). */
  blocked(): boolean {
    if (!this.prop) return false;
    this.set({ notice: say('ed.pending') });
    // whatever was being dragged goes back to the proposal's preview
    if (this.view && this.s.project !== this.view) { this.c.show(this.view, false); this.set({ canUndo: false, canRedo: false }); }
    return true;
  }

  /** The proposal messages of the live stream; false for any other message. */
  onLive(m: any): boolean {
    if (m?.type === 'hello' || m?.type === 'proposal') {
      // accepted somewhere else (another tab, the chat): this tab's project is no longer what is on disk
      if (!m.proposal && m.outcome === 'accepted' && this.prop && !this.accepting) this.c.outside();
      this.show(m.proposal ?? null);
    }
    else if (m?.type === 'accept-request') { if (m.id === this.prop?.id) void this.accept(); }
    else if (m?.type === 'reject-request') { if (m.id === this.prop?.id) void this.reject(); }
    else return false;
    return true;
  }

  private async report(id: string, outcome: 'accepted' | 'rejected' | 'stale', reason?: string) {
    try { await this.c.api.proposalResult?.(this.c.id, { id, outcome, ...(reason ? { reason } : {}) }); }
    catch { /* the server is gone: the chat side reports its own timeout */ }
  }

  /** Back to the project as it is, the proposal gone from the bar (notice: what to say instead). */
  private drop(h: ProposalHistory, notice?: string) {
    this.prop = null; this.view = null;
    this.set(notice === undefined ? { proposal: null } : { proposal: null, notice });
    this.c.show(h.project, false);
  }

  /** Shows a proposal as a preview: not saved, not in the history. One that no longer applies is reported stale. */
  show(p: ProposalView | null) {
    const h = this.c.history();
    if (!h) return;
    if (!p) {
      if (this.prop && !this.accepting) this.drop(h);
      return;
    }
    if (this.prop?.id === p.id) return;
    this.c.stopPreviews();
    let preview: Project;
    try { preview = h.preview((d) => runOps(d, p.ops)); }
    catch (e) {
      const why = (e as Error).message;
      this.set({ notice: say('ed.staleProposal', { why: errText(e) }) });
      void this.report(p.id, 'stale', why);
      return;
    }
    const sum = summarize(h.project, preview);
    this.prop = p;
    this.view = preview;
    this.set({ proposal: { id: p.id, label: p.label, summary: p.summary ?? sum.summary, lines: sum.lines, warnings: p.warnings ?? [], changed: sum.changed } });
    this.c.show(preview, false);
    this.set({ canUndo: false, canRedo: false });
  }

  /** One undo step, saved, then reported. Edits still waiting to be saved are saved first, so nothing is lost. */
  async accept(): Promise<boolean> {
    const p = this.prop;
    if (!p || !this.c.history() || this.accepting) return false;   // a second accept (click + chat) must not apply it twice
    this.accepting = true;
    try { return await this.acceptNow(p); } finally { this.accepting = false; }
  }
  private async acceptNow(p: ProposalView): Promise<boolean> {
    let h = this.c.history();
    if (!h) return false;
    if (this.s.diskChanged) {
      // the proposal was made from what is on disk, this editor shows another version: applying it here would be lost or wrong
      const why = say('ed.diskWhy');
      this.drop(h, say('ed.notAccepted', { why }));
      await this.report(p.id, 'stale', why);
      return false;
    }
    await this.c.settle();
    h = this.c.history();
    if (!h || this.prop?.id !== p.id) return false;
    let next: Project;
    try { next = h.apply((d) => runOps(d, p.ops)); }
    catch (e) {
      const why = (e as Error).message;
      this.drop(h, say('ed.staleProposal', { why: errText(e) }));
      await this.report(p.id, 'stale', why);
      return false;
    }
    this.prop = null; this.view = null;
    this.set({ proposal: null });
    this.c.show(next, true);
    this.set({ notice: say('ed.accepted', { label: p.label }) });
    if (!(await this.c.settle())) {
      // applied here but not on disk (a 409, the file locked, the server gone): the agent must not hear "accepted"
      const why = this.s.diskChanged ? say('ed.diskShort') : this.s.saveError;
      this.set({ notice: say('ed.acceptedUnsaved', { label: p.label, why }) });
      await this.report(p.id, 'stale', say('ed.unsavedWhy', { why }));
      return true;
    }
    await this.report(p.id, 'accepted');
    return true;
  }

  async reject() {
    const p = this.prop, h = this.c.history();
    if (!p || !h || this.accepting) return;
    this.drop(h);
    await this.report(p.id, 'rejected');
  }
}
