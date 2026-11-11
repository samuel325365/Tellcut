// @vitest-environment jsdom
// slip, rating and scoreboard spanned the side safe margins in every frame, a strip about 1700 px wide in 16:9. `w` caps them at a
// share of the short side, centred; its default (the whole short side) keeps every portrait and square frame as it was.
import { resolveTheme, withDefaults, type ItemType } from '@tellcut/engine';
import { slip } from './slip.ts';
import { rating } from './rating.ts';
import { scoreboard } from './scoreboard.ts';

function run<S>(type: ItemType<any, S>, params: Record<string, unknown>, local: number, W = 1080, H = 1920, dur = 4) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const item: any = { id: 'x', type: type.type, start: 0, end: dur, params };
  const project: any = { version: 1, meta: { width: W, height: H, fps: 30, duration: dur, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [], tracks: [] };
  const ctx: any = { t: local, local, dur, item, params: withDefaults(type.params, params, theme), root, top: document.createElement('div'), project, media: {}, W, H, fps: 30, theme, grades: {}, motion: {} };
  const s = type.build(ctx);
  type.draw(ctx, s);
  return { s: s as any, theme };
}
const css = (el: Element) => (el as any)._c as Record<string, string>;
const px = (v: string | undefined) => parseFloat(String(v));

const CASES: Array<[string, ItemType<any, any>, Record<string, unknown>, (s: any) => HTMLElement]> = [
  ['slip stub', slip, {}, (s) => s.box],
  ['slip board', slip, { mode: 'board' }, (s) => s.box],
  ['rating', rating, {}, (s) => s.card],
  ['scoreboard', scoreboard, {}, (s) => s.card],
];

describe.each(CASES)('%s: w caps the width', (_name, type, params, box) => {
  test('portrait and square: the side safe margins, exactly as before', () => {
    for (const [W, H] of [[1080, 1920], [1080, 1080], [1080, 1350]]) {
      const { s, theme } = run(type, params, 2, W, H), side = theme.safe.side * W;
      expect(css(box(s)).left).toBe(`${side}px`);
      expect(css(box(s)).width).toBe(`${W - 2 * side}px`);
    }
    // a theme with no side margin in 9:16: still the whole width (the cap is the short side, the frame's width here)
    const theme = resolveTheme({ safe: { side: 0 } }, { width: 1080, height: 1920 }), root = document.createElement('div');
    const ctx: any = { t: 2, local: 2, dur: 4, item: { id: 'x', type: type.type, start: 0, end: 4, params }, params: withDefaults(type.params, params, theme), root, top: root, project: {}, media: {}, W: 1080, H: 1920, fps: 30, theme, grades: {}, motion: {} };
    const s = type.build(ctx); type.draw(ctx, s);
    expect(px(css(box(s)).width)).toBe(1080);
  });
  test('16:9: the short side wide, centred; a bigger w gives the old strip back', () => {
    const { s } = run(type, params, 2, 1920, 1080);
    expect(px(css(box(s)).width)).toBeCloseTo(1080);
    expect(px(css(box(s)).left)).toBeCloseTo(420);
    const narrow = run(type, { ...params, w: 0.6 }, 2, 1920, 1080).s;
    expect(px(css(box(narrow)).width)).toBeCloseTo(648);
    expect(px(css(box(narrow)).left)).toBeCloseTo(636);
    const wide = run(type, { ...params, w: 1.6 }, 2, 1920, 1080);
    expect(px(css(box(wide.s)).width)).toBeCloseTo(1920 - 2 * wide.theme.safe.side * 1920);
    expect(px(css(box(wide.s)).left)).toBeCloseTo(wide.theme.safe.side * 1920);
  });
});

test('slip: a stub flying into a slot starts from where the capped stub is', () => {
  const { s } = run(slip, { slot: 1, slots: 3 }, 3.9, 1920, 1080);
  expect(px(css(s.box).width)).toBeCloseTo(1080);
  expect(css(s.box).transform).toMatch(/translate\(/);
});
