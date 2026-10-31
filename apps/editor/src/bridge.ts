// Editor side of the player postMessage protocol (spec §2.3; the player sends 'boot' when it starts listening).
import type { CropSel, PlayerMsg, PlayerTexts } from '@tellcut/protocol';
import { t } from './i18n/index.ts';

export type { CropSel };
export type KeyMsg = Omit<Extract<PlayerMsg, { type: 'key' }>, 'type'>;
export type CropChangeMsg = Omit<Extract<PlayerMsg, { type: 'cropChange' }>, 'type'>;
export type TransformMsg = Omit<Extract<PlayerMsg, { type: 'transformChange' }>, 'type'>;
export type ParamEditMsg = Omit<Extract<PlayerMsg, { type: 'paramEdit' }>, 'type'>;

/** what the preview words by itself, in the page's language (sent each time the player starts) */
export const playerTexts = (): PlayerTexts => ({ textInPanel: t('ed.textInPanel') });

export class PlayerBridge {
  onReady: (duration: number) => void = () => {};
  /** the player (re)started: a reloaded iframe is not ready until it says so again */
  onBoot: () => void = () => {};
  onTime: (t: number) => void = () => {};
  onEnded: () => void = () => {};
  onError: (message: string) => void = () => {};
  /** a key pressed while the preview iframe has focus */
  onKey: (k: KeyMsg) => void = () => {};
  /** the crop-mode viewfinder moved (final = released) */
  onCropChange: (m: CropChangeMsg) => void = () => {};
  /** master output peak (dBFS) while playing */
  onLevel: (db: number) => void = () => {};
  /** the preview's tools: an item clicked, moved or scaled, or a text edited in place */
  onPick: (id: string | null) => void = () => {};
  onTransformChange: (m: TransformMsg) => void = () => {};
  onParamEdit: (m: ParamEditMsg) => void = () => {};
  private target: { postMessage(m: unknown, origin: string): void } | null = null;
  private booted = false;
  private ready = false;
  /** the newest project (loaded or patched): a re-booted player gets this one */
  private latest: unknown = null;
  private pending: unknown = null;
  private queued = false;
  constructor(private origin: string, private schedule: (f: () => void) => void = (f) => { requestAnimationFrame(() => f()); }) {}

  attach(win: { postMessage(m: unknown, origin: string): void }) { this.target = win; }

  handle(m: PlayerMsg) {
    if (m.type === 'boot') { this.booted = true; this.ready = false; this.onBoot(); this.post({ type: 'texts', texts: playerTexts() }); if (this.latest) { this.pending = null; this.post({ type: 'load', project: this.latest }); } }
    else if (m.type === 'ready') { this.ready = true; this.onReady(m.duration); this.flush(); }
    else if (m.type === 'time') this.onTime(m.t);
    else if (m.type === 'ended') this.onEnded();
    else if (m.type === 'key') this.onKey(m);
    else if (m.type === 'cropChange') this.onCropChange(m);
    else if (m.type === 'level') this.onLevel(m.db);
    else if (m.type === 'pick') this.onPick(m.itemId);
    else if (m.type === 'transformChange') this.onTransformChange(m);
    else if (m.type === 'paramEdit') this.onParamEdit(m);
    else if (m.type === 'error') this.onError(m.itemId ? `${m.itemId}: ${m.message}` : m.message);
  }

  load(p: unknown) {
    this.latest = p; this.pending = null; this.ready = false;
    if (this.booted) this.post({ type: 'load', project: p });
  }

  /** At most one patch per animation frame, always the newest project; held until the player is ready. */
  patch(p: unknown) {
    this.latest = p;
    this.pending = p;
    if (!this.ready || this.queued) return;
    this.queued = true;
    this.schedule(() => { this.queued = false; this.flush(); });
  }

  // a waiting patch goes first: the player would otherwise seek or play the project as it was before the last edit
  seek(t: number) { if (this.ready) { this.flush(); this.post({ type: 'seek', t }); } }
  play(from: number) { if (this.ready) { this.flush(); this.post({ type: 'play', from }); } }
  pause() { if (this.ready) this.post({ type: 'pause' }); }
  select(id: string | null) { if (this.ready) this.post({ type: 'select', itemId: id }); }
  quality(v: 'full' | 'draft') { if (this.ready) this.post({ type: 'quality', value: v }); }
  cropMode(sel: CropSel | null) { if (this.ready) this.post({ type: 'cropMode', sel }); }

  private flush() { if (this.ready && this.pending) { this.post({ type: 'patch', project: this.pending }); this.pending = null; } }
  private post(m: unknown) { this.target?.postMessage(m, this.origin); }
}
