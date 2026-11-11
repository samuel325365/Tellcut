// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { arrayText, ColorField, JsonField, NumberField, ParamField, TextField } from './fields.tsx';
import { parseStops, routeboard } from '../../../packages/plugin-common/src/routeboard.ts';
import { parseTouches, touch } from '../../../packages/plugin-common/src/touch.ts';
import { parseObjects } from '../../../packages/plugin-common/src/flatlay/objects.ts';
import { flatlay } from '../../../packages/plugin-common/src/flatlay.ts';
import { fixture } from '@tellcut/engine/test-fixture';

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

// common.routeboard, common.touch and common.flatlay read a list from cut.ts as well as their text: the box shows the list in
// that text, which must read back the same
const legsOf = (v: unknown) => String(Array.isArray(v) ? v.join(',') : v ?? '').split(/[,，]/).map((x) => (x.trim() === '' ? NaN : Number(x)));   // routeboard's draw
async function shown(block: any, key: string, value: unknown) {
  const root = document.createElement('div'), commits: unknown[] = [];
  const def = block.params.find((d: any) => d.key === key);
  await act(() => render(<ParamField def={def} value={value} project={fixture()} onCommit={(v) => commits.push(v)} />, root));
  return { box: root.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!, commits };
}

test('a list given to a text param shows one entry per line in the block\'s own syntax and reads back the same', async () => {
  const stops = [[0, 0, '05.26'], [1.5, '-', ''], [2.6, 'all', '05.26–08.21']];
  const a = await shown(routeboard, 'stops', stops);
  expect(a.box.value).toBe('0|0|05.26\n1.5|-|\n2.6|all|05.26–08.21');
  expect(parseStops(a.box.value, 3)).toEqual(parseStops(stops, 3));
  const touches = ['0.5|tap|0.5,0.38', '1.1-1.9|drag|0.3,0.6>0.7,0.6'];
  const b = await shown(touch, 'touches', touches);
  expect(b.box.value).toBe(touches.join('\n'));
  expect(parseTouches(b.box.value)).toEqual(parseTouches(touches));
  // nothing is stored until the box is edited; an edit stores the text
  expect([a.commits, b.commits]).toEqual([[], []]);
  b.box.value = '0.5|tap|0.5,0.38';
  await act(() => { b.box.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(b.commits).toEqual(['0.5|tap|0.5,0.38']);
});

test('a list given to a one-line param is joined with commas; empty entries stay empty', async () => {
  const legs = [1.2, null, 3];
  const a = await shown(routeboard, 'legs', legs);
  expect(a.box.value).toBe('1.2, , 3');
  expect(legsOf(a.box.value)).toEqual(legsOf(legs));
  expect(a.commits).toEqual([]);
});

test('a list of objects has no line form: it shows as JSON, which the block taking objects reads in its text', async () => {
  const objects = [{ kind: 'polaroid', x: -0.4, y: 0.2, rot: 0.1 }, { kind: 'postcard', x: 0.5, y: -0.3 }];
  const a = await shown(flatlay, 'objects', objects);
  expect(JSON.parse(a.box.value)).toEqual(objects);
  expect(parseObjects({ objects: a.box.value } as any, 1080, 1920, 6)).toEqual(parseObjects({ objects } as any, 1080, 1920, 6));
  expect(arrayText([['a', { b: 1 }]], false)).toBe('[["a",{"b":1}]]');
  expect(arrayText([], true)).toBe('');
});
