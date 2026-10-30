// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { createStore, initialState } from './store.ts';
import { Preview } from './Preview.tsx';

test('an audition shows a banner over the preview: "add" keeps the material, "stop" puts the project back', async () => {
  const store = createStore({ ...initialState('t'), project: fixture(), audition: { material: { kind: 'music' as const, media: 'm' }, label: '音樂 m', addable: true, result: null } });
  const calls: string[] = [];
  const editor: any = { store, addAuditioned: () => calls.push('add'), endAudition: () => calls.push('end'), playResult: () => calls.push('result'), togglePlay() {}, exitCrop() {} };
  const bridge: any = { attach() {}, handle() {} };
  const root = document.createElement('div');
  await act(() => render(<Preview editor={editor} bridge={bridge} s={store.get()} />, root));
  expect(root.querySelector('[data-audition]')!.textContent).toContain('音樂 m');
  (root.querySelector('[data-audition-add]') as HTMLElement).click();
  (root.querySelector('[data-audition-stop]') as HTMLElement).click();
  expect(calls).toEqual(['add', 'end']);
  await act(() => render(<Preview editor={editor} bridge={bridge} s={{ ...store.get(), audition: null }} />, root));
  expect(root.querySelector('[data-audition]')).toBe(null);
  // a timeline item is in the project already: no "add"
  await act(() => render(<Preview editor={editor} bridge={bridge} s={{ ...store.get(), audition: { ...store.get().audition!, addable: false, result: 4 } }} />, root));
  expect([!!root.querySelector('[data-audition]'), root.querySelector('[data-audition-add]')]).toEqual([true, null]);
  (root.querySelector('[data-audition-result]') as HTMLElement).click();     // back to the finished video at that item
  expect(calls).toEqual(['add', 'end', 'result']);
});
test('the transport has start, frame steps, play, end and loop', async () => {
  const store = createStore({ ...initialState('t'), project: fixture() });
  const runs: string[] = [];
  const editor: any = { store, run: (a: string) => runs.push(a), togglePlay: () => runs.push('toggle'), toggleLoop: () => runs.push('loop'), exitCrop() {} };
  const root = document.createElement('div');
  await act(() => render(<Preview editor={editor} bridge={{ attach() {}, handle() {} } as any} s={store.get()} />, root));
  for (const k of ['home', 'prev', 'play', 'next', 'end']) (root.querySelector(`[data-transport="${k}"]`) as HTMLElement).click();
  (root.querySelector('[data-loop]') as HTMLElement).click();
  expect(runs).toEqual(['home', 'prevFrame', 'toggle', 'nextFrame', 'end', 'loop']);
});
test('the loop switch is a line icon in the text colour (not the blue 🔁 emoji) and says whether it is on', async () => {
  const store = createStore({ ...initialState('t'), project: fixture() });
  const editor: any = { store, run() {}, togglePlay() {}, toggleLoop() {}, exitCrop() {} };
  const bridge: any = { attach() {}, handle() {} };
  const root = document.createElement('div');
  await act(() => render(<Preview editor={editor} bridge={bridge} s={{ ...store.get(), loop: false }} />, root));
  const btn = () => root.querySelector('[data-loop]') as HTMLElement;
  expect(btn().textContent).toBe('');
  expect(btn().querySelector('svg')!.getAttribute('stroke')).toBe('currentColor');
  expect([btn().className, btn().getAttribute('aria-pressed')]).toEqual(['', 'false']);
  await act(() => render(<Preview editor={editor} bridge={bridge} s={{ ...store.get(), loop: true }} />, root));
  expect([btn().className, btn().getAttribute('aria-pressed')]).toEqual(['on', 'true']);
});
