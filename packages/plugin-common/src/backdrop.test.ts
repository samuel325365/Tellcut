import { DRIFT_IDLE, halftoneRadius, patternCss, sunburstTurn, WAVE_BANDS, waveEdge } from './backdrop.ts';
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

test('sunburst: 1080 / scale rays a turn from the frame centre, turned by the time; drift 0 still turns', () => {
  const c = patternCss({ ...base, pattern: 'sunburst' as const }, 70, 1, 12.5).image;
  expect(c).toContain('repeating-conic-gradient(from 12.500deg at 50% 50%');
  // 15 rays at scale 70: a ray and a gap every 24 degrees
  expect(c).toContain('transparent 12.500deg 23.500deg');
  expect(patternCss({ ...base, pattern: 'sunburst' as const }, 140, 2).image).toBe(patternCss({ ...base, pattern: 'sunburst' as const }, 70, 1).image.replace('circle 110.0px', 'circle 220.0px'));
  expect(sunburstTurn(0, 2)).toBe((DRIFT_IDLE / 10) * 2);
  expect(sunburstTurn(-30, 2)).toBe(-6);
});

test('halftone: the dots shrink from 0.4 of the cell at the bottom left to nothing at the top right', () => {
  expect(halftoneRadius(0, 1920, 1080, 1920, 50)).toBeCloseTo(20, 9);
  expect(halftoneRadius(1080, 0, 1080, 1920, 50)).toBe(0);
  expect(halftoneRadius(540, 960, 1080, 1920, 50)).toBeCloseTo(10, 9);
  expect(halftoneRadius(300, 960, 1080, 1920, 50)).toBeGreaterThan(halftoneRadius(700, 960, 1080, 1920, 50));
  expect(patternCss({ ...base, pattern: 'halftone' as const }, 70).image).toBe('none');
});

test('waves: each band\'s edge is a function of the time alone, the bands stacked from the top down and sliding at their own speeds', () => {
  expect(waveEdge(1, 300, 1920, 70, 0, 1, 1.5)).toBe(waveEdge(1, 300, 1920, 70, 0, 1, 1.5));
  for (let i = 0; i < WAVE_BANDS - 1; i++) expect(waveEdge(i + 1, 0, 1920, 70, 0, 1, 0)).toBeGreaterThan(waveEdge(i, 0, 1920, 70, 0, 1, 0));
  // drift 0 slides at DRIFT_IDLE: the same as drift 40
  expect(waveEdge(2, 300, 1920, 70, 0, 1, 1)).toBe(waveEdge(2, 300, 1920, 70, DRIFT_IDLE, 1, 1));
  expect(waveEdge(2, 300, 1920, 70, 0, 1, 1)).not.toBe(waveEdge(2, 300, 1920, 70, 0, 1, 0));
});
