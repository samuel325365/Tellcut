// spec §4.5 / §8: save 1 s after the last edit; on failure keep the edits, show the error and retry.
import type { SaveStatus } from './store.ts';
import { errText } from './i18n/index.ts';

export class Autosave {
  status: SaveStatus = 'saved';
  dirty = false;
  private latest: unknown;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving = false;
  constructor(private o: { save: (p: unknown) => Promise<unknown>; delay?: number; retry?: number; onStatus?: (s: SaveStatus, error?: string) => void }) {}

  private held = false;
  private dead = false;

  schedule(p: unknown) {
    if (this.dead) return;
    this.latest = p;
    this.dirty = true;
    this.setStatus('pending');
    if (!this.held) this.arm(this.o.delay ?? 1000);
  }

  /** Hold writes while the file on disk was changed outside (the user decides first); releasing writes what waited. */
  hold(on: boolean) {
    this.held = on;
    if (on) clearTimeout(this.timer);
    else if (this.dirty) void this.flush();
  }

  /** This editor session is over (a reload): nothing it still holds is ever written. */
  dispose() { this.dead = true; this.dirty = false; clearTimeout(this.timer); }

  private inflight: Promise<void> = Promise.resolve();

  /** Writes the pending edit now; while a write is running, resolves when that one ends. */
  flush(): Promise<void> {
    if (this.dead || this.held || this.saving || !this.dirty) return this.inflight;
    this.inflight = this.write();
    return this.inflight;
  }

  /** Saves everything now and waits until it is on disk (an export must see the latest edit, spec §7.1).
   *  false = it is not on disk: the save failed (the usual retry keeps running) or writes are held with an edit waiting. */
  async settle(): Promise<boolean> {
    clearTimeout(this.timer);
    while (!this.dead && !this.held && (this.saving || this.dirty)) {
      await this.flush();
      if (this.status === 'error') return false;
    }
    return !(this.held && this.dirty);
  }

  private async write(): Promise<void> {
    this.saving = true;
    this.dirty = false;
    const p = this.latest;
    this.setStatus('saving');
    try {
      await this.o.save(p);
      this.saving = false;
      if (this.dirty) { this.setStatus('pending'); if (!this.held && !this.dead) this.arm(this.o.delay ?? 1000); } else this.setStatus('saved');
    } catch (e) {
      this.saving = false;
      this.dirty = true;
      this.setStatus('error', errText(e));
      if (!this.dead) this.arm(this.o.retry ?? 3000);
    }
  }

  private arm(ms: number) { clearTimeout(this.timer); this.timer = setTimeout(() => void this.flush(), ms); }
  private setStatus(s: SaveStatus, error?: string) { this.status = s; this.o.onStatus?.(s, error); }
}
