// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ColorField, JsonField, NumberField, TextField } from './fields.tsx';

test('a short hex color shows as its full form; a color the picker cannot show stays editable as text', async () => {
  const root = document.createElement('div');
  await act(() => render(<div><ColorField label="a" name="a" value="#fff" onCommit={() => {}} /><ColorField label="b" name="b" value="rgba(0,0,0,.5)" onCommit={() => {}} /></div>, root));
  const a = root.querySelector<HTMLInputElement>('[data-field="a"] input')!, b = root.querySelector<HTMLInputElement>('[data-field="b"] input')!;
  expect([a.type, a.value]).toEqual(['color', '#ffffff']);
  expect([b.type, b.value]).toEqual(['text', 'rgba(0,0,0,.5)']);
});

test('broken JSON stays in the box so it can be fixed', async () => {
  const root = document.createElement('div');
  const commits: unknown[] = [];
  await act(() => render(<JsonField label="j" name="j" value={{ a: 1 }} onCommit={(v) => commits.push(v)} />, root));
  const ta = root.querySelector('textarea')!;
  ta.value = '{ "a": 2';
  await act(() => { ta.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(ta.value).toBe('{ "a": 2');
  expect(commits).toEqual([]);
  ta.value = '{ "a": 2 }';
  await act(() => { ta.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(commits).toEqual([{ a: 2 }]);
});

test('a number being typed survives re-renders until it is committed; while it is not being typed in, new values show', async () => {
  const root = document.createElement('div');
  const commits: unknown[] = [];
  const show = (value: number) => act(() => render(<NumberField label="n" name="n" value={value} onCommit={(v) => commits.push(v)} />, root));
  await show(1);
  const box = root.querySelector('input')!;
  box.value = '1.25';
  await act(() => { box.dispatchEvent(new Event('input', { bubbles: true })); });
  await show(1);                       // the panel re-rendered (the playhead moved)
  await show(2);                       // or the value changed meanwhile: the typing still wins
  expect(box.value).toBe('1.25');
  expect(commits).toEqual([]);
  await act(() => { box.dispatchEvent(new Event('change', { bubbles: true })); });   // Enter / blur
  expect(commits).toEqual([1.25]);
  await show(1.25);
  expect(box.value).toBe('1.25');
  await show(3);                       // undo, the timeline: shown when the box is not being typed in
  expect(box.value).toBe('3');
  // typed, then left without a change: the next value from outside shows
  box.value = '4';
  await act(() => { box.dispatchEvent(new Event('input', { bubbles: true })); box.dispatchEvent(new Event('blur')); });
  await show(5);
  expect(box.value).toBe('5');
});

test('a text being typed is not put back by a re-render either', async () => {
  const root = document.createElement('div');
  const show = () => act(() => render(<TextField label="t" name="t" value="old" onCommit={() => {}} />, root));
  await show();
  const box = root.querySelector('input')!;
  box.value = 'new wor';
  await act(() => { box.dispatchEvent(new Event('input', { bubbles: true })); });
  await show();
  expect(box.value).toBe('new wor');
});
