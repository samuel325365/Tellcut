// @vitest-environment jsdom
import { StageTools } from './tools.ts';

(globalThis as any).CSS ??= { escape: (s: string) => s };
const rect = (left: number, top: number, w: number, h: number) => (() => ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top })) as any;

function setup(transform?: any) {
  const viewport = document.createElement('div'), stage = document.createElement('div');
  viewport.appendChild(stage); document.body.appendChild(viewport);
  const layer = document.createElement('div');
  layer.className = 'st-item'; layer.dataset.id = 't'; layer.style.zIndex = '1';
  const txt = document.createElement('div');
  txt.textContent = 'Hello';
  layer.appendChild(txt); stage.appendChild(layer);
  txt.getBoundingClientRect = rect(10, 10, 100, 20);
  stage.getBoundingClientRect = rect(0, 0, 320, 180);
  viewport.getBoundingClientRect = rect(0, 0, 320, 180);
  const project: any = { meta: { width: 320, height: 180 }, tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 't', type: 'x.title', start: 0, end: 1, params: { title: 'Hello' }, transform }] }] };
  const registry: any = { item: () => ({ params: [{ key: 'title', label: '標題', type: 'string', default: '' }] }) };
  const sent: any[] = [];
  const tools = new StageTools(stage, viewport, (m) => sent.push(m), { project: () => project, registry, busy: () => false });
  return { viewport, tools, sent };
}
const at = (type: string, target: EventTarget, init: MouseEventInit = {}) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 50, clientY: 20, ...init }));

test('double-clicking inside the open text box keeps that box (no second box with the old text)', () => {
  const { viewport } = setup();
  at('dblclick', viewport);
  const box = viewport.querySelector<HTMLInputElement>('.text-edit')!;
  box.value = 'Hello world';
  at('dblclick', box);
  expect(viewport.querySelectorAll('.text-edit').length).toBe(1);
  expect(viewport.querySelector('.text-edit')).toBe(box);   // the same box, still holding the typed text
  expect(box.value).toBe('Hello world');
});

test('Esc closes the text box without changing anything', () => {
  const { viewport, sent } = setup();
  at('dblclick', viewport);
  const box = viewport.querySelector<HTMLInputElement>('.text-edit')!;
  box.value = 'Changed';
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(viewport.querySelector('.text-edit')).toBeNull();
  expect(sent.filter((m) => m.type === 'paramEdit')).toEqual([]);
});

test('a burst of wheel steps adds up even before the preview catches up; small touchpad steps scale a little', () => {
  vi.useFakeTimers();
  try {
    const { tools, sent, viewport } = setup();
    tools.select('t');
    const box = viewport.querySelector<HTMLElement>('.sel-box')!;
    box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    vi.advanceTimersByTime(300);
    const finals = sent.filter((m) => m.type === 'transformChange' && m.final);
    expect(finals.length).toBe(1);
    expect(finals[0].transform.scale).toBeCloseTo(1.21, 3);
    sent.length = 0;
    box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -4 }));
    vi.advanceTimersByTime(300);
    expect(sent.at(-1).transform.scale).toBeCloseTo(Math.pow(1.1, 0.04), 3);
  } finally { vi.useRealTimers(); }
});

test('releasing a drag outside the preview does not swallow the next click', () => {
  vi.useFakeTimers();
  try {
    const { tools, viewport, sent } = setup();
    tools.select('t');
    const box = viewport.querySelector<HTMLElement>('.sel-box')!;
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 50, clientY: 20 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 20 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 60, clientY: 20 }));   // no click follows (released outside)
    vi.advanceTimersByTime(0);
    sent.length = 0;
    at('click', viewport, { clientX: 300, clientY: 170 });
    expect(sent).toEqual([{ type: 'pick', itemId: null }]);
  } finally { vi.useRealTimers(); }
});

test('a click in a gap inside the selection box keeps the selection', () => {
  const { tools, viewport, sent } = setup();
  const second = document.createElement('div');
  second.textContent = 'World';
  second.getBoundingClientRect = rect(10, 60, 100, 20);
  viewport.querySelector('[data-id="t"]')!.appendChild(second);
  tools.select('t');
  at('click', viewport, { clientX: 50, clientY: 45 });   // between the two lines, inside the box (10..110 × 10..80)
  expect(sent).toEqual([]);
});

test('Enter while an input method is composing does not commit the text', () => {
  const { viewport, sent } = setup();
  at('dblclick', viewport);
  const box = viewport.querySelector<HTMLInputElement>('.text-edit')!;
  box.value = '迎娶';
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
  expect(viewport.querySelector('.text-edit')).toBe(box);
  expect(sent.filter((m) => m.type === 'paramEdit')).toEqual([]);
});

test('invisible elements are not picked', () => {
  const { viewport, sent } = setup();
  (viewport.querySelector('[data-id="t"] div') as HTMLElement).style.opacity = '0';
  at('click', viewport);
  expect(sent).toEqual([{ type: 'pick', itemId: null }]);
});

test('a gap inside the selection box keeps the selection even with a full-frame clip underneath', () => {
  const { tools, viewport, sent } = setup();
  const stage = viewport.firstElementChild as HTMLElement;
  const bg = document.createElement('div');
  bg.className = 'st-item'; bg.dataset.id = 'bg'; bg.style.zIndex = '0';
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = rect(0, 0, 320, 180);
  bg.appendChild(canvas); stage.appendChild(bg);
  const second = document.createElement('div');
  second.textContent = 'World';
  second.getBoundingClientRect = rect(10, 60, 100, 20);
  viewport.querySelector('[data-id="t"]')!.appendChild(second);
  tools.select('t');
  at('click', viewport, { clientX: 50, clientY: 45 });
  expect(sent).toEqual([]);
});

test('an element in the middle of a fade-out (opacity close to 0) is not picked', () => {
  const { viewport, sent } = setup();
  (viewport.querySelector('[data-id="t"] div') as HTMLElement).style.opacity = '0.01';
  at('click', viewport);
  expect(sent).toEqual([{ type: 'pick', itemId: null }]);
});
