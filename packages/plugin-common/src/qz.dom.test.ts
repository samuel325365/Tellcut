// @vitest-environment jsdom
// Blocks q–z sized to their room: lines that would run off the frame or the card shrink (or fit), short ones are drawn as before.
// jsdom has no layout and no 2D context: the tests read what cssCamel last wrote (`_c`) and the canvas is a stand-in.
import { resolveTheme, textEm, withDefaults, type ItemType } from '@tellcut/engine';
import { quote } from './quote.ts';
import { rating } from './rating.ts';
import { stations, stationsLayout } from './stations.ts';
import { marqueeCopies, reels } from './reels.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === 'width' ? 10 : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const real = { getContext: HTMLCanvasElement.prototype.getContext, toDataURL: HTMLCanvasElement.prototype.toDataURL };
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : t[k]) }); };
  HTMLCanvasElement.prototype.toDataURL = () => 'data:,';
});
afterAll(() => Object.assign(HTMLCanvasElement.prototype, real));

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
const motion: any = { spring: () => (t: number) => Math.min(1, Math.max(0, t / 0.4)), interpolate: () => () => 1, ease: { in: (x: number) => x } };
/** build and draw a block alone on a W×H frame at item time `local`; its state (the elements) and the theme */
function run<S>(type: ItemType<any, S>, params: Record<string, unknown>, local: number, W = 1080, H = 1920, dur = 4) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const item: any = { id: 'x', type: type.type, start: 0, end: dur, params };
  const project: any = { version: 1, meta: { width: W, height: H, fps: 30, duration: dur, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [], tracks: [] };
  const ctx: any = { t: local, local, dur, item, params: withDefaults(type.params, params, theme), root, top: document.createElement('div'), project, media, W, H, fps: 30, theme, grades: {}, motion, reportText() {} };
  const s = type.build(ctx);
  type.draw(ctx, s);
  return { s: s as any, theme, ctx };
}
const css = (el: Element) => (el as any)._c as Record<string, string>;
const px = (v: string | undefined) => parseFloat(String(v));

describe('common.quote', () => {
  test('an English line is fitted with the spaces it is drawn with', () => {
    const text = 'every single morning I would rather stay in bed', W = 1080;
    const { s, theme } = run(quote, { text, sizes: '' }, 3, W);
    const row = s.rows[0] as HTMLElement, drawn = row.textContent!;
    expect(drawn.replace(/ /g, ' ')).toBe(text);   // the space between Latin words is a no-break one
    expect(px(css(row).fontSize) * textEm(drawn)).toBeLessThanOrEqual(W - 2 * theme.safe.side * W + 0.01);
  });
  test('a Chinese line is drawn and sized as before (no spaces between its words)', () => {
    const { s } = run(quote, {}, 3);
    expect((s.rows as HTMLElement[]).map((r) => r.textContent)).toEqual(['但如果今天', '你討厭早起，', '你又沒有理由，', '那就別起。', '去睡吧']);
  });
});

describe('common.rating', () => {
  const em = (v: string, base: number) => (v.endsWith('em') ? parseFloat(v) * base : parseFloat(v));
  test('ten stars fit the card: the stars shrink to the room left beside the label and the number', () => {
    const { s, theme, ctx } = run(rating, { max: 10 }, 3);
    const W = 1080, base = (ctx.params.size / 100) * 1080, k = 1, w = W - 2 * theme.safe.side * W;
    const inner = w - 68 * k - 2 * theme.stroke * 0.6 * k, r = s.rows[0];
    const used = em(css(r.label).width, base) + r.marks.reduce((a: number, m: HTMLElement) => a + em(css(m).width, base), 0) + 0.3 * base * (r.marks.length + 1) + 1.8 * base;
    expect(used).toBeLessThanOrEqual(inner + 0.01);
  });
  test('five stars and short labels are drawn as before', () => {
    const { s } = run(rating, {}, 3);
    for (const r of s.rows) {
      expect(r.marks.map((m: HTMLElement) => css(m).width)).toEqual(Array(5).fill('1em'));
      expect([css(r.label).width, css(r.label).fontSize ?? '']).toEqual(['4.2em', '']);
    }
  });
  test('a long label shrinks into its column', () => {
    const { s, ctx } = run(rating, { rows: 'Value for money:4' }, 3), base = (ctx.params.size / 100) * 1080, l = s.rows[0].label;
    expect(px(css(l).fontSize) * textEm('Value for money')).toBeLessThanOrEqual(4.2 * base + 0.01);
    expect(px(css(l).width)).toBeCloseTo(4.2 * base, 6);
  });
});

describe('common.stations', () => {
  test('eight stations in 16:9 start inside the safe area: the rows and their type shrink together', () => {
    const theme = resolveTheme(undefined, { width: 1920, height: 1080 }), L = stationsLayout(8, 1920, 1080, theme.safe);
    expect(L.top).toBeGreaterThanOrEqual(theme.safe.top * 1080 - 1e-6);
    expect(L.u).toBeLessThan(1);
    const { s } = run(stations, { stops: Array.from({ length: 8 }, (_, i) => `站${i}|S${i}`).join(', ') }, 1, 1920, 1080);
    expect(px(css(s.rows[0].row).top)).toBeGreaterThanOrEqual(theme.safe.top * 1080 - 1e-6);
  });
  test('three stations in 9:16 keep their layout', () => {
    const theme = resolveTheme(undefined, { width: 1080, height: 1920 }), L = stationsLayout(3, 1080, 1920, theme.safe);
    const bottom = (1 - theme.safe.bottom) * 1920;
    expect(L).toEqual({ u: 1, top: bottom - (3 * 150 + 90), left: theme.safe.side * 1080 + 20, bottom });
  });
});

describe('common.reels marquee', () => {
  test('enough copies of a short line to fill the 560-unit window while it slides', () => {
    expect(marqueeCopies(140, 560)).toBe(5);
    expect(marqueeCopies(402, 560)).toBe(3);
    expect(marqueeCopies(900, 560)).toBe(2);
    for (const mw of [90, 140, 333, 560, 1000]) expect((marqueeCopies(mw, 560) - 1) * mw).toBeGreaterThanOrEqual(560);   // the last copy starts past the window even at the largest offset
  });
  test('the feed draws that many copies', () => {
    const { s } = run(reels, { music: '♪ ok' }, 1);
    const shown = [...s.marquee.children] as HTMLElement[];
    expect(shown.length).toBe(marqueeCopies(textEm('♪ ok') * 28 + 90, 560));
    expect(shown.every((el) => el.textContent === '♪ ok')).toBe(true);
  });
});
