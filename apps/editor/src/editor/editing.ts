// The timeline's edit commands and the selection, out of editor.ts like the other flows: the tracks' buttons and order, overlaps
// and transitions, the cutting keys (Q / W, ↑ / ↓, S, Delete), copy, paste and duplicate, muting, magnetic tracks, dragging on the
// timeline, adding from the library at the playhead, replacing a block, and what is selected. Every edit is one undo step through
// the editor's apply(); the editor keeps the project, its history, the preview and crop mode.
import { addItem, addTrack, allItems, attach as attachCmd, CommandError, copyItems, deleteItems, detach as detachCmd, findItem, magneticGaps, magneticTrack, moveTrack as moveTrackCmd,
  overlapPairs, ownSounds, pasteItems, removeTrack as removeTrackCmd, resolveTimes, restackItem, rippleDelete, setCrossfade, setMagnetic, setTrack as setTrackCmd, split, trimEnd, trimStart,
  updateItem, type Clip, type Project, type Registry, type TrackKind } from '@tellcut/engine';
import type { PlayerBridge } from '../bridge.ts';
import type { History } from '../history.ts';
import type { EditorState, PeakInfo, Store } from '../store.ts';
import { dragRecipe, planDrag, type DragPlan, type DragStart, type Mods } from '../timeline/drag.ts';
import { cutPoints, edgeTargets, nextCut, selectionHasNoClip } from './cutting.ts';
import { errText, t as say } from '../i18n/index.ts';
import { blockText } from '../i18n/blocks.ts';
import { localValues } from '../i18n/values.ts';
import { materialItem, type MaterialItem } from './materials.ts';
import { dropRecipe, planDrop, type DropKind, type DropPlan, type DropTarget } from '../timeline/drop.ts';
import type { Material } from '../audition.ts';

/** a block of My blocks not copied into the project yet (the library panel's pick) */
export type LibPick = { slug: string; type: string; kind: 'scene' | 'overlay' };

type Recipe = (d: Project) => void;
/** the track kinds the library adds to */
type AddKind = 'video' | 'sfx' | 'overlay' | 'music';

export interface EditingDeps {
  id: string;
  store: Store<EditorState>;
  bridge: Pick<PlayerBridge, 'select'>;
  history: () => History | null;
  registry: () => Registry | undefined;
  /** one undoable edit; false when it changed nothing or was refused (the notice says why) */
  apply: (recipe: Recipe) => boolean;
  /** a project shown in the store and the preview; commit: a recorded edit to save */
  changed: (p: Project, commit: boolean) => void;
  livePreview: (recipe: Recipe) => void;
  seek: (t: number) => void;
  endAudition: () => void;
  /** whether edits are refused (a proposal waits: says so), and whether one waits (silently) */
  blocked: () => boolean;
  pending: () => boolean;
  isLocked: (itemId: string) => boolean;
  /** crop mode ends when its clip is no longer the only selection */
  checkCrop: () => void;
}

export class TimelineEditing {
  constructor(private c: EditingDeps) {}
  private get s() { return this.c.store.get(); }
  private set(patch: Partial<EditorState>) { this.c.store.set(patch); }
  private get reg() { return this.c.registry(); }

  /** Click on a same-track overlap (spec 2026-10-14 §5.1–5.2); `id` is the later item B. */
  overlapClick(id: string): boolean {
    const p = this.c.history()?.project, pair = p && overlapPairs(p).get(id);
    if (!p || !pair) return false;
    if (pair.kind === 'video') {
      const tr = (findItem(p, id).item as any).transitionIn;
      if (!tr || tr.type === 'cut') return this.c.apply((d) => updateItem(d, { id, patch: { transitionIn: { type: 'dissolve', dur: pair.ov } } }));
      this.select([id]);   // it has a transition: the properties panel shows it
      return true;
    }
    if (pair.kind === 'music' || pair.kind === 'audio') return this.c.apply((d) => setCrossfade(d, { id, on: !pair.linked }));
    return false;
  }
  /** Dragging a transition block's right edge: a live preview; the drag's release calls commitLive (one undo step). */
  previewTransitionDur(id: string, dur: number) {
    const p = this.c.history()?.project, found = p && allItems(p).find((x) => x.item.id === id);
    const it: any = found?.item;
    if (!p || !it?.transitionIn) return;
    const d = Math.round(Math.min(it.end - it.start, Math.max(1 / p.meta.fps, dur)) * 1e6) / 1e6;
    this.c.livePreview((x) => { updateItem(x, { id, patch: { transitionIn: { ...it.transitionIn, dur: d } } }); });
  }
  /** Track order inside its group, deleting a track with its items, a new empty track (all undoable). */
  moveTrack(id: string, to: number) { return this.c.apply((d) => moveTrackCmd(d, { id, to })); }
  removeTrack(id: string) { return this.c.apply((d) => removeTrackCmd(d, { id })); }
  addTrackOf(kind: TrackKind) { return this.c.apply((d) => { addTrack(d, { kind }); }); }
  /** One layer up or down past the nearest overlapping item of the same track. */
  restack(id: string, dir: 'up' | 'down') { return this.c.apply((d) => restackItem(d, { id, dir })); }
  /** M and S buttons: against the real track, whatever the preview plays */
  toggleTrack(id: string, key: 'muted' | 'solo') {
    const t: any = this.c.history()?.project.tracks.find((x) => x.id === id);
    return t ? this.c.apply((d) => setTrackCmd(d, { id, patch: { [key]: !t[key] } })) : false;
  }

  /** Tracks the cutting keys pass over (A3 fills it with the locked ones). */
  skipTracks(): ReadonlySet<string> { return new Set(this.s.locked); }

  /** Q / W (spec 2026-10-28-timeline-refresh A2): cut the clips at the playhead from their start (left) or to their end
   *  (right), one undo step. On the magnetic track the gap closes and, after Q, the playhead stays on the frame it showed. */
  deleteSide(side: 'left' | 'right'): boolean {
    const p = this.s.project;
    if (!p) return false;
    const t = this.s.playhead, times = resolveTimes(p), ids = edgeTargets(p, times, t, this.s.selection, this.skipTracks());
    if (!ids) { this.set({ notice: say(selectionHasNoClip(p, this.s.selection, this.skipTracks()) ? 'ed.why.selectionNoClip' : 'ed.selectClip') }); return false; }
    const ok = this.c.apply((d) => { for (const id of ids) { const tm = times.get(id)!; if (side === 'left') trimStart(d, { id, dt: t - tm.start }); else trimEnd(d, { id, dt: t - tm.end }); } });
    const mag = ok && side === 'left' ? magneticTrack(this.s.project!) : undefined;
    const back = mag && ids.find((id) => (mag.items as any[]).some((c) => c.id === id));
    if (back) this.c.seek(resolveTimes(this.s.project!).get(back)!.start);
    return ok;
  }

  /** ↑ / ↓: the previous / next clip edge on any track. */
  jumpCut(dir: -1 | 1) {
    const p = this.s.project;
    if (p) this.c.seek(nextCut(cutPoints(p, resolveTimes(p)), this.s.playhead, dir, p.meta.fps));
  }

  /** S: the selected clips cut at the playhead (with nothing selected every clip under it, except on locked tracks); the
   *  pieces after the cut are selected. */
  split() {
    const s = this.s;
    let made: string[] = [];
    const open = s.selection.length ? s.selection : s.locked.length && s.project
      ? s.project.tracks.filter((tr) => !s.locked.includes(tr.id)).flatMap((tr) => (tr.items as any[]).map((i) => i.id)) : undefined;
    if (this.c.apply((d) => { made = split(d, { t: s.playhead, ids: open }); }) && made.length) this.select(made);
  }
  /** Delete / Shift+Delete: the selection deleted, or deleted with the gap closed (ripple). */
  deleteSelection(ripple: boolean) {
    const ids = this.s.selection;
    if (!ids.length) return;
    if (this.c.apply((d) => (ripple ? rippleDelete(d, { ids }) : deleteItems(d, { ids })))) this.select([]);
  }

  /** Ctrl+C: the selection, its children and own sounds, kept in memory for this project. */
  copy(): boolean {
    const p = this.s.project;
    if (!p) return false;
    if (!this.s.selection.length) { this.set({ notice: say('ed.nothingToCopy') }); return false; }
    try { this.set({ clipboard: copyItems(p, this.s.selection, this.c.id), notice: '' }); return true; }
    catch (e) { if (e instanceof CommandError) { this.set({ notice: errText(e) }); return false; } throw e; }
  }
  /** Ctrl+V: at the playhead; the new items are selected. */
  paste(): boolean { return this.pasteAt(this.s.clipboard, this.s.playhead); }
  /** also: more of the same edit once pasted (Ctrl+D hangs the copies), with each copied id → its copy's */
  private pasteAt(clip: Clip | null, t: number, also?: (d: Project, renamed: Map<string, string>) => void): boolean {
    const p = this.s.project;
    if (!clip || !p) return false;
    if (clip.project !== this.c.id) { this.set({ notice: say('ed.pasteOtherProject') }); return false; }
    // a one-per-film block the project already has is left out (with what hangs on it), and the notice says so
    const why = new Set<string>();
    const entries = clip.entries.filter((e) => {
      const type = (e.item as any).type, w = typeof type === 'string' ? uniqueBlock(this.reg, p, type) : '';
      if (w) why.add(w);
      return !w;
    });
    if (!entries.length) { this.set({ notice: [...why].join(' ') }); return false; }
    let made: string[] = [];
    const dropped: string[] = [], renamed = new Map<string, string>();
    const ok = this.c.apply((d) => { made = pasteItems(d, { clip: { ...clip, entries }, t, skip: this.skipTracks(), dropped, renamed }); also?.(d, renamed); });
    if (!ok) return false;
    this.select(made);
    const notice = [...why, dropped.length ? say('ed.pastePartly', { n: dropped.length }) : ''].filter(Boolean).join(' ');
    if (notice) this.set({ notice });
    return true;
  }
  /** Ctrl+D: a copy right after the selection (on the magnetic track: right after its clip). What Ctrl+C copied stays on the
   *  clipboard. A copy of a caption hung on a clip hangs on that clip too, when it starts inside it. */
  duplicate(): boolean {
    const p = this.s.project;
    if (!p) return false;
    if (!this.s.selection.length) { this.set({ notice: say('ed.nothingToCopy') }); return false; }
    let clip: Clip;
    try { clip = copyItems(p, this.s.selection, this.c.id); }
    catch (e) { if (e instanceof CommandError) { this.set({ notice: errText(e) }); return false; } throw e; }
    const times = resolveTimes(p), end = Math.max(...this.s.selection.map((id) => times.get(id)?.end ?? 0));
    const mag = magneticTrack(p), onMag = !!mag && clip.entries.some((e) => e.track === mag.id && e.item.parent === undefined);
    const hang = (d: Project, renamed: Map<string, string>) => {
      const now = resolveTimes(d);
      for (const [old, copy] of renamed) {
        const par = findItem(p, old).item.parent, at = now.get(copy), span = par === undefined ? undefined : now.get(par);
        if (par === undefined || renamed.has(par) || !at || !span || at.start < span.start - 1e-6 || at.start >= span.end - 1e-6) continue;
        attachCmd(d, { id: copy, to: par });
      }
    };
    // pasteItems puts magnetic clips after the clip under t: half a frame before the end is still the selected clip
    return this.pasteAt(clip, onMag ? end - 0.5 / p.meta.fps : end, hang);
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
    return this.c.apply((d) => { for (const id of targets) { const it: any = findItem(d, id).item; if (on) it.muted = true; else delete it.muted; } });
  }

  /** The 磁 button (spec 2026-10-15-proposals-magnetic §4.1): closing gaps asks first; off just clears the flag. */
  toggleMagnetic(id: string, ask: (msg: string) => boolean): boolean {
    const p = this.c.history()?.project, t: any = p?.tracks.find((x) => x.id === id);
    if (!p || !t) return false;
    // turning it on closes the gaps, moving the locked clips (its button is off while the track is locked)
    if (this.s.locked.includes(id)) { this.set({ notice: say('ed.lockedNotice') }); return false; }
    const on = !t.magnetic;
    if (on) {
      const g = magneticGaps(p, id);
      if (g.count && !ask(say('ed.magnetMerge', { n: g.count, s: g.shift.toFixed(2) }))) return false;
    }
    return this.c.apply((d) => setMagnetic(d, { id, on }));
  }
  /** 解除掛勾: the item stays where it is in time and no longer moves with its clip. */
  detach(id: string) { return this.c.apply((d) => detachCmd(d, { id })); }

  // ---------------------------------------------------------------- dragging on the timeline
  private drag: { plan: DragPlan; recipe: Recipe | null } | null = null;

  beginDrag(start: DragStart) {
    this.c.endAudition();
    const h = this.c.history();
    if (!this.s.project || !h || this.c.blocked()) return;
    this.drag = { plan: planDrag(h.project, resolveTimes(h.project), start), recipe: null };
  }

  /** dx in pixels from the drag start; previews live, never recorded until endDrag. */
  dragTo(dx: number, mods: Mods, toTrack?: string) {
    const h = this.c.history();
    if (!this.drag || !h || this.c.pending()) return;
    const base = h.project;
    const { recipe, guide } = dragRecipe(base, resolveTimes(base), this.drag.plan, dx / this.s.pps,
      // Ctrl on an edge means stretch (spec §4.2), so a stretch keeps snapping
      { snap: this.s.layout.snap && (!mods.ctrl || this.drag.plan.kind.startsWith('stretch')), threshold: 8 / this.s.pps, playhead: this.s.playhead, toTrack });
    try {
      const view = h.preview(recipe);
      this.drag.recipe = recipe;
      this.set({ guide });
      this.c.changed(view, false);
    } catch (e) { if (!(e instanceof CommandError)) throw e; }
  }

  endDrag() {
    const d = this.drag, h = this.c.history();
    this.drag = null;
    this.set({ guide: null });
    if (!d || !h) return;
    if (d.recipe) this.c.apply(d.recipe); else this.c.changed(h.project, false);
  }

  // ---------------------------------------------------------------- dragging a library card onto the timeline
  // (spec 2026-11-10-media-panel-visual §5): planned by timeline/drop.ts, previewed live like a drag on the timeline, recorded
  // once on release. A block of My blocks not in the project yet has no item to preview: only its place is shown, and the
  // editor copies it in after the release (useLibraryBlock with that place).
  /** last: the project and plan last shown, so a move that changes neither shows nothing again (the player is sent a project each time) */
  private libDrag: { item?: MaterialItem; lib?: LibPick; kind: DropKind; len: number; refuse: string; recipe: Recipe | null; last?: { base: Project; plan: string } } | null = null;

  beginLibDrag(src: Material | { lib: LibPick }): boolean {
    this.c.endAudition();
    const h = this.c.history();
    this.libDrag = null;
    if (!this.s.project || !h || this.c.blocked()) return false;
    const p = h.project;
    if ('lib' in src) {
      const refuse = src.lib.kind === 'scene' ? say('ed.sceneAdd') : '';
      this.libDrag = { lib: src.lib, kind: 'overlay', len: 2, refuse, recipe: null };
    } else {
      const item = materialItem(p, src, 0, { reg: this.reg, peaks: this.s.peaks, beats: this.s.beats });
      const type = src.kind === 'overlay' ? src.type : '';
      const refuse = type && this.reg?.item(type)?.kind === 'scene' ? say('ed.sceneAdd') : type ? uniqueBlock(this.reg, p, type) : '';
      this.libDrag = { item, kind: item.kind, len: (item.item.end as number) - (item.item.start as number), refuse, recipe: null };
    }
    this.set({ libDrag: { kind: this.libDrag.kind, len: this.libDrag.len, plan: null } });
    return true;
  }

  /** where the pointer is now; previews the drop there (or shows the project as it is when it cannot go there) */
  libDragTo(at: DropTarget, mods: Mods) {
    const d = this.libDrag, h = this.c.history();
    if (!d || !h || this.c.pending()) return;
    const base = h.project;
    const plan = planDrop(base, resolveTimes(base), { kind: d.kind, len: d.len, at, locked: new Set(this.s.locked), refuse: d.refuse || undefined },
      { snap: this.s.layout.snap && !mods.ctrl, threshold: 8 / this.s.pps, playhead: this.s.playhead });
    const key = JSON.stringify(plan);
    if (d.last?.base === base && d.last.plan === key) return;
    d.last = { base, plan: key };
    d.recipe = null;
    let line: number | undefined;
    if (plan?.ok && d.item) {
      const recipe = dropRecipe(plan, d.kind, d.item.item, d.item.also);
      try {
        let id = '';
        const view = h.preview((x) => { id = recipe(x); });
        // on the magnetic track the packing moved it to a cut: that cut is marked
        if (plan.track && plan.track === magneticTrack(base)?.id) line = resolveTimes(view).get(id)?.start;
        this.c.changed(view, false);
        d.recipe = (x) => { recipe(x); };
      } catch (e) { if (!(e instanceof CommandError)) throw e; this.c.changed(base, false); }
    } else this.c.changed(base, false);
    this.set({ libDrag: { kind: d.kind, len: d.len, plan, ...(line !== undefined ? { line } : {}) } });
  }

  /** the release (commit) or Esc: true when something was added. A block of My blocks comes back as the place to copy it to. */
  endLibDrag(commit: boolean): boolean | { lib: LibPick; at: { track: string | null; start: number; end: number } } {
    const d = this.libDrag, h = this.c.history(), plan = this.s.libDrag?.plan;
    this.libDrag = null;
    this.set({ libDrag: null });
    if (!d || !h) return false;
    if (!commit || !plan) { this.c.changed(h.project, false); return false; }
    if (!plan.ok) { this.c.changed(h.project, false); this.set({ notice: plan.why }); return false; }
    if (d.lib) return { lib: d.lib, at: { track: plan.track, start: plan.start, end: plan.end } };
    if (!d.item) return false;
    return this.addPlaced(plan, d.item);
  }

  /** adds an item at a planned place (a drop) as one undo step and selects it, keeping the library in front */
  addPlaced(plan: Extract<DropPlan, { ok: true }>, x: MaterialItem): boolean {
    let id = '';
    const recipe = dropRecipe(plan, x.kind, x.item, x.also);
    const ok = this.c.apply((d) => { id = recipe(d); });
    if (ok) this.select([id], { reveal: false });
    return ok;
  }

  // ---------------------------------------------------------------- adding at the playhead (the library, the gallery)
  /** Library: adds an item at the playhead to the selected track of that kind, else the first one (created if none). */
  addTo(kind: AddKind, item: Record<string, unknown>, also?: (d: Project, id: string) => void) {
    const end = this.fitEnd(kind, item.start as number, item.end as number);
    if (end === null) return false;
    item = { ...item, end };
    const open = (t: { id: string; kind: string }) => t.kind === kind && !this.s.locked.includes(t.id);   // locked tracks are passed over
    let id = '';
    const sel = this.s.selection[0];
    const ok = this.c.apply((d) => {
      const selected = sel ? d.tracks.find((t) => open(t) && (t.items as any[]).some((i) => i.id === sel)) : undefined;
      const track = selected?.id ?? d.tracks.find(open)?.id ?? addTrack(d, { kind });
      id = addItem(d, { track, item });
      also?.(d, id);
    });
    if (ok) this.select([id], { reveal: false });   // keep the library in front while adding several
    return ok;
  }

  /** where an item added to a track of `kind` ends: nothing may start at or run past the project end — except on the magnetic
   *  track, which makes the film longer; null (and the reason shown) when nothing is left of it */
  fitEnd(kind: AddKind, start: number, end: number): number | null {
    const p = this.s.project!, sel0 = this.s.selection[0];
    const open = (t: { id: string; kind: string }) => t.kind === kind && !this.s.locked.includes(t.id);
    const target: any = (sel0 && p.tracks.find((t) => open(t) && (t.items as any[]).some((i) => i.id === sel0))) ?? p.tracks.find(open);
    const e = target?.magnetic ? end : Math.min(end, p.meta.duration);
    if (e - start < 1 / p.meta.fps - 1e-9) { this.set({ notice: say('ed.atEnd') }); return null; }
    return e;
  }

  /** the item a piece of the library makes at the playhead (materials.ts), added like the library adds */
  private addAtPlayhead(m: Material) {
    const x = materialItem(this.s.project!, m, this.s.playhead, { reg: this.reg, peaks: this.s.peaks, beats: this.s.beats });
    return this.addTo(x.kind, x.item, x.also);
  }
  addClip(source: string, from: number, len: number) { return this.addAtPlayhead({ kind: 'clip', source, from, len }); }
  addMusic(media: string) { return this.addAtPlayhead({ kind: 'music', media }); }
  /** `params`: values set in the gallery (only the sound's own keys are kept) */
  addSfx(type: string, params?: Record<string, unknown>) { return this.addAtPlayhead({ kind: 'sfx', type, params }); }

  /** The library's "replace": the block becomes another of the same kind (a picture block for one that sits the same way
   *  over or under the video, a sound for a sound), in the same place and length, keeping the parameters both have. */
  replaceBlock(id: string, type: string): boolean {
    const why = replaceProblem(this.reg, this.s.project, id, type);
    if (why) { this.set({ notice: why }); return false; }
    const f = allItems(this.s.project!).find((x) => x.item.id === id)!, it = f.item as any, sfx = f.track.kind === 'sfx';
    const defs = (sfx ? this.reg?.sfx(type) : this.reg?.item(type))!.params, keys = new Set(defs.map((d) => d.key));
    // the words the new type starts with in the UI language, under the parameters both types have
    const params = { ...localValues(type, defs), ...Object.fromEntries(Object.entries(it.params ?? {}).filter(([k]) => keys.has(k))) };
    return this.c.apply((d) => updateItem(d, { id, patch: { type, params } }));
  }

  /** `params`: values set in the gallery, over the defaults (only the block's own keys are kept) */
  addOverlay(type: string, params?: Record<string, unknown>) {
    const why = uniqueBlock(this.reg, this.s.project!, type);
    if (why) { this.set({ notice: why }); return false; }
    return this.addAtPlayhead({ kind: 'overlay', type, params });
  }

  // ---------------------------------------------------------------- the selection
  select(ids: string[], o: { reveal?: boolean } = {}) {
    if (this.s.locked.length) ids = ids.filter((id) => !this.c.isLocked(id));   // a locked track's items are not picked by the user
    const changed = ids.length !== this.s.selection.length || ids.some((id, i) => id !== this.s.selection[i]);
    this.set(changed ? { selection: ids, notice: '' } : { selection: ids });   // a notice is about the previous selection
    this.c.bridge.select(ids.length === 1 ? ids[0] : null);
    // portrait layout: a selection brings the properties tab forward
    // (not out of the chat: a selection made while talking must not pull the conversation away)
    if (ids.length && o.reveal !== false && this.s.layout.sideTab === 'library') this.set({ layout: { ...this.s.layout, sideTab: 'props' } });
    this.c.checkCrop();
  }
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

export { musicLength } from './materials.ts';
