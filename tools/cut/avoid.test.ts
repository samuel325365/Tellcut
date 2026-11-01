import { avoidBurnedMove, avoidCaptionCrop, burnedZoomCap, spreadMove, visibleRows } from './avoid.ts';
import { viewRect } from './view.ts';

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

test('the zoom is capped by how far the footage is already blown up on the frame, with a gentle push always allowed', () => {
  expect(burnedZoomCap(1920, 1080, 1920, 1080)).toBe(1.6);                                       // 1080p in a 1080p film
  expect(burnedZoomCap(1280, 720, 1920, 1080)).toBe(1.25);                                       // 720p: already 1.5× on the frame
  expect(burnedZoomCap(3840, 2160, 1920, 1080)).toBe(2.2);                                       // 4K has room to spare, up to the limit
  expect(burnedZoomCap(1920, 1080, 1080, 1920)).toBe(1.25);                                      // landscape in a portrait film
  // a caption high in the picture (top at 0.75) needs about 1.36×: refused within 1.25, found within 1.6
  const high = { srcW: 1920, srcH: 1080, frameW: 1920, frameH: 1080, captionTop: 0.75 };
  expect(avoidBurnedMove({ ...high, maxZoom: 1.25 }, { from: want, to: want })).toEqual({ from: want, to: want, why: 'zoom' });
  expect(avoidBurnedMove({ ...high, maxZoom: 1.6 }, { from: want, to: want }).from.zoom).toBeCloseTo(1.36, 2);
});

test('a face the asked-for crop shows stays in frame: the focus moves onto it, or the crop is left as asked', () => {
  const geo = { srcW: 1920, srcH: 1080, frameW: 1920, frameH: 1080, captionTop: 0.86, maxZoom: 1.6 };
  const inside = (c: typeof want, s: number[]) => { const v = viewRect(1920, 1080, 1920, 1080, c); return s[0] >= v[0] - 0.004 && s[1] >= v[1] - 0.004 && s[2] <= v[2] + 0.004 && s[3] <= v[3] + 0.004; };
  // a face low on the left: the plain crop zooms about the middle and cuts it; with the face it looks left instead
  const face: [number, number, number, number] = [0.03, 0.55, 0.13, 0.75];
  const plain = avoidBurnedMove(geo, { from: want, to: want });
  expect(inside(plain.from, face)).toBe(false);
  const kept = avoidBurnedMove(geo, { from: want, to: want }, face);
  expect(kept.why).toBeUndefined();
  expect(kept.from.zoom).toBe(plain.from.zoom);                                                  // no more zoom than without it
  expect(kept.from.x).toBeLessThan(0.5);
  expect(inside(kept.from, face) && inside(kept.to, face)).toBe(true);
  // a face reaching down into the rows that must go: the crop stays as asked
  expect(avoidBurnedMove(geo, { from: want, to: want }, [0.4, 0.6, 0.55, 0.855])).toEqual({ from: want, to: want, why: 'subject' });
  // a face the asked-for crop does not show whole does not hold it back
  expect(avoidBurnedMove(geo, { from: want, to: want }, [0.4, 0.6, 0.55, 1.2]).why).toBeUndefined();
});

test('a move spread over pieces runs on without a jump at the joins', () => {
  const move = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.1, zoom: 1.4 } };
  const s = spreadMove(move, [1, 3]);
  expect(s[0].from).toEqual(move.from);
  expect(s[1].to).toEqual(move.to);
  expect(s[0].to).toEqual(s[1].from);
  expect(s[0].to.zoom).toBeCloseTo(1.1, 6);
});
