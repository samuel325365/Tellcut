// @vitest-environment jsdom
// common.magazine's head band: the issue lines never run under No. or the page squares, however wide the masthead.
import { resolveTheme, textEm } from '@tellcut/engine';
import { magazine, magazineLayout } from './magazine.ts';

// a canvas whose letters are 0.6 em wide, enough to measure with (jsdom has no canvas)
const st: Record<string, unknown> = { font: '10px x' };
const ctx2d: any = new Proxy({}, {
  get: (_t, k) => (typeof k === 'symbol' ? undefined : k in st ? st[k as string]
    : k === 'measureText' ? (t: string) => ({ width: [...t].length * 0.6 * parseFloat(/(\d+(?:\.\d+)?)px/.exec(String(st.font))![1]) })
      : () => ({ addColorStop() {} })),
  set: (_t, k, v) => { st[k as string] = v; return true; },
});
beforeAll(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx2d); });
afterAll(() => vi.restoreAllMocks());

function band(params: Record<string, unknown>) {
  const W = 1080, H = 1920, root = document.createElement('div');
  const all = { ...Object.fromEntries(magazine.params.map((d) => [d.key, d.default])), ...params } as any;
  const theme = resolveTheme({}, { width: W, height: H });
  const ctx: any = { root, params: all, W, H, t: 1, local: 1, dur: 3, theme, item: { id: 'm', type: 'common.magazine', start: 0, end: 3, params: all }, media: { stillUrl: () => '', image: () => document.createElement('img') } };
  const s = magazine.build(ctx), L = magazineLayout(all, W, H, theme.safe);
  const px = (e: HTMLElement) => parseFloat(e.style.fontSize), left = (e: HTMLElement) => parseFloat(e.style.left);
  const width = (e: HTMLElement, wt = 0.02) => [...e.textContent!].length * (0.6 + wt) * px(e);
  return { s, L, W, px, left, width };
}

test('a masthead at its widest: the issue line ends before No., the Chinese line before the squares', () => {
  const { s, W, L, px, left, width } = band({ title: 'WANDERLUSTING' });
  const noLeft = W - L.tx - width(s.no, 0), sqLeft = W - L.tx - (5 * 30 - 8);
  expect(left(s.issue) + width(s.issue)).toBeLessThanOrEqual(noLeft + 1e-6);
  expect(left(s.issueSub) + width(s.issueSub, 0)).toBeLessThanOrEqual(sqLeft + 1e-6);
  expect(px(s.issue)).toBeGreaterThanOrEqual(24 * 0.6 - 1e-6);
});

test('the default masthead leaves the issue lines their own size', () => {
  const { s, px } = band({});
  expect([px(s.issue), px(s.issueSub), px(s.mast)]).toEqual([24, 28, 84]);
});

/** the deck's font size and left edge after drawing at 2.5 s, and the room the headline has (the same sums as the block) */
function deckOf(params: Record<string, unknown>) {
  const W = 1080, H = 1920, root = document.createElement('div');
  const all = { ...Object.fromEntries(magazine.params.map((d) => [d.key, d.default])), ...params } as any;
  const theme = resolveTheme({}, { width: W, height: H });
  const ctx: any = { root, params: all, W, H, t: 2.5, local: 2.5, dur: 3, theme, item: { id: 'm', type: 'common.magazine', start: 0, end: 3, params: all },
    media: { stillUrl: () => '', image: () => document.createElement('img'), video: () => document.createElement('video'), place() {}, begin() {} }, reportText() {}, motion: {} };
  const s: any = magazine.build(ctx);
  magazine.draw(ctx, s);
  const L = magazineLayout(all, W, H, theme.safe), room = all.layout === 'list' ? L.column[2] : all.layout === 'back' ? W - 2 * L.tx : L.win[2] - 56 * L.k;
  return { px: parseFloat(s.deck.style.fontSize), room };
}

test('a long deck shrinks to the headline\'s width (feature, list, back); a short one keeps its size', () => {
  const deck = '從清晨的魚市場一路走到老城區的咖啡館再到河邊看夕陽的一整天', short = '從市場到老城';
  for (const [layout, base] of [['feature', 34], ['list', 36], ['back', 76]] as const) {
    const long = deckOf({ layout, deck });
    expect(long.px, layout).toBeLessThan(base);
    expect(long.px * textEm(deck), layout).toBeLessThanOrEqual(long.room + 1e-6);
    expect(deckOf({ layout, deck: short }).px, layout).toBe(base);
  }
});
