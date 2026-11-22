// common.progress runner (spec 2026-11-22, progress characters): the hop, which way the runner faces, what counts as a picture.
import { FACES_RIGHT, glyphOf, hopAt, isPicture, mirrored } from './runner.ts';

test('hopAt: on the ground at each step, highest halfway, squashed as it lands', () => {
  expect(hopAt(0, 60).lift).toBe(0);
  expect(hopAt(30, 60).lift).toBeCloseTo(1, 5);
  expect(hopAt(60, 60).lift).toBeCloseTo(0, 5);
  expect(hopAt(60, 60).squash).toBeCloseTo(1, 5);
  expect(hopAt(30, 60).squash).toBeCloseTo(0, 5);
  for (let d = 0; d <= 200; d += 7) {
    const { lift, squash } = hopAt(d, 60);
    expect(lift).toBeGreaterThanOrEqual(0); expect(lift).toBeLessThanOrEqual(1);
    expect(squash).toBeGreaterThanOrEqual(0); expect(squash).toBeLessThanOrEqual(1);
  }
  // a stride of 0 (or none) never hops, and never gives NaN
  expect(hopAt(30, 0)).toEqual({ lift: 0, squash: 0 });
});

test('mirrored: emoji mirror unless they face right already, pictures never; flip reverses either', () => {
  expect(mirrored('🐕', false)).toBe(true);
  expect(mirrored('🚀', false)).toBe(false);
  expect(mirrored('✈️', false)).toBe(false);
  expect(mirrored('✈', false)).toBe(false);
  expect(mirrored('🐕', true)).toBe(false);
  expect(mirrored('🚀', true)).toBe(true);
  expect(mirrored('media/dog.png', false)).toBe(false);
  expect(mirrored('media/dog.png', true)).toBe(true);
  // the right-facing ZWJ sequences, with a skin tone too
  expect(mirrored('🏃‍➡️', false)).toBe(false);
  expect(mirrored('🏃🏽‍➡️', false)).toBe(false);
  expect(mirrored('🏃🏽', false)).toBe(true);
  expect(FACES_RIGHT.has('🚀')).toBe(true);
});

test('glyphOf: the first grapheme, whole; the fallback when empty', () => {
  expect(glyphOf('👨‍👩‍👧abc', '🐕')).toBe('👨‍👩‍👧');
  expect(glyphOf('', '🐕')).toBe('🐕');
  expect(glyphOf('  ', '🐕')).toBe('🐕');
  expect(glyphOf('🇯🇵🇫🇷', '🐕')).toBe('🇯🇵');
  expect(glyphOf('cat', '🐕')).toBe('c');
});

test('isPicture: a path or a file name, not an emoji', () => {
  expect(isPicture('media/a.png')).toBe(true);
  expect(isPicture('a.webp')).toBe(true);
  expect(isPicture('media\\b.JPG')).toBe(true);
  expect(isPicture('🐕')).toBe(false);
  expect(isPicture('')).toBe(false);
  expect(isPicture('none')).toBe(false);
});
