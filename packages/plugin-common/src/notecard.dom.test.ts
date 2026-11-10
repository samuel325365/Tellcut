// @vitest-environment jsdom
// common.notecard: a line too long for the card is written smaller so it stays on the card; lines that fit keep their size.
import { resolveTheme, withDefaults } from '@tellcut/engine';
import { notecard } from './notecard.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything), apply: () => anything, construct: () => anything, set: () => true,
});
beforeAll(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => anything); });
afterAll(() => vi.restoreAllMocks());

/** the font size (px) each written line got, by its text */
function sizes(params: Record<string, unknown>, local = 3) {
  const W = 1080, H = 1920, theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const ctx: any = { t: local, local, dur: 4, item: { id: 'n', type: notecard.type, start: 0, end: 4, params }, params: withDefaults(notecard.params, params, theme), root, W, H, fps: 30, theme, motion: {} };
  const s = notecard.build(ctx);
  notecard.draw(ctx, s);
  const u = parseFloat(s.wrap.style.width) / 940;
  return Object.fromEntries(s.txt.slots.map((sl: { box: HTMLElement; chars: HTMLElement[] }) => [sl.chars.map((c) => c.textContent).join(''), parseFloat(sl.box.style.fontSize) / u]));
}

test('step: a long title and a long field value shrink; the defaults keep 60 and 42', () => {
  expect(sizes({ mode: 'step' })).toMatchObject({ 打發鮮奶油: expect.closeTo(60, 6), 電動打蛋器: expect.closeTo(42, 6) });
  const long = sizes({ mode: 'step', title: '把鮮奶油和糖一起打發到濃稠綿密的程度', fields: '用具|電動打蛋器或者手動打蛋器加上一個大碗' });
  expect(long['把鮮奶油和糖一起打發到濃稠綿密的程度']).toBeLessThan(60);
  expect(long['電動打蛋器或者手動打蛋器加上一個大碗']).toBeLessThan(42);
});

test('list: an item too long even for one column shrinks to the card, a long title to the room left of the count; title mode\'s name too', () => {
  const s = sizes({ mode: 'list', title: '我的超長購物清單標題一二三四五', items: '濃咖啡|粗糖|可可酒|鮮奶油|香草莢|馬斯卡彭起司', size: 1 });
  expect(s['濃咖啡']).toBeCloseTo(44, 6);
  expect(s['馬斯卡彭起司']).toBeCloseTo(44, 6);
  const item = '一二三四五六七八九十一二三四五六七八九十', long = sizes({ mode: 'list', items: `${item}|粗糖|可可酒|鮮奶油|香草莢`, size: 1 });
  expect(long[item]).toBeLessThan(44);
  expect(long[item] * 20).toBeLessThanOrEqual(940 - 52 - 52 - 54 + 1e-6);
  expect(s['我的超長購物清單標題一二三四五']).toBeLessThan(60);
  expect(sizes({ mode: 'title', title: '義式經典提拉米蘇蛋糕' })['義式經典提拉米蘇蛋糕']).toBeLessThan(150);
  expect(sizes({ mode: 'title', title: '提拉米蘇' })['提拉米蘇']).toBeCloseTo(150, 6);
});
