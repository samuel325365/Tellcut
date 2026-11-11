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
  const svg = el.querySelector<SVGSVGElement>('svg.env'), box = (svg ?? el).getBoundingClientRect(), h = box.height || 1;   // the line's own box: the clip border is 1 px
  // seconds from the drawn width: under a CSS zoom on the page the box (and the mouse) are scaled, view.pps is not
  const w = Number(svg?.getAttribute('width')), pps = box.width && w ? (g.view.pps * box.width) / w : g.view.pps;
  const at = (m: MouseEvent) => ({ t: (m.clientX - box.left) / pps, db: yToDb(m.clientY - box.top, h) });
  const index = envEl.getAttribute('data-env-index'), fade = envEl.getAttribute('data-fade') as 'in' | 'out' | null;
  // a point moves by the mouse's offset from the press, starting where its handle is drawn: a press anywhere on the ring
  // does not snap it under the cursor, and a point a trim left outside the clip (drawn just inside the edge) enters the
  // clip there instead of at the mouse
  const sx = box.width && w ? box.width / w : 1, svgH = Number(svg?.getAttribute('height')), sy = box.height && svgH ? box.height / svgH : 1;
  const hx = box.left + Number(envEl.getAttribute('cx')) * sx, hy = box.top + Number(envEl.getAttribute('cy')) * sy;
  const pointAt = (m: MouseEvent) => at({ clientX: hx + m.clientX - e.clientX, clientY: hy + m.clientY - e.clientY } as MouseEvent);
  let moved = false;
  const move = (m: MouseEvent) => {
    moved = true;
    const pt = index !== null ? pointAt(m) : at(m);
    if (index !== null) g.editor.livePreview((d: any) => moveEnvelopePoint(d, { id, index: Number(index), t: pt.t, db: pt.db }));
    else if (fade) g.editor.livePreview((d: any) => setFade(d, { id, edge: fade, dur: fade === 'in' ? pt.t : it.end - it.start - pt.t }));
  };
  follow(move, (m) => {
    if (moved && (index !== null || fade)) g.editor.commitLive();
    else if (m && !moved && envEl.hasAttribute('data-env-line')) { const pt = at(m); g.editor.apply((d: any) => addEnvelopePoint(d, { id, t: pt.t, db: pt.db })); }
  });
  return true;
}
