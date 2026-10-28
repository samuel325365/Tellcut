// A press on an empty spot: a click moves the playhead there; only a drag of 3 px or more draws a marquee and selects what it
// touches (Shift keeps the selection).
import { HEADER_W } from '../geometry.ts';
import { itemsInRect } from '../drag.ts';
import { follow, type GestureCtx } from './follow.ts';

export interface Marquee { x0: number; y0: number; x1: number; y1: number }

export function startMarquee(e: MouseEvent, g: GestureCtx, show: (m: Marquee | null) => void) {
  const rect = g.rowsEl.getBoundingClientRect(), y = (cy: number) => cy - rect.top, x = (cx: number) => cx - rect.left - HEADER_W;
  if (x(e.clientX) < 0) return;
  const start = { x0: x(e.clientX), y0: y(e.clientY) };
  let dragged = false;
  const move = (m: MouseEvent) => {
    if (!dragged && Math.abs(m.clientX - e.clientX) < 3 && Math.abs(m.clientY - e.clientY) < 3) return;
    dragged = true;
    const r = { ...start, x1: x(m.clientX), y1: y(m.clientY) };
    show(r);
    g.editor.select(itemsInRect(g.p, g.times, g.rows(), g.view, r));
  };
  if (!e.shiftKey) g.editor.select([]);
  follow(move, (m) => {
    show(null);
    if (m && !dragged) g.editor.seek(g.tAt(m.clientX));
  });
}
