// @vitest-environment jsdom
// common.header's chip look: a long title ran off the right edge of the frame (the box had no width limit and never wrapped), as
// the kicker look's did before it was kept between the side margins. jsdom has no layout: the CSS cssCamel wrote is read (`_c`).
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { header } from './header.ts';
import { flipDone, flipRun, sideFit } from './header-looks.ts';

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

// the corner looks (spec 2026-11-20, header looks): slate, flip, side, big
const altCtx = (look: string, params: Record<string, unknown>, local: number, W = 1080, H = 1920) => {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  return { t: local, local, dur: 4, W, H, theme, root, motion, params: withDefaults(header.params, { look, ...params }, theme) } as any;
};

test.each(['slate', 'flip', 'side', 'big'])('%s: shows the number and the title, starting at the side safe margin', (look) => {
  const ctx = altCtx(look, { no: '07', text: '夜市小吃' }, 2), s = header.build(ctx);
  header.draw(ctx, s);
  expect(css(s.box).display).toBe('none');
  const alt = s.alt!, left = ctx.theme.safe.side * ctx.W;
  expect(alt.root.textContent).toContain('夜市小吃');
  expect(alt.root.textContent!.replace(/\s/g, '')).toContain('07');
  if (look === 'side') { expect(css(alt.root).left).toBe('0'); expect(parseFloat(css(alt.root).paddingLeft)).toBeCloseTo(left, 6); }
  else expect(parseFloat(css(alt.root).left)).toBeCloseTo(left, 6);
  if (look === 'slate' || look === 'big') expect(parseFloat(css(alt.root).maxWidth)).toBeCloseTo(ctx.W - 2 * left, 6);
  // fades out over the last 0.3 s
  const end = altCtx(look, { no: '07', text: '夜市小吃' }, 3.99);
  header.draw({ ...end, root: ctx.root }, s);
  expect(parseFloat(css(s.alt!.root).opacity)).toBeLessThan(0.05);
});

test('slate: SCENE for a number, CHAPTER otherwise', () => {
  for (const [no, cap] of [['02', 'SCENE'], ['B', 'CHAPTER']]) {
    const ctx = altCtx('slate', { no, text: '開場' }, 1), s = header.build(ctx);
    header.draw(ctx, s);
    expect(s.alt!.el.cap.textContent).toBe(cap);
  }
});

test('flip: each cell runs through a few letters to its own, the same at the same time, and the title plate opens last', () => {
  expect(flipRun('7', 1).at(-1)).toBe('7');
  expect(flipRun('7', 1).length).toBeGreaterThanOrEqual(4);
  expect(flipRun('夜', 0)).toEqual(['夜']);
  expect(flipRun('A', 0)).toEqual(flipRun('A', 0));
  const ctx = altCtx('flip', { no: 'A12', text: 'Gate' }, 0.2), s = header.build(ctx);
  header.draw(ctx, s);
  const mid = s.alt!.cells.map((c) => c.glyph.textContent);
  header.draw(ctx, s);
  expect(s.alt!.cells.map((c) => c.glyph.textContent)).toEqual(mid);
  expect(mid).not.toEqual(['A', '1', '2']);
  expect(parseFloat(/scaleY\(([\d.]+)\)/.exec(css(s.alt!.el.plate).transform)![1])).toBe(0);
  const done = flipDone('A12');
  expect(done).toBeLessThan(0.8);
  const after = altCtx('flip', { no: 'A12', text: 'Gate' }, done + 0.3);
  header.draw({ ...after, root: ctx.root }, s);
  expect(s.alt!.cells.map((c) => c.glyph.textContent)).toEqual(['A', '1', '2']);
  expect(css(s.alt!.el.plate).transform).toBe('scaleY(1.000)');
});

test('side: a title too long to stand shrinks to half, then is cut with an ellipsis', () => {
  const px = 50;
  expect(sideFit('老街', px, 1000)).toEqual({ px, text: '老街' });
  const shrunk = sideFit('一二三四五六七八九十', px, 400);
  expect(shrunk.px).toBeLessThan(px); expect(shrunk.px).toBeGreaterThanOrEqual(px / 2); expect(shrunk.text).toBe('一二三四五六七八九十');
  const cut = sideFit('一二三四五六七八九十'.repeat(4), px, 400);
  expect(cut.px).toBe(px / 2);
  expect(cut.text.endsWith('…')).toBe(true);
  expect((cut.text.length) * 1.05 * cut.px).toBeLessThanOrEqual(400);
});

test('switching back to chip hides the corner look', () => {
  const ctx = altCtx('big', { no: '04', text: '甜點' }, 1), s = header.build(ctx);
  header.draw(ctx, s);
  header.draw({ ...ctx, params: { ...ctx.params, look: 'chip' } }, s);
  expect(css(s.alt!.root).display).toBe('none');
  expect(css(s.box).display).toBe('flex');
});
