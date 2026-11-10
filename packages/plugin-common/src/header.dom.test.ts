// @vitest-environment jsdom
// common.header's chip look: a long title ran off the right edge of the frame (the box had no width limit and never wrapped), as
// the kicker look's did before it was kept between the side margins. jsdom has no layout: the CSS cssCamel wrote is read (`_c`).
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { header } from './header.ts';

const css = (el: Element) => (el as any)._c as Record<string, string>;

test('chip: the label wraps inside the side safe margins and the chip keeps its size beside it', () => {
  const W = 1080, H = 1920, theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const ctx: any = { t: 1, local: 1, dur: 4, W, H, theme, root, motion, params: withDefaults(header.params, { text: '這一段我們來聊聊為什麼大家都喜歡在週末的早上去市場買菜' }, theme) };
  const s = header.build(ctx);
  header.draw(ctx, s);
  const left = theme.safe.side * W, px = 0.03 * H;
  // the label's room: the safe width less the chip (01: two digits, padding 0.9 em) and the 0.5 em gap
  expect(parseFloat(css(s.label).maxWidth)).toBeCloseTo(W - 2 * left - (1.1 * 1.1 + 1.4) * px, 6);
  expect(css(s.label).whiteSpace).toBe('pre-wrap');
  expect(css(s.chip).flex).toBe('none');
});
