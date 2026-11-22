// common.progress's character modes (spec 2026-11-22, progress characters): how far along, when it arrived, the fade, the box.
import { resolveTheme } from '@tellcut/engine';
import { pawSince } from './paws.ts';
import { arrived, band, corner, fadeOut, isMoreMode, MORE_MODES, sinceAt, tail, travel, type MoreParams } from './shared.ts';

test('tail: a quarter of the item, at most a second', () => {
  expect(tail(4)).toBe(1);
  expect(tail(10)).toBe(1);
  expect(tail(2)).toBe(0.5);
  expect(tail(0)).toBe(0);
});

test('isMoreMode: the character modes, not the old ones', () => {
  expect(MORE_MODES).toEqual(['runner', 'stretch', 'paws', 'segments', 'fuse', 'battery', 'rocket', 'ring', 'vine', 'stamps']);
  for (const m of MORE_MODES) expect(isMoreMode(m)).toBe(true);
  for (const m of ['bar', 'dots', 'tabs', 'pencil', 'timeline', 'slots', 'osd', '']) expect(isMoreMode(m)).toBe(false);
});

test('travel, step -1: 0 to 1 over the item less its tail', () => {
  expect(travel(-1, 5, 0, 4)).toBe(0);
  expect(travel(-1, 5, 1.5, 4)).toBe(0.5);
  expect(travel(-1, 5, 3, 4)).toBe(1);
  expect(travel(-1, 5, 3.8, 4)).toBe(1);
});

test('travel, step >= 0: across that chapter, clamped to the run', () => {
  expect(travel(2, 5, 0, 4)).toBeCloseTo(0.4, 12);
  expect(travel(2, 5, 3, 4)).toBeCloseTo(0.6, 12);
  expect(travel(9, 5, 4, 4)).toBe(1);
  expect(travel(9, 5, 0, 4)).toBeGreaterThanOrEqual(0);
  expect(travel(9, 5, 0, 4)).toBeLessThanOrEqual(1);
  for (const dots of [2, 12]) for (const step of [-1, 0, 1, 11, 30]) for (const local of [-1, 0, 0.5, 2, 4, 9]) {
    const v = travel(step, dots, local, 4);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  }
});

test('travel: a short item or none at all gives a finite share', () => {
  const v = travel(-1, 5, 0.4, 0.8);
  expect(Number.isFinite(v)).toBe(true);
  expect(v).toBeGreaterThan(0);
  expect(v).toBeLessThan(1);
  expect(travel(-1, 5, 0, 0)).toBe(1);
  for (const dur of [0, 0.1, 0.3, 0.8, 1.19]) for (const local of [0, dur / 2, dur]) {
    expect(Number.isFinite(travel(-1, 5, local, dur))).toBe(true);
    expect(Number.isFinite(arrived(-1, 5, local, dur))).toBe(true);
    const f = fadeOut(local, dur);
    expect(Number.isFinite(f)).toBe(true);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  }
});

test('arrived: seconds since the end was reached, -1 before or when this chapter is not the last', () => {
  expect(arrived(-1, 5, 3.5, 4)).toBe(0.5);
  expect(arrived(-1, 5, 2, 4)).toBe(-1);
  expect(arrived(1, 5, 3.9, 4)).toBe(-1);
  expect(arrived(4, 5, 3.5, 4)).toBe(0.5);
  expect(arrived(9, 5, 3.5, 4)).toBe(0.5);
});

test('fadeOut: 1 until the last 0.3 s, then down to 0', () => {
  expect(fadeOut(0, 4)).toBe(1);
  expect(fadeOut(3.7, 4)).toBe(1);
  expect(fadeOut(3.85, 4)).toBeCloseTo(0.5, 9);
  expect(fadeOut(4, 4)).toBe(0);
});

const params = (over: Partial<MoreParams>): MoreParams => ({ mode: 'runner', position: 'top', y: -1, color: '#f00', track: '#fff', thickness: 12, dots: 5, step: -1,
  iconSize: 1, size: 2.4, align: 'center', done: '#ff0', ink: '#111', paper: '#fff', at: '', runner: '', goal: '', look: 'dog', flip: false, ...over });

test('band: inside the side safe margins; centred on y, or against the top or bottom safe edge', () => {
  const W = 1080, H = 1920, theme = resolveTheme(undefined, { width: W, height: H }), ctx = { W, H, theme };
  const b = band(ctx, params({ y: 0.5 }), 100);
  expect(b.x).toBeCloseTo(theme.safe.side * W, 9);
  expect(b.w).toBeCloseTo(W - 2 * theme.safe.side * W, 9);
  expect(b.top).toBeCloseTo(H / 2 - 50, 9);
  expect(band(ctx, params({ y: -1, position: 'top' }), 100).top).toBeCloseTo(theme.safe.top * H, 9);
  expect(band(ctx, params({ y: -1, position: 'bottom' }), 100).top).toBeCloseTo(H * (1 - theme.safe.bottom) - 100, 9);
});

test('sinceAt: seconds since travel reached v, negative before it, Infinity when it was there before the item began', () => {
  // step −1 over 4 s (tail 1): span 3, v 0.5 reached at 1.5 s
  expect(sinceAt(-1, 5, 0.5, 2, 4)).toBeCloseTo(0.5, 12);
  expect(sinceAt(-1, 5, 0.5, 1, 4)).toBeCloseTo(-0.5, 12);
  // chapter 2 of 5 starts at 0.4: 0.3 was passed before the item began
  expect(sinceAt(2, 5, 0.3, 1, 4)).toBe(Infinity);
  // no time to go along in
  expect(sinceAt(-1, 5, 0.5, 0, 0)).toBe(Infinity);
});

test('sinceAt: what pawSince gave for each print', () => {
  for (let i = 0; i < 12; i++) for (const local of [0, 0.4, 1.3, 2.2, 3, 3.7]) {
    expect(pawSince(-1, 12, i, local, 4)).toBe(sinceAt(-1, 12, (i + 0.5) / 12, local, 4));
    expect(pawSince(3, 12, i, local, 4)).toBe(sinceAt(3, 12, (i + 0.5) / 12, local, 4));
  }
});

test('corner: against the left or right safe edge; top by band', () => {
  const W = 1080, H = 1920, theme = resolveTheme(undefined, { width: W, height: H }), ctx = { W, H, theme }, side = theme.safe.side * W;
  expect(corner(ctx, params({ align: 'left' }), 200, 80).left).toBeCloseTo(side, 9);
  expect(corner(ctx, params({ align: 'right' }), 200, 80).left).toBeCloseTo(W - side - 200, 9);
  expect(corner(ctx, params({ align: 'center' }), 200, 80).left).toBeCloseTo(W - side - 200, 9);
  expect(corner(ctx, params({ position: 'bottom', y: -1 }), 200, 80).top).toBeCloseTo(H * (1 - theme.safe.bottom) - 80, 9);
  expect(corner(ctx, params({ position: 'top', y: -1 }), 200, 80).top).toBeCloseTo(theme.safe.top * H, 9);
  expect(corner(ctx, params({ y: 0.5 }), 200, 80).top).toBeCloseTo(H / 2 - 40, 9);
});
