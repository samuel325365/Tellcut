import { patternCss } from './backdrop.ts';
import { withAlpha } from './color.ts';

const base = { pattern: 'gingham' as const, color: '#fff8ec', color2: '#ff4d4f', tint: 0.2, scale: 70, drift: 0 };

test('withAlpha reads short and long hex and leaves other colours alone', () => {
  expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  expect(withAlpha('#0f0', 0.25)).toBe('rgba(0, 255, 0, 0.25)');
  expect(withAlpha('red', 0.5)).toBe('red');
});

test('every pattern makes its own CSS, solid makes none', () => {
  const css = (pattern: any) => patternCss({ ...base, pattern }, 70);
  expect(css('gingham').image.match(/repeating-linear-gradient/g)).toHaveLength(2);
  expect(css('stripes').image).toContain('45deg');
  expect(css('dots')).toMatchObject({ size: '70px 70px' });
  expect(css('grid').image.match(/linear-gradient/g)).toHaveLength(2);
  expect(css('gradient').image).toContain('#fff8ec');
  expect(css('solid').image).toBe('none');
});

test('the grid and diamond lines scale with the frame like the cells (2 px at 1080, 4 px at 2160)', () => {
  const at = (pattern: any, k: number) => patternCss({ ...base, pattern }, 70 * k, k).image;
  expect(at('grid', 1)).toBe(patternCss({ ...base, pattern: 'grid' }, 70).image);
  expect(at('diamond', 1)).toBe(patternCss({ ...base, pattern: 'diamond' }, 70).image);
  expect(at('grid', 1)).toContain(' 0 2px, transparent 2px)');
  expect(at('grid', 2)).toContain(' 0 4px, transparent 4px)');
  expect(at('diamond', 2)).toContain(' 0 4px, transparent 4px 140px)');
});
