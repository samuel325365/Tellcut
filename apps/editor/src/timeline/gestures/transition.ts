// A transition block: its right edge sets the length (live, one undo step on release); a click selects the clip.
// An overlap: a click (no drag) adds a dissolve or toggles a crossfade; a drag still moves the clip under it.
import { allItems } from '@tellcut/engine';
import { follow, type GestureCtx } from './follow.ts';

/** true when the press was on a transition block (handled here) */
export function startTransitionDrag(e: MouseEvent, g: GestureCtx): boolean {
  const target = e.target as HTMLElement, el = target.closest<HTMLElement>('[data-item-id]'), trEl = target.closest<HTMLElement>('[data-transition]');
  if (!trEl || !el) return false;
  e.preventDefault(); e.stopPropagation();
  if (g.locked.has(el.dataset.track!)) return true;      // locked: no select, no length change
  const id = trEl.dataset.transition!;
  if (!target.hasAttribute('data-transition-edge')) { g.editor.select([id]); return true; }
  // relative to where the drag began: a short transition's block is drawn wider than it is
  const dur0 = (allItems(g.p).find((x) => x.item.id === id)?.item as any)?.transitionIn?.dur ?? 0;
  follow((m) => g.editor.previewTransitionDur(id, dur0 + (m.clientX - e.clientX) / g.view.pps), () => g.editor.commitLive());
  return true;
}

/** a press on an overlap: watched for a click; it does not stop the clip drag that may follow */
export function watchOverlapClick(e: MouseEvent, g: GestureCtx) {
  const ovEl = (e.target as HTMLElement).closest<HTMLElement>('[data-overlap]'), el = ovEl?.closest<HTMLElement>('[data-item-id]');
  if (ovEl && !(el && g.locked.has(el.dataset.track!))) follow(null, (m) => {
    if (m && Math.abs(m.clientX - e.clientX) < 3 && Math.abs(m.clientY - e.clientY) < 3) g.editor.overlapClick(ovEl.dataset.overlap!);
  });
}
