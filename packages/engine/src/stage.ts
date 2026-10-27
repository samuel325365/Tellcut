// Compositor: one isolated layer per visual item, stacked by track order then array order.
// draw(t) sets every layer's state as a pure function of t; the caller then awaits media.sync().
import type { AnyItem, Project, SceneItem, Track, Transform, VideoItem } from './schema.ts';
import { allItems } from './schema.ts';
import { activeAt, resolveTimes, type Times } from './time.ts';
import { coverPlacement, kbMatrix, videoState } from './geometry.ts';
import type { ItemCtx, ItemType, MediaRef } from './plugin.ts';
import { withDefaults, type Registry } from './registry.ts';
import { resolveTheme } from './theme.ts';
import type { MediaPool } from './media/pool.ts';
import { videoRefOf } from './media/refs.ts';
import { cssCamel, h, showCamel } from './util.ts';
import { itemMediaIssues } from './validate.ts';

/** sig = the item's JSON: update() compares content, since projects posted into the preview iframe are copies. */
type Common = { id: string; el: HTMLElement; sig: string; muted: boolean };
type Layer =
  | (Common & { kind: 'video'; frame: HTMLElement; holder: HTMLElement; kb: HTMLElement | null; img: HTMLImageElement | null; item: VideoItem; ref: MediaRef })
  | (Common & { kind: 'plugin'; slot: HTMLElement; item: SceneItem; params: Record<string, any>; type: ItemType; state: unknown; shown?: boolean })
  | (Common & { kind: 'missing' });

/** sig without the transform: moving or scaling a layer restyles it instead of rebuilding it (Kyoto scenes are heavy). */
const sigOf = (item: AnyItem) => JSON.stringify({ ...item, transform: undefined });
/** Where a layer with a moving transform is at `local` seconds into its item: linear between keys, held outside them. */
export function transformAt(t: Transform, local: number): Transform {
  if (!t.keys?.length) return t;
  // in time order whatever order they were given in (as cropAt does): unsorted, the layer jumped between them
  const k = t.keys.every((x, i, a) => !i || a[i - 1].t <= x.t) ? t.keys : [...t.keys].sort((a, b) => a.t - b.t);
  const at = (q: { x: number; y: number; scale: number }) => ({ ...t, x: q.x, y: q.y, scale: q.scale });
  if (local <= k[0].t) return at(k[0]);
  for (let i = 1; i < k.length; i++) if (local < k[i].t) {
    const a = k[i - 1], b = k[i], f = (local - a.t) / (b.t - a.t || 1);
    return at({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, scale: a.scale + (b.scale - a.scale) * f });
  }
  return at(k[k.length - 1]);
}
const transformCss = (t: Transform | undefined, W: number, H: number) => (t
  ? { transform: `translate(${+(t.x * W).toFixed(2)}px, ${+(t.y * H).toFixed(2)}px) scale(${+t.scale.toFixed(4)})`, transformOrigin: `${+((t.ox ?? 0.5) * 100).toFixed(2)}% ${+((t.oy ?? 0.5) * 100).toFixed(2)}%` }
  : { transform: '', transformOrigin: '' });
const STYLE_ID = 'tellcut-plugin-css';
const SVG_ID = 'tellcut-svg-defs';
const MISSING_BG = 'repeating-linear-gradient(45deg, rgba(255,0,80,.35) 0 12px, transparent 12px 24px)';
const VISUAL = new Set(['video', 'scene', 'overlay']);
/** the project settings that change what the layers look like; the length, the name, the sound and export settings
 *  and the home preset info do not (a magnetic edit changes meta.duration on every drag frame: that must not rebuild every layer) */
const visualMeta = (p: Project) => { const { duration: _d, name: _n, mix: _m, loudness: _l, cut: _c, preset: _p, ...rest } = p.meta; return JSON.stringify(rest); };

export class Stage {
  project!: Project;
  times!: Times;
  private layers: Layer[] = [];
  /** another registered item type, by id (ctx.types and media()'s third argument) */
  private types = (type: string) => this.registry.item(type);
  private top!: HTMLElement;
  /** strict (render mode): a failing item aborts with its id instead of becoming a placeholder */
  constructor(private root: HTMLElement, private registry: Registry, private media: MediaPool,
    private opts: { strict?: boolean; onError?: (itemId: string, message: string) => void; /** previews: see draw() */ subpixelZoom?: boolean;
      /** the ThreeKit handed to every item as ctx.three (the player loads it when usesThree) */ three?: unknown } = {}) {}

  private fail(L: Common, item: SceneItem, e: unknown): Layer {
    const msg = `Item "${item.id}" (${item.type}): ${(e as Error)?.message ?? e}`;
    if (this.opts.strict) throw new Error(msg);
    this.opts.onError?.(item.id, msg);
    console.error(msg);
    L.el.innerHTML = '';
    const m = h('div', 'st-missing', null, L.el);
    cssCamel(m, { position: 'absolute', inset: '0', background: MISSING_BG });
    return { kind: 'missing', id: L.id, el: L.el, sig: L.sig, muted: L.muted };
  }

  load(p: Project) {
    this.project = p;
    this.times = resolveTimes(p);
    const { width, height, background } = p.meta;
    this.destroy();
    this.root.innerHTML = '';
    cssCamel(this.root, { position: 'relative', overflow: 'hidden', width: `${width}px`, height: `${height}px`, background });
    this.styles(p);
    this.top = h('div', 'st-top', null, this.root);
    cssCamel(this.top, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.layers = [];
    for (const { track, item } of allItems(p)) if (VISUAL.has(track.kind)) this.layers.push(this.build(track, item, p));
    this.restack();
  }

  /** Lets every item go (its GPU things): before the stage itself is dropped, as a preview opening another project does. */
  destroy() {
    for (const L of this.layers) this.release(L);
    this.layers = [];
  }

  /** Applies an edited project: unchanged items keep their layer, changed ones are rebuilt (spec §2.3). */
  update(p: Project) {
    const prev = this.project;
    if (!prev || visualMeta(p) !== visualMeta(prev) || JSON.stringify(p.sources) !== JSON.stringify(prev.sources)) return this.load(p);
    const before = this.times;
    this.project = p;
    this.times = resolveTimes(p);
    this.styles(p);
    const old = new Map(this.layers.map((L) => [L.id, L]));
    const next: Layer[] = [];
    for (const { track, item } of allItems(p)) {
      if (!VISUAL.has(track.kind)) continue;
      const L = old.get(item.id), a = before.get(item.id), b = this.times.get(item.id)!;
      if (L && L.sig === sigOf(item) && L.muted === !!track.muted && a && a.start === b.start && a.end === b.end) {
        if (L.kind !== 'video') { const tcss = transformCss((item as SceneItem).transform, p.meta.width, p.meta.height); cssCamel(L.el, tcss); if (L.kind === 'plugin') cssCamel(L.slot, tcss); }
        // the signature leaves the transform out: draw() reads the keys (and ctx.item) from the item, so it must be the new one
        if (L.kind === 'plugin') L.item = item as SceneItem;
        next.push(L); old.delete(item.id); continue;
      }
      if (L) { this.dispose(L); old.delete(item.id); }
      next.push(this.build(track, item, p));
    }
    for (const L of old.values()) this.dispose(L);
    this.layers = next;
    this.restack();
  }

  private dispose(L: Layer) {
    L.el.remove();
    if (L.kind === 'plugin') L.slot.remove();
    this.release(L);
  }

  private release(L: Layer) {
    if (L.kind === 'plugin') { try { L.type.dispose?.(L.state); } catch (e) { console.error(e); } }
  }

  /** z-order follows track order then array order; the top container stays above all items. */
  private restack() {
    this.layers.forEach((L, i) => { L.el.style.zIndex = String(i + 1); if (L.kind === 'plugin') this.top.appendChild(L.slot); });
    this.top.style.zIndex = String(this.layers.length + 1);
  }

  private styles(p: Project) {
    if (typeof document === 'undefined') return;
    // only this project's plugins: their stylesheets share generic class names (.layer, .title, …)
    let s = document.getElementById(STYLE_ID);
    if (!s) { s = document.createElement('style'); s.id = STYLE_ID; document.head.appendChild(s); }
    const listed = new Set(['core', ...p.meta.plugins]);
    const used = new Set(allItems(p).flatMap(({ track, item }) =>
      track.kind === 'scene' || track.kind === 'overlay' ? [(item as SceneItem).type.split('.')[0]] : []));
    const extra = [...used].filter((id) => !listed.has(id) && id in this.registry.cssById);
    if (extra.length) console.warn(`meta.plugins does not list ${extra.map((x) => `"${x}"`).join(', ')} (used by items); loading its styles anyway`);
    const css = [...listed, ...extra].map((id) => this.registry.cssById[id] ?? '').join('\n');
    if (s.textContent !== css) s.textContent = css;
    // every plugin's SVG filters live in one hidden <svg> (CSS filter: url(#id) finds them anywhere in the document).
    // All of them, not only the listed plugins': the grade menu offers every grade, ids are plugin-prefixed, and an unused filter is inert.
    const defs = Object.values(this.registry.svgById ?? {}).join('\n');
    let g = document.getElementById(SVG_ID) as (SVGSVGElement & { _defs?: string }) | null;
    if (!g) {
      g = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement & { _defs?: string };
      g.id = SVG_ID; g.setAttribute('width', '0'); g.setAttribute('height', '0'); g.setAttribute('aria-hidden', 'true');
      g.style.position = 'absolute';
      document.body.appendChild(g);
    }
    if (g._defs !== defs) { g.innerHTML = `<defs>${defs}</defs>`; g._defs = defs; }
  }

  private build(track: Track, item: AnyItem, p: Project): Layer {
    const el = h('div', 'st-item', null, this.root);
    el.dataset.id = item.id;
    cssCamel(el, { position: 'absolute', inset: '0', isolation: 'isolate', display: 'none' });
    const c: Common = { id: item.id, el, sig: sigOf(item), muted: !!track.muted };
    if (track.muted) return { ...c, kind: 'missing' };
    if (track.kind === 'video') {
      const it = item as VideoItem, tm = this.times.get(it.id)!;
      const frame = h('div', 'st-frame', null, el);
      cssCamel(frame, { position: 'absolute', overflow: 'hidden', background: '#000' });
      let kb: HTMLElement | null = null;
      if ((p.meta.videoScale ?? 'transform') === 'transform') {
        kb = h('div', 'st-kb', null, frame);
        cssCamel(kb, { position: 'absolute', inset: '0', willChange: 'transform' });
      }
      const img = p.sources[it.source]?.kind === 'image' ? this.media.image(it.source, kb ?? frame) : null;
      return { ...c, kind: 'video', frame, holder: kb ?? frame, kb, img, item: it, ref: videoRefOf(it, tm.start, tm.end) };
    }
    const it = item as SceneItem;
    const tcss = transformCss(it.transform, p.meta.width, p.meta.height);
    cssCamel(el, tcss);
    const type = this.registry.item(it.type);
    if (!type) {
      const m = h('div', 'st-missing', null, el);
      cssCamel(m, { position: 'absolute', inset: '0', background: MISSING_BG });
      console.warn(`Unknown item type "${it.type}" (${it.id})`);
      return { ...c, kind: 'missing' };
    }
    if (type.blend) cssCamel(el, { mixBlendMode: type.blend });
    const slot = h('div', null, null, this.top);
    slot.dataset.id = it.id;
    cssCamel(slot, { position: 'absolute', inset: '0', display: 'none', ...tcss });
    const params = withDefaults(type.params, it.params, resolveTheme(p.meta.theme, p.meta));
    try {
      // a typo in a media ref inside params must name the item, not surface later as a resolver TypeError
      const bad = itemMediaIssues(type, it, p, this.types);
      if (bad.length) throw new Error(bad.join('; '));
      const state = type.build(this.ctx(it, params, this.times.get(it.id)!.start, el, slot));
      return { ...c, kind: 'plugin', slot, item: it, params, type, state };
    } catch (e) {
      slot.remove();
      return this.fail(c, it, e);
    }
  }

  private ctx(item: SceneItem, params: Record<string, any>, t: number, root: HTMLElement, top: HTMLElement): ItemCtx {
    const tm = this.times.get(item.id)!;
    const { width: W, height: H, fps } = this.project.meta;
    return { t, local: t - tm.start, dur: tm.end - tm.start, item, params, root, top, project: this.project, media: this.media, W, H, fps, theme: resolveTheme(this.project.meta.theme, this.project.meta), types: this.types,
      grades: this.registry.grades ?? {}, ...(this.opts.three !== undefined ? { three: this.opts.three } : {}) };
  }

  draw(t: number) {
    this.media.begin();
    const { width: W, height: H } = this.project.meta;
    this.layers.forEach((L, i) => {
      const tm = this.times.get(L.id)!;
      const on = activeAt(tm, t);   // an end stored a hair late used to show over the next item for one frame
      showCamel(L.el, on);
      if (L.kind === 'plugin') {
        showCamel(L.slot, on);
        // hidden after showing: let the item free what it holds (it draws again when it comes back)
        if (!on && L.shown) { L.shown = false; try { L.type.hide?.(L.state); } catch (e) { console.error(e); } }
        if (on) L.shown = true;
      }
      if (!on) return;
      if (L.kind === 'video') {
        const s = videoState(L.item, tm.start, tm.end, t, W, H, this.registry.grades);
        cssCamel(L.frame, {
          left: `${s.frame.left}px`, top: `${s.frame.top}px`, width: `${s.frame.width}px`, height: `${s.frame.height}px`,
          transform: s.offsetX || s.offsetY ? `translate(${s.offsetX}px, ${s.offsetY}px)` : 'none',
          opacity: s.opacity.toFixed(3), filter: s.filter, borderRadius: s.radius ? `${s.radius}px` : '',
        });
        const src = this.project.sources[L.item.source];
        // a photo is placed like a video frame, without media time
        const v = L.img ?? this.media.video(L.ref, L.holder, s.mediaLocal, s.held);
        if (L.kb) {
          // video at its zoom-1 cover box, scaled by the wrapper around the focus point (original Wedding structure)
          const base = coverPlacement(src.width, src.height, s.frame.width, s.frame.height, { ...s.crop, zoom: 1 });
          const ax = base.left + s.crop.x * base.width, ay = base.top + s.crop.y * base.height;
          if (s.shakeX || s.shakeY || s.shakeScale !== 1) {
            // the shake grows the picture around the frame centre (not the focus), so no edge shows wherever the focus is
            const k = kbMatrix(ax, ay, s.crop.zoom, s.frame.width / 2, s.frame.height / 2, s.shakeScale, s.shakeX, s.shakeY);
            cssCamel(L.kb, { transformOrigin: '0 0', transform: `matrix(${k.m.toFixed(5)}, 0, 0, ${k.m.toFixed(5)}, ${k.tx.toFixed(2)}, ${k.ty.toFixed(2)})` });
          // subpixelZoom (previews): a layer that is only scaled is snapped to whole device pixels, so a slow zoom shown small
          // (e.g. at 150% display scaling) jumps back and forth; a 0.02° tilt makes the browser draw it at sub-pixel positions
          } else cssCamel(L.kb, { transformOrigin: `${ax}px ${ay}px`, transform: `scale(${s.crop.zoom.toFixed(4)})${this.opts.subpixelZoom && s.crop.zoom !== 1 ? ' rotate(0.02deg)' : ''}` });
          this.media.place(v, s.frame.width, s.frame.height, { ...s.crop, zoom: 1 }, src.width, src.height);
        } else {
          this.media.place(v, s.frame.width, s.frame.height, s.crop, src.width, src.height);
          // same rule without the wrapper: grow around the frame centre, given in the video box's own coordinates
          const b = coverPlacement(src.width, src.height, s.frame.width, s.frame.height, s.crop);
          cssCamel(v, s.shakeX || s.shakeY
            ? { transformOrigin: `${(s.frame.width / 2 - b.left).toFixed(2)}px ${(s.frame.height / 2 - b.top).toFixed(2)}px`, transform: `translate(${s.shakeX.toFixed(2)}px, ${s.shakeY.toFixed(2)}px) scale(${s.shakeScale.toFixed(4)})` }
            : { transformOrigin: '', transform: '' });
        }
      } else if (L.kind === 'plugin') {
        // a layer that moves (a sticker following a mouth): its place this frame
        const tf = L.item.transform;
        if (tf?.keys?.length) { const tcss = transformCss(transformAt(tf, t - tm.start), W, H); cssCamel(L.el, tcss); cssCamel(L.slot, tcss); }
        try { L.type.draw(this.ctx(L.item, L.params, t, L.el, L.slot), L.state); } catch (e) { L.slot.remove(); this.release(L); this.layers[i] = this.fail(L, L.item, e); }
      }
    });
  }

  /** The late pass, after the caller awaited media.sync(): items that read a video's current picture draw it now. */
  late(t: number) {
    this.layers.forEach((L, i) => {
      if (L.kind !== 'plugin' || !L.type.late || !activeAt(this.times.get(L.id)!, t)) return;
      try { L.type.late(this.ctx(L.item, L.params, t, L.el, L.slot), L.state); } catch (e) { L.slot.remove(); this.release(L); this.layers[i] = this.fail(L, L.item, e); }
    });
  }

  /** Every plugin item's own assets loaded. A failure fails an export (strict) and is reported in a preview. */
  async ready(): Promise<void> {
    await Promise.all(this.layers.map(async (L) => {
      if (L.kind !== 'plugin' || !L.type.ready) return;
      try { await L.type.ready(L.state); } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (this.opts.strict) throw new Error(`${L.id}: ${m}`);
        this.opts.onError?.(L.id, m);
      }
    }));
  }

  mediaRefs(): MediaRef[] {
    return this.layers.flatMap((L) => (L.kind === 'video' ? (L.img ? [] : [L.ref]) : L.kind === 'plugin' && L.type.media ? L.type.media({ ...L.item, params: L.params }, this.project, this.types).videos : []));
  }
}
