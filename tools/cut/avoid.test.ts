import { avoidCaptionCrop, visibleRows } from './avoid.ts';

const base = { srcW: 1920, srcH: 1080, frameW: 1080, frameH: 1920, captionTop: 0.86 };
const want = { x: 0.5, y: 0.5, zoom: 1 };

test('a landscape source in a portrait frame shows every row at zoom 1', () => {
  const [t, b] = visibleRows(1920, 1080, 1080, 1920, want);
  expect(t).toBeCloseTo(0, 3);
  expect(b).toBeCloseTo(1, 3);
});

test('the crop that clears the caption zooms in and looks at the top of the picture', () => {
  const c = avoidCaptionCrop({ ...base, want })!;
  expect(c.zoom).toBeGreaterThan(1.1);
  expect(c.zoom).toBeLessThan(1.4);
  const [t, b] = visibleRows(base.srcW, base.srcH, base.frameW, base.frameH, c);
  expect(b).toBeLessThanOrEqual(0.86 - 0.012 + 1e-6);
  expect(t).toBeGreaterThanOrEqual(-0.002);
  expect(c.x).toBe(0.5);
});

test('nothing changes when the source already clears the caption, and it gives up when no zoom manages', () => {
  expect(avoidCaptionCrop({ ...base, captionTop: 1.2, want })).toBeNull();                       // no caption in the picture at all
  expect(avoidCaptionCrop({ ...base, captionTop: 0.3, want })).toBeNull();                       // would need a crop far past the limit
  const already = avoidCaptionCrop({ ...base, want: { x: 0.5, y: 0, zoom: 1.5 } });
  expect(already).toBeNull();                                                                    // zoom 1.5 at the top already ends above 0.86
});

test('a tall source in a squarer frame shows only part of its height, so the focus alone can clear the caption', () => {
  const tall = { srcW: 1080, srcH: 1920, frameW: 1000, frameH: 1000, captionTop: 0.86 };
  expect(avoidCaptionCrop({ ...tall, want })).toBeNull();                                        // looking at the middle: rows 0.22–0.78
  const c = avoidCaptionCrop({ ...tall, want: { x: 0.5, y: 0.95, zoom: 1 } })!;                  // looking at the bottom: moved up, no zoom needed
  expect(c.zoom).toBe(1);
  expect(c.y).toBeLessThan(0.95);
  expect(visibleRows(tall.srcW, tall.srcH, tall.frameW, tall.frameH, c)[1]).toBeLessThanOrEqual(0.86);
});
