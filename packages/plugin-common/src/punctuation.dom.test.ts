// @vitest-environment jsdom
// 2026-11-03: Chinese punctuation the blocks added themselves showed in English films: quote's big 「, reels' full-width space
// before "more", versus' R1｜. They follow the language of the words now. jsdom has no 2D context: the canvas is a stand-in.
import { resolveTheme, withDefaults, type ItemType } from '@tellcut/engine';
import { quote } from './quote.ts';
import { reels } from './reels.ts';
import { versus } from './versus.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === 'width' ? 10 : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const real = { getContext: HTMLCanvasElement.prototype.getContext };
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : t[k]) }); }; });
afterAll(() => Object.assign(HTMLCanvasElement.prototype, real));

function run<S>(type: ItemType<any, S>, params: Record<string, unknown>, local: number, W = 1080, H = 1920) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const item: any = { id: 'x', type: type.type, start: 0, end: 4, params };
  const project: any = { version: 1, meta: { width: W, height: H, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [], tracks: [] };
  const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image: () => document.createElement('img') };
  const ctx: any = { t: local, local, dur: 4, item, params: withDefaults(type.params, params, theme), root, top: document.createElement('div'), project, media, W, H, fps: 30, theme, grades: {}, motion: {},
    reportText() {} };
  const s = type.build(ctx);
  type.draw(ctx, s);
  return { s: s as any, root };
}

test('quote opens an English quote with a curly quote, a Chinese one with 「', () => {
  expect(run(quote, { text: 'Stay hungry.\nStay foolish.', pre: '' }, 1).s.mark.textContent).toBe('“');
  expect(run(quote, {}, 1).s.mark.textContent).toBe('「');
});

test('reels puts an ordinary space before an English "more", a full-width one in Chinese', () => {
  expect(run(reels, { caption: 'A long, slow lunch by the sea', more: 'more' }, 1).s.capMore.textContent).toBe(' more');
  expect(run(reels, { caption: '海邊的午餐', more: '更多' }, 1).s.capMore.textContent).toBe('　更多');
});

test('versus numbers an English round "R1 | …", a Chinese one "R1｜…"', () => {
  const en = run(versus, { mode: 'table', rows: 'Price|Cheap|Dear\nTaste|Sweet|Salty', words: 'Tea|Coffee', names: 'A|B' }, 1).root.textContent!;
  expect(en).toContain('R1 | Price');
  const zh = run(versus, { mode: 'table' }, 1).root.textContent!;
  expect(zh).toMatch(/R1｜/);
});
