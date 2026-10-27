// Preview tools in the editor (embed mode): click to select, drag the box to move, drag a corner or wheel to scale.
import { resolveTheme, withDefaults, type Project, type Registry, type SceneItem, type Transform } from '@tellcut/engine';
import { inside, isFullFrame, movedTransform, pickAt, rankHits, scaledTransform, textParamFor, union, type Rect } from './tools-geom.ts';
import type { ToolMsg } from '@tellcut/protocol';

export type { ToolMsg };
type Deps = { project: () => Project | null; registry: Registry; busy: () => boolean };

const CONTENT = 'video, img, svg, canvas, .st-frame';
export const ownText = (e: Element) => [...e.childNodes].some((n) => n.nodeType === 3 && !!n.textContent?.trim());
const toRect = (r: DOMRect): Rect => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

export class StageTools {
  private sel: string | null = null;
  private box: HTMLElement;
  private dragged = false;
  private wheelTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private stageEl: HTMLElement, private viewport: HTMLElement, private post: (m: ToolMsg) => void, private d: Deps) {
    this.box = document.createElement('div');
    this.box.className = 'sel-box';
    this.box.innerHTML = ['nw', 'ne', 'sw', 'se'].map((c) => `<i class="sel-h" data-corner="${c}"></i>`).join('');
    this.box.style.display = 'none';
    viewport.appendChild(this.box);
    viewport.addEventListener('click', (e) => this.click(e));
    viewport.addEventListener('dblclick', (e) => this.dblclick(e));
    this.box.addEventListener('mousedown', (e) => this.drag(e));
    this.box.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
  }

  /** Visible item layers, topmost first. */
  private layers(): HTMLElement[] {
    return [...this.stageEl.querySelectorAll<HTMLElement>(':scope > .st-item[data-id]')]
      .filter((e) => e.style.display !== 'none').sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex));
  }

  /** Screen rects of what an item visibly draws (text, images, svg, canvas, video); with `at`, only those under that point.
   *  The cheap rect test runs before the computed-style check (Kyoto scenes have hundreds of elements). */
  rectsOf(id: string, at?: { x: number; y: number }): Rect[] {
    const roots = [...this.stageEl.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)];
    return roots.flatMap((r) => [...r.querySelectorAll('*')])
      .filter((e) => e.matches(CONTENT) || ownText(e))
      .map((e) => ({ e, r: toRect(e.getBoundingClientRect()) }))
      .filter(({ e, r }) => r.right - r.left > 0 && r.bottom - r.top > 0 && (!at || inside(r, at.x, at.y)) && this.visible(e))
      .map(({ r }) => r);
  }

  /** Visible: computed visibility (inherited, so the element itself is enough), and no ancestor faded below 5% opacity. */
  private visible(e: Element): boolean {
    if (getComputedStyle(e).visibility === 'hidden') return false;
    for (let el: Element | null = e; el && el !== this.stageEl; el = el.parentElement) { const o = getComputedStyle(el).opacity; if (o !== '' && Number(o) < 0.05) return false; }
    return true;
  }

  private hitsAt(x: number, y: number) {
    return this.layers().map((l) => ({ id: l.dataset.id!, rects: this.rectsOf(l.dataset.id!, { x, y }) })).filter((h) => h.rects.length);
  }
  itemsAt(x: number, y: number): string[] { return rankHits(this.hitsAt(x, y), toRect(this.stageEl.getBoundingClientRect())); }

  protected item(id: string | null) {
    const p = this.d.project();
    if (!p || !id) return null;
    for (const t of p.tracks) if (t.kind === 'scene' || t.kind === 'overlay') { const it = (t.items as SceneItem[]).find((i) => i.id === id); if (it) return it; }
    return null;
  }

  private click(e: MouseEvent) {
    if (this.dragged) { this.dragged = false; return; }
    if (this.d.busy() || (e.target as HTMLElement).closest?.('.text-edit')) return;
    const hits = this.hitsAt(e.clientX, e.clientY), stage = toRect(this.stageEl.getBoundingClientRect()), ids = rankHits(hits, stage);
    // a gap inside the current selection's box (between two lines of a title) keeps it selected, even with a
    // full-frame clip or scene underneath (there always is one in a real project)
    const u = this.sel ? union(this.rectsOf(this.sel)) : null;
    if (!e.altKey && u && inside(u, e.clientX, e.clientY) && !hits.some((h) => h.rects.some((r) => !isFullFrame(r, stage)))) return;
    this.post({ type: 'pick', itemId: pickAt(ids, this.sel, e.altKey) });
  }

  select(id: string | null) { this.sel = id; this.refresh(); }

  refresh() {
    const u = !this.d.busy() && this.item(this.sel) ? union(this.rectsOf(this.sel!)) : null;
    if (!u) { this.box.style.display = 'none'; return; }
    const v = this.viewport.getBoundingClientRect();
    Object.assign(this.box.style, { display: 'block', left: `${u.left - v.left}px`, top: `${u.top - v.top}px`, width: `${u.right - u.left}px`, height: `${u.bottom - u.top}px` });
  }

  /** the stage's screen rect, screen px per stage px, and the frame size */
  private fit() { const r = this.stageEl.getBoundingClientRect(), p = this.d.project()!; return { r, k: r.width / p.meta.width, W: p.meta.width, H: p.meta.height }; }

  private drag(e: MouseEvent) {
    const it = this.item(this.sel);
    if (!it || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const id = it.id, t0 = it.transform, { r, k, W, H } = this.fit();
    const corner = (e.target as HTMLElement).dataset.corner;
    const u = union(this.rectsOf(id))!, cx = (u.left + u.right) / 2, cy = (u.top + u.bottom) / 2;
    const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    // scaling turns around the on-screen centre of what the item draws
    const anchor = { cx: (cx - r.left) / r.width, cy: (cy - r.top) / r.height };
    let last: Transform | null = null;
    const move = (m: MouseEvent) => {
      last = corner ? scaledTransform(t0, Math.hypot(m.clientX - cx, m.clientY - cy) / d0, anchor)
        : movedTransform(t0, (m.clientX - e.clientX) / k / W, (m.clientY - e.clientY) / k / H);
      this.dragged = true;
      this.post({ type: 'transformChange', itemId: id, transform: last, final: false });
    };
    const up = () => {
      removeEventListener('mousemove', move); removeEventListener('mouseup', up);
      // the click that follows a drag is swallowed; released outside the preview there is none, so clear the flag anyway
      setTimeout(() => { this.dragged = false; }, 0);
      if (last) this.post({ type: 'transformChange', itemId: id, transform: last, final: true });
    };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  }

  private hintTimer: ReturnType<typeof setTimeout> | undefined;
  private hint(text: string) {
    let h = this.viewport.querySelector<HTMLElement>('.tool-hint');
    if (!h) { h = document.createElement('div'); h.className = 'tool-hint'; this.viewport.appendChild(h); }
    h.textContent = text; h.style.display = 'block';
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { h!.style.display = 'none'; }, 2000);
  }

  /** The smallest text element under the pointer in the topmost layer that has one. Rect-based rather than
   *  elementsFromPoint: pointer-events is inherited and the top slots have it off. */
  private textAt(x: number, y: number): { el: Element; id: string } | null {
    for (const layer of this.layers()) {
      const id = layer.dataset.id!;
      const roots = [...this.stageEl.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)];
      const hits = roots.flatMap((r) => [...r.querySelectorAll('*')]).filter((e) => (ownText(e) || e.tagName.toLowerCase() === 'text') && this.visible(e))
        .map((el) => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0 && inside(toRect(r), x, y))
        .sort((a, b) => a.r.width * a.r.height - b.r.width * b.r.height);
      if (hits.length) return { el: hits[0].el, id };
    }
    return null;
  }

  private dblclick(e: MouseEvent) {
    // a double-click inside the open text box selects a word there; it must not open another box
    if (this.d.busy() || (e.target as HTMLElement).closest?.('.text-edit')) return;
    const hit = this.textAt(e.clientX, e.clientY), it = this.item(hit?.id ?? null);
    if (!hit || !it) return;
    const defs = (this.d.registry.item(it.type)?.params ?? []).filter((p) => p.type === 'string' || p.type === 'text');
    const values = withDefaults(defs, it.params, resolveTheme(this.d.project()?.meta.theme, this.d.project()?.meta));
    const chain: Element[] = [];
    for (let el: Element | null = hit.el; el && !(el as HTMLElement).dataset?.id; el = el.parentElement) chain.push(el);
    const found = textParamFor(chain.map((el) => el.textContent ?? ''), defs.map((p) => ({ key: p.key, value: String(values[p.key] ?? '') })));
    this.post({ type: 'pick', itemId: it.id });
    if (!found) { this.hint('這段文字請在右側屬性面板修改'); return; }
    const def = defs.find((p) => p.key === found.key)!, target = chain[found.index].getBoundingClientRect(), v = this.viewport.getBoundingClientRect();
    const box = document.createElement(def.type === 'text' ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
    box.className = 'text-edit';
    box.value = String(values[found.key] ?? '');
    Object.assign(box.style, { left: `${target.left - v.left}px`, top: `${target.top - v.top}px`, minWidth: `${Math.max(160, target.width)}px` });
    this.viewport.appendChild(box);
    box.focus(); box.select();
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      if (commit && box.value !== String(values[found.key] ?? '')) this.post({ type: 'paramEdit', itemId: it.id, key: found.key, value: box.value });
      box.remove();
    };
    box.addEventListener('keydown', (ev) => {
      const k = ev as KeyboardEvent;
      k.stopPropagation();
      if (k.isComposing || k.keyCode === 229) return;   // the input method owns Enter while composing
      if (k.key === 'Escape') finish(false);
      else if (k.key === 'Enter' && (def.type !== 'text' || k.ctrlKey)) { k.preventDefault(); finish(true); }
    });
    box.addEventListener('blur', () => finish(true));
  }

  /** a wheel burst: built on its own last step (the preview's copy of the project lags behind) */
  private burst: { id: string; t: Transform } | null = null;

  private wheel(e: WheelEvent) {
    const it = this.item(this.sel);
    if (!it) return;
    e.preventDefault();
    let t: Transform;
    if (this.burst?.id === it.id) t = scaledTransform(this.burst.t, Math.pow(1.1, -e.deltaY / 100));
    else {
      const { r } = this.fit(), u = union(this.rectsOf(it.id))!;
      // the first step of a burst re-anchors at the content centre; later steps keep that origin
      t = scaledTransform(it.transform, Math.pow(1.1, -e.deltaY / 100), { cx: ((u.left + u.right) / 2 - r.left) / r.width, cy: ((u.top + u.bottom) / 2 - r.top) / r.height });
    }
    this.burst = { id: it.id, t };
    this.post({ type: 'transformChange', itemId: it.id, transform: t, final: false });
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => { this.burst = null; this.post({ type: 'transformChange', itemId: it.id, transform: t, final: true }); }, 300);
  }
}
