// What every modal dialog does with the keyboard: it takes the focus when it opens (the button that opened it stays behind the
// backdrop), Esc closes it wherever the focus is (on that button, or on <body> after a click on an empty part of the box), Tab
// stays inside it (on the home page it walked out to the chat box behind, where Enter sent a message under the open dialog),
// and the focus goes back where it was when it closes. Dialogs opened from inside another (a preset's Edit) stack: only the top
// one acts.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { composing } from './keys.ts';

const open: HTMLElement[] = [];
/** whether this dialog box is the top open one (a key pressed in a dialog stacked on it is not its own) */
export const isTopModal = (el: HTMLElement | null | undefined) => !!el && open[open.length - 1] === el;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function wrapTab(box: HTMLElement, e: KeyboardEvent) {
  const all = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => !x.closest('[hidden], [inert]'));
  const at = document.activeElement as HTMLElement | null, inside = !!at && at !== box && box.contains(at);
  if (!all.length) { e.preventDefault(); box.focus(); return; }
  if (e.shiftKey ? !inside || at === all[0] : !inside || at === all[all.length - 1]) {
    e.preventDefault();
    (e.shiftKey ? all[all.length - 1] : all[0]).focus();
  }
}

/** For the dialog's box (give it tabIndex={-1} so it can hold the focus): onEscape is called for Esc (the dialog's own close,
 *  which may refuse while it works). */
export function useModal(box: RefObject<HTMLElement>, onEscape: () => void) {
  const esc = useRef(onEscape);
  esc.current = onEscape;
  // read at the first render, before any effect of the dialog moves the focus into it
  const [before] = useState(() => (typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null));
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    open.push(el);
    if (!el.contains(document.activeElement)) el.focus();
    // the same key reaches the box and then the document: acted on once
    const done = new WeakSet<Event>();
    const key = (e: KeyboardEvent) => {
      if (done.has(e) || !isTopModal(el)) return;
      done.add(e);
      if (e.key === 'Escape' && !composing(e)) { e.stopPropagation(); esc.current(); }
      else if (e.key === 'Tab') wrapTab(el, e);
    };
    el.addEventListener('keydown', key);
    document.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('keydown', key);
      document.removeEventListener('keydown', key);
      const i = open.indexOf(el);
      if (i >= 0) open.splice(i, 1);
      // back where it was, unless the page has already put it somewhere else (the chat box after Import)
      const now = document.activeElement;
      if (before?.isConnected && (!now || now === document.body || el.contains(now))) before.focus();
    };
  }, []);
}
