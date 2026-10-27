// The export button and panel (spec §7.1), out of editor.ts (review B3): start an export of the saved project, follow it, list
// what is in exports/, and pick up an export that was still running when the page was reloaded.
import { ApiError, isTerminal, type Api } from '../api.ts';
import type { EditorState, Store } from '../store.ts';
import { t } from '../i18n/index.ts';

export class ExportTracker {
  private following = '';
  private starting = false;
  /** `settle`: wait for the autosave; false when the project could not be saved */
  constructor(private c: { id: string; api: Api; store: Store<EditorState>; settle: () => Promise<boolean> }) {}
  private get s() { return this.c.store.get(); }
  private set(patch: Partial<EditorState>) { this.c.store.set(patch); }

  /** Saves, then starts an export of the saved project and follows it (spec §7.1: the snapshot is what is on disk). */
  async start() {
    const cur = this.s.exportJob;
    // a second press while the first is still saving or starting only opens the panel
    if (this.starting || (cur && !isTerminal(cur.status))) { this.set({ exportOpen: true }); return; }
    this.starting = true;
    this.set({ exportOpen: true, exportError: '', exportJob: null });   // the previous result is gone once a new export starts
    let job;
    try {
      if (!(await this.c.settle())) { this.set({ exportError: this.s.diskChanged ? t('ed.exDisk') : t('ed.exSaveFail', { err: this.s.saveError }) }); return; }
      try { job = await this.c.api.exportStart(this.c.id); }
      catch (e) { this.set({ exportJob: null, exportError: t('ed.exStartFail', { err: (e as Error)?.message ?? String(e) }) }); return; }
    } finally { this.starting = false; }
    this.set({ exportJob: job });
    await this.follow(job.id);
  }

  /** Polls the job once a second until it ends (no long-lived connection, see api.waitJob). */
  private async follow(jobId: string, interval = 1000) {
    if (this.following === jobId) return;
    this.following = jobId;
    try {
      // a server that does not answer ten times running is gone: stop asking (the job list picks it up again after a reload)
      for (let misses = 0; ;) {
        await new Promise((r) => setTimeout(r, interval));
        let j;
        try { j = await this.c.api.job(jobId); misses = 0; }
        catch (e) {
          if (e instanceof ApiError && e.status === 404) { this.set({ exportJob: null, exportError: t('ed.exLost') }); return; }
          if (++misses >= 10) { this.set({ exportJob: null, exportError: t('ed.exOffline') }); return; }
          continue;
        }
        this.set({ exportJob: j });
        if (isTerminal(j.status)) { await this.load(); return; }
      }
    } finally { if (this.following === jobId) this.following = ''; }
  }

  cancel() {
    const j = this.s.exportJob;
    if (j && !isTerminal(j.status)) void this.c.api.cancelJob(j.id).catch(() => {});
  }

  async load() { try { this.set({ exports: await this.c.api.exports(this.c.id) }); } catch { /* history is optional */ } }
  toggle(open = !this.s.exportOpen) { this.set({ exportOpen: open }); if (open) void this.load(); }

  /** An export started before a reload keeps running on the server: show and follow it again. */
  async resume() {
    try {
      const j = (await this.c.api.jobs()).find((x) => x.kind === 'export' && x.project === this.c.id && !isTerminal(x.status));
      if (j) { this.set({ exportJob: j }); await this.follow(j.id); }
    } catch { /* no job list: nothing to resume */ }
  }
}
