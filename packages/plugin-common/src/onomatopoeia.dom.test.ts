// @vitest-environment jsdom
// common.onomatopoeia pops in a letter at a time: a letter is a grapheme, so a joined emoji or a flag pops in whole.
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { onomatopoeia } from './onomatopoeia.ts';

test('a family emoji and a flag are one popping letter each, never split into pieces', () => {
  const params = { text: '哇👨‍👩‍👧🇹🇼' }, theme = resolveTheme(undefined, { width: 1080, height: 1920 }), root = document.createElement('div');
  const ctx: any = { t: 1, local: 1, dur: 3, item: { id: 'x', type: onomatopoeia.type, start: 0, end: 3, params }, params: withDefaults(onomatopoeia.params, params, theme), root, W: 1080, H: 1920, fps: 30, theme, motion };
  const s = onomatopoeia.build(ctx);
  onomatopoeia.draw(ctx, s);
  expect(s.chars.map((c) => c.textContent)).toEqual(['哇', '👨‍👩‍👧', '🇹🇼']);
});
