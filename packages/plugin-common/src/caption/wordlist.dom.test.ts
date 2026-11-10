// @vitest-environment jsdom
// common.caption splits a line with no word times into even words (evenWords, a word segmenter over the line) only when a word
// effect or an entrance draws it a word at a time; a plain caption draws its runs and never needs them, on any frame.
import { createRegistry, Stage } from '@tellcut/engine';

const calls = vi.hoisted(() => ({ even: 0 }));
vi.mock('./wordfx.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./wordfx.ts')>();
  return { ...real, evenWords: (...a: Parameters<typeof real.evenWords>) => { calls.even++; return real.evenWords(...a); } };
});
const { caption } = await import('../caption.ts');

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };

function draws(params: Record<string, unknown>) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [caption] } as any]), media);
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'c', type: 'common.caption', start: 0, end: 3, params }] }] } as any);
  calls.even = 0;
  for (const t of [0.5, 1, 1.5, 2]) st.draw(t);
  return calls.even;
}

test('a plain caption with no word times never splits its line into words; a word effect does', () => {
  expect(draws({ text: '今天帶你去吃台南' })).toBe(0);
  expect(draws({ text: '今天帶你去吃台南', wordFx: 'color' })).toBeGreaterThan(0);
});
