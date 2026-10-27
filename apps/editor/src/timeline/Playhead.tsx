import type { Editor } from '../editor.ts';
import { useStoreSelector } from '../store.ts';
import { HEADER_W, timeToX } from './geometry.ts';

/** The playhead subscribes on its own, so playback does not re-render the timeline. */
export function Playhead({ editor }: { editor: Editor }) {
  const s = useStoreSelector(editor.store, (x) => ({ t: x.playhead, pps: x.pps, scroll: x.scroll }));
  return <span class="playhead" data-playhead style={{ left: `${HEADER_W + timeToX(s.t, { pps: s.pps, scroll: s.scroll })}px` }} />;
}
