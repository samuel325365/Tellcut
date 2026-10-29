import { expect, test } from 'vitest';
import { DOG_BAND, DOG_COLORS, DOG_PIVOTS, DOG_SHAPES, DOG_VIEWBOX, dogSvg } from './dachshund.ts';

test('the dog is drawn in filled shapes only, inside its 160×80 box', () => {
  expect(DOG_VIEWBOX).toEqual([160, 80]);
  expect(DOG_SHAPES.every((s) => /^M[\d.\s,MLHVCQAZmlhvcqaz-]+$/.test(s.d))).toBe(true);
  expect(dogSvg({ look: 'light', holes: 'cut' })).not.toMatch(/stroke=/);
});

test('the light look is the black and cream dog, the dark look its reverse', () => {
  expect(DOG_COLORS.light).toMatchObject({ body: '#161412', ear: '#3b342d', mark: '#d8b88a', eye: '#f4ebdd', nose: '#161412' });
  expect(DOG_COLORS.dark).toMatchObject({ body: '#f4ebdd', ear: '#e3d5bf', mark: '#bea279', eye: '#161412', nose: '#161412' });
});

test('cut holes are holes in the body path; painted holes are shapes of the hole colour', () => {
  const cut = dogSvg({ look: 'light', holes: 'cut' }), paint = dogSvg({ look: 'light', holes: 'paint', holeColor: '#f4ebdd' });
  expect(cut).toMatch(/fill-rule="evenodd"/);
  // the light dog's eye is cream: in the cut version it is the only cream shape, in the painted one the eye and the 10 holes
  expect((cut.match(/fill="#f4ebdd"/g) ?? []).length).toBe(1);
  expect((paint.match(/fill="#f4ebdd"/g) ?? []).length).toBe(11);
});

test('the 16 px icon keeps the silhouette and the muzzle, nothing marked detail', () => {
  const icon = dogSvg({ look: 'light', icon: true, holes: 'paint', tile: '#f4ebdd' });
  const details = DOG_SHAPES.filter((s) => s.detail).map((s) => s.d);
  expect(details.length).toBeGreaterThanOrEqual(13);   // 10 sprocket holes, 2 paws, the brow, the chest
  for (const d of details) expect(icon).not.toContain(d);
  expect(icon).toMatch(/<rect[^>]*rx=/);
  expect(icon).toContain(DOG_SHAPES.find((s) => s.role === 'mark' && s.part === 'head' && !s.detail)!.d);
});

test('every moving part has a pivot, and the film band sits between the two rows of holes', () => {
  expect(Object.keys(DOG_PIVOTS).sort()).toEqual(['backLeg', 'frontLeg', 'head', 'tail']);
  expect(DOG_BAND).toEqual({ x: 34, y: 34, w: 70, h: 12, count: 5, gap: 2 });
});
