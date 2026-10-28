// A press on a clip selects it (Shift adds or removes); dragging 3 px or more moves or trims it, following the rows as they
// are now (a single item may change track).
import { rowAt } from '../geometry.ts';
import { follow, mods, type GestureCtx } from './follow.ts';

/** true when the press was on a clip (handled here) */
export function startItemDrag(e: MouseEvent, g: GestureCtx): boolean {
  const target = e.target as HTMLElement, el = target.closest<HTMLElement>('[data-item-id]');
  if (!el) return false;
  e.preventDefault();
  if (g.locked.has(el.dataset.track!)) return true;    // locked: no select, no drag
  const rect = g.rowsEl.getBoundingClientRect(), y = (cy: number) => cy - rect.top;
  const id = el.dataset.itemId!, grip = (target.dataset.edge as 'start' | 'end' | undefined) ?? 'body';
  const sel = e.shiftKey ? (g.selection.includes(id) ? g.selection.filter((i) => i !== id) : [...g.selection, id]) : g.selection.includes(id) ? g.selection : [id];
  g.editor.select(sel);
  let started = false;
  const move = (m: MouseEvent) => {
    if (!started && Math.abs(m.clientX - e.clientX) < 3 && Math.abs(m.clientY - e.clientY) < 3) return;
    if (!started) { started = true; g.editor.beginDrag({ grip, id, mods: mods(e), selection: sel }); }
    const row = rowAt(g.rows(), y(m.clientY));
    // changing track only for a single item (moveItems refuses more)
    g.editor.dragTo(m.clientX - e.clientX, mods(m), row && row.track.id !== el.dataset.track && sel.length <= 1 ? row.track.id : undefined);
  };
  follow(move, () => { if (started) g.editor.endDrag(); });
  return true;
}
