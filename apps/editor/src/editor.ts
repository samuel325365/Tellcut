// The editor controller: project + history + autosave + preview bridge + UI state.
import { addCropKey, addItem, addTrack, allItems, removeCropKey, type CropWhich, CommandError, type TrackKind, parseProject, resolveTimes, setCrop, setTrack as setTrackCmd, setTransform as setTransformCmd, updateItem, type Project, type Registry, type Transform } from '@tellcut/engine';
import { captionPlan } from '@tellcut/plugin-common/speech';
import { zoomAround } from './timeline/geometry.ts';
import { keyAction, type Action } from './keys.ts';
import { ChatSession } from './chat.ts';
import type { FsApi } from './ImportDialog.tsx';
import type { LiveEvent } from '@tellcut/protocol';
import type { DragStart, Mods } from './timeline/drag.ts';
import { materialOf, planAudition, type Material } from './audition.ts';
import { FIT_MIN_PPS, MAX_PPS, MIN_PPS, maxScroll } from './timeline/geometry.ts';
import { ApiError, type Api } from './api.ts';
import { Autosave } from './autosave.ts';
import { History } from './history.ts';
import { arrangementOf, nextArrange, orientationOf, previewWOf, sanitizeLayout, sizePatch, WIDEST_PREVIEW, type Layout } from './layout.ts';
import { createStore, initialState, type EditorState, type Store } from './store.ts';
import type { PlayerBridge } from './bridge.ts';
import { ExportTracker } from './editor/exports.ts';
import { analyzeProject } from './editor/analysis.ts';
import { applyCaptionTemplate, captionLook, captionLookParams, setCaptionTemplate, useMyCaptionTemplate } from './editor/captions.ts';
import { templateOf } from '@tellcut/plugin-common/templates';
import { titleTemplateOf } from '@tellcut/plugin-common/title-templates';
import type { TemplateKind } from '@tellcut/protocol';
import { importMedia } from './editor/importing.ts';
import { AskFlow } from './editor/ask-flow.ts';
import { LibraryFlow } from './editor/library.ts';
import { PresetSaveFlow } from './editor/preset-save.ts';
import { ProposalFlow, type ProposalView } from './editor/proposals.ts';
import { musicLength, TimelineEditing, type LibPick } from './editor/editing.ts';
import type { DropTarget } from './timeline/drop.ts';
import { errCoded, errText, t as say } from './i18n/index.ts';
import { paramText } from './i18n/params.ts';

type Recipe = (d: Project) => void;
export type { ProposalView } from './editor/proposals.ts';
/** Actions that only change the view: an audition goes on through them. */
const AUDITION_PASS = new Set<Action>(['maxPreview', 'zoomFit', 'help']);
type BridgeLike = Pick<PlayerBridge, 'load' | 'patch' | 'seek' | 'play' | 'pause' | 'cropMode' | 'quality' | 'select'> & Partial<Pick<PlayerBridge, 'onBoot' | 'onReady' | 'onTime' | 'onEnded' | 'onError' | 'onKey' | 'onCropChange' | 'onLevel' | 'onPick' | 'onTransformChange' | 'onParamEdit'>>;

export class Editor {
  store: Store<EditorState>;
  history: History | null = null;
  private autosave: Autosave | null = null;
  /** this project's chat (spec 2026-10-16-in-editor-chat §2.2) */
  chat: ChatSession;
  /** the folder browser behind the chat's ＋ (absent with a test api that has none) */
  readonly fs: FsApi | undefined;

  constructor(public id: string, private deps: { api: Api; bridge: BridgeLike; registry?: Registry; /** the registry for a project, with its own fx (absent: `registry` as is) */ registryFor?: (p: Project) => Promise<Registry>; storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void }; clipboard?: { writeText(t: string): Promise<void> } }) {
    this.store = createStore(initialState(id));
    this.reg = deps.registry;
    this.chat = new ChatSession(id, deps.api as any);
    this.fs = typeof (deps.api as any).fsList === 'function' ? deps.api as unknown as FsApi : undefined;
    try { if (this.storage?.getItem('tellcut.quality') === 'draft') this.store.set({ quality: 'draft' }); } catch { /* storage blocked */ }
    try {
      const saved = JSON.parse(this.storage?.getItem('tellcut.layout') ?? 'null');
      // sizes and toggles come back; the transient bits (large preview, side tab) always start fresh
      if (saved) this.store.set({ layout: sanitizeLayout(saved) });
    } catch { /* storage blocked or garbled */ }
    const b = deps.bridge;
    // a preview that restarts (the Layout button moves its iframe, which reloads it) is not ready until it says so; Play pressed
    // meanwhile never reached it, so a ready player goes on playing if the editor is playing
    b.onBoot = () => this.set({ playerReady: false });
    b.onReady = () => {
      this.set({ playerReady: true }); b.seek(this.s.playhead); b.quality(this.s.quality); if (this.s.crop) b.cropMode(this.s.crop); b.select(this.s.selection.length === 1 ? this.s.selection[0] : null);
      if (this.s.playing) b.play(this.s.playhead);
    };
    b.onPick = (id) => { if (!id || !this.isLocked(id)) this.select(id ? [id] : []); };
    // dragging on the preview: live while moving, one undo step on release (like crop mode)
    b.onTransformChange = (m) => {
      if (this.isLocked(m.itemId)) { if (m.final) this.set({ notice: say('ed.lockedNotice') }); return; }
      const recipe = (d: Project) => setTransformCmd(d, { id: m.itemId, transform: m.transform });
      // the release is the drag's step: what it previewed is done with (a later commitLive brought an undone drag back)
      if (m.final) { this.live = null; this.apply(recipe); } else this.livePreview(recipe);
    };
    b.onParamEdit = (m) => { if (this.isLocked(m.itemId)) { this.set({ notice: say('ed.lockedNotice') }); return; } this.updateParam(m.itemId, m.key, m.value); };
    b.onTime = (t) => {
      if (this.stale(t)) return;
      this.set({ playhead: t });
      this.auditionTime(t);
      // loop: back to the start of the range when the playhead reaches its end (an audition is never looped)
      if (this.s.loop && this.s.playing && !this.aud) { const r = this.loopRange(); if (t >= r.end - 1e-3) { this.lastT = null; this.seekTo(r.start); return; } }   // lastT: the view comes back with it
      this.follow(t);
    };
    b.onEnded = () => {
      this.set({ playing: false });
      if (this.aud) { this.endAudition(); return; }
      if (this.s.loop) { this.seekTo(this.loopRange().start); this.start(); }
    };
    b.onError = (m) => this.set({ playerError: m });
    // the selection and the playhead reach the server for Claude, 300 ms after they settle (spec 2026-10-15-proposals-magnetic §5)
    this.store.subscribe(() => this.queueState());
    b.onLevel = (db) => this.set({ level: db });
    b.onKey = (k) => { const a = keyAction(k); if (a) this.run(a); };
    // crop mode: live drags preview, the release is one undo step
    b.onCropChange = (m) => {
      if (!this.s.crop || m.itemId !== this.s.crop.itemId || !this.history || this.blocked()) return;
      const recipe = (d: Project) => setCrop(d, { id: m.itemId, which: m.which, crop: m.crop });
      if (m.final) this.apply(recipe);
      else this.changed(this.history.preview(recipe), false);
    };
  }

  private get s() { return this.store.get(); }
  private reg: Registry | undefined;
  get registry() { return this.reg; }
  /** the meta.fx the registry was last built for (registryFor), and a count that lets only the newest build land */
  private regFx = '';
  private regTurn = 0;
  /** The registry for a project with its own fx; false when a newer build was asked for meanwhile (this one is dropped). */
  private async loadRegistry(p: Project): Promise<boolean> {
    if (!this.deps.registryFor) return true;
    const turn = ++this.regTurn, key = fxKey(p);
    this.regFx = key;
    const reg = await this.deps.registryFor(p);
    if (turn !== this.regTurn) return false;
    this.reg = reg;
    return true;
  }
  /** An undo, redo or proposal that changes meta.fx (an added block of My blocks undone, say) builds the registry again: one that
   *  kept the module would list the block as the project's own, and a later add would skip copying it into meta.fx. */
  private async followFx(p: Project) {
    if (await this.loadRegistry(p)) this.set({});   // the panels read the registry: show them again
  }
  private get storage() { try { return this.deps.storage ?? globalThis.localStorage; } catch { return undefined; } }
  /** Panel sizes and toggles; the lasting ones are remembered in this browser. */
  setLayout(patch: Partial<Layout>) {
    const layout = { ...this.s.layout, ...patch };
    this.set({ layout });
    const { split, previewW, libClosed, propsClosed, trackSize, snap, sideW, arrange } = layout;
    try { this.storage?.setItem('tellcut.layout', JSON.stringify({ split, previewW, libClosed, propsClosed, trackSize, snap, sideW, arrange })); } catch { /* not remembered */ }
  }

  /** The Layout button and Ctrl+\: Auto → Stacked → Side for this project's orientation only. */
  cycleLayout() {
    const p = this.s.project;
    if (!p) return;
    const o = orientationOf(p.meta), a = this.s.layout.arrange;
    this.setLayout({ arrange: { ...a, [o]: nextArrange(a[o]) }, maxPreview: false });
  }

  setQuality(v: 'full' | 'draft') {
    this.set({ quality: v });
    try { this.storage?.setItem('tellcut.quality', v); } catch { /* private mode: not remembered */ }
    this.deps.bridge.quality(v);
  }
  private set(patch: Partial<EditorState>) { this.store.set(patch); }

  /** A project whose footage is not on this PC (a sample handed over without its sources) says so once it opens. */
  private async missingNotice() {
    const list = (this.deps.api as any).projects as (() => Promise<Array<{ id: string; missing?: number }>>) | undefined;
    if (typeof list !== 'function') return;   // test fakes without a project list
    const n = (await list().catch(() => []))?.find((r) => r.id === this.id)?.missing;
    if (n && !this.store.get().notice) this.set({ notice: say('ed.missingSources', { n }) });
  }

  async open() {
    try {
      // My blocks are fetched with the project and in the store before it shows: an answer landing later re-rendered the panels
      // and reset a number the user was typing (Preact writes a controlled input's value on every render)
      const lib = typeof (this.deps.api as any).library === 'function' ? this.library.load() : Promise.resolve();   // test fakes without the library
      const p = parseProject(await this.deps.api.project(this.id));
      await this.loadRegistry(p);
      this.fitted = false;
      // an audition or crop mode of the version before a reload has nothing to end on in the new one: its banner would stay
      this.aud = null;
      this.set({ audition: null });
      this.exitCrop();
      this.history = new History(p);
      this.autosave?.dispose();   // a reload: the previous session's unsaved edit must not be written over the reloaded project
      // a 409: another tab or Claude wrote a newer version first; this one's edits wait like after any outside change
      this.autosave = new Autosave({ save: async (x) => { try { await this.deps.api.save(this.id, x); } catch (e) { if (e instanceof ApiError && e.status === 409) this.outside(); throw e; } }, onStatus: (save, err) => { this.set({ save, saveError: err ?? '' }); if (save === 'saved') this.analyzeWaiting(); } });
      this.waitingAnalysis = [];   // a reload analyses everything
      await lib;
      this.set({ project: p, error: null, pps: Math.max(5, Math.min(400, (innerWidthSafe() - 160) / p.meta.duration)), scroll: 0 });
      try {
        const saved = JSON.parse(this.storage?.getItem(this.collapseKey) ?? '[]');
        this.set({ collapsed: Array.isArray(saved) ? saved.filter((x) => p.tracks.some((t) => t.id === x)) : [] });
      } catch { this.set({ collapsed: [] }); }
      try {
        const locked = JSON.parse(this.storage?.getItem(this.lockKey) ?? '[]');
        this.set({ locked: Array.isArray(locked) ? locked.filter((x) => p.tracks.some((t) => t.id === x)) : [] });
      } catch { this.set({ locked: [] }); }
      this.deps.bridge.load(p);
      this.proposals.reset();
      this.set({ diskChanged: false });
      this.offLive?.();
      this.offLive = this.deps.api.events?.(this.id, (m) => this.onLive(m)) ?? null;
      void this.analyze();
      void this.missingNotice();
      if (typeof (this.deps.api as any).chat === 'function') void this.chat.load();   // test fakes without chat
      void this.loadExports();
      void this.resumeExport();
    } catch (e) {
      // one with a code (a project from a newer Tellcut) is worded in the page's language; its issue line says the same in Chinese
      const issues: string[] = errCoded(e) ? [] : e instanceof ApiError ? e.issues : (e as any)?.issues ?? [];
      const err = { message: errText(e), issues };
      this.set({ error: err, history: await this.deps.api.history(this.id).catch(() => []) });
    }
  }

  /** Writes a history version over project.json (the user chose it: whatever is on disk now, broken outside, is not
   *  compared with the version this page last held) and opens it. A failure is shown on the error page. */
  async restore(name: string): Promise<boolean> {
    this.set({ restoreError: '' });
    try {
      const p = await this.deps.api.historyVersion(this.id, name);
      this.deps.api.forgetVersion?.(this.id);
      await this.deps.api.save(this.id, p);
    } catch (e) { this.set({ restoreError: say('ed.restoreFailed', { why: errText(e) }) }); return false; }
    await this.open();
    return true;
  }

  /** One undoable edit. Returns false when the command refused (out of range, wrong item kind, …). */
  apply(recipe: Recipe): boolean {
    this.endAudition();   // an edit goes to the real project, not to the audition's
    if (!this.history || this.blocked()) return false;
    const before = this.history.project;
    try {
      const next = this.history.apply(recipe);
      if (next === before) { this.set({ notice: '' }); return false; }   // nothing changed (the value is fine): no save, no history entry
      this.changed(next, true);
      this.set({ notice: '' });
      return true;
    } catch (e) {
      if (e instanceof CommandError) { this.set({ notice: errText(e) }); return false; }
      throw e;
    }
  }

  /** A validated field edit from the properties panel. */
  update(id: string, patch: Record<string, unknown>) { return this.apply((d) => updateItem(d, { id, patch })); }
  /** One plugin parameter: the whole params object is replaced (old values plus the new one). */
  updateParam(id: string, key: string, value: unknown) {
    const p = this.s.project;
    const it = p && (allItems(p).find((x) => x.item.id === id)?.item as any);
    if (!it) return false;
    const t = allItems(p!).find((x) => x.item.id === id)!.track;
    const def = (t.kind === 'sfx' ? this.registry?.sfx(it.type) : this.registry?.item(it.type))?.params.find((d) => d.key === key);
    // an emptied field (undefined) puts the default back
    if (value === undefined) { const params = { ...it.params }; delete params[key]; return this.update(id, { params }); }
    if (def?.type === 'number' && (typeof value !== 'number' || (def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max))) {
      this.set({ notice: say('ed.numRange', { label: paramText(it.type, key, def.label, 'en').name, min: def.min ?? '−∞', max: def.max ?? '∞' }) }); return false;
    }
    if (def?.type === 'enum' && !def.options.includes(value as string)) { this.set({ notice: say('ed.enumOnly', { label: paramText(it.type, key, def.label, 'en').name, options: def.options.join(say('ed.listSep')) }) }); return false; }
    return this.update(id, { params: { ...it.params, [key]: value } });
  }
  /** Position and size of a scene/overlay item (panel fields, preview handles). */
  setTransform(id: string, t: Transform | null) { return this.apply((d) => setTransformCmd(d, { id, transform: t })); }

  /** Track bus: mute (visual = hidden), solo, gain (spec §4.4). */
  setTrack(id: string, patch: { gain?: number; muted?: boolean; solo?: boolean }) { return this.apply((d) => setTrackCmd(d, { id, patch })); }
  private get collapseKey() { return `tellcut.collapsed.${this.id}`; }
  private get lockKey() { return `tellcut.locked.${this.id}`; }
  /** Locks or unlocks a track against the user's own edits (spec 2026-10-28-timeline-refresh A3); what was selected on it is let go. */
  toggleLock(id: string) {
    const cur = new Set(this.s.locked), on = !cur.has(id);
    if (on) cur.add(id); else cur.delete(id);
    this.setLocked([...cur]);
    if (on) { const p = this.s.project, tr = p?.tracks.find((t) => t.id === id), own = new Set(((tr?.items ?? []) as any[]).map((i) => i.id)); if (this.s.selection.some((x) => own.has(x))) this.select(this.s.selection.filter((x) => !own.has(x))); }
  }
  private setLocked(ids: string[]) {
    this.set({ locked: ids });
    try { this.storage?.setItem(this.lockKey, JSON.stringify(ids)); } catch { /* not remembered */ }
  }
  /** whether the item sits on a locked track */
  isLocked(itemId: string): boolean {
    const p = this.s.project;
    if (!p || !this.s.locked.length) return false;
    const tr = p.tracks.find((t) => (t.items as any[]).some((i) => i.id === itemId));
    return !!tr && this.s.locked.includes(tr.id);
  }
  /** a press on a clip of a locked track: it takes none, so say why (as on the preview) */
  tellLocked() { this.set({ notice: say('ed.lockedNotice') }); }
  /** A thin row for a track; sameKind (Shift): every track of its kind, opened if any of them is collapsed. Remembered per project. */
  toggleCollapse(id: string, sameKind = false) {
    const p = this.s.project, t = p?.tracks.find((x) => x.id === id);
    if (!p || !t) return;
    const ids = sameKind ? p.tracks.filter((x) => x.kind === t.kind).map((x) => x.id) : [id];
    const cur = new Set(this.s.collapsed), close = sameKind ? !ids.some((x) => cur.has(x)) : !cur.has(id);
    for (const x of ids) if (close) cur.add(x); else cur.delete(x);
    this.setCollapsed([...cur]);
  }
  private setCollapsed(ids: string[]) {
    this.set({ collapsed: ids });
    try { this.storage?.setItem(this.collapseKey, JSON.stringify(ids)); } catch { /* not remembered */ }
  }

  // ---------------------------------------------------------------- timeline edits and the selection (editor/editing.ts)
  private editFlow: TimelineEditing | undefined;
  private get editing() {
    return (this.editFlow ??= new TimelineEditing({ id: this.id, store: this.store, bridge: this.deps.bridge, history: () => this.history, registry: () => this.reg,
      apply: (r) => this.apply(r), changed: (p, commit) => this.changed(p, commit), livePreview: (r) => this.livePreview(r), seek: (t) => this.seek(t),
      endAudition: () => this.endAudition(), blocked: () => this.blocked(), pending: () => this.proposals.pending, isLocked: (id) => this.isLocked(id), checkCrop: () => this.checkCrop() }));
  }
  /** Click on a same-track overlap (spec 2026-10-14 §5.1–5.2); `id` is the later item B. */
  overlapClick(id: string): boolean { return this.editing.overlapClick(id); }
  /** Dragging a transition block's right edge: a live preview; the drag's release calls commitLive (one undo step). */
  previewTransitionDur(id: string, dur: number) { this.editing.previewTransitionDur(id, dur); }
  /** Track order inside its group, deleting a track with its items, a new empty track (all undoable). */
  moveTrack(id: string, to: number) { return this.editing.moveTrack(id, to); }
  removeTrack(id: string) { return this.editing.removeTrack(id); }
  addTrackOf(kind: TrackKind) { return this.editing.addTrackOf(kind); }
  /** One layer up or down past the nearest overlapping item of the same track. */
  restack(id: string, dir: 'up' | 'down') { return this.editing.restack(id, dir); }
  /** M and S buttons: against the real track, whatever the preview plays */
  toggleTrack(id: string, key: 'muted' | 'solo') { return this.editing.toggleTrack(id, key); }
  /** Q / W: cut the clips at the playhead from their start (left) or to their end (right), one undo step. */
  deleteSide(side: 'left' | 'right'): boolean { return this.editing.deleteSide(side); }
  /** ↑ / ↓: the previous / next clip edge on any track. */
  jumpCut(dir: -1 | 1) { this.editing.jumpCut(dir); }
  stepFrames(n: number) { this.step(n); }
  /** Ctrl+C / Ctrl+V / Ctrl+D / Ctrl+A / M */
  copy(): boolean { return this.editing.copy(); }
  paste(): boolean { return this.editing.paste(); }
  duplicate(): boolean { return this.editing.duplicate(); }
  selectAll() { this.editing.selectAll(); }
  toggleItemMute(): boolean { return this.editing.toggleItemMute(); }
  /** The 磁 button (spec 2026-10-15-proposals-magnetic §4.1): closing gaps asks first; off just clears the flag. */
  toggleMagnetic(id: string, ask: (msg: string) => boolean = (m) => globalThis.confirm(m)): boolean { return this.editing.toggleMagnetic(id, ask); }
  /** 解除掛勾: the item stays where it is in time and no longer moves with its clip. */
  detach(id: string) { return this.editing.detach(id); }
  beginDrag(start: DragStart) { this.editing.beginDrag(start); }
  /** dx in pixels from the drag start; previews live, never recorded until endDrag. */
  dragTo(dx: number, mods: Mods, toTrack?: string) { this.editing.dragTo(dx, mods, toTrack); }
  endDrag() { this.editing.endDrag(); }
  /** set by the timeline while it is shown: where a drag over it would drop (timeline/Timeline.tsx) */
  dropProbe: ((clientX: number, clientY: number) => DropTarget) | null = null;
  /** A library card dragged onto the timeline (spec 2026-11-10-media-panel-visual §5): false when edits are refused now */
  beginLibDrag(src: Material | { lib: LibPick }): boolean { return this.editing.beginLibDrag(src); }
  libDragTo(at: DropTarget, mods: Mods) { this.editing.libDragTo(at, mods); }
  /** the release (commit) or Esc: true when something was added (a block of My blocks is copied in first, after this returns) */
  endLibDrag(commit: boolean): boolean {
    const r = this.editing.endLibDrag(commit);
    if (typeof r === 'boolean') return r;
    void this.useLibraryBlock(r.lib.slug, r.lib.type, r.at);
    return true;
  }
  /** The library's adds at the playhead, and its "replace" */
  addClip(source: string, from: number, len: number) { return this.editing.addClip(source, from, len); }
  addMusic(media: string) { return this.editing.addMusic(media); }
  /** `params`: values set in the gallery (only the sound's or block's own keys are kept) */
  addSfx(type: string, params?: Record<string, unknown>) { return this.editing.addSfx(type, params); }
  addOverlay(type: string, params?: Record<string, unknown>) { return this.editing.addOverlay(type, params); }
  replaceBlock(id: string, type: string): boolean { return this.editing.replaceBlock(id, type); }
  select(ids: string[], o: { reveal?: boolean } = {}) { this.editing.select(ids, o); }

  /** Ctrl+= / Ctrl+-: zoom the timeline around the playhead when it is in view, else around the middle (like the slider). */
  zoomBy(factor: number) {
    const v = { pps: this.s.pps, scroll: this.s.scroll }, ph = (this.s.playhead - v.scroll) * v.pps, w = this.laneW > 0 ? this.laneW : 1000;
    this.setView(zoomAround(v, factor, ph >= 0 && ph <= w ? ph : w / 2));
  }

  /** Crop mode (spec §4.3) on the one selected video clip. */
  enterCrop(which: CropWhich) {
    this.endAudition();
    const p = this.s.project, id = this.s.selection.length === 1 ? this.s.selection[0] : null;
    const isVideo = !!p && !!id && p.tracks.some((t) => t.kind === 'video' && t.items.some((i) => i.id === id));
    if (!isVideo) { this.exitCrop(); return; }
    this.pause();
    // a keyframe is followed by its time: its index shifts when keys are added or removed before it
    const key = typeof which === 'number' ? (allItems(p!).find((x) => x.item.id === id)!.item as any).crop?.keys?.[which] : undefined;
    this.set({ crop: { itemId: id!, which, ...(key ? { t: key.t } : {}) } });
    this.deps.bridge.cropMode({ itemId: id!, which });
  }
  exitCrop() { if (!this.s.crop) return; this.set({ crop: null }); this.deps.bridge.cropMode(null); }

  /** A crop keyframe at the playhead on the one selected clip, then crop mode on it. */
  addCropKey(): boolean {
    const p = this.s.project, id = this.s.selection.length === 1 ? this.s.selection[0] : null;
    const f = p && id ? allItems(p).find((x) => x.item.id === id && x.track.kind === 'video') : undefined;
    if (!f) return false;
    let index = -1;
    const ok = this.apply((d) => { index = addCropKey(d, { id: id!, t: this.s.playhead - resolveTimes(p!).get(id!)!.start }); });
    if (ok) this.enterCrop(index);
    return ok;
  }
  /** Deletes a crop keyframe of the one selected clip (crop mode on it ends first). */
  removeCropKey(index: number): boolean {
    const id = this.s.selection.length === 1 ? this.s.selection[0] : null;
    if (!id) return false;
    const c = this.s.crop;
    // indexes after the deleted one shift: crop mode on any keyframe of this clip ends rather than jump to another
    if (c && c.itemId === id && typeof c.which === 'number') this.exitCrop();
    return this.apply((d) => removeCropKey(d, { id, index }));
  }
  /** Leaves crop mode when its clip is gone or no longer the only selection. */
  private checkCrop() {
    const c = this.s.crop, sel = this.s.selection;
    const clip = c && this.s.project ? allItems(this.s.project).find((x) => x.item.id === c.itemId)?.item as any : undefined;
    if (c && (sel.length !== 1 || sel[0] !== c.itemId || !clip)) { this.exitCrop(); return; }
    if (c && typeof c.which === 'number') {
      // the keyframe in crop mode, found again by its time: gone (undo, deleted) → leave; moved → follow it
      const i = (clip.crop?.keys ?? []).findIndex((k: { t: number }) => c.t != null && Math.abs(k.t - c.t) < 1e-6);
      if (i < 0) this.exitCrop();
      else if (i !== c.which) { this.set({ crop: { ...c, which: i } }); this.deps.bridge.cropMode({ itemId: c.itemId, which: i }); }
    }
  }

  undo() { this.endAudition(); if (this.blocked()) return; const p = this.history?.undo(); if (p) this.changed(p, true); }
  redo() { this.endAudition(); if (this.blocked()) return; const p = this.history?.redo(); if (p) this.changed(p, true); }

  // ---------------------------------------------------------------- the live stream and the Agent's proposals (spec 2026-10-15-proposals-magnetic §3, §5; editor/proposals.ts)
  private offLive: (() => void) | null = null;
  private stateTimer: ReturnType<typeof setTimeout> | undefined;
  private sentState = '';

  private propFlow: ProposalFlow | undefined;
  private get proposals() {
    return (this.propFlow ??= new ProposalFlow({ id: this.id, api: this.deps.api, store: this.store, history: () => this.history,
      show: (p, commit) => this.changed(p, commit), stopPreviews: () => { this.endAudition(); this.live = null; },
      settle: async () => !this.autosave || await this.autosave.settle(), outside: () => this.outside() }));
  }
  /** While a proposal waits, edits are refused (the preview shows the proposal, not the project). */
  private blocked(): boolean { return this.proposals.blocked(); }
  private onLive(m: LiveEvent) {
    if (this.proposals.onLive(m)) return;
    // a save of this page's own (the server leaves it out; a stream opened again by a reload could still hear it)
    if (m?.type === 'changed-on-disk') { if (!m.by || m.by !== this.deps.api.clientId) this.outside(); }
    // `fx` (the server's stamp of the fx folder): one this tab has already loaded (its own Update) is not loaded twice
    else if (m?.type === 'fx-changed') { if (!m.fx || m.fx !== this.fxLoaded) void this.reloadFx(m.fx); }
  }
  /** the fx folder's stamp this tab last loaded, when the server gave one */
  private fxLoaded: string | undefined;
  /** A project fx module was edited (project.json the same): the preview loads it again and stays where it was. `fx`: the folder's
   *  stamp it is loading */
  private async reloadFx(fx?: string) {
    const p = this.s.project;
    if (!p) return;
    this.fxLoaded = fx;
    await this.loadRegistry(p);
    this.deps.bridge.load(p);
    if (typeof (this.deps.api as any).projectLibrary === 'function') void this.library.loadProject();   // a module saved or edited: its star may change
  }
  /** project.json changed outside: hold saves until the user reloads or chooses to keep this version (忽略). */
  private outside() {
    this.set({ diskChanged: true });
    this.autosave?.hold(true);
  }
  /** Shows a proposal as a preview: not saved, not in the history. One that no longer applies is reported stale. */
  showProposal(p: ProposalView | null) { this.proposals.show(p); }
  /** One undo step, saved, then reported. Edits still waiting to be saved are saved first, so nothing is lost. */
  acceptProposal(): Promise<boolean> { return this.proposals.accept(); }
  rejectProposal(): Promise<void> { return this.proposals.reject(); }
  // ---------------------------------------------------------------- My blocks (spec 2026-10-29-my-library §3.2, §3.3; editor/library.ts)
  private libraryFlow: LibraryFlow | undefined;
  get library() {
    return (this.libraryFlow ??= new LibraryFlow({ id: this.id, api: this.deps.api, store: this.store, chat: this.chat, setLayout: (patch) => this.setLayout(patch) }));
  }
  /** ☆ on one of this project's blocks: the dialog starts from its name, description and category */
  openSaveBlock(type: string) {
    const def = this.registry?.item(type);
    if (!def) return;
    void this.library.openBlock(type, { name: def.label, desc: def.doc ?? '', category: def.category });
  }
  openSaveStyle(id: string, label: string) { this.library.openStyle(id, label); }
  /** A block of My blocks at the playhead: the entry is copied into the project (fx/lib/<slug>/), its module joins meta.fx in the
   *  same edit as the item (one undo step), and the preview loads it. Nothing is copied when the item would not fit (playhead at
   *  the end); a copy whose add is undone stays on disk (a redo may want it again) but is no link while meta.fx does not name it
   *  (liveLinks); the server's start removes it once nothing in the project names it (media-node pruneCopies). */
  async useLibraryBlock(slug: string, type: string, at?: { track: string | null; start: number; end: number }): Promise<boolean> {
    const p = this.s.project, t = at?.start ?? this.s.playhead;
    if (!p || this.blocked() || (!at && this.editing.fitEnd('overlay', t, t + 2) === null)) return false;
    let file: string, stamp: string | undefined;
    try { ({ file, fx: stamp } = await this.library.use(slug)); }
    catch (e) { this.set({ notice: say('lib.addFailed', { err: errText(e) }) }); return false; }
    const now = this.s.project!, fx = [...new Set([...(now.meta.fx ?? []), file])];
    await this.loadRegistry({ ...now, meta: { ...now.meta, fx } });
    // a background or frame goes under the video: it only replaces one already there (the library and gallery refuse it first)
    if (this.reg?.item(type)?.kind === 'scene') { void this.followFx(this.s.project!); this.set({ notice: say('ed.sceneAdd') }); return false; }
    // dropped on the timeline: at the place the drop planned; else at the playhead
    const item = { kind: 'overlay' as const, item: { type, start: t, end: t + 2, params: {} }, also: (d: Project) => { d.meta.fx = [...new Set([...(d.meta.fx ?? []), file])]; } };
    const ok = at ? this.editing.addPlaced({ ok: true, ...at }, item)
      : this.editing.addTo('overlay', item.item, item.also);
    if (ok) { this.deps.bridge.load(this.s.project!); this.fxLoaded = stamp; }   // a module the preview has not loaded yet; the copy's fx-changed is then skipped
    else if (this.s.project) void this.followFx(this.s.project);   // not added: the registry goes back to what meta.fx loads
    return ok;
  }
  /** "Update": the newer version of an entry over this project's copy; the timeline stays as it is */
  async updateLibraryBlock(slug: string) {
    let fx: string | undefined;
    try { fx = (await this.library.use(slug)).fx; } catch (e) { this.set({ notice: say('lib.addFailed', { err: errText(e) }) }); return; }
    // loaded here whatever the folder watcher does (it may be down); its fx-changed for the same stamp is then skipped, and when that
    // event came first, this one is
    if (!fx || fx !== this.fxLoaded) await this.reloadFx(fx);
  }

  // ---------------------------------------------------------------- Save as my preset (spec 2026-10-29-my-library §3.5; editor/preset-save.ts)
  private presetFlow: PresetSaveFlow | undefined;
  get presetSave() {
    return (this.presetFlow ??= new PresetSaveFlow({ id: this.id, api: this.deps.api, store: this.store, chat: this.chat, setLayout: (patch) => this.setLayout(patch), playhead: () => this.s.playhead }));
  }

  // ---------------------------------------------------------------- Ask Agent… (spec 2026-10-16-right-click-claude §2; editor/ask-flow.ts)
  private askFlow: AskFlow | undefined;
  private get ask() {
    return (this.askFlow ??= new AskFlow({ id: this.id, api: this.deps.api, store: this.store, chat: this.chat, clipboard: this.deps.clipboard,
      settle: async () => this.autosave?.settle(), select: (ids) => this.select(ids, { reveal: false }), setLayout: (patch) => this.setLayout(patch) }));
  }
  /** Right-click "Ask Agent…": on an item outside the selection it becomes the selection; empty space = the playhead. */
  openAsk(itemId?: string) { this.ask.open(itemId); }
  closeAsk() { this.ask.close(); }
  /** 「送出」: the request is stored, then the same message goes into this project's chat (the 對話 tab opens). */
  sendAskToChat(text: string) { return this.ask.sendToChat(text); }
  /** Stores the request, then copies the message for the chat (or shows it to copy by hand). */
  sendAsk(text: string) { return this.ask.send(text); }
  /** Keep this version: the held edits are saved over the outside change. */
  /** Reload on the changed-on-disk bar: edits made since then wait unsaved, and reloading drops them, so it asks first */
  async reload(ask: (msg: string) => boolean = (m) => globalThis.confirm(m)): Promise<boolean> {
    if (this.autosave?.dirty && !ask(say('ed.reloadLoses'))) return false;
    await this.open();
    return true;
  }
  ignoreDisk() { this.set({ diskChanged: false }); this.deps.api.forgetVersion?.(this.id); this.autosave?.hold(false); }

  private queueState() {
    const s = this.s;
    if (!s.project || !this.deps.api.editorState) return;
    if (JSON.stringify([s.selection, s.playhead]) === this.sentState) return;
    clearTimeout(this.stateTimer);
    this.stateTimer = setTimeout(() => {
      const now = this.s, key = JSON.stringify([now.selection, now.playhead]);
      if (key === this.sentState) return;
      this.sentState = key;
      void Promise.resolve(this.deps.api.editorState?.(this.id, { selection: now.selection, playhead: now.playhead })).catch(() => {});
    }, 300);
  }

  /** Shows a project in the store and the preview; commit = recorded edit that must be saved. */
  changed(p: Project, commit: boolean) {
    const ids = new Set(allItems(p).map((x) => x.item.id));
    const before = this.s.selection, selection = before.filter((id) => ids.has(id));
    this.set({ project: p, canUndo: !!this.history?.canUndo, canRedo: !!this.history?.canRedo, selection, playerError: '' });
    // a deleted track leaves the collapsed list
    if (this.s.collapsed.some((x) => !p.tracks.some((t) => t.id === x))) this.setCollapsed(this.s.collapsed.filter((x) => p.tracks.some((t) => t.id === x)));
    if (this.s.locked.some((x) => !p.tracks.some((t) => t.id === x))) this.setLocked(this.s.locked.filter((x) => p.tracks.some((t) => t.id === x)));
    if (selection.length !== before.length) this.deps.bridge.select(selection.length === 1 ? selection[0] : null);
    this.deps.bridge.patch(p);
    if (commit) this.autosave?.schedule(p);
    this.checkCrop();
    if (this.deps.registryFor && fxKey(p) !== this.regFx) void this.followFx(p);
  }

  /** A seek or a play from the UI ends an audition first: they are meant for the real project. */
  seek(t: number) { this.endAudition(); this.seekTo(t); }
  private seekTo(t: number) {
    const p = this.s.project, d = p?.meta.duration ?? 0, fps = p?.meta.fps ?? 30;
    const at = Math.max(0, Math.min(d, Math.round(t * fps) / fps));
    this.set({ playhead: at });
    // the player starts over from 0 when asked to play in its last 50 ms: a jump to the end while playing stops there
    if (this.s.playing && at >= d - 0.05) { this.pause(); this.deps.bridge.seek(at); return; }
    if (this.s.playing) { this.playFrom = at; this.deps.bridge.play(at); } else this.deps.bridge.seek(at);
  }
  /** Playing leaves crop mode first (the stage is hidden while cropping). */
  play() { this.endAudition(); this.start(); }
  private start() {
    this.exitCrop(); this.lastT = null;
    if (this.s.loop && !this.aud) { const r = this.loopRange(); if (this.s.playhead < r.start || this.s.playhead >= r.end - 1e-3) this.seekTo(r.start); }
    // the player starts over from 0 when asked to play at the very end
    const t = this.s.playhead, d = this.s.project?.meta.duration ?? Infinity;
    this.playFrom = t >= d - 0.05 ? 0 : t;
    this.set({ playing: true }); this.deps.bridge.play(t);
  }
  pause() { this.playFrom = null; this.set({ playing: false, level: -120 }); this.deps.bridge.pause(); }
  /** Where play() was sent from: until the player reports a time there, its reports are of what it showed before
   *  (it redraws while pausing and patching) and must not move the playhead, the view or end an audition. */
  private playFrom: number | null = null;
  private stale(t: number) {
    const f = this.playFrom;
    if (f === null) return false;
    const a = this.aud, tol = a ? Math.min(0.15, (a.until - a.from) / 2) : 0.15;
    if (Math.abs(t - f) >= tol) return true;
    this.playFrom = null;
    return false;
  }
  togglePlay() { if (this.aud) this.endAudition(); else if (this.s.playing) this.pause(); else this.play(); }
  step(frames: number) { const fps = this.s.project?.meta.fps ?? 30; this.pause(); this.seek(Math.round(this.s.playhead * fps + frames) / fps); }

  private live: Recipe | null = null;
  /** Shows the project with the recipe applied (from the committed state), without recording it. */
  livePreview(recipe: Recipe) {
    this.endAudition();
    if (!this.history || this.blocked()) return;
    try { this.changed(this.history.preview(recipe), false); this.live = recipe; }
    catch (e) { if (!(e instanceof CommandError)) throw e; }
  }
  /** Records the last live preview as one undo step. */
  commitLive() { const r = this.live; this.live = null; if (r) this.apply(r); }
  cancelLive() { this.live = null; if (this.history) this.changed(this.history.project, false); }

  /** Audition: the material plays alone on temporary tracks of a project sent to the player only (audition.ts); it ends
   *  when its time is over, at the project end, on Space/Esc, a seek or any edit, and the real project and playhead come back. */
  private aud: { material: Material; addable: boolean; back: number; scroll: number; from: number; until: number } | null = null;
  /** o.at: where the material plays (default: the playhead); o.back: where the playhead goes afterwards (default: where it
   *  is); o.result: the item's start, for "play the result" */
  audition(m: Material, o: { addable?: boolean; at?: number; back?: number; result?: number; inPlace?: boolean } = {}): boolean {
    this.endAudition();
    const p = this.history?.project;
    if (!p) return false;
    this.exitCrop();
    if (this.s.playing) this.pause();
    const back = o.back ?? this.s.playhead, addable = o.addable ?? true;
    const plan = planAudition(p, m, o.at ?? back, { inPlace: o.inPlace, registry: this.registry, musicLen: m.kind === 'music' ? musicLength(this.s.peaks[`media:${m.media}`]) : undefined });
    // the player alone gets the audition project: the timeline and the panels keep showing the real one
    let shown: Project;
    try { shown = this.history!.preview(plan.recipe); }
    catch (e) { if (e instanceof CommandError) { this.set({ notice: errText(e) }); return false; } throw e; }
    this.deps.bridge.patch(shown);
    this.live = null;
    this.aud = { material: m, addable, back, scroll: this.s.scroll, from: plan.from, until: plan.until };
    this.set({ audition: { material: m, label: plan.label, addable, result: o.result ?? null }, notice: '' });
    this.seekTo(plan.from);
    this.start();
    return true;
  }
  /** The loop range: the selected items' span, or the whole project. */
  private loopRange() {
    const p = this.s.project!, times = resolveTimes(p), sel = this.s.selection.map((id) => times.get(id)).filter((x) => !!x) as Array<{ start: number; end: number }>;
    return sel.length ? { start: Math.min(...sel.map((x) => x.start)), end: Math.max(...sel.map((x) => x.end)) } : { start: 0, end: p.meta.duration };
  }
  toggleLoop() { this.set({ loop: !this.s.loop }); }
  /** The whole project in the timeline (\), however small that makes it. */
  zoomToFit() { const p = this.s.project; if (p && this.laneW > 0) this.setView({ pps: this.laneW / p.meta.duration, scroll: 0 }); }
  /** The audition ends when its time is over (reports of the old position were already dropped by stale()). */
  private auditionTime(t: number) {
    const a = this.aud;
    if (!a) return;
    if (t >= a.until - 1e-6) this.endAudition();
  }
  endAudition() {
    const a = this.aud;
    if (!a) return;
    this.aud = null;
    // the player's errors were about the audition's items; a temporary item could have been picked meanwhile
    const ids = new Set(this.history ? allItems(this.history.project).map((x) => x.item.id) : []);
    this.set({ audition: null, playerError: '', selection: this.s.selection.filter((id) => ids.has(id)) });
    this.pause();
    if (this.history) this.deps.bridge.patch(this.history.project);
    this.seekTo(a.back);
    this.setView({ scroll: a.scroll });
  }
  /** Timeline double-click: the item's raw material alone. Afterwards the playhead waits at the item's start, so
   *  Space (or the banner's "play the result") goes back to the finished video right there. */
  auditionItem(id: string): boolean {
    const p = this.history?.project, m = p && materialOf(p, id);
    if (!p || !m) return false;
    const start = resolveTimes(p).get(id)!.start;
    return this.audition(m, { addable: false, at: start, back: start, result: start, inPlace: true });
  }
  /** The banner's "play the result": the finished video from where the audition will put the playhead back. */
  playResult() { if (!this.aud) return; this.endAudition(); this.start(); }
  /** The audition banner's "add": the material goes in at the playhead where the audition started. */
  addAuditioned(): boolean {
    const a = this.aud;
    if (!a || !a.addable) return false;
    this.endAudition();
    return this.addMaterial(a.material);
  }
  /** The library's "add at the playhead". */
  addMaterial(m: Material): boolean {
    this.endAudition();   // at the real playhead, checked against the real project
    switch (m.kind) {
      case 'clip': return this.addClip(m.source, m.from, m.len);
      case 'music': return this.addMusic(m.media);
      case 'sfx': return this.addSfx(m.type);
      case 'overlay': return this.addOverlay(m.type);
    }
  }

  /** The help panel (? or F1, the toolbar's 幫助). */
  toggleHelp(open?: boolean) { this.set({ helpOpen: open ?? !this.s.helpOpen }); }
  run(a: Action) {
    // the help covers the editor: keys must not edit what is behind it; Esc (and ? or F1 again) closes it
    if (this.s.helpOpen) { if (a === 'exitCrop' || a === 'help') this.toggleHelp(false); return; }
    // Space and Esc only end an audition; a view key (F…) leaves it playing; any other key ends it and does its job
    if (this.aud && !AUDITION_PASS.has(a)) { this.endAudition(); if (a === 'playPause' || a === 'pause' || a === 'exitCrop') return; }
    const s = this.s;
    switch (a) {
      case 'playPause': return this.togglePlay();
      case 'back': return this.seek(s.playhead - 1);
      case 'pause': return this.pause();
      case 'play': return this.play();
      case 'prevFrame': return this.step(-1);
      case 'nextFrame': return this.step(1);
      case 'home': return this.seek(0);
      case 'end': return this.seek(s.project?.meta.duration ?? 0);
      case 'undo': return this.undo();
      case 'redo': return this.redo();
      case 'exitCrop': return this.exitCrop();
      case 'maxPreview':
        // side layout: the preview column grows as wide as the timeline allows (gridFor clamps it), or back to its default
        if (s.project && arrangementOf(s.layout, s.project.meta) === 'side') return this.setLayout(sizePatch(s.layout, s.project.meta, { previewW: previewWOf(s.layout, s.project.meta) === WIDEST_PREVIEW ? null : WIDEST_PREVIEW }));
        return this.setLayout({ maxPreview: !s.layout.maxPreview });
      case 'zoomFit': return this.zoomToFit();
      case 'layout': return this.cycleLayout();
      case 'deleteLeft': return void this.deleteSide('left');
      case 'deleteRight': return void this.deleteSide('right');
      case 'prevCut': return this.jumpCut(-1);
      case 'nextCut': return this.jumpCut(1);
      case 'back10': return this.stepFrames(-10);
      case 'forward10': return this.stepFrames(10);
      case 'copy': return void this.copy();
      case 'paste': return void this.paste();
      case 'duplicate': return void this.duplicate();
      case 'selectAll': return this.selectAll();
      case 'muteItem': return void this.toggleItemMute();
      case 'zoomIn': return this.zoomBy(1.25);
      case 'zoomOut': return this.zoomBy(0.8);
      case 'help': return this.toggleHelp();
      case 'raise': case 'lower':
        if (s.selection.length === 1) this.restack(s.selection[0], a === 'raise' ? 'up' : 'down');
        return;
      case 'split': return this.editing.split();
      case 'delete': case 'rippleDelete': return this.editing.deleteSelection(a === 'rippleDelete');
    }
  }

  /** The clip's speech as captions attached to it (spec 2026-10-14 §10), looking like the film's other speech captions
   *  (captionLook: their block, settings, karaoke and length); one undo step. */
  async speechCaptions(id: string): Promise<boolean> {
    const p = this.history?.project, found = p && allItems(p).find((x) => x.item.id === id);
    const it: any = found?.item;
    if (!p || !found || (found.track.kind !== 'video' && found.track.kind !== 'audio')) return false;
    let tr;
    try { tr = await this.deps.api.transcript(this.id, it.source); }
    catch { this.set({ notice: say('ed.noTranscript') }); return false; }
    const rate = found.track.kind === 'video' ? it.speed : it.rate, len = it.end - it.start, look = captionLook(p, id);
    // the first speech captions of a film: pieces of about two lines (Chinese and Japanese have a character a word)
    const options = look.options.maxChars ? look.options : { ...look.options, maxChars: /^(zh|ja)/.test(tr.language ?? '') ? 16 : 32 };
    // the clip as one piece in its own seconds: the plan's times come out relative to the clip, as an attached item's are
    const caps = captionPlan(tr, [{ id, source: it.source, in: it.in, out: it.in + len * rate, start: 0, end: len, rate }], options);
    if (!caps.length) { this.set({ notice: say('ed.noSpeech') }); return false; }
    // a locked track is passed over (as the library's add does): the new captions go on another, made if none is open
    const open = (t: { id: string }) => !this.s.locked.includes(t.id);
    return this.apply((d) => {
      const track = (look.track && d.tracks.some((t) => t.id === look.track && open(t)) ? look.track : undefined)
        ?? d.tracks.find((t) => t.kind === 'overlay' && open(t) && (t.id === 'text' || t.name === 'Captions' || t.name === '字幕'))?.id ?? addTrack(d, { kind: 'overlay', name: 'Captions' });
      for (const c of caps) addItem(d, { track, item: { type: look.type, start: c.at, end: +(c.at + c.len).toFixed(6), params: { ...look.params, ...c.extra, text: c.text }, parent: id } });
    });
  }

  /** Every caption on `track` drawn with caption template `template` ('' for the project's default): one undo step. */
  captionTemplateOnTrack(track: string, template: string, kind: TemplateKind = 'caption'): boolean {
    // while a proposal waits apply() refuses, and the notice is that one's (not "no captions on this track")
    if (this.blocked()) return false;
    let n = 0;
    const ok = this.apply((d) => { n = applyCaptionTemplate(d, track, template, undefined, kind); });
    if (ok || n) return ok;
    this.set({ notice: say(kind === 'title' ? 'ed.noTitles' : 'ed.noCaptions') });
    return false;
  }

  /** One caption drawn with caption template `template` ('' for the project's default), its look parameters dropped: one undo step. */
  captionTemplateOnItem(id: string, template: string, kind: TemplateKind = 'caption'): boolean {
    const found = this.s.project && allItems(this.s.project).find((x) => x.item.id === id);
    return !!found && this.apply((d) => { applyCaptionTemplate(d, found.track.id, template, [id], kind); });
  }

  /** A template of My caption templates on one caption (copied into the project): one undo step. */
  myCaptionTemplateOnItem(id: string, entry: { slug: string; params: Record<string, unknown> }, kind: TemplateKind = 'caption'): boolean {
    const found = this.s.project && allItems(this.s.project).find((x) => x.item.id === id);
    return !!found && this.apply((d) => useMyCaptionTemplate(d, found.track.id, id, entry, kind));
  }

  /** Saves caption `id`'s look (its template's under its own look parameters) to My caption templates as `name`. */
  async saveMyCaptionTemplate(id: string, name: string, kind: TemplateKind = 'caption'): Promise<boolean> {
    const p = this.s.project, it: any = p && allItems(p).find((x) => x.item.id === id)?.item;
    if (!p || !it) return false;
    const builtIn = (t: string) => (kind === 'title' ? titleTemplateOf(t) : templateOf(t))?.params;
    try { await this.library.saveTemplate(kind, { name, params: captionLookParams(p, it, builtIn, kind) }); return true; }
    catch (e) { this.set({ notice: errText(e) }); return false; }
  }
  /** My caption (or title) templates, as the library last listed them (fetched with the project, again after a save or delete) */
  myCaptionTemplates(kind: TemplateKind = 'caption') { return this.library.templates(kind); }
  /** Deletes one of My caption (or title) templates; the films that use it keep their copy. */
  async deleteMyCaptionTemplate(slug: string, kind: TemplateKind = 'caption'): Promise<boolean> {
    try { await this.library.deleteTemplate(kind, slug); return true; }
    catch (e) { this.set({ notice: errText(e) }); return false; }
  }
  /** a built-in template's picture (the gallery's thumbnail, in the zh UI's words), once loadTemplateThumbs has them */
  templateThumb(id: string, kind: TemplateKind = 'caption'): string | undefined { return this.s.library.templateThumbs?.[kind][id]; }
  loadTemplateThumbs() { return this.library.loadTemplateThumbs(); }

  /** The project's default caption template ('' for none): every caption naming none of its own follows it; one undo step. */
  projectCaptionTemplate(template: string, kind: TemplateKind = 'caption'): boolean { return this.apply((d) => setCaptionTemplate(d, template, kind)); }


  private fitted = false;
  private laneW = 0;
  /** The first measured timeline width (it depends on the layout) fits the whole project, but never below
   *  FIT_MIN_PPS (a long project would be a squeezed strip: the scrollbar shows the rest); later resizes keep the zoom. */
  fitTimeline(laneWidth: number) {
    const p = this.s.project;
    if (!p || !(laneWidth > 0)) return;
    this.laneW = laneWidth;
    if (this.fitted) { this.setView({}); return; }   // a wider lane may need less scroll
    this.fitted = true;
    this.setView({ pps: Math.max(FIT_MIN_PPS, laneWidth / p.meta.duration), scroll: 0 });
  }

  /** Playback turns the timeline's page when the playhead runs off the view (it goes to the left edge). */
  private lastT: number | null = null;
  private follow(t: number) {
    const last = this.lastT;
    this.lastT = t;
    if (!this.s.playing || !(this.laneW > 0)) return;
    const { scroll, pps } = this.s, right = scroll + this.laneW / pps;
    // the first report after play brings an off-screen playhead into view; after that only crossing the right edge
    // turns the page (the user may scroll elsewhere while it plays)
    if (last === null ? t < scroll || t > right : last <= right && t > right) this.setView({ scroll: t });
  }

  setView(v: { pps?: number; scroll?: number }) {
    const pps = Math.max(MIN_PPS, Math.min(MAX_PPS, v.pps ?? this.s.pps)), p = this.s.project;
    const hi = p && this.laneW > 0 ? maxScroll(p.meta.duration, this.laneW, pps) : Infinity;
    this.set({ pps, scroll: Math.max(0, Math.min(hi, v.scroll ?? this.s.scroll)) });
  }

  // ---------------------------------------------------------------- export and analysis (editor/exports.ts, editor/analysis.ts)
  private exportsTracker: ExportTracker | undefined;
  private get exportsCtl() { return (this.exportsTracker ??= new ExportTracker({ id: this.id, api: this.deps.api, store: this.store, settle: async () => !this.autosave || await this.autosave.settle() })); }
  /** Saves, then starts an export of the saved project and follows it (spec §7.1: the snapshot is what is on disk). */
  exportVideo() { return this.exportsCtl.start(); }
  cancelExport() { this.exportsCtl.cancel(); }
  loadExports() { return this.exportsCtl.load(); }
  toggleExports(open = !this.s.exportOpen) { this.exportsCtl.toggle(open); }
  /** An export started before a reload keeps running on the server: show and follow it again. */
  private resumeExport() { return this.exportsCtl.resume(); }
  /** Requests source analysis and loads thumbnails/peaks as they become available. */
  analyze(only?: string[]) { return analyzeProject({ id: this.id, api: this.deps.api, store: this.store }, only); }
  /** The sources whose analysis failed, analysed again (the server forgets every failure it remembers for this project's files). */
  retryAnalysis() { const ids = this.s.analysisFailed; return ids.length ? analyzeProject({ id: this.id, api: this.deps.api, store: this.store }, ids, { retry: true }) : Promise.resolve(); }

  /** imported sources and music whose save was held (the changed-on-disk bar): analysed once a save goes through */
  private waitingAnalysis: string[] = [];
  private analyzeWaiting() { const ids = this.waitingAnalysis; if (!ids.length) return; this.waitingAnalysis = []; void this.analyze(ids); }
  /** The media panel's Import: files from this PC added to the project as one undoable edit, then analysed in the background. */
  importMedia(paths: string[]) {
    return importMedia({ id: this.id, api: this.deps.api, store: this.store, apply: (r) => this.apply(r), settle: () => this.autosave?.settle() ?? Promise.resolve(false),
      analyze: (only) => this.analyze(only), later: (ids) => { this.waitingAnalysis.push(...ids); } }, paths);
  }
}

const innerWidthSafe = () => (typeof innerWidth === 'number' ? innerWidth : 1280);
/** what a registry built by registryFor depends on: the project's own modules */
const fxKey = (p: Project) => JSON.stringify(p.meta.fx ?? []);
