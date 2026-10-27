// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PresetStrip } from './PresetStrip.tsx';

const mk = (id: string): any => ({ id, order: 1, mine: false, color: '#2f8cff', name: { zh: id }, summary: { zh: '' }, fit: {}, facts: {}, poster: null, preview: null, styles: [] });
const PRESETS = ['a', 'b', 'c', 'd'].map(mk);

/** jsdom has no layout: give the strip a width and a scroll position through stubs */
function stub(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  let left = 0;
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => clientWidth });
  Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => { left = v; } });
  const calls: any[] = [];
  (el as any).scrollBy = (o: any) => { calls.push(o); left += o.left; el.dispatchEvent(new Event('scroll')); };
  return calls;
}

async function mount(widths: [number, number]) {
  const root = document.createElement('div');
  document.body.append(root);
  // the stubs must exist before the first measurement: patch the prototype for the render, then per element
  const proto = HTMLElement.prototype as any, sw = Object.getOwnPropertyDescriptor(proto, 'scrollWidth'), cw = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
  Object.defineProperty(proto, 'scrollWidth', { configurable: true, get: () => widths[0] });
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => widths[1] });
  await act(() => render(<PresetStrip presets={PRESETS} picked={null} onOpen={() => {}} />, root));
  const strip = root.querySelector<HTMLElement>('[data-preset-strip]')!;
  const calls = stub(strip, widths[0], widths[1]);
  await act(() => { strip.dispatchEvent(new Event('scroll')); });
  const restore = () => { for (const [k, d] of [['scrollWidth', sw], ['clientWidth', cw]] as const) { if (d) Object.defineProperty(proto, k, d); else delete proto[k]; } };
  return { root, strip, calls, restore };
}

test("the strip scrolls when presets don't fit", async () => {
  const { root, strip, calls, restore } = await mount([800, 300]);
  try {
    expect(root.querySelector('[data-strip-prev]')).toBeNull();
    const next = root.querySelector<HTMLElement>('[data-strip-next]')!;
    expect(next).not.toBeNull();
    await act(() => { next.click(); });
    expect(calls.length).toBe(1);
    expect(calls[0].left).toBeGreaterThan(0);
    expect(root.querySelector('[data-strip-prev]')).not.toBeNull();
    await act(() => { root.querySelector<HTMLElement>('[data-strip-prev]')!.click(); });
    expect(calls[1].left).toBeLessThan(0);
    // the wheel turns vertical movement into horizontal
    const wheel = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
    await act(() => { strip.dispatchEvent(wheel); });
    expect(wheel.defaultPrevented).toBe(true);
    expect(calls[2].left).toBe(40);
    // at the far end there is no "next"
    await act(() => { strip.scrollLeft = 500; strip.dispatchEvent(new Event('scroll')); });
    expect(root.querySelector('[data-strip-next]')).toBeNull();
    // at the far end a downward wheel is left to the page; so is an upward one at the start
    const down = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true }), n = calls.length;
    await act(() => { strip.dispatchEvent(down); });
    expect(down.defaultPrevented).toBe(false);
    expect(calls.length).toBe(n);
    await act(() => { strip.scrollLeft = 0; strip.dispatchEvent(new Event('scroll')); });
    const up = new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true });
    await act(() => { strip.dispatchEvent(up); });
    expect(up.defaultPrevented).toBe(false);
    expect(calls.length).toBe(n);
  } finally { restore(); }
});

test('a couple of pixels from either end counts as the end', async () => {
  const { root, strip, calls, restore } = await mount([800, 300]);
  try {
    // 2px in (the strip's own padding): still the start, so no "prev"; and an upward wheel is the page's
    await act(() => { strip.scrollLeft = 2; strip.dispatchEvent(new Event('scroll')); });
    expect(root.querySelector('[data-strip-prev]')).toBeNull();
    const up = new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true });
    await act(() => { strip.dispatchEvent(up); });
    expect(up.defaultPrevented).toBe(false);
    // 3px short of the end (fractional scrollLeft on scaled displays): no "next", the downward wheel is the page's
    await act(() => { strip.scrollLeft = 800 - 300 - 3; strip.dispatchEvent(new Event('scroll')); });
    expect(root.querySelector('[data-strip-next]')).toBeNull();
    const down = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
    await act(() => { strip.dispatchEvent(down); });
    expect(down.defaultPrevented).toBe(false);
    expect(calls.length).toBe(0);
  } finally { restore(); }
});

test('no scroll buttons when everything fits', async () => {
  const { root, strip, restore } = await mount([300, 300]);
  try {
    expect(root.querySelector('[data-strip-prev]')).toBeNull();
    expect(root.querySelector('[data-strip-next]')).toBeNull();
    const wheel = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
    await act(() => { strip.dispatchEvent(wheel); });
    expect(wheel.defaultPrevented).toBe(false);
  } finally { restore(); }
});

test('a thumbnail announces that it opens a dialog', async () => {
  const { root, restore } = await mount([300, 300]);
  try {
    expect([...root.querySelectorAll('[data-preset]')].every((e) => e.getAttribute('aria-haspopup') === 'dialog')).toBe(true);
  } finally { restore(); }
});
