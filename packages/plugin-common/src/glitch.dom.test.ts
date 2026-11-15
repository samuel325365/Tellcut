// @vitest-environment jsdom
// common.glitch: tear (the first look, unchanged: difference-blended bars) and the looks that move the picture under them through a
// backdrop-filter SVG filter of their own (scan, rgb, block). jsdom has no layout or filters: the tests read what cssCamel and attr last
// wrote (`_c`, `_a`).
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { glitch, glitchBlocks, glitchBurst, rgbSplit, scanJump } from './glitch.ts';

function run(params: Record<string, unknown>, local: number, W = 1080, H = 1920) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div'), top = document.createElement('div');
  const ctx: any = { t: local, local, dur: 4, item: { id: 'x', type: glitch.type, start: 0, end: 4, params }, params: withDefaults(glitch.params, params, theme), root, top, W, H, fps: 30, theme, motion };
  const s = glitch.build(ctx);
  glitch.draw(ctx, s);
  return { s, root };
}
const css = (e: Element | undefined) => ((e as any)?._c ?? {}) as Record<string, string>;
const attrs = (e: Element) => ((e as any)._a ?? {}) as Record<string, string>;
/** everything a look drew: each element's styles and each filter node's attributes, ids left out (each item has its own) */
const picture = (root: HTMLElement) => JSON.stringify([...root.querySelectorAll('*')].map((e) => [e.tagName, css(e), (e as any)._a ?? null])).replace(/tc-glitch-\d+/g, 'id');
const D = { seed: 5, density: 1, shift: 1, bands: 6, maxHeight: 0.05, tint: true };

describe('common.glitch', () => {
  test('tear is the default and the old drawing: the layer is difference-blended, the type itself has no blend', () => {
    expect(withDefaults(glitch.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 })).look).toBe('tear');
    expect(glitch.blend).toBeUndefined();
    const { s, root } = run({ density: 1 }, 0.2);
    expect(root.style.mixBlendMode).toBe('difference');
    expect(s.bars).toHaveLength(6);
    expect(root.querySelector('svg')).toBeNull();
    expect(s.bars.filter((b) => css(b).display === 'block')).toHaveLength(6);
  });

  test('the same moment draws the same picture, for every look', () => {
    for (const look of ['tear', 'scan', 'rgb', 'block']) for (const t of [0.3, 0.5, 1.1]) {
      expect(picture(run({ look, density: 1 }, t).root)).toBe(picture(run({ look, density: 1 }, t).root));
    }
  });

  test('scan, rgb and block are not blended and filter the picture under them with a filter of their own', () => {
    const ids = new Set<string>();
    for (const look of ['scan', 'rgb', 'block']) {
      const { s, root } = run({ look, density: 1 }, 0.3);
      expect(root.style.mixBlendMode).toBe('');
      const f = root.querySelector('svg filter')!;
      expect(f).not.toBeNull();
      expect(css(s.back).backdropFilter).toBe(`url(#${f.id})`);
      ids.add(f.id);
    }
    expect(ids.size).toBe(3);
  });

  test('scan and block leave the picture alone when calm; rgb keeps a faint fringe', () => {
    expect(css(run({ look: 'scan', density: 1 }, 0.5).s.back).backdropFilter).toBe('none');
    expect(css(run({ look: 'block', density: 1 }, 0.5).s.back).backdropFilter).toBe('none');
    const { s } = run({ look: 'rgb', density: 1 }, 0.5);
    expect(css(s.back).backdropFilter).toMatch(/^url\(#/);
    expect(Number(attrs(s.nodes[0][1]).dx)).toBeCloseTo(1.08, 2);
    expect(Number(attrs(s.nodes[0][0]).dx)).toBeCloseTo(-1.08, 2);
  });

  test('a burst: one in each half second at density 1, 2–5 frames long; none at density 0; seeded', () => {
    for (let w = 0; w < 6; w++) {
      const on = Array.from({ length: 15 }, (_, i) => glitchBurst(w * 15 + i, 30, 5, 1)).filter((b) => b > 0);
      expect(on.length).toBeGreaterThanOrEqual(2); expect(on.length).toBeLessThanOrEqual(5);
      expect(on[on.length - 1]).toBe(0.5);
    }
    expect(Array.from({ length: 90 }, (_, n) => glitchBurst(n, 30, 5, 0)).every((b) => b === 0)).toBe(true);
    const a = Array.from({ length: 90 }, (_, n) => glitchBurst(n, 30, 5, 0.6)), b = Array.from({ length: 90 }, (_, n) => glitchBurst(n, 30, 6, 0.6));
    expect(Array.from({ length: 90 }, (_, n) => glitchBurst(n, 30, 5, 0.6))).toEqual(a);
    expect(b).not.toEqual(a);
  });

  test('rgb: a tenth of shift when calm, about half of it in a burst; scaled with the short side', () => {
    expect(rgbSplit(15, 30, D, 1)).toBeCloseTo(1.08, 2);
    const burst = Math.abs(rgbSplit(9, 30, D, 1));   // frames 8–10 burst at seed 5
    expect(burst).toBeGreaterThan(0.4 * 10.8 - 0.01); expect(burst).toBeLessThan(0.6 * 10.8 + 0.01);
    expect(rgbSplit(15, 30, D, 2)).toBeCloseTo(2.16, 2);
  });

  test('block: rectangles inside the frame only during a burst, `bands` of them; scan jumps only then too', () => {
    expect(glitchBlocks(15, 30, D, 1080, 1920)).toEqual([]);
    const b = glitchBlocks(9, 30, D, 1080, 1920);
    expect(b).toHaveLength(6);
    for (const r of b) {
      expect(r.y).toBeGreaterThanOrEqual(0); expect(r.y + r.h).toBeLessThanOrEqual(1920);
      expect(Math.abs(r.dx)).toBeGreaterThanOrEqual(2.5 * 10.8 - 0.1);
    }
    expect(glitchBlocks(9, 30, { ...D, tint: false }, 1080, 1920).every((r) => r.tint === 0)).toBe(true);
    expect(scanJump(15, 30, D, 1)).toBe(0);
    expect(Math.abs(scanJump(9, 30, D, 1))).toBeGreaterThan(3);
  });
});
