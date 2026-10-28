import type { Editor } from '../editor.ts';
import { useStoreSelector } from '../store.ts';
import { HEADER_W, timeToX } from './geometry.ts';

/** The playhead subscribes on its own, so playback does not re-render the timeline. Its head on the ruler can be grabbed
 *  (`onGrab`: the ruler's scrub), so the playhead is easy to find and to drag (spec 2026-10-28-timeline-refresh A1). */
export function Playhead({ editor, onGrab }: { editor: Editor; onGrab?: (e: MouseEvent) => void }) {
  const s = useStoreSelector(editor.store, (x) => ({ t: x.playhead, pps: x.pps, scroll: x.scroll }));
  return <span class="playhead" data-playhead style={{ left: `${HEADER_W + timeToX(s.t, { pps: s.pps, scroll: s.scroll })}px` }}>
    <i class="playhead-head" data-playhead-head onMouseDown={onGrab as any} />
  </span>;
}
