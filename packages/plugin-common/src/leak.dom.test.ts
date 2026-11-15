// @vitest-environment jsdom
// common.leak (2026-11-03, from the Egypt photo films' fx.leak / fx.lightleak / fx.glow). jsdom has no layout: the tests read what
// cssCamel last wrote (`_c`).
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { bokehDiscs, GHOSTS, leak, leakCentre, leakDirection, leakLevel, prismBand } from './leak.ts';

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

  test('the looks: glow is the default and the old drawing; prism, bokeh and flare are other pictures, the same at the same moment', () => {
    expect(withDefaults(leak.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 })).look).toBe('glow');
    expect(run({ look: 'glow' }, 1.5).bg()).toBe(run({}, 1.5).bg());
    const count = (bg: string, kind: string) => bg.split(kind).length - 1;
    const prism = run({ look: 'prism' }, 1.5).bg(), bokeh = run({ look: 'bokeh' }, 1.5).bg(), flare = run({ look: 'flare' }, 1.5).bg();
    expect([count(prism, 'linear-gradient'), count(prism, 'radial-gradient')]).toEqual([2, 1]);
    expect(count(bokeh, 'radial-gradient')).toBe(14);
    expect(count(flare, 'ellipse')).toBe(2);
    expect(count(flare, 'radial-gradient')).toBe(4 + GHOSTS.length);
    expect(flare).toContain('rgba(156, 196, 255');   // the streak's blue-white
    for (const look of ['prism', 'bokeh', 'flare']) {
      expect(run({ look }, 0.9).bg()).toBe(run({ look }, 0.9).bg());
      expect(run({ look }, 0).bg()).toBe('none');
      expect(run({ look }, 0.9).bg()).not.toBe(run({ look }, 1.6).bg());
    }
  });

  test('prism: the band runs across the drift, its rainbow centred on the point given', () => {
    const u = leakDirection({ from: 'l', travel: 0.6 }, 1080, 1920);
    expect(Math.hypot(u[0], u[1])).toBeCloseTo(1, 9);
    expect(u[0]).toBeGreaterThan(0.9);
    expect(leakDirection({ from: 'tr', travel: 0 }, 1080, 1920)[0]).toBeLessThan(0);
    // a band through the frame's centre on a gradient line straight across (90deg): its middle stop at half the width
    const band = prismBand(1000, 500, [1, 0], 500, 250, 100, 0.5);
    expect(band.startsWith('linear-gradient(90.00deg')).toBe(true);
    expect(band).toContain('rgba(255,60,60,0) 400.0px');
    expect(band).toContain('rgba(190,80,255,0) 600.0px');
  });

  test('bokeh: fourteen discs placed by the seed, drifting and breathing slowly, sized by the long side', () => {
    const p = { seed: 3, size: 0.6, from: 'tr' as const, travel: 0.6 };
    const a = bokehDiscs(p, 1, 0.3, 1080, 1920);
    expect(a).toHaveLength(14);
    expect(bokehDiscs(p, 1, 0.3, 1080, 1920)).toEqual(a);
    expect(bokehDiscs({ ...p, seed: 4 }, 1, 0.3, 1080, 1920)[0].x).not.toBe(a[0].x);
    const later = bokehDiscs(p, 1.1, 0.3, 1080, 1920);
    for (let i = 0; i < 14; i++) {
      expect(Math.abs(later[i].x - a[i].x)).toBeLessThan(0.01);
      expect(a[i].level).toBeGreaterThanOrEqual(0.1); expect(a[i].level).toBeLessThanOrEqual(1);
      expect(a[i].r).toBeGreaterThan(0.035 * 0.6 * 1920 - 0.01); expect(a[i].r).toBeLessThan(0.11 * 0.6 * 1920);
    }
    expect(bokehDiscs(p, 1, 0.3, 1920, 1080).map((d) => d.r)).toEqual(a.map((d) => d.r));
  });
});
