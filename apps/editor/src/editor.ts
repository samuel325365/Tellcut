// The editor controller: project + history + autosave + preview bridge + UI state.
import { runOps, summarize, type Op, magneticGaps, setMagnetic, detach as detachCmd, addCropKey, addItem, addTrack, allItems, removeCropKey, type CropWhich, captionsInClip, CommandError, deleteItems, findItem, moveTrack as moveTrackCmd, overlapPairs, removeTrack as removeTrackCmd, restackItem, setCrossfade, type TrackKind, parseProject, resolveTimes, rippleDelete, setCrop, setTrack as setTrackCmd, setTransform as setTransformCmd, split, updateItem, withDefaults, type Project, type Registry, type Transform, copyItems, pasteItems, trimStart, trimEnd, magneticTrack, ownSounds } from '@tellcut/engine';
import { cutPoints, edgeTargets, nextCut } from './editor/cutting.ts';
import { zoomAround } from './timeline/geometry.ts';
import { keyAction, type Action } from './keys.ts';
import { ChatSession } from './chat.ts';
import type { FsApi } from './ImportDialog.tsx';
import { dragRecipe, planDrag, type DragPlan, type DragStart, type Mods } from './timeline/drag.ts';
import { materialOf, planAudition, type Material } from './audition.ts';
import { FIT_MIN_PPS, MAX_PPS, MIN_PPS, maxScroll } from './timeline/geometry.ts';
import { ApiError, type Api } from './api.ts';
import { Autosave } from './autosave.ts';
import { History } from './history.ts';
import { arrangementOf, nextArrange, orientationOf, previewWOf, sanitizeLayout, sizePatch, WIDEST_PREVIEW, type Layout } from './layout.ts';
import { createStore, initialState, type EditorState, type PeakInfo, type Store } from './store.ts';
import type { PlayerBridge } from './bridge.ts';
import type { Proposal } from '@tellcut/protocol';
import { ExportTracker } from './editor/exports.ts';
import { analyzeProject } from './editor/analysis.ts';
import { AskFlow } from './editor/ask-flow.ts';
import { errText, t as say } from './i18n/index.ts';
import { blockText } from './i18n/blocks.ts';
import { paramText } from './i18n/params.ts';

type Recipe = (d: Project) => void;
/** A proposal as the server sends it (media-node's Proposal, without the node imports). */
/** what the editor needs of a proposal (the server sends the whole Proposal) */
export type ProposalView = Pick<Proposal, 'id' | 'label' | 'ops' | 'summary' | 'warnings'> & { status?: string };
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
      const p = parseProject(await this.deps.api.project(this.id));
      if (this.deps.registryFor) this.reg = await this.deps.registryFor(p);
      this.fitted = false;
      this.aud = null;
      this.history = new History(p);
      this.autosave?.dispose();   // a reload: the previous session's unsaved edit must not be written over the reloaded project
      // a 409: another tab or Claude wrote a newer version first; this one's edits wait like after any outside change
      this.autosave = new Autosave({ save: async (x) => { try { await this.deps.api.save(this.id, x); } catch (e) { if (e instanceof ApiError && e.status === 409) this.outside(); throw e; } }, onStatus: (save, err) => this.set({ save, saveError: err ?? '' }) });
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
      this.prop = null;
      this.set({ proposal: null, diskChanged: false });
      this.offLive?.();
      this.offLive = this.deps.api.events?.(this.id, (m) => this.onLive(m)) ?? null;
      void this.analyze();
      void this.missingNotice();
      if (typeof (this.deps.api as any).chat === 'function') void this.chat.load();   // test fakes without chat
      void this.loadExports();
      void this.resumeExport();
    } catch (e) {
      const err = e instanceof ApiError ? { message: e.message, issues: e.issues } : { message: String((e as Error)?.message ?? e), issues: (e as any)?.issues ?? [] };
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

  /** Click on a same-track overlap (spec 2026-10-14 §5.1–5.2); `id` is the later item B. */
  overlapClick(id: string): boolean {
    const p = this.history?.project, pair = p && overlapPairs(p).get(id);
    if (!p || !pair) return false;
    if (pair.kind === 'video') {
      const tr = (findItem(p, id).item as any).transitionIn;
      if (!tr || tr.type === 'cut') return this.update(id, { transitionIn: { type: 'dissolve', dur: pair.ov } });
      this.select([id]);   // it has a transition: the properties panel shows it
      return true;
    }
    if (pair.kind === 'music' || pair.kind === 'audio') return this.apply((d) => setCrossfade(d, { id, on: !pair.linked }));
    return false;
  }
  /** Dragging a transition block's right edge: a live preview; the drag's release calls commitLive (one undo step). */
  previewTransitionDur(id: string, dur: number) {
    const p = this.history?.project, found = p && allItems(p).find((x) => x.item.id === id);
    const it: any = found?.item;
    if (!p || !it?.transitionIn) return;
    const d = Math.round(Math.min(it.end - it.start, Math.max(1 / p.meta.fps, dur)) * 1e6) / 1e6;
    this.livePreview((x) => { updateItem(x, { id, patch: { transitionIn: { ...it.transitionIn, dur: d } } }); });
  }
  /** Track order inside its group, deleting a track with its items, a new empty track (all undoable). */
  moveTrack(id: string, to: number) { return this.apply((d) => moveTrackCmd(d, { id, to })); }
  removeTrack(id: string) { return this.apply((d) => removeTrackCmd(d, { id })); }
  addTrackOf(kind: TrackKind) { return this.apply((d) => { addTrack(d, { kind }); }); }
  /** One layer up or down past the nearest overlapping item of the same track. */
  restack(id: string, dir: 'up' | 'down') { return this.apply((d) => restackItem(d, { id, dir })); }
  /** M and S buttons: against the real track, whatever the preview plays */
  toggleTrack(id: string, key: 'muted' | 'solo') {
    const t: any = this.history?.project.tracks.find((x) => x.id === id);
    return t ? this.setTrack(id, { [key]: !t[key] }) : false;
  }

  /** Tracks the cutting keys pass over (A3 fills it with the locked ones). */
  protected skipTracks(): ReadonlySet<string> { return new Set(this.s.locked); }

  /** Q / W (spec 2026-10-28-timeline-refresh A2): cut the clips at the playhead from their start (left) or to their end
   *  (right), one undo step. On the magnetic track the gap closes and, after Q, the playhead stays on the frame it showed. */
  deleteSide(side: 'left' | 'right'): boolean {
    const p = this.s.project;
    if (!p) return false;
    const t = this.s.playhead, times = resolveTimes(p), ids = edgeTargets(p, times, t, this.s.selection, this.skipTracks());
    if (!ids) { this.set({ notice: say('ed.selectClip') }); return false; }
    const ok = this.apply((d) => { for (const id of ids) { const tm = times.get(id)!; if (side === 'left') trimStart(d, { id, dt: t - tm.start }); else trimEnd(d, { id, dt: t - tm.end }); } });
    const mag = ok && side === 'left' ? magneticTrack(this.s.project!) : undefined;
    const back = mag && ids.find((id) => (mag.items as any[]).some((c) => c.id === id));
    if (back) this.seek(resolveTimes(this.s.project!).get(back)!.start);
    return ok;
  }

  /** ↑ / ↓: the previous / next clip edge on any track. */
  jumpCut(dir: -1 | 1) {
    const p = this.s.project;
    if (p) this.seek(nextCut(cutPoints(p, resolveTimes(p)), this.s.playhead, dir, p.meta.fps));
  }
  stepFrames(n: number) { this.step(n); }

  /** Ctrl+C: the selection, its children and own sounds, kept in memory for this project. */
  copy(): boolean {
    const p = this.s.project;
    if (!p) return false;
    if (!this.s.selection.length) { this.set({ notice: say('ed.nothingToCopy') }); return false; }
    try { this.set({ clipboard: copyItems(p, this.s.selection, this.id), notice: '' }); return true; }
    catch (e) { if (e instanceof CommandError) { this.set({ notice: errText(e) }); return false; } throw e; }
  }
  /** Ctrl+V: at the playhead; the new items are selected. */
  paste(): boolean { return this.pasteAt(this.s.playhead); }
  private pasteAt(t: number): boolean {
    const clip = this.s.clipboard;
    if (!clip || !this.s.project) return false;
    if (clip.project !== this.id) { this.set({ notice: say('ed.pasteOtherProject') }); return false; }
    let made: string[] = [];
    const ok = this.apply((d) => { made = pasteItems(d, { clip, t, skip: this.skipTracks() }); });
    if (ok) this.select(made);
    return ok;
  }
  /** Ctrl+D: a copy right after the selection (on the magnetic track: right after its clip). */
  duplicate(): boolean {
    const p = this.s.project;
    if (!p) return false;
    if (!this.copy()) return false;
    const times = resolveTimes(p), end = Math.max(...this.s.selection.map((id) => times.get(id)?.end ?? 0));
    const mag = magneticTrack(p), onMag = !!mag && this.s.clipboard!.entries.some((e) => e.track === mag.id && e.item.parent === undefined);
    // pasteItems puts magnetic clips after the clip under t: half a frame before the end is still the selected clip
    return this.pasteAt(onMag ? end - 0.5 / p.meta.fps : end);
  }
  /** Ctrl+A: every item on the tracks the cutting keys may touch. */
  selectAll() {
    const p = this.s.project, skip = this.skipTracks();
    if (p) this.select(p.tracks.filter((tr) => !skip.has(tr.id)).flatMap((tr) => (tr.items as any[]).map((i) => i.id)));
  }
  /** M: mutes or unmutes the selected sounds; a video clip's own sound stands for the clip. All take the first one's new state. */
  toggleItemMute(): boolean {
    const p = this.s.project;
    if (!p) return false;
    const targets = this.s.selection.flatMap((id) => {
      const f = allItems(p).find((x) => x.item.id === id);
      if (!f) return [];
      if (f.track.kind === 'video') return ownSounds(p, id).map((c) => c.id);
      return f.track.kind === 'music' || f.track.kind === 'audio' || f.track.kind === 'sfx' ? [id] : [];
    });
    if (!targets.length) { this.set({ notice: say('ed.nothingToMute') }); return false; }
    const on = !(findItem(p, targets[0]).item as any).muted;
    return this.apply((d) => { for (const id of targets) { const it: any = findItem(d, id).item; if (on) it.muted = true; else delete it.muted; } });
  }
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

  // ---------------------------------------------------------------- Claude's proposals (spec 2026-10-15-proposals-magnetic §3, §5)
  private prop: ProposalView | null = null;
  private offLive: (() => void) | null = null;
  private stateTimer: ReturnType<typeof setTimeout> | undefined;
  private sentState = '';

  /** While a proposal waits, edits are refused (the preview shows the proposal, not the project). */
  private propView: Project | null = null;
  private accepting = false;
  private blocked(): boolean {
    if (!this.prop) return false;
    this.set({ notice: say('ed.pending') });
    // whatever was being dragged goes back to the proposal's preview
    if (this.propView && this.s.project !== this.propView) { this.changed(this.propView, false); this.set({ canUndo: false, canRedo: false }); }
    return true;
  }
  private onLive(m: any) {
    if (m?.type === 'hello' || m?.type === 'proposal') {
      // accepted somewhere else (another tab, the chat): this tab's project is no longer what is on disk
      if (!m.proposal && m.outcome === 'accepted' && this.prop && !this.accepting) this.outside();
      this.showProposal(m.proposal ?? null);
    }
    else if (m?.type === 'accept-request') { if (m.id === this.prop?.id) void this.acceptProposal(); }
    else if (m?.type === 'reject-request') { if (m.id === this.prop?.id) void this.rejectProposal(); }
    // a save of this page's own (the server leaves it out; a stream opened again by a reload could still hear it)
    else if (m?.type === 'changed-on-disk') { if (!m.by || m.by !== this.deps.api.clientId) this.outside(); }
    else if (m?.type === 'fx-changed') void this.reloadFx();
  }
  /** A project fx module was edited (project.json the same): the preview loads it again and stays where it was. */
  private async reloadFx() {
    const p = this.s.project;
    if (!p) return;
    if (this.deps.registryFor) this.reg = await this.deps.registryFor(p);
    this.deps.bridge.load(p);
  }
  /** project.json changed outside: hold saves until the user reloads or chooses to keep this version (忽略). */
  private outside() {
    this.set({ diskChanged: true });
    this.autosave?.hold(true);
  }
  private async report(id: string, outcome: 'accepted' | 'rejected' | 'stale', reason?: string) {
    try { await this.deps.api.proposalResult?.(this.id, { id, outcome, ...(reason ? { reason } : {}) }); }
    catch { /* the server is gone: the chat side reports its own timeout */ }
  }
  /** Shows a proposal as a preview: not saved, not in the history. One that no longer applies is reported stale. */
  showProposal(p: ProposalView | null) {
    if (!this.history) return;
    if (!p) {
      if (this.prop && !this.accepting) { this.prop = null; this.propView = null; this.set({ proposal: null }); this.changed(this.history.project, false); }
      return;
    }
    if (this.prop?.id === p.id) return;
    this.endAudition();
    this.live = null;
    let preview: Project;
    try { preview = this.history.preview((d) => runOps(d, p.ops)); }
    catch (e) {
      const why = (e as Error).message;
      this.set({ notice: say('ed.staleProposal', { why }) });
      void this.report(p.id, 'stale', why);
      return;
    }
    const sum = summarize(this.history.project, preview);
    this.prop = p;
    this.propView = preview;
    this.set({ proposal: { id: p.id, label: p.label, summary: p.summary ?? sum.summary, lines: sum.lines, warnings: p.warnings ?? [], changed: sum.changed } });
    this.changed(preview, false);
    this.set({ canUndo: false, canRedo: false });
  }
  /** One undo step, saved, then reported. Edits still waiting to be saved are saved first, so nothing is lost. */
  async acceptProposal(): Promise<boolean> {
    const p = this.prop;
    if (!p || !this.history || this.accepting) return false;   // a second accept (click + chat) must not apply it twice
    this.accepting = true;
    try { return await this.acceptNow(p); } finally { this.accepting = false; }
  }
  private async acceptNow(p: ProposalView): Promise<boolean> {
    if (!this.history) return false;
    if (this.s.diskChanged) {
      // the proposal was made from what is on disk, this editor shows another version: applying it here would be lost or wrong
      const why = say('ed.diskWhy');
      this.prop = null; this.propView = null;
      this.set({ proposal: null, notice: say('ed.notAccepted', { why }) });
      this.changed(this.history.project, false);
      await this.report(p.id, 'stale', why);
      return false;
    }
    await this.autosave?.settle();
    if (this.prop?.id !== p.id) return false;
    let next: Project;
    try { next = this.history.apply((d) => runOps(d, p.ops)); }
    catch (e) {
      const why = (e as Error).message;
      this.prop = null; this.propView = null;
      this.set({ proposal: null, notice: say('ed.staleProposal', { why }) });
      this.changed(this.history.project, false);
      await this.report(p.id, 'stale', why);
      return false;
    }
    this.prop = null; this.propView = null;
    this.set({ proposal: null });
    this.changed(next, true);
    this.set({ notice: say('ed.accepted', { label: p.label }) });
    if (this.autosave && !(await this.autosave.settle())) {
      // applied here but not on disk (a 409, the file locked, the server gone): the agent must not hear "accepted"
      const why = this.s.diskChanged ? say('ed.diskShort') : this.s.saveError;
      this.set({ notice: say('ed.acceptedUnsaved', { label: p.label, why }) });
      await this.report(p.id, 'stale', say('ed.unsavedWhy', { why }));
      return true;
    }
    await this.report(p.id, 'accepted');
    return true;
  }
  async rejectProposal() {
    const p = this.prop;
    if (!p || !this.history || this.accepting) return;
    this.prop = null; this.propView = null;
    this.set({ proposal: null });
    this.changed(this.history.project, false);
    await this.report(p.id, 'rejected');
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

  /** The 磁 button (spec 2026-10-15-proposals-magnetic §4.1): closing gaps asks first; off just clears the flag. */
  toggleMagnetic(id: string, ask: (msg: string) => boolean = (m) => globalThis.confirm(m)): boolean {
    const p = this.history?.project, t: any = p?.tracks.find((x) => x.id === id);
    if (!p || !t) return false;
    const on = !t.magnetic;
    if (on) {
      const g = magneticGaps(p, id);
      if (g.count && !ask(say('ed.magnetMerge', { n: g.count, s: g.shift.toFixed(2) }))) return false;
    }
    return this.apply((d) => setMagnetic(d, { id, on }));
  }
  /** 解除掛勾: the item stays where it is in time and no longer moves with its clip. */
  detach(id: string) { return this.apply((d) => detachCmd(d, { id })); }
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

  private drag: { plan: DragPlan; recipe: Recipe | null } | null = null;

  beginDrag(start: DragStart) {
    this.endAudition();
    if (!this.s.project || !this.history || this.blocked()) return;
    this.drag = { plan: planDrag(this.history.project, resolveTimes(this.history.project), start), recipe: null };
  }

  /** dx in pixels from the drag start; previews live, never recorded until endDrag. */
  dragTo(dx: number, mods: Mods, toTrack?: string) {
    if (!this.drag || !this.history || this.prop) return;
    const base = this.history.project;
    const { recipe, guide } = dragRecipe(base, resolveTimes(base), this.drag.plan, dx / this.s.pps,
      // Ctrl on an edge means stretch (spec §4.2), so a stretch keeps snapping
      { snap: this.s.layout.snap && (!mods.ctrl || this.drag.plan.kind.startsWith('stretch')), threshold: 8 / this.s.pps, playhead: this.s.playhead, toTrack });
    try {
      const view = this.history.preview(recipe);
      this.drag.recipe = recipe;
      this.set({ guide });
      this.changed(view, false);
    } catch (e) { if (!(e instanceof CommandError)) throw e; }
  }

  endDrag() {
    const d = this.drag;
    this.drag = null;
    this.set({ guide: null });
    if (!d || !this.history) return;
    if (d.recipe) this.apply(d.recipe); else this.changed(this.history.project, false);
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
      case 'split': {
        let made: string[] = [];
        // with nothing selected every clip under the playhead is cut, except on locked tracks
        const open = s.selection.length ? s.selection : s.locked.length && s.project
          ? s.project.tracks.filter((tr) => !s.locked.includes(tr.id)).flatMap((tr) => (tr.items as any[]).map((i) => i.id)) : undefined;
        if (this.apply((d) => { made = split(d, { t: s.playhead, ids: open }); }) && made.length) this.select(made);
        return;
      }
      case 'delete': case 'rippleDelete': {
        if (!s.selection.length) return;
        const ids = s.selection;
        if (this.apply((d) => (a === 'delete' ? deleteItems(d, { ids }) : rippleDelete(d, { ids })))) this.select([]);
      }
    }
  }

  /** Library: adds an item at the playhead to the selected track of that kind, else the first one (created if none). */
  private addTo(kind: 'video' | 'sfx' | 'overlay' | 'music', item: Record<string, unknown>, also?: (d: Project, id: string) => void) {
    // nothing may start at or run past the project end — except on the magnetic track, which makes the film longer
    const p = this.s.project!, sel0 = this.s.selection[0];
    const open = (t: { id: string; kind: string }) => t.kind === kind && !this.s.locked.includes(t.id);   // locked tracks are passed over
    const target: any = (sel0 && p.tracks.find((t) => open(t) && (t.items as any[]).some((i) => i.id === sel0))) ?? p.tracks.find(open);
    const end = target?.magnetic ? (item.end as number) : Math.min(item.end as number, p.meta.duration);
    if (end - (item.start as number) < 1 / p.meta.fps - 1e-9) { this.set({ notice: say('ed.atEnd') }); return false; }
    item = { ...item, end };
    let id = '';
    const sel = this.s.selection[0];
    const ok = this.apply((d) => {
      const selected = sel ? d.tracks.find((t) => open(t) && (t.items as any[]).some((i) => i.id === sel)) : undefined;
      const track = selected?.id ?? d.tracks.find(open)?.id ?? addTrack(d, { kind });
      id = addItem(d, { track, item });
      also?.(d, id);
    });
    if (ok) this.select([id], { reveal: false });   // keep the library in front while adding several
    return ok;
  }

  addClip(source: string, from: number, len: number) {
    const p = this.s.project!, t = this.s.playhead;
    // a photo: 3 s with a gentle push-in (spec 2026-10-14 §5)
    if (p.sources[source]?.kind === 'image') return this.addTo('video', { source, in: 0, speed: 1, start: t, end: t + 3, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.1 } } });
    const dur = Math.min(len, p.sources[source].duration - from), still = { x: 0.5, y: 0.5, zoom: 1 };
    return this.addTo('video', { source, in: from, speed: 1, start: t, end: t + dur, crop: { from: still, to: still } });
  }


  addMusic(media: string) {
    const t = this.s.playhead, len = musicLength(this.s.peaks[`media:${media}`]) ?? 10, b = this.s.beats[media];
    // with detected beats, a beat grid comes along (snapping finds the beats)
    return this.addTo('music', { media, in: 0, start: t, end: t + len, gain: 0, fadeIn: 0, fadeOut: 0 },
      b && b.beats.length ? (d, id) => { d.grids.push({ id: `beats-${id}`, at: Math.round((t + b.offset) * 1e6) / 1e6, bpm: b.bpm, until: t + len }); } : undefined);
  }

  /** The clip's speech as captions attached to it (spec 2026-10-14 §10); one undo step. */
  async speechCaptions(id: string): Promise<boolean> {
    const p = this.history?.project, found = p && allItems(p).find((x) => x.item.id === id);
    const it: any = found?.item;
    if (!p || !found || (found.track.kind !== 'video' && found.track.kind !== 'audio')) return false;
    let tr;
    try { tr = await this.deps.api.transcript(this.id, it.source); }
    catch { this.set({ notice: say('ed.noTranscript') }); return false; }
    const caps = captionsInClip(tr, { in: it.in, len: it.end - it.start, rate: found.track.kind === 'video' ? it.speed : it.rate });
    if (!caps.length) { this.set({ notice: say('ed.noSpeech') }); return false; }
    return this.apply((d) => {
      const track = d.tracks.find((t) => t.kind === 'overlay' && (t.id === 'text' || t.name === 'Captions' || t.name === '字幕'))?.id ?? addTrack(d, { kind: 'overlay', name: 'Captions' });
      for (const c of caps) addItem(d, { track, item: { type: 'core.caption', start: c.start, end: c.end, params: { text: c.text }, parent: id } });
    });
  }


  addSfx(type: string) {
    const def = this.registry?.sfx(type);
    const t = this.s.playhead, dur = def ? def.duration(withDefaults(def.params, {})) : 0.5;
    return this.addTo('sfx', { type, start: t, end: t + Math.max(dur, 1 / (this.s.project?.meta.fps ?? 30)), params: {}, gain: 0 });
  }

  /** The library's "replace": the block becomes another of the same kind (a picture block for one that sits the same way
   *  over or under the video, a sound for a sound), in the same place and length, keeping the parameters both have. */
  replaceBlock(id: string, type: string): boolean {
    const why = replaceProblem(this.registry, this.s.project, id, type);
    if (why) { this.set({ notice: why }); return false; }
    const f = allItems(this.s.project!).find((x) => x.item.id === id)!, it = f.item as any, sfx = f.track.kind === 'sfx';
    const keys = new Set((sfx ? this.registry?.sfx(type) : this.registry?.item(type))!.params.map((d) => d.key));
    const params = Object.fromEntries(Object.entries(it.params ?? {}).filter(([k]) => keys.has(k)));
    return this.update(id, { type, params });
  }

  addOverlay(type: string) {
    const why = uniqueBlock(this.registry, this.s.project!, type);
    if (why) { this.set({ notice: why }); return false; }
    const t = this.s.playhead;
    return this.addTo('overlay', { type, start: t, end: t + 2, params: {} });
  }

  select(ids: string[], o: { reveal?: boolean } = {}) {
    if (this.s.locked.length) ids = ids.filter((id) => !this.isLocked(id));   // a locked track's items are not picked by the user
    const changed = ids.length !== this.s.selection.length || ids.some((id, i) => id !== this.s.selection[i]);
    this.set(changed ? { selection: ids, notice: '' } : { selection: ids });   // a notice is about the previous selection
    this.deps.bridge.select(ids.length === 1 ? ids[0] : null);
    // portrait layout: a selection brings the properties tab forward
    // (not out of the chat: a selection made while talking must not pull the conversation away)
    if (ids.length && o.reveal !== false && this.s.layout.sideTab === 'library') this.set({ layout: { ...this.s.layout, sideTab: 'props' } });
    this.checkCrop();
  }
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
  analyze() { return analyzeProject({ id: this.id, api: this.deps.api, store: this.store }); }
}

/** Why a unique item type cannot be added again, or '' when it can. */
export function uniqueBlock(registry: Pick<Registry, 'item'> | undefined, p: Project, type: string): string {
  const def = registry?.item(type);
  return def?.unique && allItems(p).some((x) => (x.item as any).type === type) ? say('ed.unique', { label: blockText(type, { label: def.label, doc: '' }, 'en').label }) : '';
}

/** Why the item cannot become `type` ('' when it can): it must be a block or sound, the new one of the same kind and not a
 *  one-per-film block already used elsewhere. Also what the library's replace button says. */
export function replaceProblem(registry: Pick<Registry, 'item' | 'sfx'> | undefined, p: Project | null | undefined, id: string | undefined, type: string): string {
  const f = p && id ? allItems(p).find((x) => x.item.id === id) : undefined, it = f?.item as any;
  if (!f || typeof it.type !== 'string') return say('ed.replacePick');
  if (it.type === type) return say('ed.replaceSame');
  if (f.track.kind === 'sfx') return registry?.sfx(type) ? '' : say('ed.replaceKind');
  const from = registry?.item(it.type), to = registry?.item(type);
  if (!to || (from && from.kind !== to.kind)) return say('ed.replaceKind');
  return registry ? uniqueBlock(registry, p!, type) : '';
}

/** Length of a music file from its waveform (peaks per second), if known. */
export const musicLength = (pk?: PeakInfo) => (pk && pk.rate > 0 && pk.peaks.length ? pk.peaks.length / pk.rate : undefined);

const innerWidthSafe = () => (typeof innerWidth === 'number' ? innerWidth : 1280);
