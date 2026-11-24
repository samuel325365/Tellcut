// @vitest-environment jsdom
// common.onomatopoeia pops in a letter at a time: a letter is a grapheme, so a joined emoji or a flag pops in whole.
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { letterAt, onomatopoeia, type Look } from './onomatopoeia.ts';

test('a family emoji and a flag are one popping letter each, never split into pieces', () => {
  const params = { text: '哇👨‍👩‍👧🇹🇼' }, theme = resolveTheme(undefined, { width: 1080, height: 1920 }), root = document.createElement('div');
  const ctx: any = { t: 1, local: 1, dur: 3, item: { id: 'x', type: onomatopoeia.type, start: 0, end: 3, params }, params: withDefaults(onomatopoeia.params, params, theme), root, W: 1080, H: 1920, fps: 30, theme, motion };
  const s = onomatopoeia.build(ctx);
  onomatopoeia.draw(ctx, s);
  expect(s.chars.map((c) => c.textContent)).toEqual(['哇', '👨‍👩‍👧', '🇹🇼']);
});

const drawn = (params: Record<string, unknown>, local = 1.5) => {
  const theme = resolveTheme(undefined, { width: 1080, height: 1920 }), root = document.createElement('div');
  const ctx: any = { t: local, local, dur: 3, item: { id: 'x', type: onomatopoeia.type, start: 0, end: 3, params }, params: withDefaults(onomatopoeia.params, params, theme), root, W: 1080, H: 1920, fps: 30, theme, motion };
  const s = onomatopoeia.build(ctx);
  onomatopoeia.draw(ctx, s);
  return { s, ctx };
};

test('every look places a letter as a pure function of time, and all its letters are out and whole once settled', () => {
  const o = { gap: 0.07, shake: 3, px: 170, W: 1080, spring: motion.spring({ duration: 0.38, bounce: 0.55 }) };
  for (const look of onomatopoeia.variants!.list.map((v) => v.value as Look)) {
    expect(letterAt(look, 1, 3, 0.4, o), look).toEqual(letterAt(look, 1, 3, 0.4, o));
    for (let i = 0; i < 3; i++) {
      const l = letterAt(look, i, 3, 2.5, o);
      expect(l.show, look).toBe(true);
      expect(l.opacity, look).toBeGreaterThan(0.9);
      expect(Math.abs(l.x), look).toBeLessThan(20);   // back in its place in the row, give or take the twitch
    }
    expect(letterAt(look, 2, 3, 0, o).show && letterAt(look, 2, 3, 0, o).opacity > 0, look).toBe(false);   // the third letter is not there at the start
  }
});

test('shout grows letter by letter; vertical stacks the letters and turns the climb sideways', () => {
  const o = { gap: 0.07, shake: 0, px: 170, W: 1080, spring: motion.spring({ duration: 0.38, bounce: 0.55 }) };
  expect(letterAt('shout', 2, 3, 2, o).sx).toBeGreaterThan(letterAt('shout', 0, 3, 2, o).sx * 1.4);
  const row = drawn({ text: '咚咚', rise: 0.2, shake: 0 }), col = drawn({ text: '咚咚', rise: 0.2, shake: 0, vertical: true });
  expect(row.s.box.style.flexDirection).toBe('row');
  expect(col.s.box.style.flexDirection).toBe('column');
  expect(row.s.chars[0].style.transform).toMatch(/^translate\(0\.0px, [1-9]/);
  expect(col.s.chars[0].style.transform).toMatch(/^translate\(-[1-9][\d.]*px, 0\.0px\)/);
});

test('the glints and streaks show only in the looks that have them, and a change of text keeps them', () => {
  const shown = (s: { extras: HTMLElement[] }) => s.extras.filter((el) => el.style.display !== 'none').length;
  expect(shown(drawn({ look: 'sparkle' }).s)).toBe(6);
  expect(shown(drawn({ look: 'zoom' }).s)).toBe(3);
  expect(shown(drawn({}).s)).toBe(0);
  const { s, ctx } = drawn({ look: 'sparkle' });
  ctx.params = { ...ctx.params, text: '亮' };
  onomatopoeia.draw(ctx, s);
  expect(s.chars.length).toBe(1);
  expect(s.extras.every((el) => el.parentElement === s.box)).toBe(true);
});
