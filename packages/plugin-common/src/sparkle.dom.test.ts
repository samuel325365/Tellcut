// @vitest-environment jsdom
// common.sparkle: burst (the default) and twinkle as before, confetti (paper falling from the top) and glint (one cross flare).
// jsdom has no 2D canvas: a recording stand-in logs every call and property set, so a picture is its log.
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { CONFETTI_PER, confettiColors, confettiPieces, glintAt, sparkle } from './sparkle.ts';

let log: string[] = [];
const fake = () => {
  const grad = (...a: number[]) => ({ addColorStop: (o: number, c: string) => log.push(`stop ${a.map((v) => v.toFixed(2))} ${o} ${c}`) });
  const g: any = { createLinearGradient: grad, createRadialGradient: grad };
  return new Proxy(g, {
    get: (t, k) => (k in t ? t[k] : (...a: unknown[]) => { log.push(`${String(k)}(${a.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join(',')})`); }),
    set: (t, k, v) => { log.push(`${String(k)}=${typeof v === 'object' ? 'grad' : v}`); t[k] = v; return true; },
  });
};
const real = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = fake; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = real; });

function draw(params: Record<string, unknown>, local: number, dur = 3, W = 1080, H = 1920) {
  const theme = resolveTheme(undefined, { width: W, height: H });
  const ctx: any = { t: local, local, dur, W, H, fps: 30, theme, motion, root: document.createElement('div'), params: withDefaults(sparkle.params, params, theme) };
  log = [];
  sparkle.draw(ctx, sparkle.build(ctx));
  return log.join('\n');
}

describe('common.sparkle', () => {
  test('burst is the default mode; burst and twinkle draw their stars as before', () => {
    expect(withDefaults(sparkle.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 })).mode).toBe('burst');
    expect(draw({ mode: 'burst' }, 0.4)).toBe(draw({}, 0.4));
    // every star is eight points, all 18 of them in flight at 0.4 s and twinkling at 1.5 s
    expect(draw({}, 0.4).split('\n').filter((l) => l.startsWith('lineTo(')).length).toBe(18 * 8);
    expect(draw({ mode: 'twinkle' }, 1.5).split('\n').filter((l) => l.startsWith('lineTo(')).length).toBe(18 * 8);
  });

  test('every mode draws the same picture at the same moment, and another a little later', () => {
    for (const mode of ['burst', 'twinkle', 'confetti', 'glint']) {
      expect(draw({ mode }, 0.5)).toBe(draw({ mode }, 0.5));
      expect(draw({ mode }, 0.5)).not.toBe(draw({ mode }, 0.6));
    }
  });

  test('confetti: count × CONFETTI_PER pieces seeded one by one, falling, tumbling and swaying; the frame fills over the item', () => {
    const p = { count: 18, size: 3.5, seed: 7 }, all = (t: number) => confettiPieces(p, 1080, 1920, t, 3);
    expect(all(1)).toEqual(all(1));
    expect(all(0).length).toBeGreaterThan(0);
    expect(all(1.6).length).toBeGreaterThan(all(0).length);
    expect(all(1.6).length).toBeLessThanOrEqual(18 * CONFETTI_PER);
    for (const c of all(1.6)) {
      expect(c.y).toBeLessThanOrEqual(1920 + c.w); expect(Math.abs(c.squash)).toBeLessThanOrEqual(1);
      expect(c.h).toBeLessThan(c.w);
    }
    // the same piece a tenth of a second later: lower, turned, a different squash
    const a = all(1.6), b = confettiPieces(p, 1080, 1920, 1.7, 3), same = b.find((x) => x.pick === a[0].pick)!;
    expect(same.y).toBeGreaterThan(a[0].y);
    expect(same.squash).not.toBe(a[0].squash);
    expect(confettiPieces({ ...p, seed: 8 }, 1080, 1920, 1.6, 3)[0].pick).not.toBe(a[0].pick);
  });

  test('confetti takes color and the theme accents and highlight, each once', () => {
    expect(confettiColors('#ffe14d', { accent: '#ff4d4f', accent2: '#2ec4b6', hl: '#FFE14D', ink: '#000', paper: '#fff' })).toEqual(['#ffe14d', '#ff4d4f', '#2ec4b6']);
    const log = draw({ mode: 'confetti' }, 1.6);
    for (const c of ['#ff4d4f', '#2ec4b6', '#ffe14d']) expect(log).toContain(`fillStyle=${c}`);
  });

  test('glint: grows to its peak at 0.3 of its time, turns a little and is gone by the end of its first second', () => {
    expect(glintAt(0, 2).size).toBe(0);
    expect(glintAt(0.3, 2).size).toBeCloseTo(1, 9);
    expect(glintAt(0.15, 2).size).toBeLessThan(1);
    expect(glintAt(0.7, 2).size).toBeLessThan(1); expect(glintAt(0.7, 2).alpha).toBeLessThan(1);
    expect(glintAt(0.7, 2).rot).toBeGreaterThan(glintAt(0.2, 2).rot);
    expect(Math.abs(glintAt(0.99, 2).rot)).toBeLessThan(0.15);
    expect(glintAt(1, 2).alpha).toBe(0);
    // a short item: the glint fits in it
    expect(glintAt(0.15, 0.5).size).toBeCloseTo(1, 9);
    expect(draw({ mode: 'glint' }, 1.2, 2)).toBe('setTransform(1.00,0.00,0.00,1.00,0.00,0.00)\nclearRect(0.00,0.00,1080.00,1920.00)\nclearRect(0.00,0.00,1080.00,1920.00)');
  });
});
