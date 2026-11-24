// @vitest-environment jsdom
import { passShare, tone, TONE_PASSES } from './tone.ts';

/** the backgrounds tone draws (as cssCamel wrote them) at `amount`, one per pass, with the further layers the stage gives a blend list */
function drawn(params: Record<string, unknown>): string[] {
  const root = document.createElement('div'), layers = Array.from({ length: TONE_PASSES - 1 }, () => document.createElement('div'));
  const ctx = { root, layers, params: { color: '#ffbe78', edge: '#28140a', amount: 0.55, ...params } } as any;
  const s = tone.build(ctx);
  tone.draw(ctx, s);
  return s.els.map((el) => (el as any)._c.background);
}

test('one soft-light layer per pass, as the stage lays them', () => {
  expect(tone.blend).toEqual(Array(TONE_PASSES).fill('soft-light'));
  expect((tone.params.find((p) => p.key === 'amount') as { max?: number }).max).toBe(TONE_PASSES);
});

test('up to amount 1 the first pass draws what tone always drew and the others nothing; above 1 the next pass takes the rest', () => {
  // the gradient of the old one-layer tone at the default amount 0.55
  const a = 0.55, old = `radial-gradient(ellipse at 50% 45%, rgba(255, 190, 120, ${0.55 * a}) 0%, rgba(255, 190, 120, ${0.3 * a}) 45%, rgba(40, 20, 10, ${0.9 * a}) 100%)`;
  expect(drawn({})).toEqual([old, 'none', 'none']);
  const full = 'radial-gradient(ellipse at 50% 45%, rgba(255, 190, 120, 0.55) 0%, rgba(255, 190, 120, 0.3) 45%, rgba(40, 20, 10, 0.9) 100%)';
  expect(drawn({ amount: 1.5 })).toEqual([full, 'radial-gradient(ellipse at 50% 45%, rgba(255, 190, 120, 0.275) 0%, rgba(255, 190, 120, 0.15) 45%, rgba(40, 20, 10, 0.45) 100%)', 'none']);
  expect(drawn({ amount: 3 })).toEqual([full, full, full]);
  // amount 0 still draws the first pass's (clear) gradient, as before
  expect(drawn({ amount: 0 })[0]).toContain('rgba(255, 190, 120, 0)');
});

test('passShare: each pass takes its own unit of the amount; out of range and not a number clamp', () => {
  expect([0, 1, 2].map((k) => passShare(2.25, k))).toEqual([1, 1, 0.25]);
  expect([0, 1, 2].map((k) => passShare(5, k))).toEqual([1, 1, 1]);
  expect([0, 1, 2].map((k) => passShare(-1, k))).toEqual([0, 0, 0]);
  expect(passShare(Number.NaN, 0)).toBe(0);
});
