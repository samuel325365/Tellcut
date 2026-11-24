// @vitest-environment jsdom
// common.headline: no element asks for a layer of its own (will-change). Chrome keeps such a layer rastered as it was first drawn, so
// the same moment came out a fraction of a pixel apart depending on what the page drew before: draw(t) is a pure function of t.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { headline } from './headline.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };

test.each(['doc', 'brand', 'proof', 'name'])('headline look %s: no element has will-change', (look) => {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [headline as ItemType] } as any]), media);
  st.load({
    version: 1, meta: { width: 1920, height: 1080, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type: 'common.headline', start: 0, end: 4, params: { look, text: 'Tellcut', sub: 'a sub line' } }] }],
  } as any);
  for (const t of [0.2, 1.5, 3]) st.draw(t);
  const asked = [...root.querySelectorAll<HTMLElement>('*')].filter((e) => e.style.willChange);
  expect(asked.map((e) => e.style.willChange)).toEqual([]);
});
