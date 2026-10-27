import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

/** a focus that follows a mouse press this recently is the click's, not the keyboard's */
const POINTER_FOCUS_MS = 600;
const DELAY_MS = 300, GAP = 8, MARGIN = 6;

/** The nearest element at or above `n` that carries a non-empty data-tip. */
function tipOwner(n: EventTarget | null): HTMLElement | null {
  const el = n instanceof Element ? n.closest<HTMLElement>('[data-tip]') : null;
  return el && el.dataset.tip ? el : null;
}

/** One tooltip for every data-tip in the page (home, gallery, editor). Replaces the browser's slow title bubble.
 *  Components write `data-tip={t('…')} aria-label={t('…')}`. */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ el: HTMLElement; text: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined, lastPointer = -Infinity;
    const hide = () => { clearTimeout(timer); timer = undefined; setTip(null); };
    const arm = (el: HTMLElement | null) => {
      clearTimeout(timer);
      if (!el) { setTip(null); return; }
      timer = setTimeout(() => { if (el.isConnected) setTip({ el, text: el.dataset.tip ?? '' }); }, DELAY_MS);
    };
    const over = (e: Event) => arm(tipOwner(e.target));
    // the focus a mouse click causes is not a keyboard visit: only keyboard focus arms the tip
    const focus = (e: Event) => {
      const el = tipOwner(e.target);
      if (el && Date.now() - lastPointer < POINTER_FOCUS_MS) return;
      let visible = true;
      try { if (el && el === document.activeElement) visible = el.matches(':focus-visible'); } catch { /* no :focus-visible: the timing check above is all there is */ }
      if (visible) arm(el);
    };
    // moving onto the owner's own child is still inside the owner
    const out = (e: Event) => {
      const el = tipOwner(e.target), to = (e as PointerEvent | FocusEvent).relatedTarget;
      if (el && !(to instanceof Node && el.contains(to))) hide();
    };
    const down = () => { lastPointer = Date.now(); hide(); };
    const key = (e: Event) => { if ((e as KeyboardEvent).key === 'Escape') hide(); };
    const on: [string, EventListener, boolean?][] = [
      ['pointerover', over], ['pointerout', out], ['focusin', focus], ['focusout', out],
      ['keydown', key], ['pointerdown', down], ['scroll', hide, true],
    ];
    for (const [n, f, c] of on) document.addEventListener(n, f, c);
    return () => { clearTimeout(timer); for (const [n, f, c] of on) document.removeEventListener(n, f, c); };
  }, []);

  // Place above the element (below when there is no room), clamped inside the window.
  useLayoutEffect(() => {
    const b = box.current;
    if (!tip || !b) return;
    const a = tip.el.getBoundingClientRect(), w = b.offsetWidth, h = b.offsetHeight;
    const top = a.top - h - GAP >= MARGIN ? a.top - h - GAP : a.bottom + GAP;
    const left = Math.max(MARGIN, Math.min(a.left + a.width / 2 - w / 2, innerWidth - w - MARGIN));
    b.style.top = `${top}px`;
    b.style.left = `${left}px`;
    b.style.visibility = 'visible';
  }, [tip]);

  if (!tip) return null;
  return <div ref={box} class="tooltip" role="tooltip" data-tooltip style="visibility:hidden">{tip.text}</div>;
}
