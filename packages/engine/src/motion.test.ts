import { describe, expect, it } from 'vitest';
import { motion } from './motion.ts';

const { spring, bezier, ease, steps, stagger, interpolate, mix } = motion;
const frames = (n: number, fps = 60) => Array.from({ length: n }, (_, i) => i / fps);

describe('motion curves', () => {
  it('a spring depends on t alone: shuffled and repeated reads match', () => {
    const s = spring({ duration: 0.6, bounce: 0.4 });
    const ts = frames(90);
    const seq = ts.map(s);
    const rev = [...ts].reverse().map(s).reverse();
    expect(rev).toEqual(seq);
    expect(ts.map(spring({ duration: 0.6, bounce: 0.4 }))).toEqual(seq);
  });

  it('times are seconds: near 1 at its duration, overshoots with bounce, rests at settle', () => {
    const s = spring({ duration: 0.5, bounce: 0.35 });
    expect(s(0)).toBe(0);
    expect(s(-1)).toBe(0);
    expect(s(0.5)).toBeGreaterThan(0.95);
    expect(Math.max(...frames(120).map(s))).toBeGreaterThan(1.02);
    expect(s.settle).toBeGreaterThan(0.5);
    expect(s.settle).toBeLessThan(3);
    expect(s(s.settle)).toBe(1);
    expect(s(10)).toBe(1);
  });

  it('bounce 0 never passes 1; the physical form works too', () => {
    const flat = spring({ duration: 0.4, bounce: 0 });
    expect(Math.max(...frames(120).map(flat))).toBeLessThanOrEqual(1);
    const p = spring({ stiffness: 300, damping: 15 });
    expect(p(0.15)).toBeGreaterThan(0.5);
    expect(p(5)).toBe(1);
  });

  it('the same options give the cached curve', () => {
    expect(spring({ duration: 0.3 })).toBe(spring({ duration: 0.3, bounce: 0.25 }));
    expect(spring({ duration: 0.3 })).not.toBe(spring({ duration: 0.31 }));
  });

  it('easings, steps, stagger, interpolate and mix', () => {
    expect(bezier(0.22, 1, 0.36, 1)(0.3)).toBeCloseTo(0.832, 2);
    expect(ease.out(0)).toBe(0);
    expect(ease.out(1)).toBe(1);
    expect(ease.backOut(0.6)).toBeGreaterThan(1);
    expect(steps(4)(0.3)).toBe(0.25);
    const st = stagger(0.1, { from: 'center' });
    expect([0, 1, 2, 3, 4].map((i) => st(i, 5))).toEqual([0.2, 0.1, 0, 0.1, 0.2]);
    expect(stagger(0.1)(3, 5)).toBeCloseTo(0.3);
    const f = interpolate([0, 0.5, 1], [0, 200, 50]);
    expect([-1, 0.25, 0.75, 2].map(f)).toEqual([0, 100, 125, 50]);
    expect(interpolate([0, 1], [0, 10], { clamp: false })(2)).toBe(20);
    expect(interpolate([0, 1], ['#ff0000', '#0000ff'])(0.5)).toMatch(/^rgba\(\d+, 0, \d+, 1\)$/);
    expect(mix(10, 20, 0.25)).toBe(12.5);
    expect(mix('#000000', '#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('edge values stay numbers with a finite rest: a 0 duration is already there, 0 stiffness or mass is not NaN, steps(0) is one step', () => {
    const now = spring({ duration: 0 });
    expect([now(-1), now(0), now(0.001), now(5), now.settle]).toEqual([0, 0, 1, 1, 0]);
    expect(spring({ duration: -2 })(0.01)).toBe(1);
    for (const o of [{ stiffness: 0 }, { mass: 0 }, { damping: 0 }, { stiffness: -5, damping: -1 }, { duration: NaN }, { duration: 17 }, { duration: 30 }]) {
      const s = spring(o);
      expect(Number.isFinite(s.settle), JSON.stringify(o)).toBe(true);
      for (const t of [0.01, 0.5, 3, 30, 100]) expect(Number.isFinite(s(t)), JSON.stringify(o)).toBe(true);
      expect(s(s.settle)).toBe(1);
    }
    // a slow spring rests where it really does, past Motion's 20 s search, near 1
    const slow = spring({ duration: 17 });
    expect(slow.settle).toBeGreaterThan(20);
    expect(Math.abs(slow(slow.settle - 0.05) - 1)).toBeLessThan(0.01);
    expect([0, 0.5, 1].map(steps(0))).toEqual([0, 1, 1].map(steps(1)));
    expect(steps(NaN)(0.5)).toBe(steps(1)(0.5));
    expect(steps(2.4)(0.6)).toBe(0.5);
  });
});
