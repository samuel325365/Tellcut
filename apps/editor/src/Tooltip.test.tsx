// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { TooltipLayer } from './Tooltip.tsx';

let root: HTMLElement;
beforeEach(async () => {
  vi.useFakeTimers();
  root = document.createElement('div');
  document.body.appendChild(root);
  await act(async () => { render(<><TooltipLayer /><button data-tip="提示"><svg><path /></svg></button></>, root); });
});
afterEach(() => { render(null, root); root.remove(); vi.useRealTimers(); });

const fire = (el: Element, type: string, init: object = {}) => act(() => { el.dispatchEvent(new Event(type, { bubbles: true, ...init })); });
const tooltip = () => root.querySelector('[data-tooltip]');

test('hovering an element with data-tip shows its text after a short delay', async () => {
  const btn = root.querySelector('button')!;
  await fire(btn, 'pointerover');
  expect(tooltip()).toBeNull();
  await act(() => { vi.advanceTimersByTime(300); });
  expect(tooltip()?.textContent).toBe('提示');
  expect(tooltip()?.getAttribute('role')).toBe('tooltip');
  await fire(btn, 'pointerout');
  expect(tooltip()).toBeNull();
});

test('keyboard focus shows it too; Escape hides it', async () => {
  const btn = root.querySelector('button')!;
  await fire(btn, 'focusin');
  await act(() => { vi.advanceTimersByTime(300); });
  expect(tooltip()?.textContent).toBe('提示');
  const esc = new Event('keydown', { bubbles: true }) as Event & { key: string };
  esc.key = 'Escape';
  await act(() => { btn.dispatchEvent(esc); });
  expect(tooltip()).toBeNull();
});

test('a child of the element counts', async () => {
  await fire(root.querySelector('svg')!, 'pointerover');
  await act(() => { vi.advanceTimersByTime(300); });
  expect(tooltip()?.textContent).toBe('提示');
});

test('pointerdown cancels a pending tooltip', async () => {
  const btn = root.querySelector('button')!;
  await fire(btn, 'pointerover');
  await fire(btn, 'pointerdown');
  await act(() => { vi.advanceTimersByTime(300); });
  expect(tooltip()).toBeNull();
});

test('a mouse click does not bring the tooltip back through the focus it causes', async () => {
  const btn = root.querySelector('button')!;
  await fire(btn, 'pointerdown');
  await fire(btn, 'focusin');
  await act(() => { vi.advanceTimersByTime(300); });
  expect(tooltip()).toBeNull();
});

test('an owner removed before the delay shows nothing', async () => {
  const btn = root.querySelector('button')!;
  await fire(btn, 'pointerover');
  await act(async () => { render(<TooltipLayer />, root); });   // the owner is gone
  await act(() => { vi.advanceTimersByTime(300); });
  expect(tooltip()).toBeNull();
});

test('moving the pointer onto the owner\'s own child keeps the tooltip', async () => {
  const btn = root.querySelector('button')!;
  await fire(btn, 'pointerover');
  await act(() => { vi.advanceTimersByTime(300); });
  const ev = new Event('pointerout', { bubbles: true }) as Event & { relatedTarget: EventTarget };
  ev.relatedTarget = root.querySelector('svg')!;
  await act(() => { btn.dispatchEvent(ev); });
  expect(tooltip()?.textContent).toBe('提示');
});
