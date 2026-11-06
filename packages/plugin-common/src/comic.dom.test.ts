// @vitest-environment jsdom
// common.comic and common.onomatopoeia (2026-11-05, the comic pilot film's fx.comicpage / fx.comicsfx). jsdom has no canvas or
// layout: the page's geometry is tested through its helpers, the sound word through what cssCamel last wrote (`_c`).
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { COMIC_LAYOUTS, comic, comicFocus, comicPanels, comicReveal, comicShape, comicWindow } from './comic.ts';
import { letterPop, onomatopoeia } from './onomatopoeia.ts';

describe('common.comic', () => {
  test('a frame overlay with a theme ink; two panels by default', () => {
    expect([comic.kind, comic.category]).toEqual(['overlay', 'frame']);
    const d = withDefaults(comic.params, {}, resolveTheme({ palette: { ink: '#222222' } }, { width: 1080, height: 1920 }));
    expect([d.layout, d.ink]).toEqual(['two', '#222222']);
    expect(comicPanels(d)).toHaveLength(2);
  });

  test('every layout stays inside the frame and its panels do not overlap one another', () => {
    for (const [name, polys] of Object.entries(COMIC_LAYOUTS)) {
      for (const poly of polys) for (const [x, y] of poly) { expect(x, name).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1); }
      expect(polys.length, name).toBe({ one: 1, two: 2, 'two-flip': 2, three: 3, four: 4, side: 2 }[name]);
    }
  });

  test('comicShape is the panel\'s corners inside its box', () => {
    // two: the top panel's bottom edge runs from 0.555 (left) up to 0.5 (right) of the frame, in a box 0.015–0.555
    expect(comicShape(1, { layout: 'two' })).toEqual([[0, 0], [1, 0], [1, 0.8981], [0, 1]]);
    expect(comicShape(2, { layout: 'two' })).toEqual([[0, 0.1183], [1, 0], [1, 1], [0, 1]]);
    expect(comicShape(1, { layout: 'one' })).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);
  });

  test('comicWindow is the panel\'s bounding box, counted from 1 and clamped', () => {
    expect(comicWindow(1, { layout: 'two' })).toEqual([0.03, 0.015, 0.94, 0.54]);
    expect(comicWindow(2, { layout: 'two' })).toEqual([0.03, 0.52, 0.94, 0.465]);
    expect(comicWindow(9, { layout: 'two' })).toEqual(comicWindow(2, { layout: 'two' }));
    expect(comicWindow(1, { layout: 'one' })).toEqual([0.03, 0.015, 0.94, 0.97]);
  });

  test('own panels win over the layout; a broken line is skipped', () => {
    const panels = '0.1,0.1 0.9,0.1 0.9,0.4 0.1,0.4\nnot a panel\n0.1,0.5 0.9,0.5 0.5,0.9';
    expect(comicPanels({ layout: 'four', panels })).toHaveLength(2);
    expect(comicWindow(2, { panels })).toEqual([0.1, 0.5, 0.8, 0.4]);
  });

  test('reveal: given seconds and sides, the rest 0.6 s apart, the first still and the others from right and left in turn', () => {
    expect(comicReveal({ times: '', from: '' }, 3)).toEqual([{ at: 0, dir: 'none' }, { at: 0.6, dir: 'right' }, { at: 1.2, dir: 'left' }]);
    expect(comicReveal({ times: '0, 1.4', from: 'top,bogus' }, 3)).toEqual([{ at: 0, dir: 'top' }, { at: 1.4, dir: 'right' }, { at: 1.2, dir: 'left' }]);
  });

  test('focus lines: panel|x,y|seconds, the seconds optional', () => {
    expect(comicFocus('2|0.5,0.7|0.85\n1|0.4,0.3\nnope')).toEqual([{ panel: 2, x: 0.5, y: 0.7, at: 0.85 }, { panel: 1, x: 0.4, y: 0.3, at: null }]);
  });
});

function word(params: Record<string, unknown>, local: number, dur = 3) {
  const theme = resolveTheme(undefined, { width: 1080, height: 1920 }), root = document.createElement('div');
  const ctx: any = { t: local, local, dur, item: { id: 'x', type: onomatopoeia.type, start: 0, end: dur, params }, params: withDefaults(onomatopoeia.params, params, theme), root, W: 1080, H: 1920, fps: 30, theme, motion };
  const s = onomatopoeia.build(ctx);
  onomatopoeia.draw(ctx, s);
  return { s, ctx, css: (el: HTMLElement) => (el as any)._c as Record<string, string> };
}

describe('common.onomatopoeia', () => {
  test('one span per letter, the text as text (never markup)', () => {
    const { s } = word({ text: '<b>哈</b>' }, 1);
    expect(s.chars.map((c) => c.textContent).join('')).toBe('<b>哈</b>');
    expect(s.box.querySelector('b')).toBeNull();
  });

  test('letters pop in one after another: later ones still hidden early on', () => {
    const { s, css } = word({ text: '哈哈哈！', gap: 0.1 }, 0.15);
    expect(s.chars.map((c) => css(c).visibility)).toEqual(['visible', 'visible', 'hidden', 'hidden']);
    const spring = motion.spring({ duration: 0.38, bounce: 0.55 });
    expect(letterPop(spring, 2, 0.1, 0.15)).toBe(0);
    expect(letterPop(spring, 0, 0.1, 2)).toBeCloseTo(1, 2);
  });

  test('placed at (x, y), tilted, outlined in ink; same frame twice draws the same', () => {
    const a = word({ x: 0.25, y: 0.4, tilt: -10 }, 1.234), b = word({ x: 0.25, y: 0.4, tilt: -10 }, 1.234);
    expect(a.css(a.s.box).transform).toContain('translate(270.0px, 768.0px)');
    expect(a.css(a.s.box).transform).toContain('rotate(-10deg)');
    expect(a.css(a.s.chars[0]).webkitTextStroke).toBe('28.0px #1a1a1a');   // the theme's ink
    expect(a.s.chars.map((c) => a.css(c).transform)).toEqual(b.s.chars.map((c) => b.css(c).transform));
  });
});
