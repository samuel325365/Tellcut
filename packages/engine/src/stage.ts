// Compositor: one isolated layer per visual item, stacked by track order then array order.
// draw(t) sets every layer's state as a pure function of t; the caller then awaits media.sync().
import type { AnyItem, Project, SceneItem, Track, Transform, VideoItem } from './schema.ts';
import { allItems } from './schema.ts';
import { activeAt, resolveTimes, type Times } from './time.ts';
import { coverPlacement, kbMatrix, videoState, type VideoLink, type VideoState } from './geometry.ts';
import { fitText, isNamedShape, textFont, type FittedText, type InkBox, type TextShape } from './shapes.ts';
import { videoLinks } from './pairs.ts';
import type { ItemCtx, ItemType, MediaRef } from './plugin.ts';
import { withDefaults, type Registry } from './registry.ts';
import { resolveTheme } from './theme.ts';
import type { MediaPool } from './media/pool.ts';
import { videoRefOf } from './media/refs.ts';
import { attr, cssCamel, h, showCamel } from './util.ts';
import { motion } from './motion.ts';
import { itemMediaIssues } from './validate.ts';
import { NO_REPORT, textReporter, type ReportedText } from './report.ts';

/** a video layer's own blur filter: the CSS filter() that names it and its feGaussianBlur, with the deviation last written */
type Streak = { url: string; blur: SVGElement; dev: string };
const SVG_NS = 'http://www.w3.org/2000/svg';
/** streak filter ids, document-wide (several stages may share a page) */
let streakSeq = 0;
/** A blur of the frame that leaves no fringe at its edges: a CSS blur() (or feGaussianBlur's edgeMode, which Chrome ignores on an
 *  element's filter) fades the frame's edge rows into transparency, showing what is under them. Here the blur's alpha is set back
 *  to full (feComponentTransfer works on unpremultiplied colour, so an edge pixel keeps the colour of the picture near it, as if
 *  the edge were repeated) and cut to the frame's own alpha again, so rounded corners stay round. The region is the frame's box;
 *  the deviation is in the frame's own px (userSpaceOnUse), "x y". */
function streakFilter(parent: HTMLElement): Streak {
  const id = `tc-streak-${++streakSeq}`, el = (name: string, a: Record<string, string>, to: Element) => {
    const e = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
    to.appendChild(e);
    return e;
  };
  const svg = el('svg', { width: '0', height: '0', 'aria-hidden': 'true' }, parent) as SVGSVGElement;
  svg.style.position = 'absolute';
  const f = el('filter', { id, x: '0', y: '0', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB', primitiveUnits: 'userSpaceOnUse' }, svg);
  const blur = el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '0 0', result: 'b' }, f);
  const ct = el('feComponentTransfer', { in: 'b', result: 'o' }, f);
  el('feFuncA', { type: 'table', tableValues: '1 1' }, ct);
  el('feComposite', { in: 'o', in2: 'SourceAlpha', operator: 'in' }, f);
  return { url: `url(#${id})`, blur, dev: '0 0' };
}

const svgEl = <K extends keyof SVGElementTagNameMap>(name: K, a: Record<string, string>, to: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
  to.appendChild(e);
  return e;
};
/** A video layer's text shape: an SVG <clipPath> of <text> rows (one per line) the frame is cut to through clip-path: url(#id),
 *  in the frame's own px (userSpaceOnUse is the frame's box for an HTML element); `key` says what the rows were last fitted for. */
type TextClip = { url: string; clip: SVGClipPathElement; key: string; fit: FittedText | null };
/** text-shape clip ids, document-wide like the streak's */
let textSeq = 0;
function makeTextClip(parent: HTMLElement): TextClip {
  const id = `tc-text-${++textSeq}`, svg = svgEl('svg', { width: '0', height: '0', 'aria-hidden': 'true' }, parent);
  svg.style.position = 'absolute';
  return { url: `url(#${id})`, clip: svgEl('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, svg), key: '', fit: null };
}
/** The outline drawn over a video layer's picture: an SVG the size of the frame, moved, grown and faded with it, holding the line
 *  on the shape's path, the frame's rounded rectangle, or the text shape's letters (whichever the clip has). */
type Deco = { svg: SVGSVGElement; path: SVGPathElement; rect: SVGRectElement; text: SVGGElement; key: string };
function decoOf(parent: HTMLElement, under: HTMLElement | null): Deco {
  const svg = svgEl('svg', { 'aria-hidden': 'true', class: 'st-outline' }, parent);
  if (under) parent.insertBefore(svg, under);
  // above the frame (later in the item's own stacking context; `under`: just below it), never catching the pointer
  cssCamel(svg as unknown as HTMLElement, { position: 'absolute', overflow: 'visible', pointerEvents: 'none' });
  const paint = { fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  return { svg, path: svgEl('path', paint, svg), rect: svgEl('rect', paint, svg), text: svgEl('g', paint, svg), key: '' };
}

/** A line's ink at font size 100 (canvas TextMetrics' actual box, which a heavy display face fills to its edges). Without a canvas
 *  (jsdom) a rough guess: wide letters as tall as capitals. */
let inkCanvas: CanvasRenderingContext2D | null | undefined;
function inkOf(font: string): (line: string) => InkBox {
  // jsdom has a canvas whose getContext only complains: no canvas there
  if (inkCanvas === undefined) { try { inkCanvas = /jsdom/.test(navigator.userAgent) ? null : document.createElement('canvas').getContext('2d'); } catch { inkCanvas = null; } }
  const g = inkCanvas;
  if (!g) return (line) => ({ left: 0, right: 62 * [...line].length, ascent: 72, descent: 0 });
  return (line) => { g.font = font; const m = g.measureText(line); return { left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent }; };
}
/** the CSS font family of a theme font: quoted unless it is already a list */
const family = (f: string) => (/[,'"]/.test(f) ? f : `"${f}"`);
/** a fitted text shape's rows as <text> elements (made in `parent`'s document, not attached) */
function textRows(fit: FittedText, fam: string, weight: number, parent: Element): SVGTextElement[] {
  return fit.rows.map((r) => {
    const t = parent.ownerDocument.createElementNS(SVG_NS, 'text');
    for (const [k, v] of Object.entries({ x: r.x, y: r.y, 'font-family': fam, 'font-weight': weight, 'font-size': fit.size })) t.setAttribute(k, String(v));
    t.textContent = r.text;
    return t;
  });
}

/** sig = the item's JSON: update() compares content, since projects posted into the preview iframe are copies. */
/** `more`: the item's further layers, one per blend mode after its first (ItemType.blend), each right above `el` */
type Common = { id: string; el: HTMLElement; sig: string; muted: boolean; more?: HTMLElement[] };
type Layer =
  | (Common & { kind: 'video'; frame: HTMLElement; holder: HTMLElement; kb: HTMLElement | null; img: HTMLImageElement | null; item: VideoItem; ref: MediaRef;
      /** made the first time a transition needs them, then kept: the veil over the picture, the streak's filter */
      veil?: HTMLElement; streak?: Streak;
      /** made the first time the clip needs them: its text shape's clipPath, its outline */
      text?: TextClip; deco?: Deco;
      /** a clip stacked under the clip its linked transition comes from: its own z-index, the one just above that clip's, and the
       *  time the transition ends (restack) */
      lift?: { base: string; z: string; until: number } })
  | (Common & { kind: 'plugin'; slot: HTMLElement; item: SceneItem; params: Record<string, any>; type: ItemType; state: unknown; shown?: boolean; readied?: Promise<void> })
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
/** a layer's elements: its own and the further ones of its other blend modes */
const layerEls = (L: { el: HTMLElement; more?: HTMLElement[] }) => (L.more ? [L.el, ...L.more] : [L.el]);
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
  /** the video clips in a linked transition, made with the times: a kept layer A still learns of a new transition on the clip after it */
  private links = new Map<string, VideoLink>();
  private layers: Layer[] = [];
  /** another registered item type, by id (ctx.types and media()'s third argument) */
  private types = (type: string) => this.registry.item(type);
  private top!: HTMLElement;
  /** this frame's ctx.reportText boxes (opts.measure), emptied at every draw() */
  private reports: ReportedText[] = [];
  /** strict (render mode): a failing item aborts with its id instead of becoming a placeholder */
  constructor(private root: HTMLElement, private registry: Registry, private media: MediaPool,
    private opts: { strict?: boolean; /** coded: the code and params the editor words the error by in its language (err.<code>) */
      onError?: (itemId: string, message: string, coded?: { code: string; params: Record<string, string> }) => void; /** previews: see draw() */ subpixelZoom?: boolean;
      /** the ThreeKit handed to every item as ctx.three (the player loads it when usesThree) */ three?: unknown;
      /** keep what items report with ctx.reportText (the player's render mode, which check measures); otherwise it is a no-op */ measure?: boolean } = {}) {}

  private fail(L: Common, item: SceneItem, e: unknown): Layer {
    const error = String((e as Error)?.message ?? e), msg = `Item "${item.id}" (${item.type}): ${error}`;
    if (this.opts.strict) throw new Error(msg);
    this.opts.onError?.(item.id, msg, { code: 'player.itemFailed', params: { type: item.type, error } });
    console.error(msg);
    for (const m of L.more ?? []) m.remove();
    L.el.innerHTML = '';
    const m = h('div', 'st-missing', null, L.el);
    cssCamel(m, { position: 'absolute', inset: '0', background: MISSING_BG });
    return { kind: 'missing', id: L.id, el: L.el, sig: L.sig, muted: L.muted };
  }

  load(p: Project) {
    this.project = p;
    this.times = resolveTimes(p);
    this.links = videoLinks(p, this.times);
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
    this.links = videoLinks(p, this.times);
    this.styles(p);
    const old = new Map(this.layers.map((L) => [L.id, L]));
    const next: Layer[] = [];
    for (const { track, item } of allItems(p)) {
      if (!VISUAL.has(track.kind)) continue;
      const L = old.get(item.id), a = before.get(item.id), b = this.times.get(item.id)!;
      if (L && L.sig === sigOf(item) && L.muted === !!track.muted && a && a.start === b.start && a.end === b.end) {
        if (L.kind !== 'video') { const tcss = transformCss((item as SceneItem).transform, p.meta.width, p.meta.height); for (const e of layerEls(L)) cssCamel(e, tcss); if (L.kind === 'plugin') cssCamel(L.slot, tcss); }
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
    for (const e of layerEls(L)) e.remove();
    if (L.kind === 'plugin') L.slot.remove();
    this.release(L);
  }

  private release(L: Layer) {
    if (L.kind === 'plugin') { try { L.type.dispose?.(L.state); } catch (e) { console.error(e); } }
  }

  /** z-order follows track order then array order, in steps of two: a clip stacked under the clip its linked transition comes
   *  from (moved below it on the timeline, or that clip moved to start first) is drawn one above that clip while the transition
   *  runs, as every transition is drawn with the incoming clip on top, and nothing else changes place. The top container stays
   *  above all items. */
  private restack() {
    const z = new Map<string, number>();
    this.layers.forEach((L, i) => { z.set(L.id, 2 * (i + 1)); for (const e of layerEls(L)) e.style.zIndex = String(2 * (i + 1)); if (L.kind === 'plugin') this.top.appendChild(L.slot); });
    for (const L of this.layers) {
      if (L.kind !== 'video') continue;
      const under = this.links.get(L.id)?.lift, tm = this.times.get(L.id)!, tr = L.item.transitionIn;
      L.lift = under && z.has(under) && tr ? { base: String(z.get(L.id)), z: String(z.get(under)! + 1), until: tm.start + tr.dur } : undefined;
    }
    this.top.style.zIndex = String(2 * this.layers.length + 2);
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
    const modes = typeof type.blend === 'string' ? [type.blend] : type.blend ?? [];
    if (modes[0]) cssCamel(el, { mixBlendMode: modes[0] });
    // a further mode is a layer of its own, isolated like the item's, right after it at the same stacking (same z-index: the order
    // in the document decides), so it blends with the picture the item's first layer already made
    let after = el;
    const more = modes.slice(1).map((mode) => {
      const x = document.createElement('div');
      x.className = 'st-more';
      x.dataset.id = it.id;
      cssCamel(x, { position: 'absolute', inset: '0', isolation: 'isolate', display: 'none', mixBlendMode: mode, ...tcss });
      after.after(x);
      after = x;
      return x;
    });
    if (more.length) c.more = more;
    const slot = h('div', null, null, this.top);
    slot.dataset.id = it.id;
    cssCamel(slot, { position: 'absolute', inset: '0', display: 'none', ...tcss });
    const params = withDefaults(type.params, it.params, resolveTheme(p.meta.theme, p.meta));
    try {
      // a typo in a media ref inside params must name the item, not surface later as a resolver TypeError
      const bad = itemMediaIssues(type, it, p, this.types);
      if (bad.length) throw new Error(bad.join('; '));
      const state = type.build(this.ctx(it, params, this.times.get(it.id)!.start, el, slot, more));
      return { ...c, kind: 'plugin', slot, item: it, params, type, state };
    } catch (e) {
      slot.remove();
      return this.fail(c, it, e);
    }
  }

  private ctx(item: SceneItem, params: Record<string, any>, t: number, root: HTMLElement, top: HTMLElement, more: HTMLElement[] = []): ItemCtx {
    const tm = this.times.get(item.id)!;
    const { width: W, height: H, fps } = this.project.meta;
    return { t, local: t - tm.start, dur: tm.end - tm.start, item, params, root, top, layers: more, project: this.project, media: this.media, W, H, fps, theme: resolveTheme(this.project.meta.theme, this.project.meta), types: this.types,
      grades: this.registry.grades ?? {}, motion, reportText: this.opts.measure ? textReporter(item.id, this.reports, root, W, H) : NO_REPORT, ...(this.opts.three !== undefined ? { three: this.opts.three } : {}) };
  }

  draw(t: number) {
    this.media.begin();
    this.reports = [];
    const { width: W, height: H } = this.project.meta;
    this.layers.forEach((L, i) => {
      const tm = this.times.get(L.id)!;
      const on = activeAt(tm, t);   // an end stored a hair late used to show over the next item for one frame
      for (const e of layerEls(L)) showCamel(e, on);
      if (L.kind === 'plugin') {
        showCamel(L.slot, on);
        // hidden after showing: let the item free what it holds (it draws again when it comes back)
        if (!on && L.shown) { L.shown = false; try { L.type.hide?.(L.state); } catch (e) { console.error(e); } }
        if (on) L.shown = true;
      }
      if (!on) return;
      if (L.kind === 'video') {
        const s = videoState(L.item, tm.start, tm.end, t, W, H, this.registry.grades, this.links.get(L.id));
        if (L.lift) { const z = t < L.lift.until ? L.lift.z : L.lift.base; if (L.el.style.zIndex !== z) L.el.style.zIndex = z; }
        const move = s.offsetX || s.offsetY ? `translate(${s.offsetX}px, ${s.offsetY}px)` : '';
        // a streak (a transition's blur, a defocus): the layer's own filter after the grade's; its deviation written only when it changes
        let filter = s.filter;
        if (s.streak[0] > 0 || s.streak[1] > 0) {
          const k = (L.streak ??= streakFilter(L.el)), dev = `${s.streak[0]} ${s.streak[1]}`;
          if (k.dev !== dev) { k.blur.setAttribute('stdDeviation', dev); k.dev = dev; }
          filter = filter === 'none' ? k.url : `${filter} ${k.url}`;
        }
        const box = {
          left: `${s.frame.left}px`, top: `${s.frame.top}px`, width: `${s.frame.width}px`, height: `${s.frame.height}px`,
          // the frame grows round its own centre (the default transform-origin)
          transform: s.scale !== 1 ? `${move ? `${move} ` : ''}scale(${s.scale.toFixed(4)})` : move || 'none',
          opacity: s.opacity.toFixed(3),
        };
        cssCamel(L.frame, { ...box, filter, borderRadius: s.radius ? `${s.radius}px` : '', clipPath: s.text ? this.textClip(L, s) : s.clipPath });
        this.dress(L, s, box);
        // a veil: over the picture inside the frame, so the frame's corners and shape cut it too
        if (s.veil) {
          if (!L.veil) { L.veil = h('div', 'st-veil', null, L.frame); cssCamel(L.veil, { position: 'absolute', inset: '0', zIndex: '1', pointerEvents: 'none' }); }
          cssCamel(L.veil, { display: '', background: s.veil.color, opacity: s.veil.opacity.toFixed(4) });
        } else if (L.veil) cssCamel(L.veil, { display: 'none' });
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
        if (tf?.keys?.length) { const tcss = transformCss(transformAt(tf, t - tm.start), W, H); for (const e of layerEls(L)) cssCamel(e, tcss); cssCamel(L.slot, tcss); }
        try { L.type.draw(this.ctx(L.item, L.params, t, L.el, L.slot, L.more), L.state); } catch (e) { L.slot.remove(); this.release(L); this.layers[i] = this.fail(L, L.item, e); }
      }
    });
  }

  /** The text shape's clip-path for a video layer: its rows fitted to the frame again only when the words, the font (or whether
   *  it has loaded: before it has, the rows are fitted to the fallback's measures, and once it has they are fitted again), the
   *  frame's size or the inset change. */
  private textClip(L: Extract<Layer, { kind: 'video' }>, s: VideoState): string {
    const tc = (L.text ??= makeTextClip(L.el)), sh = s.text!, { font, fam, weight } = this.textFontOf(sh);
    const loaded = typeof document !== 'undefined' && document.fonts?.check ? document.fonts.check(font, sh.text) : true;
    const key = `${font}|${sh.text}|${sh.line ?? ''}|${s.frame.width}|${s.frame.height}|${s.inset}|${loaded}`;
    if (tc.key !== key) {
      tc.key = key;
      tc.fit = fitText(sh, s.frame.width, s.frame.height, inkOf(font), s.inset);
      tc.clip.replaceChildren(...textRows(tc.fit, fam, weight, tc.clip));
    }
    return tc.url;
  }

  /** a text shape's font from the project's theme: the CSS font at size 100 (to measure and load), its family and weight */
  private textFontOf(sh: TextShape) {
    const { role, weight } = textFont(sh), fam = family(resolveTheme(this.project.meta.theme, this.project.meta).fonts[role]);
    return { font: `${weight} 100px ${fam}`, fam, weight };
  }

  /** A video layer's dressing: the shadow on the item's own layer (a drop-shadow follows what the layer shows: the frame as its
   *  shape cuts it, and the outline), the outline over the picture, moved, grown and faded with the frame (`box`). */
  private dress(L: Extract<Layer, { kind: 'video' }>, s: VideoState, box: Record<string, string>) {
    const sd = s.shadow, n = (v: number) => +v.toFixed(2);
    cssCamel(L.el, { filter: sd ? `drop-shadow(0px ${n(sd.y)}px ${n(sd.blur)}px rgba(0, 0, 0, ${n(sd.opacity)}))` : '' });
    const o = s.outline;
    if (!o) { if (L.deco) cssCamel(L.deco.svg as unknown as HTMLElement, { display: 'none' }); return; }
    // A text shape's line goes under the picture, twice as wide: a font's glyphs are often drawn as overlapping contours (an A's
    // bar, most CJK strokes), whose stroke on top would show lines crossing inside the letters; under the picture only the half
    // outside the letters shows, the outline of the word as read. (A shape's path is one contour: its line goes on top, its inner
    // half covering the picture's cut edge.)
    const d = (L.deco ??= decoOf(L.el, s.text ? L.frame : null)), kind = s.text ? 'text' : o.path ? 'path' : 'rect', w = n(kind === 'text' ? 2 * o.width : o.width);
    cssCamel(d.svg as unknown as HTMLElement, { display: '', transformOrigin: '50% 50%', ...box });
    attr(d.path, { display: kind === 'path' ? 'inline' : 'none' }); attr(d.rect, { display: kind === 'rect' ? 'inline' : 'none' }); attr(d.text, { display: kind === 'text' ? 'inline' : 'none' });
    const paint = { stroke: o.color, 'stroke-width': w };
    if (kind === 'path') attr(d.path, { d: o.path, ...paint });
    else if (kind === 'rect') {
      // on the frame's edge, half the width in, its corners following the frame's rounded ones
      const r = n(Math.max(0, s.radius - o.width / 2));
      attr(d.rect, { x: n(o.width / 2), y: n(o.width / 2), width: n(Math.max(0, s.frame.width - o.width)), height: n(Math.max(0, s.frame.height - o.width)), rx: r, ry: r, ...paint });
    } else {
      // the letters' own edges: the rows the clip was just fitted to, stroked
      attr(d.text, paint);
      const tc = L.text!;
      if (d.key !== tc.key && tc.fit) { const { fam, weight } = this.textFontOf(s.text!); d.text.replaceChildren(...textRows(tc.fit, fam, weight, d.text)); d.key = tc.key; }
    }
  }

  /** The late pass, after the caller awaited media.sync(): items that read a video's current picture draw it now. */
  late(t: number) {
    this.layers.forEach((L, i) => {
      if (L.kind !== 'plugin' || !L.type.late || !activeAt(this.times.get(L.id)!, t)) return;
      try { L.type.late(this.ctx(L.item, L.params, t, L.el, L.slot, L.more), L.state); } catch (e) { L.slot.remove(); this.release(L); this.layers[i] = this.fail(L, L.item, e); }
    });
  }

  /** Every plugin item's own assets loaded. A failure fails an export (strict) and is reported in a preview.
   *  Once per layer: a preview edit keeps the unchanged layers, and their ready (a three.js block building its scene) must not
   *  run again over the old state. A failed load is forgotten, so the next edit tries it again. */
  async ready(): Promise<void> {
    await Promise.all(this.layers.map(async (L) => {
      // a text shape's font, for its letters' first frame (the rows are fitted to its measures)
      if (L.kind === 'video' && isNamedShape(L.item.shape) && L.item.shape.type === 'text') {
        const sh = L.item.shape;
        if (typeof document !== 'undefined' && document.fonts) await document.fonts.load(this.textFontOf(sh).font, sh.text).catch(() => []);
        return;
      }
      if (L.kind !== 'plugin' || !L.type.ready) return;
      try { await (L.readied ??= L.type.ready(L.state)); } catch (e) {
        L.readied = undefined;
        const m = e instanceof Error ? e.message : String(e);
        if (this.opts.strict) throw new Error(`${L.id}: ${m}`);
        this.opts.onError?.(L.id, m, { code: 'player.itemNotReady', params: { type: L.item.type, error: m } });
      }
    }));
  }

  /** the words items reported drawing in the last draw() and late() (ctx.reportText; empty unless opts.measure), in each element's
   *  own pixels: reportedBoxes() places them on the stage */
  textReports(): ReportedText[] { return this.reports; }

  mediaRefs(): MediaRef[] {
    return this.layers.flatMap((L) => (L.kind === 'video' ? (L.img ? [] : [L.ref]) : L.kind === 'plugin' && L.type.media ? L.type.media({ ...L.item, params: L.params }, this.project, this.types).videos : []));
  }
}
