// @vitest-environment jsdom
import { startCardDrag } from './drag.ts';

function fakeEditor(begin = true) {
  const calls: any[] = [];
  const editor: any = {
    beginLibDrag: (m: any) => { calls.push(['begin', m]); return begin; },
    libDragTo: (at: any) => calls.push(['to', at]),
    endLibDrag: (c: boolean) => { calls.push(['end', c]); return c; },
    dropProbe: (x: number, y: number) => ({ t: x / 100, row: y > 50 ? 'v' : null }),
  };
  return { editor, calls };
}
const press = (el: HTMLElement, x = 10, y = 10) => { const e = new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0 }); el.dispatchEvent(e); return e; };
const move = (x: number, y: number) => dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, buttons: 1 }));
const up = (x: number, y: number) => dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y }));

test('a press that moves 3 px drags the card: the timeline is asked where the pointer is, the release drops it and swallows its click', () => {
  const { editor, calls } = fakeEditor(), card = document.createElement('button');
  document.body.appendChild(card);
  let clicks = 0;
  card.addEventListener('click', () => clicks++);
  card.addEventListener('mousedown', (e) => startCardDrag(e, editor, { kind: 'sfx', type: 'x.tap' }));
  press(card);
  move(11, 11);                                   // under 3 px: still a click
  expect(calls).toEqual([]);
  move(300, 80);
  up(300, 80);
  card.click();
  expect(calls).toEqual([['begin', { kind: 'sfx', type: 'x.tap' }], ['to', { t: 3, row: 'v' }], ['end', true]]);
  expect(clicks).toBe(0);
  card.click();                                   // only the one click right after the drop is swallowed
  expect(clicks).toBe(1);
});

test('a press without moving stays a click; Esc cancels a drag; a refused start follows no further', () => {
  const { editor, calls } = fakeEditor();
  const card = document.createElement('button');
  card.addEventListener('mousedown', (e) => startCardDrag(e, editor, { kind: 'music', media: 'm' }));
  press(card);
  up(10, 10);
  expect(calls).toEqual([]);
  press(card);
  move(200, 80);
  dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  up(200, 80);
  expect(calls.map((c) => c[0])).toEqual(['begin', 'to', 'end']);
  expect(calls.at(-1)).toEqual(['end', false]);
  const refused = fakeEditor(false), card2 = document.createElement('button');
  card2.addEventListener('mousedown', (e) => startCardDrag(e, refused.editor, { kind: 'music', media: 'm' }));
  press(card2);
  move(200, 80);
  move(250, 80);
  up(250, 80);
  expect(refused.calls).toEqual([['begin', { kind: 'music', media: 'm' }]]);
});
