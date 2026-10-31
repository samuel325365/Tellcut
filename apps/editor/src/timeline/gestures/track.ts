// Track order (spec 2026-10-14 §5.3): the grip drags a track onto another of its group (pictures / sound).
import type { Track } from '@tellcut/engine';
import { rowAt } from '../geometry.ts';
import { follow, type GestureCtx } from './follow.ts';

export const groupOf = (k: string) => (k === 'scene' || k === 'video' || k === 'overlay' ? 'picture' : 'sound');

/** showDrop: the y of the insertion line while dragging, null when there is none */
export function startTrackDrag(e: MouseEvent, g: GestureCtx, track: Track, showDrop: (y: number | null) => void) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const top = g.rowsEl.getBoundingClientRect().top;
  const target = (m: MouseEvent) => { const r = rowAt(g.rows(), m.clientY - top); return r && groupOf(r.track.kind) === groupOf(track.kind) ? r : null; };
  const move = (m: MouseEvent) => {
    const r = target(m), src = g.rows().find((x) => x.track.id === track.id)!;
    showDrop(r ? (r.y > src.y ? r.y + r.h : r.y) : null);
  };
  // released outside the window (no mouseup seen): the drag ends with no drop
  follow(move, (m) => {
    showDrop(null);
    const r = m && target(m);
    if (!r || r.track.id === track.id) return;
    g.editor.moveTrack(track.id, g.p.tracks.filter((t) => groupOf(t.kind) === groupOf(track.kind)).findIndex((t) => t.id === r.track.id));
  });
}
