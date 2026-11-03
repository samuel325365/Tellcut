// @vitest-environment jsdom
// common.leak (2026-11-03, from the Egypt photo films' fx.leak / fx.lightleak / fx.glow). jsdom has no layout: the tests read what
// cssCamel last wrote (`_c`).
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { leak, leakCentre, leakLevel } from './leak.ts';

function run(params: Record<string, unknown>, local: number, W = 1080, H = 1920, dur = 3) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const ctx: any = { t: local, local, dur, item: { id: 'x', type: leak.type, start: 0, end: dur, params }, params: withDefaults(leak.params, params, theme), root, W, H, fps: 30, theme, motion };
  const s = leak.build(ctx);
  leak.draw(ctx, s);
  return { s, ctx, bg: () => ((s.el as any)._c as Record<string, string>).background };
}

describe('common.leak', () => {
  test('a look overlay blended in screen: warm, from the top right, drifting 0.6 of the frame', () => {
    expect([leak.kind, leak.category, leak.blend]).toEqual(['overlay', 'look', 'screen']);
    const d = withDefaults(leak.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 }));
    expect([d.from, d.travel, d.peak, d.color]).toEqual(['tr', 0.6, 0.55, '#ff9a52']);
  });

  test('a sweep: dark at both ends, at its peak halfway', () => {
    const p = { travel: 0.6, peak: 0.5 };
    expect(leakLevel(p, 0, 3)).toBe(0);
    expect(leakLevel(p, 1.5, 3)).toBeCloseTo(0.5, 6);
    expect(leakLevel(p, 3, 3)).toBeCloseTo(0, 6);
    expect(leakLevel(p, 0.75, 3)).toBeLessThan(leakLevel(p, 1.5, 3));
  });

  test('travel 0 stays put at (x, y), fades in over 0.6 s and out over the last 0.6 s', () => {
    const p = { from: 'tr' as const, travel: 0, x: 0.8, y: 0.15, peak: 0.5 };
    expect(leakCentre(p, 0)).toEqual([0.8, 0.15]);
    expect(leakCentre(p, 1)).toEqual([0.8, 0.15]);
    expect(leakLevel(p, 0, 3)).toBe(0);
    expect(leakLevel(p, 1.5, 3)).toBeGreaterThan(0.35);
    expect(leakLevel(p, 3, 3)).toBe(0);
  });

  test('each side starts outside the frame and drifts into it', () => {
    for (const from of ['tl', 'tr', 'bl', 'br', 'l', 'r'] as const) {
      const [x0, y0] = leakCentre({ from, travel: 0.6, x: 0, y: 0 }, 0), [x1, y1] = leakCentre({ from, travel: 0.6, x: 0, y: 0 }, 1);
      expect(x0 < 0 || x0 > 1 || y0 < 0 || y0 > 1).toBe(true);
      expect(Math.abs(x1 - 0.5)).toBeLessThan(Math.abs(x0 - 0.5));
      expect(Math.abs(y1 - 0.5)).toBeLessThanOrEqual(Math.abs(y0 - 0.5) + 1e-9);
    }
  });

  test('draws three glows (core, body, rose), two with rose empty, nothing at the ends', () => {
    const glows = (bg: string) => (bg.match(/radial-gradient/g) ?? []).length;
    expect(glows(run({}, 1.5).bg())).toBe(3);
    expect(glows(run({ rose: '' }, 1.5).bg())).toBe(2);
    expect(run({}, 0).bg()).toBe('none');
    // the glow's size goes by the long side: the same on 9:16 and 16:9
    expect(run({}, 1.5).bg()).toContain('circle 1152.0px');
    expect(run({}, 1.5, 1920, 1080).bg()).toContain('circle 1152.0px');
  });
});
