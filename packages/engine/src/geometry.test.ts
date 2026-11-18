import { BAR_GAP, BAR_LEN, BARS, BLUR_MAX, clockClip, coverPlacement, cropAt, cropForWindow, drawnTransition, irisClip, kbMatrix, lerpCrop, moveViewfinder, shapeClipPath, videoState, visibleRegion,
  WHIP_BLUR, ZOOM_BLUR, ZOOM_IN, ZOOM_OUT, ZOOM_POW } from './geometry.ts';
import { TRANSITION_TYPES } from './schema.ts';
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

test('a shape becomes a CSS polygon of the frame (none when absent or under three corners)', () => {
  expect(videoState(vid({ shape: [[0, 0], [1, 0], [1, 0.8981], [0, 1]] }), 0, 4, 1, 100, 100, {}).clipPath).toBe('polygon(0% 0%, 100% 0%, 100% 89.81%, 0% 100%)');
  expect(videoState(vid(), 0, 4, 1, 100, 100, {}).clipPath).toBe('');
  expect(shapeClipPath([[0, 0], [1, 1]])).toBe('');
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

// ── transitions in which both pictures show (wipe, push) and the outgoing clip's side of them
const W = 1920, H = 1080;
const vs = (o: any, t: number, link?: any, start = 0) => videoState(vid(o), start, start + 4, t, W, H, {}, link);
/** the outgoing clip A of a linked 1 s transition starting 3 s into it */
const outOf = (type: string, dir?: string, more: any = {}) => ({ out: { type, ...(dir ? { dir } : {}), at: 3, dur: 1, frame: [0, 0, 1, 1], shaped: false, ...more } });

test('wipe: B is revealed from its dir side, eased in-out, A stays still', () => {
  const at = (dir: string, t: number) => vs({ transitionIn: { type: 'wipe', dur: 1, dir } }, t, { from: [0, 0, 1, 1] }).clipPath;
  expect([0, 0.5].map((t) => at('l', t))).toEqual(['inset(0 100% 0 0)', 'inset(0 50% 0 0)']);
  expect([0, 0.5].map((t) => at('r', t))).toEqual(['inset(0 0 0 100%)', 'inset(0 0 0 50%)']);
  expect([0, 0.5].map((t) => at('u', t))).toEqual(['inset(0 0 100% 0)', 'inset(0 0 50% 0)']);
  expect([0, 0.5].map((t) => at('d', t))).toEqual(['inset(100% 0 0 0)', 'inset(50% 0 0 0)']);
  for (const d of ['l', 'r', 'u', 'd']) expect(at(d, 1)).toBe('');   // whole again: no clip-path at all
  expect(at('l', 0.25)).toBe(`inset(0 ${+((1 - eIO3(0.25)) * 100).toFixed(3)}% 0 0)`);
  expect(vs({ transitionIn: { type: 'wipe', dur: 1 } }, 0.5).clipPath).toBe('inset(0 50% 0 0)');   // no dir: from the left, like slide
  const b = vs({ transitionIn: { type: 'wipe', dur: 1, dir: 'l' } }, 0.5);
  expect([b.opacity, b.offsetX, b.offsetY]).toEqual([1, 0, 0]);
  for (const t of [3, 3.5, 3.99]) {
    const a = vs({}, t, outOf('wipe', 'l'));
    expect([a.opacity, a.offsetX, a.offsetY, a.clipPath]).toEqual([1, 0, 0, '']);
  }
});

test('push: B slides in from its dir side at full opacity while A slides out the other, edges touching', () => {
  const cases: Array<[string, [number, number], [number, number]]> = [
    // dir, B's offset at 0.5, A's offset at 0.5
    ['l', [-960, 0], [960, 0]], ['r', [960, 0], [-960, 0]], ['u', [0, -540], [0, 540]], ['d', [0, 540], [0, -540]],
  ];
  for (const [dir, b5, a5] of cases) {
    const b = (t: number) => { const s = vs({ transitionIn: { type: 'push', dur: 1, dir } }, t, { from: [0, 0, 1, 1] }); return [s.offsetX, s.offsetY, s.opacity]; };
    const a = (t: number) => { const s = vs({}, t, outOf('push', dir)); return [s.offsetX, s.offsetY, s.opacity]; };
    const sx = dir === 'l' ? -1 : dir === 'r' ? 1 : 0, sy = dir === 'u' ? -1 : dir === 'd' ? 1 : 0;
    expect(b(0)).toEqual([sx * W, sy * H, 1]);
    expect(b(0.5)).toEqual([...b5, 1]);
    expect(b(1)).toEqual([0, 0, 1]);
    expect(a(3)).toEqual([0, 0, 1]);
    expect(a(3.5)).toEqual([...a5, 1]);
    // B and A one picture apart all along (no gap, no overlap), in whole pixels
    for (const f of [0.1, 0.33, 0.77, 0.95]) {
      const [bx, by] = b(f), [ax, ay] = a(3 + f);
      expect([ax - bx, ay - by]).toEqual([-sx * W + 0, -sy * H + 0]);
      expect(Number.isInteger(bx) && Number.isInteger(by)).toBe(true);
    }
  }
  // eased in-out, like the wipe
  expect(vs({ transitionIn: { type: 'push', dur: 1, dir: 'l' } }, 0.25).offsetX).toBe(-Math.round((1 - eIO3(0.25)) * W));
  // A before and after the transition does not move
  expect([vs({}, 2.9, outOf('push', 'l')).offsetX, vs({}, 4, outOf('push', 'l')).offsetX]).toEqual([0, 0]);
});

test('a push not linked to a clip before it (the film\'s first clip) only slides B in, at full opacity', () => {
  const s = vs({ transitionIn: { type: 'push', dur: 1, dir: 'r' } }, 0.5);
  expect([s.offsetX, s.opacity]).toEqual([960, 1]);
});

test('a push needs both frames whole: otherwise B dissolves and A stays still', () => {
  const half = [0, 0, 0.5, 1];
  const dissolve = vs({ transitionIn: { type: 'dissolve', dur: 1 } }, 0.25);
  for (const [o, link] of [[{ frame: half }, { from: [0, 0, 1, 1] }], [{}, { from: half }], [{ frame: half }, undefined]] as const) {
    const s = vs({ ...o, transitionIn: { type: 'push', dur: 1, dir: 'l' } }, 0.25, link);
    expect([s.offsetX, s.offsetY, s.opacity]).toEqual([0, 0, dissolve.opacity]);
  }
  expect(vs({ frame: half }, 3.5, outOf('push', 'l')).offsetX).toBe(0);                     // A not whole
  expect(vs({}, 3.5, outOf('push', 'l', { frame: half })).offsetX).toBe(0);                 // B not whole
});

test('a clip cut to a shape cannot also wipe: it dissolves and keeps its shape', () => {
  const shape = [[0, 0], [1, 0], [1, 1], [0, 0.8]];
  const s = vs({ shape, transitionIn: { type: 'wipe', dur: 1, dir: 'l' } }, 0.25);
  expect(s.clipPath).toBe(shapeClipPath(shape as any));
  expect(s.opacity).toBeCloseTo(eIO3(0.25));
  expect(drawnTransition('wipe', [0, 0, 1, 1], true)).toBe('dissolve');
  expect(drawnTransition('wipe', [0, 0, 1, 1], false)).toBe('wipe');
});

test('every transition type is drawn as itself; the fallback is only for a type added later', () => {
  for (const type of TRANSITION_TYPES) expect(drawnTransition(type, [0, 0, 1, 1], false, [0, 0, 1, 1])).toBe(type);
  expect(drawnTransition('later' as any, [0, 0, 1, 1], false)).toBe('dissolve');
});

/** B of a linked 1 s transition at progress p (B starts at 0), and the outgoing A at progress p (A's transition starts at 3) */
const B = (type: string, p: number, o: any = {}, link: any = { from: [0, 0, 1, 1] }) => vs({ ...o, transitionIn: { type, dur: 1, dir: 'l', ...o.tr } }, p, link);
const A = (type: string, p: number, more: any = {}, o: any = {}) => vs(o, 3 + p, outOf(type, more.dir ?? 'l', more));
const PS = [0, 0.25, 0.5, 0.75, 1];
/** the parts of a state a transition may change, the frame and crop left out */
const parts = (s: any) => ({ offsetX: s.offsetX, offsetY: s.offsetY, opacity: s.opacity, filter: s.filter, clipPath: s.clipPath, scale: s.scale, streak: s.streak, veil: s.veil });
const STILL = { offsetX: 0, offsetY: 0, opacity: 1, filter: 'none', clipPath: '', scale: 1, streak: [0, 0], veil: null };

test('iris: B through a circle growing from (x, y) until it reaches the farthest corner, in px; A still', () => {
  const R = Math.hypot(960, 540);
  expect(PS.map((p) => B('iris', p).clipPath)).toEqual([0, 0.25, 0.5, 0.75].map((p) => `circle(${+(eIO3(p) * R).toFixed(3)}px at 50% 50%)`).concat(''));
  // off centre: the farthest corner from (0.25, 0.75) is the top right one
  expect(B('iris', 0.5, { tr: { x: 0.25, y: 0.75 } }).clipPath).toBe(`circle(${+(0.5 * Math.hypot(1440, 810)).toFixed(3)}px at 25% 75%)`);
  expect(irisClip(1 - 1e-9, 100, 100, 0, 0)).toBe(`circle(${+((1 - 1e-9) * Math.hypot(100, 100)).toFixed(3)}px at 0% 0%)`);
  for (const p of PS) { expect(parts(B('iris', p))).toEqual({ ...STILL, clipPath: B('iris', p).clipPath }); expect(parts(A('iris', p))).toEqual(STILL); }
});

test('clock: a hand sweeping clockwise from 12 o\'clock round the centre, at an even angle on the real frame', () => {
  expect(B('clock', 0).clipPath).toBe('polygon(50% 50%, 50% 0%, 50% 0%)');                        // nothing swept yet
  const x = (deg: number) => +((960 + 540 * Math.tan((deg * Math.PI) / 180)) / 19.2).toFixed(3);   // where the hand meets the top edge, %
  expect(B('clock', 0.25).clipPath).toBe(`polygon(50% 50%, 50% 0%, ${x(22.5)}% 0%)`);              // eIO3(0.25) of 360° = 22.5°
  expect(B('clock', 0.5).clipPath).toBe('polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 50% 100%)'); // half way: the right half
  expect(B('clock', 0.75).clipPath).toBe(`polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${x(-22.5)}% 0%)`);
  expect(B('clock', 1).clipPath).toBe('');
  // a quarter turn on a tall frame ends at 3 o'clock, the right edge's middle, past the top right corner
  expect(clockClip(0.25, 1080, 1920)).toBe('polygon(50% 50%, 50% 0%, 100% 0%, 100% 50%)');
  for (const p of PS) expect(parts(A('clock', p))).toEqual(STILL);
});

/** bars' clip-path read back: each rectangle as [x0, y0, x1, y1] in px */
const rects = (clip: string) => [...clip.matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)H[\d.]+Z/g)].map((m) => m.slice(1).map(Number));
test('bars: six strips across the travel wiping at once at different stages, every other one from the other end', () => {
  expect(B('bars', 0).clipPath).toBe('inset(50%)');
  expect(B('bars', 1).clipPath).toBe('');
  const w = 1920 / 6, q = (i: number, p: number) => { const v = Math.min(1, Math.max(0, (p - i * BAR_GAP) / BAR_LEN)); return v * v * (3 - 2 * v); };
  expect(BAR_GAP * (BARS - 1) + BAR_LEN).toBeCloseTo(1, 12);
  // dir l, half way: every strip on its way, each further than the next, the even ones from the top and the odd ones from the bottom
  const r = rects(B('bars', 0.5).clipPath);
  expect(r.map(([x0]) => Math.round(x0 / w))).toEqual([0, 1, 2, 3, 4, 5]);
  r.forEach(([x0, y0, x1, y1], k) => {
    expect([x0, x1]).toEqual([+(k * w).toFixed(3), +((k + 1) * w).toFixed(3)]);
    if (k % 2) { expect(y1).toBe(1080); expect(y0).toBeCloseTo(1080 * (1 - q(k, 0.5)), 2); } else { expect(y0).toBe(0); expect(y1).toBeCloseTo(1080 * q(k, 0.5), 2); }
  });
  const qs = [0, 1, 2, 3, 4, 5].map((i) => q(i, 0.5));
  for (let i = 1; i < 6; i++) expect(qs[i]).toBeLessThan(qs[i - 1]);
  expect(qs.filter((v) => v > 0.05 && v < 0.95).length).toBeGreaterThanOrEqual(4);
  // dir r starts at the right; u / d are horizontal strips, from the top / the bottom, along x
  expect(rects(B('bars', 0.05, { tr: { dir: 'r' } }).clipPath).map(([x0]) => Math.round(x0 / w))).toEqual([5]);
  const u = rects(B('bars', 0.25, { tr: { dir: 'u' } }).clipPath);
  expect(u.map(([, y0]) => Math.round(y0 / 180))).toEqual([0, 1, 2, 3]);
  expect(u[0][0]).toBe(0); expect(u[1][2]).toBe(1920);                                            // the first from the left, the second from the right
  expect(rects(B('bars', 0.05, { tr: { dir: 'd' } }).clipPath).map(([, y0]) => Math.round(y0 / 180))).toEqual([5]);
  // strips that touch share their edge to the digit
  const all = rects(B('bars', 0.9).clipPath);
  for (let i = 1; i < all.length; i++) expect(all[i][0]).toBe(all[i - 1][2]);
  for (const p of PS) expect(parts(A('bars', p))).toEqual(STILL);
});

test('zoom: A grows 1 → 2.4 accelerating and stays opaque; B settles from 1.8 decelerating, fading in over the middle; blurred there', () => {
  const S = 1080;
  for (const p of PS) {
    const b = B('zoom', p), a = A('zoom', p), blur = +(ZOOM_BLUR * S * (4 * p * (1 - p)) ** 2).toFixed(3);
    expect(b.scale).toBeCloseTo(1 + ZOOM_IN * (1 - p) ** 2, 12);
    expect(b.opacity).toBeCloseTo(eIO3(Math.min(1, Math.max(0, (p - 0.35) / 0.3))), 12);
    expect(b.streak).toEqual([blur, blur]);
    if (p < 1) { expect(a.scale).toBeCloseTo(1 + ZOOM_OUT * p ** ZOOM_POW, 12); expect(a.streak).toEqual([blur, blur]); expect(a.opacity).toBe(1); }
  }
  [[B('zoom', 0).scale, 1.8], [B('zoom', 0.5).scale, 1.2], [B('zoom', 0.3).opacity, 0], [B('zoom', 0.5).opacity, 0.5], [B('zoom', 0.7).opacity, 1], [A('zoom', 0.999999).scale, 2.4]]
    .forEach(([got, want]) => expect(got).toBeCloseTo(want, 4));
  expect(A('zoom', 0.5).scale).toBeGreaterThan(1.6); expect(A('zoom', 0.5).scale).toBeLessThan(1.62);
  // accelerating: it grows more in the second half than in the first
  expect(A('zoom', 0.999999).scale - A('zoom', 0.5).scale).toBeGreaterThan(A('zoom', 0.5).scale - 1);
  expect(B('zoom', 0.5).streak).toEqual([10.8, 10.8]);
  // nothing else moves
  expect([B('zoom', 0.5).offsetX, A('zoom', 0.5).offsetX, B('zoom', 0.5).clipPath, A('zoom', 0.5).filter]).toEqual([0, 0, '', 'none']);
});

test('whip: push\'s motion with a sharper ease and a blur along the travel only, strongest in the middle, none at the ends', () => {
  const e5 = (p: number) => (p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2);
  for (const [dir, w, h, sx, sy] of [['l', 1920, 0, -1, 0], ['r', 1920, 0, 1, 0], ['u', 0, 1080, 0, -1], ['d', 0, 1080, 0, 1]] as const) {
    for (const p of PS) {
      const b = B('whip', p, { tr: { dir } }), a = A('whip', p, { dir });
      expect([b.offsetX, b.offsetY]).toEqual([sx * Math.round((1 - e5(p)) * 1920) + 0, sy * Math.round((1 - e5(p)) * 1080) + 0]);
      const blur = +(WHIP_BLUR * 16 * Math.min(p, 1 - p) ** 4 * (w || h)).toFixed(3);
      expect(b.streak).toEqual(w ? [blur, 0] : [0, blur]);
      if (p < 1) {
        expect([a.offsetX - b.offsetX, a.offsetY - b.offsetY]).toEqual([-sx * 1920 + 0, -sy * 1080 + 0]);   // one picture apart, no gap
        expect(a.streak).toEqual(b.streak);
      }
      expect([b.opacity, a.opacity]).toEqual([1, 1]);
    }
  }
  expect(B('whip', 0.5).streak).toEqual([115.2, 0]);
  expect(B('whip', 0.5, { tr: { dir: 'u' } }).streak).toEqual([0, 64.8]);
  // sharper than push: less far at a quarter, as far in the middle
  expect(Math.abs(B('whip', 0.25).offsetX)).toBeGreaterThan(Math.abs(B('push', 0.25).offsetX));
  expect(B('whip', 0.5).offsetX).toBe(B('push', 0.5).offsetX);
});

test('blur: A blurs up by the middle; B, fully blurred, fades in and is sharp at the end; with the grade and defocus kept', () => {
  const M = BLUR_MAX * 1080;
  expect(PS.map((p) => B('blur', p).streak[0])).toEqual([M, M, M, M * (1 - eIO3(0.5)), 0].map((v) => +v.toFixed(3)));
  expect(PS.map((p) => B('blur', p).opacity)).toEqual(PS.map(eIO3));
  expect(PS.slice(0, 4).map((p) => A('blur', p).streak)).toEqual([0, M * eIO3(0.5), M, M].map((v) => [+v.toFixed(3), +v.toFixed(3)]));
  expect(A('blur', 0.5).opacity).toBe(1);
  // the blur is the streak's, never the filter string's: the grade and a running defocus stay as they were
  const g = { grade: 'g', defocus: { from: 0, to: 1, px: 4 } };
  const withG = (t: number, link?: any, o: any = {}) => videoState(vid({ ...g, ...o }), 0, 4, t, W, H, { g: 'saturate(1.1)' }, link);
  expect(withG(0.5, { from: [0, 0, 1, 1] }, { transitionIn: { type: 'blur', dur: 1 } }).filter).toBe(withG(0.5).filter);
  expect(withG(3.5, outOf('blur')).filter).toBe(withG(3.5).filter);
});

test('dip: A goes to black by the middle; B, unseen before it, comes up from black', () => {
  const v = (s: any) => s.veil && [s.veil.color, s.veil.opacity];
  expect(PS.map((p) => v(A('dip', p)))).toEqual([null, ['#000', eIO3(0.5)], ['#000', 1], ['#000', 1], null]);
  expect(PS.map((p) => v(B('dip', p)))).toEqual([['#000', 1], ['#000', 1], ['#000', 1], ['#000', 0.5], null]);
  expect(PS.map((p) => B('dip', p).opacity)).toEqual([0, 0, 1, 1, 1]);
  // just before and at the middle: A all black, B nothing or all black, so neither picture shows for a frame
  expect(A('dip', 0.4999).veil!.opacity).toBeGreaterThan(0.999);
  expect([B('dip', 0.4999).opacity, v(B('dip', 0.5))]).toEqual([0, ['#000', 1]]);
  // unlinked: B itself fades in black over the first half
  expect([0, 0.25, 0.5].map((p) => B('dip', p, {}, null).opacity)).toEqual([0, 0.5, 1]);
  // any frame, any shape
  const odd = { frame: [0.1, 0.1, 0.5, 0.5], shape: [[0, 0], [1, 0], [0, 1]] };
  expect(v(B('dip', 0.75, odd))).toEqual(['#000', 0.5]);
  expect(B('dip', 0.75, odd).clipPath).toBe(shapeClipPath(odd.shape as any));
  expect(A('dip', 0.5).filter).toBe('none');
});

test('flash: A burns out to white by the middle (brighter, then covered); B comes back from white', () => {
  const v = (s: any) => s.veil && [s.veil.color, s.veil.opacity];
  expect(PS.map((p) => v(A('flash', p)))).toEqual([null, ['#fff', 0.25], ['#fff', 1], ['#fff', 1], null]);
  expect(PS.map((p) => A('flash', p).filter)).toEqual(['none', 'brightness(2.000)', 'brightness(3.000)', 'brightness(3.000)', 'none']);
  expect(PS.map((p) => v(B('flash', p)))).toEqual([['#fff', 1], ['#fff', 1], ['#fff', 1], ['#fff', 0.25], null]);
  expect(PS.map((p) => B('flash', p).filter)).toEqual(['brightness(3.000)', 'brightness(3.000)', 'brightness(3.000)', 'brightness(2.000)', 'none']);
  expect(PS.map((p) => B('flash', p).opacity)).toEqual([0, 0, 1, 1, 1]);
  // after a grade
  expect(videoState(vid({ grade: 'g' }), 0, 4, 3.25, W, H, { g: 'saturate(1.1)' }, outOf('flash')).filter).toBe('saturate(1.1) brightness(2.000)');
});

test('at the end of B\'s transition and after, and outside A\'s, every type leaves the clip exactly as with none', () => {
  for (const type of TRANSITION_TYPES) for (const dir of ['l', 'r', 'u', 'd']) {
    for (const t of [1, 1.5, 3.99]) for (const link of [{ from: [0, 0, 1, 1] }, undefined])
      expect(vs({ transitionIn: { type, dur: 1, dir, x: 0.3, y: 0.6 } }, t, link), `${type} ${dir} B at ${t}`).toEqual(vs({}, t));
    for (const t of [0, 2.99, 3])                                          // A before and at the start of the transition (p = 0)
      expect(vs({}, t, outOf(type, dir)), `${type} ${dir} A at ${t}`).toEqual(vs({}, t));
    expect(vs({}, 4, outOf(type, dir)), `${type} ${dir} A at its end`).toEqual(vs({}, 4));
  }
});

test('fallbacks: a shaped clip\'s reveal and a zoom or whip of a frame not whole are drawn as a dissolve', () => {
  const shape = [[0, 0], [1, 0], [1, 1], [0, 0.8]];
  const dissolve = vs({ shape, transitionIn: { type: 'dissolve', dur: 1 } }, 0.25, { from: [0, 0, 1, 1] });
  for (const type of ['wipe', 'iris', 'clock', 'bars']) {
    expect(drawnTransition(type as any, [0, 0, 1, 1], true)).toBe('dissolve');
    expect(vs({ shape, transitionIn: { type, dur: 1 } }, 0.25, { from: [0, 0, 1, 1] })).toEqual(dissolve);
  }
  const half = [0, 0, 0.5, 1];
  for (const type of ['zoom', 'whip']) {
    for (const [o, link] of [[{ frame: half }, { from: [0, 0, 1, 1] }], [{}, { from: half }], [{ frame: half }, undefined]] as const) {
      const s = vs({ ...o, transitionIn: { type, dur: 1, dir: 'l' } }, 0.25, link);
      expect(parts(s)).toEqual({ ...STILL, opacity: eIO3(0.25) });
    }
    expect(parts(vs({ frame: half }, 3.5, outOf(type, 'l')))).toEqual(STILL);   // A not whole
    expect(parts(vs({}, 3.5, outOf(type, 'l', { frame: half })))).toEqual(STILL); // B not whole
  }
  // blur, dip and flash work on any frame
  expect(B('blur', 0.5, { frame: half }).streak[0]).toBeGreaterThan(0);
  expect(A('flash', 0.5, { frame: half }).veil).not.toBeNull();
});

test('unlinked (the film\'s first clip, or a transition not the overlap\'s length), B draws its own half only', () => {
  for (const type of ['zoom', 'whip', 'blur', 'iris', 'clock', 'bars', 'wipe', 'push']) for (const p of [0.25, 0.5, 0.75])
    expect(B(type, p, {}, null), `${type} ${p}`).toEqual(B(type, p));
  // dip and flash: B has nothing of its own under it, so it comes in as the colour itself in the first half
  for (const type of ['dip', 'flash']) {
    expect(B(type, 0.25, {}, null).opacity).toBe(eIO3(0.5));
    expect(B(type, 0.75, {}, null)).toEqual(B(type, 0.75));
  }
});

test('without the link argument a clip draws as before (callers outside the stage)', () => {
  expect(vs({}, 3.5)).toEqual(vs({}, 3.5, {}));
  expect(vs({ transitionIn: { type: 'push', dur: 1, dir: 'l' } }, 0.5).offsetX).toBe(-960);
});
