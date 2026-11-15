// @vitest-environment jsdom
// common.speedlines: radial (the first look, the default), focus (concentration lines from the edges) and streak (parallel streaks).
// jsdom has no 2D canvas: a recording stand-in logs every call and property set, so a picture is its log.
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { focusEllipse, focusWedges, speedlines, streakLines } from './speedlines.ts';

let log: string[] = [];
const fake = () => {
  const g: any = { createLinearGradient: (...a: number[]) => ({ addColorStop: (o: number, c: string) => log.push(`stop ${a.map((v) => v.toFixed(2))} ${o} ${c}`) }) };
  return new Proxy(g, {
    get: (t, k) => (k in t ? t[k] : (...a: unknown[]) => { log.push(`${String(k)}(${a.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join(',')})`); }),
    set: (t, k, v) => { log.push(`${String(k)}=${typeof v === 'object' ? 'grad' : v}`); t[k] = v; return true; },
  });
};
const real = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = fake; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = real; });

function draw(params: Record<string, unknown>, local: number, W = 1080, H = 1920) {
  const theme = resolveTheme(undefined, { width: W, height: H });
  const ctx: any = { t: local, local, dur: 3, W, H, fps: 30, theme, motion, root: document.createElement('div'), params: withDefaults(speedlines.params, params, theme) };
  log = [];
  speedlines.draw(ctx, speedlines.build(ctx));
  return log.join('\n');
}

describe('common.speedlines', () => {
  test('radial is the default look and draws as before', () => {
    expect(withDefaults(speedlines.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 })).look).toBe('radial');
    expect(draw({ look: 'radial' }, 1.5)).toBe(draw({}, 1.5));
    // 48 wedges of three points each, as before
    expect(draw({}, 1.5).split('\n').filter((l) => l.startsWith('lineTo(')).length).toBe(96);
  });

  test('every look draws the same picture at the same moment, and another a few frames on', () => {
    for (const look of ['radial', 'focus', 'streak']) {
      expect(draw({ look }, 1.2)).toBe(draw({ look }, 1.2));
      expect(draw({ look }, 1.2)).not.toBe(draw({ look }, 1.3));
    }
    expect(draw({ look: 'focus' }, 1.2)).not.toBe(draw({ look: 'radial' }, 1.2));
    expect(draw({ look: 'streak' }, 1.2)).not.toBe(draw({ look: 'focus' }, 1.2));
  });

  test('focus: the wedges come in from outside the frame and stop at or past the clear ellipse', () => {
    const W = 1080, H = 1920, cx = 540, cy = 768, [rx, ry] = focusEllipse(0.3, W, H);
    expect(rx).toBeCloseTo(324, 6); expect(ry).toBeCloseTo(324 * Math.sqrt(1920 / 1080), 6);
    expect(focusEllipse(0.3, H, W)).toEqual([ry, rx]);
    const w = focusWedges({ count: 48, inner: 0.3, seed: 9 }, W, H, cx, cy, 0, 1);
    expect(w).toHaveLength(48);
    for (const x of w) {
      const ex = Math.cos(x.a) * x.tip, ey = Math.sin(x.a) * x.tip;
      expect((ex / rx) ** 2 + (ey / ry) ** 2).toBeGreaterThanOrEqual(1 - 1e-9);
      // the base is off the frame: past every corner from the focus
      expect(x.out).toBeGreaterThan(Math.hypot(540, 1152));
    }
    // at grow 0 the tips are still at the edge; the second set of the shiver is another shuffle
    expect(focusWedges({ count: 48, inner: 0.3, seed: 9 }, W, H, cx, cy, 0, 0).every((x) => x.tip === x.out)).toBe(true);
    expect(focusWedges({ count: 48, inner: 0.3, seed: 9 }, W, H, cx, cy, 1, 1)[0].a).not.toBe(w[0].a);
  });

  test('streak: parallel lines along `angle`, moving forward over time, the same at the same moment', () => {
    const p = { count: 30, length: 0.7, angle: 30, seed: 9 };
    const a = streakLines(p, 1080, 1920, 1), b = streakLines(p, 1080, 1920, 1.05);
    expect(streakLines(p, 1080, 1920, 1)).toEqual(a);
    const dir = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
    for (let i = 0; i < a.length; i++) {
      const len = Math.hypot(a[i].x1 - a[i].x0, a[i].y1 - a[i].y0);
      expect((a[i].x1 - a[i].x0) / len).toBeCloseTo(dir[0], 9);
      expect((a[i].y1 - a[i].y0) / len).toBeCloseTo(dir[1], 9);
      // one twentieth of a second later the head is 1.6–4 short sides / s × 0.05 s further along, unless it came round again
      const moved = (b[i].x1 - a[i].x1) * dir[0] + (b[i].y1 - a[i].y1) * dir[1];
      if (moved > 0) { expect(moved).toBeGreaterThanOrEqual(0.08 * 1080 - 1e-6); expect(moved).toBeLessThanOrEqual(0.2 * 1080 + 1e-6); }
    }
    expect(a.filter((l, i) => (b[i].x1 - l.x1) * dir[0] + (b[i].y1 - l.y1) * dir[1] > 0).length).toBeGreaterThan(25);
  });
});
