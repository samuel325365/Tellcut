// @vitest-environment jsdom
// The situation looks (layout.ts) on a stage: chat's bubble stays inside the safe area when set flush left, and chalk's rough edge
// scales with the frame. jsdom lays nothing out: these check the styles and the filter the look makes.
import { createRegistry, resolveTheme, Stage } from '@tellcut/engine';
import { caption } from '../../caption.ts';
import { chalkFilter, chat } from './layout.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };

/** one caption drawn at 1.5 s on a W×H stage */
function draw(params: Record<string, unknown>, W = 1080, H = 1920) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [caption] } as any]), media);
  st.load({ version: 1, meta: { width: W, height: H, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'c', type: 'common.caption', start: 0, end: 3, params }] }] } as any);
  st.draw(1.5);
  return root.querySelector<HTMLElement>('div[style*="font-size"]')!;
}

test('chat set flush left: the left speaker\'s bubble starts at the safe edge (leaning 9 % left put it 46 px past it); the right one still leans right', () => {
  const theme = resolveTheme(undefined, { width: 1080, height: 1920 });
  const e = (speaker: number, left: boolean) => ({ p: { speaker }, left, theme } as any);
  expect(chat.pin!(e(0, true))).toBe('');
  expect(chat.pin!(e(0, false))).toBe(' translateX(-9%)');
  expect(chat.pin!(e(2, true))).toBe(' translateX(9%)');
  expect(chat.pin!(e(3, false))).toBe(' translateX(9%)');
  // drawn: the box stands at the safe side with no shift to the left of it
  const box = draw({ text: '今天帶你去吃台南', style: 'chat', align: 'left' });
  expect(box.style.left).toBe(`${theme.safe.side * 1080}px`);
  expect(box.style.transform).not.toMatch(/translateX\(-/);
});

test('chalk\'s rough edge scales with the frame: 1080 keeps 0.9 and 2.2, a 4K frame gets the same edge twice the size', () => {
  const filter = (k: number) => {
    const f = document.getElementById(chalkFilter(k))!;
    return [f.querySelector('feTurbulence')!.getAttribute('baseFrequency'), f.querySelector('feDisplacementMap')!.getAttribute('scale')];
  };
  const hd = draw({ text: '粉筆字', style: 'chalk' });
  expect(hd.style.filter).toBe(`url(#${chalkFilter(1)})`);
  expect(filter(1)).toEqual(['0.9', '2.2']);
  const uhd = draw({ text: '粉筆字', style: 'chalk' }, 3840, 2160);
  expect(uhd.style.filter).toBe(`url(#${chalkFilter(2)})`);
  expect(filter(2)).toEqual(['0.45', '4.4']);
  // drawn again at either size: still one filter a scale
  draw({ text: '粉筆字', style: 'chalk' });
  expect(document.querySelectorAll(`#${chalkFilter(1)}`).length).toBe(1);
});
