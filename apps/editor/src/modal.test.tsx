// @vitest-environment jsdom
import { render } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { isTopModal, useModal } from './modal.ts';

function Box({ name, onClose, children }: { name: string; onClose: () => void; children?: any }) {
  const box = useRef<HTMLDivElement>(null);
  useModal(box, onClose);
  return <div ref={box} tabIndex={-1} data-box={name}><button data-first={name}>a</button><input data-mid={name} /><button data-last={name}>b</button>{children}</div>;
}

function Page({ closed }: { closed: string[] }) {
  const [outer, setOuter] = useState(false), [inner, setInner] = useState(false);
  return <div>
    <button data-opener onClick={() => setOuter(true)}>open</button>
    <button data-open-inner onClick={() => setInner(true)}>inner</button>
    {outer && <Box name="outer" onClose={() => { closed.push('outer'); setOuter(false); }}>
      {inner && <Box name="inner" onClose={() => { closed.push('inner'); setInner(false); }} />}
    </Box>}
  </div>;
}

const key = (k: string, o: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
let root: HTMLDivElement;
beforeEach(() => { root = document.createElement('div'); document.body.append(root); });
afterEach(() => { render(null, root); root.remove(); });

test('a dialog takes the focus, Esc closes it wherever the focus is, and the focus goes back to its opener (EP6)', async () => {
  const closed: string[] = [];
  await act(() => render(<Page closed={closed} />, root));
  const opener = root.querySelector<HTMLElement>('[data-opener]')!;
  opener.focus();
  await act(() => { opener.click(); });
  const box = root.querySelector<HTMLElement>('[data-box="outer"]')!;
  expect(document.activeElement).toBe(box);
  expect(isTopModal(box)).toBe(true);
  // a click on an empty part of the box, or the focus left on <body>: Esc still closes it
  (document.activeElement as HTMLElement).blur();
  expect(document.activeElement).toBe(document.body);
  await act(() => { document.body.dispatchEvent(key('Escape')); });
  expect(closed).toEqual(['outer']);
  expect(document.activeElement).toBe(opener);
  // an Esc that ends an IME composition is not the dialog's
  await act(() => { opener.click(); });
  await act(() => { document.activeElement!.dispatchEvent(key('Escape', { isComposing: true })); });
  expect(closed).toEqual(['outer']);
});

test('Tab and Shift+Tab stay inside the dialog (EP6)', async () => {
  await act(() => render(<Page closed={[]} />, root));
  await act(() => { root.querySelector<HTMLElement>('[data-opener]')!.click(); });
  const first = root.querySelector<HTMLElement>('[data-first="outer"]')!, last = root.querySelector<HTMLElement>('[data-last="outer"]')!;
  last.focus();
  const tab = key('Tab');
  last.dispatchEvent(tab);
  expect([tab.defaultPrevented, document.activeElement]).toEqual([true, first]);
  const back = key('Tab', { shiftKey: true });
  first.dispatchEvent(back);
  expect([back.defaultPrevented, document.activeElement]).toEqual([true, last]);
  // from the box itself (just opened) Tab goes to its first control; in the middle the browser moves on by itself
  root.querySelector<HTMLElement>('[data-box="outer"]')!.focus();
  root.querySelector('[data-box="outer"]')!.dispatchEvent(key('Tab'));
  expect(document.activeElement).toBe(first);
  const mid = key('Tab');
  root.querySelector('[data-mid="outer"]')!.dispatchEvent(mid);
  expect(mid.defaultPrevented).toBe(false);
});

test('a dialog opened inside another: only the top one takes Esc and Tab', async () => {
  const closed: string[] = [];
  await act(() => render(<Page closed={closed} />, root));
  await act(() => { root.querySelector<HTMLElement>('[data-opener]')!.click(); });
  await act(() => { root.querySelector<HTMLElement>('[data-open-inner]')!.click(); });
  const inner = root.querySelector<HTMLElement>('[data-box="inner"]')!, outer = root.querySelector<HTMLElement>('[data-box="outer"]')!;
  expect([isTopModal(inner), isTopModal(outer), document.activeElement]).toEqual([true, false, inner]);
  const last = root.querySelector<HTMLElement>('[data-last="inner"]')!;
  last.focus(); last.dispatchEvent(key('Tab'));
  expect(document.activeElement).toBe(root.querySelector('[data-first="inner"]'));
  await act(() => { document.activeElement!.dispatchEvent(key('Escape')); });
  expect(closed).toEqual(['inner']);
  expect(isTopModal(outer)).toBe(true);
  await act(() => { document.body.dispatchEvent(key('Escape')); });
  expect(closed).toEqual(['inner', 'outer']);
});
