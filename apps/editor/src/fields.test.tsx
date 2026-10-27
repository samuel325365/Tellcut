// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ColorField, JsonField } from './fields.tsx';

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
