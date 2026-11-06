// common.grid's layouts and cell motion.
import { gridBoxes, gridMotion } from './grid.ts';

describe('gridBoxes', () => {
  test('four at 1080×1920: margin 24, gap 12', () => {
    expect(gridBoxes({ layout: 'four', boxes: '', gap: 12, margin: 24 }, 1080, 1920)[3]).toEqual([546, 966, 510, 930]);
  });
  test('two on a wide frame is left and right', () => {
    expect(gridBoxes({ layout: 'two', boxes: '', gap: 12, margin: 24 }, 1920, 1080)).toEqual([[24, 24, 930, 1032], [966, 24, 930, 1032]]);
  });
  test('bento: a big cell, two small, a strip', () => {
    const b = gridBoxes({ layout: 'bento', boxes: '', gap: 12, margin: 24 }, 1080, 1920);
    expect(b.length).toBe(4);
    expect(b[0]).toEqual([24, 24, 1032, 930]);
    expect(b[3][2]).toBe(1032);
  });
  test('three and six have their cell counts', () => {
    expect(gridBoxes({ layout: 'three', boxes: '', gap: 12, margin: 24 }, 1080, 1920).length).toBe(3);
    expect(gridBoxes({ layout: 'six', boxes: '', gap: 12, margin: 24 }, 1080, 1920).length).toBe(6);
  });
  test('own boxes win and get no gap', () => {
    expect(gridBoxes({ layout: 'four', boxes: '0,0,0.5,0.25\nbad', gap: 12, margin: 24 }, 1080, 1920)).toEqual([[0, 0, 540, 480]]);
  });
  test('sizes go by the short side', () => {
    expect(gridBoxes({ layout: 'two', boxes: '', gap: 12, margin: 24 }, 540, 960)[0]).toEqual([12, 12, 516, 465]);
  });
});

describe('gridMotion', () => {
  test('slide starts off the frame, wipe opens from its side', () => {
    expect(gridMotion('slide', 'left', 0, [24, 24, 510, 930], 1080, 1920)).toMatchObject({ dx: -534, dy: 0, scale: 1, opacity: 1 });
    expect(gridMotion('wipe', 'left', 0.25, [24, 24, 510, 930], 1080, 1920).clip).toBe('inset(0 75% 0 0)');
    expect(gridMotion('wipe', 'top', 0.5, [24, 24, 510, 930], 1080, 1920).clip).toBe('inset(0 0 50% 0)');
  });
  test('fade and scale, settled is neutral', () => {
    expect(gridMotion('fade', 'left', 0.3, [0, 0, 10, 10], 100, 100)).toMatchObject({ opacity: 0.3, scale: 1, dx: 0, clip: 'none' });
    expect(gridMotion('scale', 'left', 0.3, [0, 0, 10, 10], 100, 100)).toMatchObject({ opacity: 1, scale: 0.3 });
    expect(gridMotion('slide', 'right', 1, [0, 0, 10, 10], 100, 100)).toEqual({ dx: 0, dy: 0, scale: 1, opacity: 1, clip: 'none' });
  });
});
