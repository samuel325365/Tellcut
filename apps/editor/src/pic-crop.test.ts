import { cropStyles, cropView, frameRatio, picCrop } from './pic-crop.ts';

const TALL = 9 / 16;
/** the shown part lies inside the frame */
const inside = ([x, y, w, h]: number[]) => {
  expect(Math.min(x, y, w, h)).toBeGreaterThanOrEqual(-1e-9);
  expect(x + w).toBeLessThanOrEqual(1 + 1e-9);
  expect(y + h).toBeLessThanOrEqual(1 + 1e-9);
};

test('a square crop of a 9:16 frame in the strip\'s tall 19 × 34 box: the box fills, showing a tall part of the frame around it', () => {
  // a pen mark in the middle: a square of 135 × 135 px of a 270 × 480 frame
  const box: [number, number, number, number] = [0.25, 0.3594, 0.5, 0.2813];
  const v = cropView({ box, ratio: TALL }, 19, 34);
  // the crop keeps the size it had letterboxed: 19 px wide
  expect(v.width * box[2]).toBeCloseTo(19, 5);
  // the picture covers the whole box: no band
  expect(v.left).toBeLessThanOrEqual(0);
  expect(v.top).toBeLessThanOrEqual(0);
  expect(v.left + v.width).toBeGreaterThanOrEqual(19 - 1e-9);
  expect(v.top + v.height).toBeGreaterThanOrEqual(34 - 1e-9);
  // what shows: the crop's width, taller than the crop, around it, inside the frame
  const [x, y, w, h] = v.shown;
  expect(w).toBeCloseTo(box[2], 5);
  expect(h).toBeGreaterThan(box[3] * 1.5);
  expect(y).toBeLessThanOrEqual(box[1]);
  expect(y + h).toBeGreaterThanOrEqual(box[1] + box[3]);
  expect(x).toBeCloseTo(box[0], 5);
  inside(v.shown);
});

test('a crop at the frame\'s edge is moved to stay inside the frame, not centred past it', () => {
  const v = cropView({ box: [0.75, 0, 0.25, 0.1406], ratio: TALL }, 19, 34);   // a mark in the top right corner
  expect(v.top).toBe(0);                                  // the frame's top at the box's top
  expect(v.shown[1]).toBe(0);
  inside(v.shown);
  expect(v.left + v.width).toBeCloseTo(19, 9);             // the frame's right edge at the box's
  expect(v.shown[0] + v.shown[2]).toBeCloseTo(1, 9);
});

test('a full-width crop shows the whole frame\'s height in the tall box', () => {
  const v = cropView({ box: [0, 0, 0.987, 0.5552], ratio: TALL }, 19, 34);
  expect(v.shown[2]).toBeCloseTo(0.987, 3);
  expect(v.shown[3]).toBeGreaterThan(0.95);
  inside(v.shown);
  // the whole frame is only a little shorter than the box: a sliver of band, centred
  const whole = cropView({ box: [0, 0, 1, 0.5625], ratio: TALL }, 19, 34);
  expect(whole.shown).toEqual([0, 0, 1, 1]);
  expect(whole.top).toBeCloseTo((34 - 19 / TALL) / 2, 5);
});

test('in a square box (the picker\'s tile and row) a square crop is shown exactly', () => {
  const box: [number, number, number, number] = [0.25, 0.3594, 0.5, 0.28125];
  const v = cropView({ box, ratio: TALL }, 52, 52);
  v.shown.forEach((n, i) => expect(n).toBeCloseTo(box[i], 4));
  expect(v.width * box[2]).toBeCloseTo(52, 5);
});

test('a crop goes to the CSS as custom properties, with its frame\'s shape', () => {
  expect(picCrop({})).toBeUndefined();
  expect(picCrop({ crop: [0.1, 0.2, 0.3, 0.4], aspect: 'wide' })).toEqual({ box: [0.1, 0.2, 0.3, 0.4], ratio: 16 / 9 });
  expect(frameRatio('square')).toBe(1);
  expect(cropStyles({ box: [0, 0.4375, 1, 0.5625], ratio: TALL })).toBe('--x:0;--y:0.4375;--w:1;--h:0.5625;--r:0.5625');
});
