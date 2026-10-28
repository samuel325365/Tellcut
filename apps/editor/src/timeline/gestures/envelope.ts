// The volume line, its control points and the fade handles come before the clip drag (spec §4.4): a point or handle drags
// live (one undo step on release); a click on the line adds a point.
import { addEnvelopePoint, allItems, moveEnvelopePoint, setFade } from '@tellcut/engine';
import { yToDb } from '../envelope.ts';
import { follow, type GestureCtx } from './follow.ts';

/** true when the press was on the volume line, a point or a fade handle (handled here) */
export function startEnvelopeDrag(e: MouseEvent, g: GestureCtx): boolean {
  const target = e.target as HTMLElement, el = target.closest<HTMLElement>('[data-item-id]');
  const envEl = target.closest('[data-env-index], [data-env-line], [data-fade]');
  if (!envEl || !el || g.locked.has(el.dataset.track!)) return false;
  e.preventDefault(); e.stopPropagation();
  const id = el.dataset.itemId!, it: any = allItems(g.p).find((x) => x.item.id === id)!.item;
  const box = (el.querySelector('svg.env') ?? el).getBoundingClientRect(), h = box.height || 1;   // the line's own box: the clip border is 1 px
  const at = (m: MouseEvent) => ({ t: (m.clientX - box.left) / g.view.pps, db: yToDb(m.clientY - box.top, h) });
  const index = envEl.getAttribute('data-env-index'), fade = envEl.getAttribute('data-fade') as 'in' | 'out' | null;
  let moved = false;
  const move = (m: MouseEvent) => {
    moved = true;
    const pt = at(m);
    if (index !== null) g.editor.livePreview((d: any) => moveEnvelopePoint(d, { id, index: Number(index), t: pt.t, db: pt.db }));
    else if (fade) g.editor.livePreview((d: any) => setFade(d, { id, edge: fade, dur: fade === 'in' ? pt.t : it.end - it.start - pt.t }));
  };
  follow(move, (m) => {
    if (moved && (index !== null || fade)) g.editor.commitLive();
    else if (m && !moved && envEl.hasAttribute('data-env-line')) { const pt = at(m); g.editor.apply((d: any) => addEnvelopePoint(d, { id, t: pt.t, db: pt.db })); }
  });
  return true;
}
