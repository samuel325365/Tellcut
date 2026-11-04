// @vitest-environment jsdom
// Word effects drawn on a stage: a span a word, what each effect shows; templates from the item and from the project.
// jsdom lays nothing out: these check the elements and what they are told, the golden pictures how they look.
import { createRegistry, Stage } from '@tellcut/engine';
import { caption } from '../caption.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };

const ZH = { text: '今天帶你去吃【台南】', words: [[0.2, 2], [0.6, 4], [1.0, 6], [1.4, 8]] };
/** the caption at `t`: its box and its word spans (the words element's line children) */
function drawn(params: Record<string, unknown>, t: number, meta: Record<string, unknown> = {}) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [caption] } as any]), media);
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [], ...meta }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'c', type: 'common.caption', start: 0, end: 3, params }] }] } as any);
  st.draw(t);
  const lines = [...root.querySelectorAll('div')].filter((d) => d.parentElement?.style.display !== 'none' && d.style.position === 'relative');
  const words = lines.flatMap((l) => [...l.children].filter((c) => c.tagName === 'SPAN') as HTMLElement[]);
  const box = root.querySelector<HTMLElement>('div[style*="font-size"]')!;
  return { root, words, box };
}
const shown = (ws: HTMLElement[]) => ws.filter((w) => w.style.display !== 'none').map((w) => w.textContent);

test('a word effect draws a span a word; without one (auto) the caption keeps its runs', () => {
  expect(drawn({ ...ZH, wordFx: 'color' }, 1.1).words.map((w) => w.textContent)).toEqual(['今天', '帶你', '去吃', '台南']);
  expect(drawn({ ...ZH }, 1.1).words).toEqual([]);
});

test('one: only the word being said; pop: the words not said yet are invisible; type: a caret after the typed characters', () => {
  expect(shown(drawn({ ...ZH, wordFx: 'one' }, 0.7).words)).toEqual(['帶你']);
  const pop = drawn({ ...ZH, wordFx: 'pop' }, 0.7).words;
  expect(pop.map((w) => Number(w.style.opacity) > 0)).toEqual([true, true, false, false]);
  expect(shown(drawn({ ...ZH, wordFx: 'type' }, 0.7).words)).toEqual(['今天', '帶|你']);   // typing 帶你 (the rest still hidden)
  const typed = drawn({ ...ZH, wordFx: 'type' }, 0.95);
  expect(shown(typed.words)).toEqual(['今天', '帶你|']);
});

test('box: a block behind the word being said; color: that word grows', () => {
  const { root } = drawn({ ...ZH, wordFx: 'box' }, 1.1);
  expect([...root.querySelectorAll<HTMLElement>('div')].some((d) => d.style.position === 'absolute' && d.style.display === 'block' && d.style.zIndex === '0')).toBe(true);
  const color = drawn({ ...ZH, wordFx: 'color' }, 1.05).words;
  expect(color[2].style.transform).toMatch(/scale\(1\.\d+\)/);
  expect(color[0].style.transform).toBe('');
});

test('a look that styles its words (neon, gradient, extrude, sticker) draws a span a word even without a word effect', () => {
  for (const style of ['neon', 'gradient', 'extrude', 'sticker']) expect(drawn({ ...ZH, style }, 1.1).words.length, style).toBe(4);
});

test('a template from the item, else the project’s; the item’s own parameters win', () => {
  expect(drawn({ ...ZH, template: 'extrude-one' }, 0.7).words.filter((w) => w.style.display !== 'none').length).toBe(1);
  expect(drawn({ ...ZH }, 0.7, { captionTemplate: 'extrude-one' }).words.filter((w) => w.style.display !== 'none').length).toBe(1);
  expect(drawn({ ...ZH, template: 'extrude-one', wordFx: 'none' }, 0.7).words.filter((w) => w.style.display !== 'none').length).toBe(4);
});
