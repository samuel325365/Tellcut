// The timeline's mouse gestures share this: what a gesture needs to know about the timeline, and how one follows the mouse.
import type { Project, Times } from '@tellcut/engine';
import type { Editor } from '../../editor.ts';
import type { Row, View } from '../geometry.ts';

export interface GestureCtx {
  editor: Editor;
  p: Project;
  times: Times;
  /** the rows as they are now (lanes reflow while dragging) */
  rows: () => Row[];
  view: View;
  rowsEl: HTMLElement;
  selection: string[];
  /** a client x on the lanes → seconds */
  tAt: (clientX: number) => number;
  /** locked track ids: their clips take no press */
  locked: ReadonlySet<string>;
}

/** Window listeners for one drag. It ends on mouseup, and also when a move comes with no button down or the window loses
 *  focus (released outside it: Alt+Tab, another app) — the drag stopped following there, and no event means `up()`
 *  without one (a release that was never seen is not a click). */
export function follow(move: ((m: MouseEvent) => void) | null, up: (m?: MouseEvent) => void) {
  const mv = (m: MouseEvent) => { if (m.buttons === 0) { end(); return; } move?.(m); };
  const end = (m?: MouseEvent) => {
    removeEventListener('mousemove', mv); removeEventListener('mouseup', release); removeEventListener('blur', lost);
    up(m);
  };
  const release = (m: MouseEvent) => end(m), lost = () => end();
  addEventListener('mousemove', mv); addEventListener('mouseup', release); addEventListener('blur', lost);
}

/** the alt / ctrl / shift held during a gesture */
export const mods = (e: MouseEvent) => ({ alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
