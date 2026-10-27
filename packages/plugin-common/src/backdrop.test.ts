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
