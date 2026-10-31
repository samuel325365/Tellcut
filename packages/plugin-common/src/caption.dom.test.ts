// @vitest-environment jsdom
// common.caption's gloss (the translated line under a caption), drawn on a stage: it sits inside the caption's box, after the line, in
// every style, so it is on the style's paper or bar, inside the ticket's torn edges and under the outline's stroke, and it wraps at the
// box's width. jsdom lays nothing out: these check where the gloss is and what it is told, the golden pictures how it looks.
import { createRegistry, Stage } from '@tellcut/engine';
import { caption } from './caption.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
const STYLES = ['outline', 'plain', 'box', 'bubble', 'ticket', 'crayon', 'bar', 'qa', 'auto', 'big', 'strip'];
const GLOSS = '匯入資料夾，選一個片型，然後按下輸出';

/** the caption's box and its gloss element at 1.5 s */
function drawn(params: Record<string, unknown>) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [caption] } as any]), media);
  st.load({
    version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'c', type: 'common.caption', start: 0, end: 3, params: { text: 'Import the folder', gloss: GLOSS, ...params } }] }],
  } as any);
  st.draw(1.5);
  const gloss = [...root.querySelectorAll('div')].find((d) => d.textContent === GLOSS)!;
  return { gloss, box: gloss.parentElement! };
}

test.each(STYLES)('style %s: the gloss is in the box’s flow after the line, and wraps', (style) => {
  const { gloss, box } = drawn({ style });
  expect(gloss.style.position).toBe('');
  expect(box.lastElementChild).toBe(gloss);
  expect(gloss.previousElementSibling!.textContent!.replace(/\s/g, '')).toBe('Importthefolder');   // the line, however it was broken
  expect(gloss.style.whiteSpace).toBe('pre-wrap');
  expect(box.style.maxWidth).not.toBe('');
});

test('on paper the gloss is ink; on strips it is a strip of its own; big’s outline is thinned with its size', () => {
  expect(drawn({ style: 'bubble', outline: '#222222' }).gloss.style.color).toBe('rgb(34, 34, 34)');
  expect(drawn({ style: 'outline', hl: '#ffe14d' }).gloss.style.color).toBe('rgb(255, 225, 77)');
  const strip = drawn({ style: 'strip', bubbleBg: '#fff8ec' }).gloss.style;
  expect([strip.display, strip.background]).toEqual(['table', 'rgb(255, 248, 236)']);
  expect(drawn({ style: 'outline' }).gloss.style.background).toBe('');
  expect(drawn({ style: 'big', glossSize: 0.5 }).gloss.style.webkitTextStroke).toMatch(/^\d+(\.\d+)?px/);
});

test('with the speaker chip (point) the box is a column, so the gloss goes under the line and not beside it', () => {
  const { box } = drawn({ style: 'plain', point: 'down', name: '她' });
  expect([box.style.display, box.style.flexDirection]).toEqual(['flex', 'column']);
});
