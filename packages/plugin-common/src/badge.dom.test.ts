// @vitest-environment jsdom
// common.badge: the number was sized as if every character were 0.6 em (Chinese ran out of the star) and the plate never shrank
// (a long name ran off the frame). jsdom has no layout: the CSS cssCamel wrote is read (`_c`).
import { motion, resolveTheme, textEm, withDefaults } from '@tellcut/engine';
import { badge } from './badge.ts';

const css = (el: Element) => (el as any)._c as Record<string, string>;
const W = 1080, H = 1920, theme = resolveTheme(undefined, { width: W, height: H });
function run(params: Record<string, unknown>) {
  const ctx: any = { t: 1, local: 1, dur: 4, W, H, theme, root: document.createElement('div'), motion, params: withDefaults(badge.params, params, theme) };
  const s = badge.build(ctx);
  badge.draw(ctx, s);
  return s as any;
}
const px = (v: string) => parseFloat(v);

test('the number fits the badge by its estimated width; No.1 and two digits keep their size', () => {
  const size = 0.15 * 1080;
  expect(px(css(run({}).num).fontSize)).toBe(size * (0.5 / (0.6 * 4)));
  expect(px(css(run({ label: '02' }).num).fontSize)).toBe(size * 0.3);
  const cjk = run({ label: '第一名' });
  expect(px(css(cjk.num).fontSize) * textEm('第一名')).toBeLessThanOrEqual(0.5 * size + 1e-9);
});

test('a long plate shrinks to end inside the side safe margin; a short one keeps its size', () => {
  const size = 0.15 * 1080, r = size / 2, side = theme.safe.side * W;
  const plate = '阿桃的店・中壢老街口第一家古早味紅茶冰';
  const s = run({ plate });
  const left = 0.14 * W - r + size + size * 0.12, fs = px(css(s.plate).fontSize);
  expect(fs).toBeLessThan(size * 0.42);
  expect(left + fs * (textEm(plate) + 0.3)).toBeLessThanOrEqual(W - side + 1e-6);
  expect(px(css(run({ plate: '阿桃的店' }).plate).fontSize)).toBe(size * 0.42);
  // box: the plate at 0.2 of the size unless it runs out
  const boxed = run({ shape: 'box', plate });
  expect(px(css(boxed.plate).fontSize)).toBeLessThan(size * 0.2);
  expect(px(css(run({ shape: 'box', plate: 'NEW' }).plate).fontSize)).toBe(size * 0.2);
});
