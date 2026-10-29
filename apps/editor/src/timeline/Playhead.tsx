import type { Editor } from '../editor.ts';
import { useStoreSelector } from '../store.ts';
import { t } from '../i18n/index.ts';
import { IconScissors } from '../icons.tsx';
import { HEADER_W, timeToX } from './geometry.ts';

/** The playhead subscribes on its own, so playback does not re-render the timeline. Its head on the ruler can be grabbed
 *  (`onGrab`: the ruler's scrub), and a razor under the ruler splits there (S) — the hand that scrubs does not have to leave
 *  the mouse (spec 2026-10-28-timeline-refresh A1, A2). Scrolled out of view it is not drawn. width: the lanes' width. */
export function Playhead({ editor, onGrab, width }: { editor: Editor; onGrab?: (e: MouseEvent) => void; width?: number }) {
  const s = useStoreSelector(editor.store, (x) => ({ t: x.playhead, pps: x.pps, scroll: x.scroll }));
  const x = timeToX(s.t, { pps: s.pps, scroll: s.scroll }), inView = width === undefined || (x >= 0 && x <= width);
  // scrolled out of view: nothing (the head would sit on the track headers)
  if (!inView) return null;
  const tipText = t('ed.razorTip');
  return <span class="playhead" data-playhead style={{ left: `${HEADER_W + x}px` }}>
    <i class="playhead-head" data-playhead-head onMouseDown={onGrab as any} />
    <button class="playhead-razor" data-razor data-tip={tipText} aria-label={tipText} onMouseDown={(e) => e.stopPropagation()}
      onClick={() => editor.run('split')}><IconScissors size={11} /></button>
  </span>;
}
