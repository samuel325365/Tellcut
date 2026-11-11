// A library card pressed and moved 3 px or more is dragged onto the timeline (spec 2026-11-10-media-panel-visual §5): the timeline
// says where the pointer is (its dropProbe), the editor previews the drop there, the release drops it. A press that does not
// move stays a click (pick) or a double-click (audition). Esc, a release off the timeline, or one never seen adds nothing.
import { follow, mods } from '../timeline/gestures/follow.ts';
import type { Material } from '../audition.ts';
import type { LibPick } from '../editor/editing.ts';
import type { DropTarget } from '../timeline/drop.ts';

export interface CardDragHost {
  beginLibDrag(src: Material | { lib: LibPick }): boolean;
  libDragTo(at: DropTarget, m: { alt: boolean; ctrl: boolean; shift: boolean }): void;
  endLibDrag(commit: boolean): boolean;
  /** set by the timeline while it is shown */
  dropProbe?: ((clientX: number, clientY: number) => DropTarget) | null;
}

export function startCardDrag(e: MouseEvent, editor: CardDragHost, src: Material | { lib: LibPick }) {
  if (e.button !== 0) return;
  let state: 'pressed' | 'dragging' | 'done' = 'pressed';
  const where = (m: MouseEvent): DropTarget => editor.dropProbe?.(m.clientX, m.clientY) ?? { t: 0, row: null };
  const esc = (k: KeyboardEvent) => { if (k.key !== 'Escape' || state !== 'dragging') return; state = 'done'; editor.endLibDrag(false); };
  addEventListener('keydown', esc);
  follow((m) => {
    if (state === 'done') return;
    if (state === 'pressed') {
      if (Math.abs(m.clientX - e.clientX) < 3 && Math.abs(m.clientY - e.clientY) < 3) return;
      if (!editor.beginLibDrag(src)) { state = 'done'; return; }
      state = 'dragging';
      document.body.classList.add('lib-dragging');
    }
    editor.libDragTo(where(m), mods(m));
  }, (m) => {
    removeEventListener('keydown', esc);
    document.body.classList.remove('lib-dragging');
    if (state !== 'dragging') return;
    state = 'done';
    // only a release seen here drops it: one never seen (the window lost focus, let go outside it) cancels
    editor.endLibDrag(!!m);
    if (!m) return;
    // the release on the card it started from would be taken as a click (a pick): that one click is swallowed
    const swallow = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, { capture: true }), 0);
  });
}
