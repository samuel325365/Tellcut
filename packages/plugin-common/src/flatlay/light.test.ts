import { lightRig, type Warmth } from './light.ts';

const rb = (hex: number) => ((hex >> 16) & 255) / (hex & 255);

test('lightRig: the window is on the chosen side', () => {
  const left = lightRig({ surface: 'linen', side: 'left', warmth: 'afternoon' }, 0);
  const right = lightRig({ surface: 'linen', side: 'right', warmth: 'afternoon' }, 0);
  expect(left.spot.pos[0]).toBeLessThan(0);
  expect(right.spot.pos[0]).toBeGreaterThan(0);
  expect(left.spot.pos[1]).toBeGreaterThan(3);
  expect(right.spot.pos[1]).toBeGreaterThan(3);
});

test('lightRig: warmth runs from cool morning to golden', () => {
  const r = (warmth: Warmth) => rb(lightRig({ surface: 'marble', side: 'left', warmth }, 0).spot.color);
  expect(r('morning')).toBeLessThan(r('afternoon'));
  expect(r('afternoon')).toBeLessThan(r('golden'));
});

test('lightRig: velvet is a warm spot from above with no window shadow', () => {
  const v = lightRig({ surface: 'velvet', side: 'left', warmth: 'morning' }, 0);
  expect(v.spot.gobo).toBe(false);
  expect(Math.abs(v.spot.pos[0])).toBeLessThan(0.5);
  expect(Math.abs(v.spot.pos[2])).toBeLessThan(0.5);
  expect(v.spot.pos[1]).toBeGreaterThan(4);
  expect(v.spot.angle).toBeLessThanOrEqual(0.3);
  // no table to fall on: no window shadow either
  expect(lightRig({ surface: 'none', side: 'left', warmth: 'afternoon' }, 0).spot.gobo).toBe(false);
  expect(lightRig({ surface: 'linen', side: 'left', warmth: 'afternoon' }, 0).spot.gobo).toBe(true);
});

test('lightRig: the leaves sway slowly and repeat for the same t', () => {
  const o = { surface: 'concrete', side: 'right', warmth: 'golden' } as const;
  expect(lightRig(o, 3.7)).toEqual(lightRig(o, 3.7));
  let most = 0;
  for (let t = 0; t <= 10; t += 1 / 30) {
    const a = lightRig(o, t).spot.goboOffset, b = lightRig(o, t + 1 / 30).spot.goboOffset;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.002);
    most = Math.max(most, Math.hypot(...a));
  }
  expect(most).toBeGreaterThan(0.005);
});
