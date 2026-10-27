// Crop keyframes and shakes are clip-local: split, head trims and speed changes must keep them on the same footage.
import { cropAt } from '../geometry.ts';
import { split } from './split.ts';
import { rateStretch, roll, trimStart } from './trim.ts';
import { fixture, item } from './test-fixture.ts';

const C = (zoom: number, x = 0.5) => ({ x, y: 0.5, zoom });
function withPunchIn() {
  const p = structuredClone(fixture());
  const c1 = item(p, 'c1');                                   // 0–4 s
  c1.crop = { from: C(1), to: C(1.5), ease: 'inOut', keys: [{ t: 1, ...C(1) }, { t: 1.5, ...C(1.5) }] };
  c1.shake = [{ at: 3, dur: 0.5, px: 10, hz: 18 }, { at: 0.5, dur: 0.4, px: 6, hz: 18 }];
  return p;
}

test('split keeps the crop keys, the easing and the picture at the cut', () => {
  const p = withPunchIn();
  const before = structuredClone(item(p, 'c1').crop);
  split(p, { t: 1.25, ids: ['c1'] });
  const a = item(p, 'c1'), b = item(p, 'c1-2');
  // exact outside the segment the cut falls in (that one is re-eased over each half); continuous at the cut
  expect(cropAt(a.crop, 0.5, 1.25).zoom).toBeCloseTo(cropAt(before, 0.5, 4).zoom);
  expect(cropAt(a.crop, 1.25, 1.25).zoom).toBeCloseTo(cropAt(before, 1.25, 4).zoom);
  for (const t of [1.25, 3]) expect(cropAt(b.crop, t - 1.25, 2.75).zoom).toBeCloseTo(cropAt(before, t, 4).zoom);
  expect([a.crop.ease, b.crop.ease]).toEqual(['inOut', 'inOut']);
  expect(a.crop.keys).toEqual([{ t: 1, ...C(1) }]);
  expect(b.crop.keys).toEqual([{ t: 0.25, ...C(1.5) }]);
});

test('split gives each shake to its half, moved to the half\'s own time', () => {
  const p = withPunchIn();
  split(p, { t: 2, ids: ['c1'] });
  expect(item(p, 'c1').shake).toEqual([{ at: 0.5, dur: 0.4, px: 6, hz: 18 }]);
  expect(item(p, 'c1-2').shake).toEqual([{ at: 1, dur: 0.5, px: 10, hz: 18 }]);
});

test('a head trim moves keys and shakes with the footage; keys trimmed off wait outside', () => {
  const p = withPunchIn();
  trimStart(p, { id: 'c1', dt: 1.2 });
  const c1 = item(p, 'c1');
  expect(c1.crop.keys.map((k: any) => k.t)).toEqual([-0.2, 0.3]);
  expect(c1.shake.map((s: any) => s.at)).toEqual([1.8, -0.7]);
  trimStart(p, { id: 'c1', dt: -1.2 });
  expect(item(p, 'c1').crop.keys.map((k: any) => k.t)).toEqual([1, 1.5]);
});

test('a speed change stretches keys and shakes with the footage', () => {
  const p = withPunchIn();
  rateStretch(p, { id: 'c1', edge: 'end', dt: 4 });          // 4 s → 8 s
  const c1 = item(p, 'c1');
  expect(c1.crop.keys.map((k: any) => k.t)).toEqual([2, 3]);
  expect(c1.shake.map((s: any) => [s.at, s.dur])).toEqual([[6, 1], [1, 0.8]]);
});

// toolkit phase 5: a moving layer (transform.keys, item-local) riding on a clip
function withSticker() {
  const p = structuredClone(fixture());
  (p.tracks.find((t) => t.id === 'sc')!.items as any[]).push({ id: 'st', type: 'x.block', start: 1, end: 3, params: {}, parent: 'c1',
    transform: { x: 0, y: 0, scale: 1, ox: 0.5, oy: 0.5, keys: [{ t: 0, x: 0, y: 0, scale: 1 }, { t: 1, x: 0.2, y: 0, scale: 1 }, { t: 2, x: 0.4, y: 0, scale: 1 }] } });
  return p;
}
const keyTimes = (p: any) => item(p, 'st').transform.keys.map((k: any) => k.t);

test("a moving layer's head trim keeps its path on the same moments", () => {
  const p = withSticker();
  trimStart(p, { id: 'st', dt: 0.5 });
  expect(keyTimes(p)).toEqual([-0.5, 0.5, 1.5]);
});

test("a speed change of the clip a moving layer rides on stretches the layer's path with it", () => {
  const p = withSticker();
  rateStretch(p, { id: 'c1', edge: 'end', dt: 4 });                // 4 s → 8 s: everything on it twice as long
  expect([item(p, 'st').start, item(p, 'st').end]).toEqual([2, 6]);
  expect(keyTimes(p)).toEqual([0, 2, 4]);
});

test('rolling the cut leaves what rides on a clip on the same picture', () => {
  const p = withSticker();
  roll(p, { left: 'c1', right: 'c2', dt: 1 });
  expect([item(p, 'st').start, item(p, 'st').end]).toEqual([1, 3]);
  expect(keyTimes(p)).toEqual([0, 1, 2]);
});
