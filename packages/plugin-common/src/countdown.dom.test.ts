// @vitest-environment jsdom
// common.countdown's looks: the slant look honours `ring` (its arc), like the ring look does.
import { countdown } from './countdown.ts';

const params = (look: 'ring' | 'slant', ring: boolean) => ({ look, ring, colors: '#ff5a1f,#ffffff', from: 3, to: 1, end: '', label: '', size: 42, y: 0.45,
  color: '#ffffff', accent: '#ff4d4f', ink: '#1a1a1a', font: 'Noto Sans TC' });
const draw = (look: 'ring' | 'slant', ring: boolean) => {
  const ctx: any = { root: document.createElement('div'), W: 1080, H: 1920, local: 0.5, dur: 3, theme: { stroke: 6 }, params: params(look, ring) };
  const s = countdown.build(ctx);
  countdown.draw(ctx, s);
  return (s.svg as unknown as HTMLElement).style.display;
};

test('ring off hides the ring in the ring look and the arc in the slant look', () => {
  expect([draw('ring', true), draw('ring', false), draw('slant', true), draw('slant', false)]).toEqual(['block', 'none', 'block', 'none']);
});

test('ring: a long end word shrinks to stay inside the ring; GO! and the numbers keep their size', () => {
  const at = (end: string) => {
    const ctx: any = { root: document.createElement('div'), W: 1080, H: 1920, local: 2.9, dur: 3, theme: { stroke: 6 }, params: { ...params('ring', true), end } };
    const s = countdown.build(ctx);
    countdown.draw(ctx, s);
    return parseFloat(s.num.style.fontSize);
  };
  const d = 0.42 * 1080;
  expect(at('GO!')).toBe(d * 0.32);
  expect(at('')).toBe(d * 0.52);
  expect(at('START NOW') * 9 * 0.55).toBeLessThanOrEqual(0.8 * d + 1e-6);
  expect(at('開始') * 2).toBeLessThanOrEqual(0.8 * d + 1e-6);
});
