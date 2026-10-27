import { coverPlacement, cropAt, cropForWindow, kbMatrix, lerpCrop, moveViewfinder, videoState, visibleRegion } from './geometry.ts';
import { eIO3, eOut3 } from './util.ts';

const vid = (o: any = {}): any => ({ id: 'v', source: 's', in: 0, speed: 1, start: 0, end: 4, frame: [0, 0, 1, 1],
  crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, interp: 'none', ...o });

test('wedding: same aspect, scale around the focus point', () => {
  const b = coverPlacement(1920, 1080, 1920, 1080, { x: 0.6, y: 0.5, zoom: 1.1 });
  expect(b.width).toBeCloseTo(2112);
  expect(b.height).toBeCloseTo(1188);
  expect(b.left).toBeCloseTo(0.6 * 1920 * (1 - 1.1));
  expect(b.top).toBeCloseTo(0.5 * 1080 * (1 - 1.1));
});

test('kyoto: landscape into portrait puts the focus x at the centre', () => {
  const b = coverPlacement(1920, 1080, 1080, 1920, { x: 0.28, y: 0.5, zoom: 1 });
  expect(b.width).toBeCloseTo(3413.333, 2);
  expect(b.left).toBeCloseTo(540 - 0.28 * 3413.333, 2);
  expect(b.top).toBeCloseTo(0);
  const z = coverPlacement(1920, 1080, 1080, 1920, { x: 0.28, y: 0.5, zoom: 1.09 });
  expect(z.left).toBeCloseTo(540 - 0.28 * 3413.333 * 1.09, 2);
  expect(z.top).toBeCloseTo((1920 - 1920 * 1.09) / 2, 2);
});

test('focus near the edge is clamped so the frame stays covered', () => {
  const b = coverPlacement(1920, 1080, 1080, 1920, { x: 0, y: 0.5, zoom: 1 });
  expect(b.left).toBe(0);
});

test('ken burns interpolates zoom over the item duration', () => {
  const s = videoState(vid({ crop: { from: { x: 0.5, y: 0.5, zoom: 1.035 }, to: { x: 0.5, y: 0.5, zoom: 1.1 } } }), 0, 4, 2, 1920, 1080, {});
  expect(s.crop.zoom).toBeCloseTo((1.035 + 1.1) / 2);
});

test('dissolve fades opacity with eIO3', () => {
  const s = videoState(vid({ transitionIn: { type: 'dissolve', dur: 0.5 } }), 0, 4, 0.25, 1920, 1080, {});
  expect(s.opacity).toBeCloseTo(0.5);
});

test('slide enters from the given side and fades with eOut3', () => {
  const s = videoState(vid({ frame: [0, 0.5, 1, 0.5], transitionIn: { type: 'slide', dur: 0.3, dir: 'd' } }), 0, 4, 0, 1080, 1920, {});
  expect(s.offsetY).toBeCloseTo(960);
  expect(s.opacity).toBe(0);
  const l = videoState(vid({ transitionIn: { type: 'slide', dur: 0.28, dir: 'l' } }), 0, 4, 0, 1080, 1920, {});
  expect(l.offsetX).toBeCloseTo(-1080);
});

test('freezeAt holds the media time; defocus appends blur after it starts', () => {
  const s = videoState(vid({ freezeAt: 1, grade: 'g', defocus: { from: 2, to: 3, px: 7 } }), 0, 4, 3, 1920, 1080, { g: 'saturate(1.1)' });
  expect(s.mediaLocal).toBe(1);
  expect(s.filter).toBe('saturate(1.1) blur(7.00px)');
  const before = videoState(vid({ grade: 'g', defocus: { from: 2, to: 3, px: 7 } }), 0, 4, 1.5, 1920, 1080, { g: 'saturate(1.1)' });
  expect(before.filter).toBe('saturate(1.1)');
});

test('visibleRegion is the part of the source a frame shows', () => {
  const r = visibleRegion(1920, 1080, 1080, 1920, { x: 0.5, y: 0.5, zoom: 1 });   // portrait frame from landscape source
  expect(r.w).toBeCloseTo(0.3164, 3); expect(r.h).toBeCloseTo(1); expect(r.x0).toBeCloseTo(0.3418, 3); expect(r.y0).toBeCloseTo(0);
  const z = visibleRegion(1920, 1080, 1920, 1080, { x: 0.5, y: 0.5, zoom: 2 });
  expect([z.x0, z.y0, z.w, z.h].map((v) => +v.toFixed(4))).toEqual([0.25, 0.25, 0.5, 0.5]);
  expect(visibleRegion(1920, 1080, 1080, 1920, { x: 0, y: 0.5, zoom: 1 }).x0).toBeCloseTo(0);
});

test('moving the viewfinder moves the visible region by exactly the cursor travel, stopping at the source edge', () => {
  const c = { x: 0.5, y: 0.5, zoom: 1.2 };
  const r0 = visibleRegion(1920, 1080, 1920, 1080, c);
  const r1 = visibleRegion(1920, 1080, 1920, 1080, moveViewfinder(1920, 1080, 1920, 1080, c, 0.05, -0.03));
  expect(r1.x0 - r0.x0).toBeCloseTo(0.05, 4);
  expect(r1.y0 - r0.y0).toBeCloseTo(-0.03, 4);
  const edge = visibleRegion(1920, 1080, 1920, 1080, moveViewfinder(1920, 1080, 1920, 1080, c, 5, 0));
  expect(edge.x0 + edge.w).toBeCloseTo(1, 4);
  expect(moveViewfinder(1920, 1080, 1920, 1080, { x: 0.5, y: 0.5, zoom: 1 }, 0.2, 0)).toEqual({ x: 0.5, y: 0.5, zoom: 1 });   // nothing to move
});

const C = (x: number, zoom: number) => ({ x, y: 0.5, zoom });

test('cropAt without keys or ease equals the old linear interpolation', () => {
  const c = { from: C(0.2, 1), to: C(0.8, 2) };
  for (const t of [0, 1, 2.5, 4]) expect(cropAt(c, t, 4)).toEqual(lerpCrop(c.from, c.to, t / 4));
});

test('cropAt holds, ramps and holds through keys (a punch-in)', () => {
  const c = { from: C(0.5, 1), to: C(0.5, 1.5), keys: [{ t: 1, ...C(0.5, 1) }, { t: 1.5, ...C(0.5, 1.5) }] };
  expect(cropAt(c, 0.5, 4).zoom).toBeCloseTo(1);
  expect(cropAt(c, 1.25, 4).zoom).toBeCloseTo(1.25);
  expect(cropAt(c, 3, 4).zoom).toBeCloseTo(1.5);
});

test('cropAt eases each segment', () => {
  const c = { from: C(0.5, 1), to: C(0.5, 2), ease: 'inOut' as const };
  expect(cropAt(c, 1, 4).zoom).toBeCloseTo(1 + eIO3(0.25));
  expect(cropAt({ ...c, ease: 'in' }, 2, 4).zoom).toBeCloseTo(1.125);
  expect(cropAt({ ...c, ease: 'out' }, 2, 4).zoom).toBeCloseTo(1 + eOut3(0.5));
});

test('keys outside the clip are ignored, not lost', () => {
  const c = { from: C(0.5, 1), to: C(0.5, 2), keys: [{ t: 3, ...C(0.5, 4) }] };
  expect(cropAt(c, 1, 2).zoom).toBeCloseTo(1.5);           // trimmed to 2 s: the key at 3 s does nothing
  expect(cropAt(c, 3, 4).zoom).toBeCloseTo(4);             // lengthened again: it is back
  expect(c.keys).toHaveLength(1);
});

test('videoState follows the crop keys', () => {
  const s = videoState(vid({ crop: { from: C(0.5, 1), to: C(0.5, 1), keys: [{ t: 2, ...C(0.5, 3) }] } }), 0, 4, 2, 100, 100, {});
  expect(s.crop.zoom).toBeCloseTo(3);
});

test('shake is deterministic, decays and ends at exactly zero', () => {
  const it = vid({ shake: [{ at: 1, dur: 0.5, px: 20, hz: 18 }] });
  const at = (t: number) => videoState(it, 0, 4, t, 400, 300, {});
  expect([at(0.9).shakeX, at(0.9).shakeY, at(0.9).shakeScale]).toEqual([0, 0, 1]);
  const a = at(1.1), b = at(1.1);
  expect([a.shakeX, a.shakeY]).toEqual([b.shakeX, b.shakeY]);
  expect(Math.hypot(a.shakeX, a.shakeY)).toBeGreaterThan(0);
  expect(Math.abs(a.shakeX)).toBeLessThanOrEqual(20);
  expect(Math.abs(at(1.45).shakeX)).toBeLessThanOrEqual(20 * 0.1 ** 2 + 1e-9);   // 90 % through: at most (1 − 0.9)²·20 px
  expect([at(1.5).shakeX, at(1.5).shakeY, at(1.5).shakeScale]).toEqual([0, 0, 1]);
  expect(a.shakeScale).toBeCloseTo(1 + (2 * 20 * (1 - 0.2) ** 2) / 300);
});

test('overlapping shakes add up; different clips shake differently', () => {
  const one = vid({ shake: [{ at: 0, dur: 1, px: 10 }] }), two = vid({ shake: [{ at: 0, dur: 1, px: 10 }, { at: 0, dur: 1, px: 10 }] });
  const s1 = videoState(one, 0, 4, 0.3, 400, 300, {}), s2 = videoState(two, 0, 4, 0.3, 400, 300, {});
  expect(s2.shakeX).not.toBe(s1.shakeX);
  const other = videoState(vid({ id: 'w', shake: one.shake }), 0, 4, 0.3, 400, 300, {});
  expect(other.shakeX).not.toBe(s1.shakeX);
});

test('defocus can start blurred and clear (px0 → px)', () => {
  const s = (t: number) => videoState(vid({ defocus: { from: 0, to: 2, px: 4, px0: 16 } }), 0, 4, t, 100, 100, {}).filter;
  expect(s(0)).toBe('blur(16.00px)');
  expect(s(1)).toBe('blur(10.00px)');
  expect(s(3)).toBe('blur(4.00px)');
  expect(videoState(vid({ defocus: { from: 1, to: 2, px: 6 } }), 0, 4, 1.5, 100, 100, {}).filter).toBe('blur(3.00px)');
});

test('radius passes through (0 when absent)', () => {
  expect(videoState(vid({ radius: 46 }), 0, 4, 1, 100, 100, {}).radius).toBe(46);
  expect(videoState(vid(), 0, 4, 1, 100, 100, {}).radius).toBe(0);
});

test('a shaken picture still covers its frame when the Ken Burns focus sits at an edge', () => {
  const W = 1920, H = 1080, amp = 20, k = 1 + (2 * amp) / Math.min(W, H);
  for (const crop of [{ x: 0.5, y: 0, zoom: 1 }, { x: 0, y: 0, zoom: 1.3 }, { x: 1, y: 1, zoom: 1 }]) {
    const B = coverPlacement(W, H, W, H, { ...crop, zoom: 1 });
    const ax = B.left + crop.x * B.width, ay = B.top + crop.y * B.height;
    for (const [sx, sy] of [[amp, amp], [-amp, -amp], [amp, -amp], [-amp, amp]]) {
      const { m, tx, ty } = kbMatrix(ax, ay, crop.zoom, W / 2, H / 2, k, sx, sy);
      const left = m * B.left + tx, top = m * B.top + ty, right = m * (B.left + B.width) + tx, bottom = m * (B.top + B.height) + ty;
      expect(left).toBeLessThanOrEqual(1e-6); expect(top).toBeLessThanOrEqual(1e-6);
      expect(right).toBeGreaterThanOrEqual(W - 1e-6); expect(bottom).toBeGreaterThanOrEqual(H - 1e-6);
    }
  }
  // without a shake it is the plain zoom around the focus
  expect(kbMatrix(960, 0, 1.2, 960, 540, 1, 0, 0)).toEqual({ m: 1.2, tx: 960 * (1 - 1.2), ty: 0 });
});

test('cropForWindow shows exactly a pixel window of the source, edges included', () => {
  const wins: Array<[number, number, number, number]> = [[120, 90, 560, 425.6], [655, 0, 456, 583.68], [800, 100, 480, 364.8], [0, 0, 1280 * 0.6, 720 * 0.6 * 0.95]];
  for (const win of wins) {
    const fw = 1000, fh = (fw * win[3]) / win[2];
    const c = cropForWindow(1280, 720, fw, fh, win);
    const r = visibleRegion(1280, 720, fw, fh, c);
    expect(r.x0 * 1280).toBeCloseTo(win[0], 1);
    expect(r.y0 * 720).toBeCloseTo(win[1], 1);
    expect(r.w * 1280).toBeCloseTo(win[2], 1);
  }
});
