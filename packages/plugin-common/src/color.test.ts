import { expect, test } from 'vitest';
import { isClear, lift, luma, mixHex, parseColor, shade, toRgb, withAlpha } from './color.ts';

test('parseColor reads hex (3, 4, 6, 8 digits), rgb()/rgba() and transparent; null for what it cannot read outside a page', () => {
  expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
  expect(parseColor('#112233')).toEqual([17, 34, 51, 1]);
  expect(parseColor('#11223300')).toEqual([17, 34, 51, 0]);
  expect(parseColor('#0008')![3]).toBeCloseTo(0.533, 3);
  expect(parseColor('rgb(15, 11, 8)')).toEqual([15, 11, 8, 1]);
  expect(parseColor('rgba(15,11,8,0.5)')).toEqual([15, 11, 8, 0.5]);
  expect(parseColor('rgb(15 11 8 / 50%)')).toEqual([15, 11, 8, 0.5]);
  expect(parseColor('transparent')).toEqual([0, 0, 0, 0]);
  expect(parseColor('navy', () => null)).toBeNull();
  expect(parseColor('navy', () => '#000080')).toEqual([0, 0, 128, 1]);
});

test('withAlpha keeps the old #rrggbb output, and now also reads #rgb, rgb() and names (they used to come back opaque)', () => {
  expect(withAlpha('#0f0b08', 0.55)).toBe('rgba(15, 11, 8, 0.55)');
  expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
  expect(withAlpha('rgb(15, 11, 8)', 0.55)).toBe('rgba(15, 11, 8, 0.55)');
  expect(withAlpha('rgba(0, 0, 0, 0.5)', 0.5)).toBe('rgba(0, 0, 0, 0.25)');
  expect(withAlpha('#11223300', 0.8)).toBe('rgba(17, 34, 51, 0)');
  expect(withAlpha('not a colour', 0.5)).toBe('not a colour');
});

test('luma reads every form: the chart / slam text colour no longer flips on #fff or #222', () => {
  expect(luma('#ffffff')).toBe(1);
  expect(luma('#fff')).toBe(1);
  expect(luma('#222')).toBeCloseTo(34 / 255, 6);
  expect(luma('rgb(0,0,0)')).toBe(0);
  expect(luma('??')).toBeNull();
});

test('mixHex, shade, lift and toRgb give the same results as the old hex-only copies', () => {
  expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  expect(mixHex('#000', '#fff', 1)).toBe('#ffffff');
  expect(mixHex('??', '#fff', 0.2)).toBe('??');
  expect(shade('#808080', 0.5)).toBe('rgb(64, 64, 64)');
  expect(shade('#808080', 1.5)).toBe('rgb(192, 192, 192)');
  expect(lift('#101010', 8, 11, 18)).toBe('rgb(24, 27, 34)');
  expect(lift('#fafafa', 8, 11, 18)).toBe('rgb(255, 255, 255)');
  expect(toRgb('#abc')).toEqual([170, 187, 204]);
  expect(toRgb('??', () => null)).toEqual([0, 0, 0]);
});

test('isClear: empty, transparent and alpha 0 have no colour', () => {
  for (const c of [undefined, '', 'transparent', '#12345600', 'rgba(1, 2, 3, 0)']) expect(isClear(c)).toBe(true);
  for (const c of ['#123456', '#000', 'rgba(1, 2, 3, 0.1)']) expect(isClear(c)).toBe(false);
});
