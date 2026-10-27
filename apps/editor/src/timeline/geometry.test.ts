import { fixture } from '../../../../packages/engine/src/commands/test-fixture.ts';
import { COLLAPSED_H, layoutRows, maxScroll, ppsFromZoom, rowAt, rulerTicks, scrollThumb, timeToX, xToTime, zoomAround, zoomFromPps } from './geometry.ts';

test('visual tracks are listed top layer first, audio tracks after', () => {
  const rows = layoutRows(fixture());
  expect(rows.map((r) => r.track.id)).toEqual(['v2', 'v', 'sc', 'mu', 'au', 'fx']);
  expect(rows.map((r) => r.y)).toEqual([0, 58, 116, 154, 200, 246]);
  expect(rowAt(rows, 60)!.track.id).toBe('v');
  expect(rowAt(rows, 1000)).toBeNull();
});

test('time and x convert with zoom and scroll; zoom keeps the anchor in place', () => {
  const v = { pps: 50, scroll: 2 };
  expect(timeToX(3, v)).toBe(50);
  expect(xToTime(50, v)).toBe(3);
  const z = zoomAround(v, 2, 50);
  expect(z.pps).toBe(100);
  expect(xToTime(50, z)).toBeCloseTo(3);
  expect(zoomAround(v, 100, 0).pps).toBe(400);
});

test('ruler ticks are at least 60 px apart', () => {
  const t = rulerTicks({ pps: 50, scroll: 0 }, 400);
  const majors = t.filter((x) => x.major).map((x) => x.t);
  expect(majors.slice(0, 3)).toEqual([0, 2, 4]);
  expect(t.filter((x) => !x.major && x.t < 2).length).toBe(4);
});

const withC3 = () => {
  const p = fixture();
  (p.tracks[1].items as any[]).push({ id: 'c3', source: 's', in: 0, speed: 1, start: 3, end: 5, frame: [0, 0, 1, 1],
    crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, interp: 'none' });
  return p;
};

test('overlapping items on a track get their own lanes; the row grows to fit them', () => {
  const p = withC3(), v = layoutRows(p).find((r) => r.track.id === 'v')!;
  expect([v.h, v.laneH, v.lanes.get('c1'), v.lanes.get('c2'), v.lanes.get('c3')]).toEqual([112, 56, 0, 0, 1]);
  expect(layoutRows(fixture()).find((r) => r.track.id === 'v')!.h).toBe(56);       // no overlap: one lane
});

test('the scrollbar thumb shows the visible part of the project; the zoom slider is logarithmic', () => {
  expect(scrollThumb({ pps: 100, scroll: 0 }, 20, 1200)).toEqual({ left: 0, width: Math.round((1200 * 12) / 21) });
  const t = scrollThumb({ pps: 100, scroll: 9 }, 20, 1200);
  expect(t.left + t.width).toBe(1200);                                   // scrolled to the end
  expect(scrollThumb({ pps: 5, scroll: 0 }, 20, 1200)).toEqual({ left: 0, width: 1200 });   // everything visible
  expect(maxScroll(20, 1200, 100)).toBe(9);                              // the end (plus 1 s of air) at the right edge
  expect(maxScroll(20, 1200, 5)).toBe(0);
  expect([ppsFromZoom(0), Math.round(ppsFromZoom(100))]).toEqual([5, 400]);
  expect(Math.round(zoomFromPps(ppsFromZoom(37)))).toBe(37);
});
test('a collapsed track is a thin row with every item in it', () => {
  const p = fixture();
  const rows = layoutRows(p, undefined, undefined, new Set(['v']));
  const v = rows.find((r) => r.track.id === 'v')!, next = rows[rows.indexOf(v) + 1];
  expect([v.h, v.laneH, [...v.lanes.values()], next.y]).toEqual([COLLAPSED_H, COLLAPSED_H, [0, 0], v.y + COLLAPSED_H + 2]);
});
