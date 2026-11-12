import { fixture } from '@tellcut/engine/test-fixture';
import { resolveTimes } from '@tellcut/engine';
import { COLLAPSED_H, ROW_H, ROW_H_MAX, drawnSpan, fitHeights, layoutRows, maxScroll, ppsFromZoom, rowAt, rulerLabel, rulerTicks, scrollThumb, timeToX, xToTime, zoomAround, zoomFromPps } from './geometry.ts';

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
  // below 5 px/s (where Zoom to fit put a long film): zooming out stays, zooming in goes on from there
  expect(zoomAround({ pps: 1, scroll: 0 }, 0.5, 0).pps).toBe(1);
  expect(zoomAround({ pps: 1, scroll: 0 }, 2, 0).pps).toBe(2);
  expect(zoomAround({ pps: 20, scroll: 0 }, 0.01, 0).pps).toBe(5);
  // a 30-minute film at 0.6 px/s: majors two minutes apart
  expect(rulerTicks({ pps: 0.6, scroll: 0 }, 400).filter((x) => x.major).map((x) => x.label)).toEqual(['0:00', '2:00', '4:00', '6:00', '8:00', '10:00']);
});

test('ruler ticks are at least 60 px apart', () => {
  const t = rulerTicks({ pps: 50, scroll: 0 }, 400);
  const majors = t.filter((x) => x.major).map((x) => x.t);
  expect(majors.slice(0, 3)).toEqual([0, 2, 4]);
  expect(t.filter((x) => !x.major && x.t < 2).length).toBe(4);
});

test('ruler labels stay whole seconds at normal zoom and tell sub-second steps apart at high zoom', () => {
  const labels = (pps: number, scroll = 0, w = 400) => rulerTicks({ pps, scroll }, w).filter((x) => x.major).map((x) => x.label);
  expect(labels(50).slice(0, 3)).toEqual(['0:00', '0:02', '0:04']);
  expect(labels(400, 59, 600)).toEqual(['0:59', '0:59.25', '0:59.50', '0:59.75', '1:00', '1:00.25', '1:00.50']);   // the 0.25 s step
  const close = labels(400, 0, 1000);
  expect(new Set(close).size).toBe(close.length);
  expect([rulerLabel(1.5, 0.5), rulerLabel(0.3, 0.1), rulerLabel(2, 0.5), rulerLabel(90, 10)]).toEqual(['0:01.5', '0:00.3', '0:02', '1:30']);
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

test('fitHeights: rows grow evenly to fill the timeline, never past ROW_H_MAX; collapsed rows stay thin', () => {
  const p = fixture(), times = resolveTimes(p), none = new Set<string>();
  const total = (h: typeof ROW_H, c = none) => { const rows = layoutRows(p, times, h, c); const l = rows[rows.length - 1]; return l.y + l.h; };
  const h0 = total(ROW_H), gaps = 2 * (layoutRows(p, times, ROW_H).length - 1);
  expect(fitHeights(p, times, ROW_H, none, h0 - 50)).toEqual(ROW_H);                      // no room to spare: as they are
  expect(fitHeights(p, times, ROW_H, none, 10000)).toEqual(ROW_H_MAX);                    // lots of room: every kind at its cap
  const k15 = fitHeights(p, times, ROW_H, none, gaps + 1.5 * (h0 - gaps));
  expect([k15.video, k15.scene, k15.music, k15.audio, k15.sfx]).toEqual([84, 54, 66, 66, 36]);
  const k18 = fitHeights(p, times, ROW_H, none, gaps + 1.8 * (h0 - gaps));
  expect(k18.video).toBe(96);                                                              // capped; the others take the rest
  expect(Math.abs(total(k18) - (gaps + 1.8 * (h0 - gaps)))).toBeLessThanOrEqual(6);
  const folded = new Set(['mu']), avail = total(ROW_H, folded) + 100;
  expect(Math.abs(total(fitHeights(p, times, ROW_H, folded, avail), folded) - avail)).toBeLessThanOrEqual(6);
  expect(layoutRows(p, times, fitHeights(p, times, ROW_H, folded, avail), folded).find((r) => r.track.id === 'mu')!.h).toBe(COLLAPSED_H);
});

test('only the stretch of a clip in view is drawn, widened to whole pieces so a small scroll does not redraw it', () => {
  expect(drawnSpan(200, 3000, 1100)).toEqual([0, 1024]);                     // starts in view
  expect(drawnSpan(-4200, 72000, 1100)).toEqual([4096, 6144]);               // a 3-minute song at 400 px/s, 10.5 s in
  expect(drawnSpan(-5000, 72000, 1100)).toEqual([4096, 6144]);               // the same pieces 2 s later
  const [a, b] = drawnSpan(2000, 500, 1100), [c, d] = drawnSpan(-9000, 500, 1100);   // right of the view, left of it
  expect([b <= a, d <= c]).toEqual([true, true]);
});
