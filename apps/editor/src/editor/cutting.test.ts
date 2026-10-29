import { resolveTimes } from '@tellcut/engine';
import { fixture } from '../../../../packages/engine/src/commands/test-fixture.ts';
import { cutPoints, edgeTargets, nextCut } from './cutting.ts';

test('cutPoints and nextCut: nearest edge on any track, half a frame of slack, ends at 0 and the duration', () => {
  const p = fixture(), pts = cutPoints(p, resolveTimes(p));
  expect(pts[0]).toBe(0);
  expect(pts.at(-1)).toBe(20);
  expect(pts).toEqual([...pts].sort((a, b) => a - b));
  expect(new Set(pts).size).toBe(pts.length);
  expect(pts).toEqual(expect.arrayContaining([1, 2, 2.5, 3, 4, 6, 8, 10]));   // a1 1–3, blk 2–6 (tap at 2.5), c1 0–4, c2 4–8, m1 0–10
  expect(nextCut(pts, 4, 1, 25)).toBe(5);                // tap2 at 3 s into blk: 5–5.1
  expect(nextCut(pts, 4.01, -1, 25)).toBe(3);            // 4 itself is within half a frame (0.02 s): skipped
  expect(nextCut(pts, 4, -1, 25)).toBe(3);
  expect(nextCut(pts, 20, 1, 25)).toBe(20);              // nothing after: the end
  expect(nextCut(pts, 0, -1, 25)).toBe(0);
});

test('edgeTargets: the selection under the playhead; with none, the magnetic clip, else the top video clip; music and overlays never count', () => {
  const p = fixture(), times = resolveTimes(p), none = new Set<string>();
  expect(edgeTargets(p, times, 2, ['c1', 'm1', 'c2'], none)).toEqual(['c1', 'm1']);   // c2 is not under the playhead
  expect(edgeTargets(p, times, 2, ['blk'], none)).toBeNull();                          // a block has no media to cut
  expect(edgeTargets(p, times, 2, [], none)).toEqual(['c1']);                          // m1 and a1 are under it too: not counted
  (p.tracks.find((t) => t.id === 'v2')!.items as any[]).push({ id: 'top', source: 's', in: 0, speed: 1, start: 1, end: 3, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
  expect(edgeTargets(p, resolveTimes(p), 2, [], none)).toEqual(['top']);               // v2 is drawn above v
  (p.tracks.find((t) => t.id === 'v') as any).magnetic = true;
  expect(edgeTargets(p, resolveTimes(p), 2, [], none)).toEqual(['c1']);                // the magnetic track comes first
  expect(edgeTargets(p, resolveTimes(p), 2, [], new Set(['v']))).toEqual(['top']);     // a skipped (locked) track is passed over
});

test('edgeTargets: a clip and its own sound selected together count once (trimming the clip trims the sound)', () => {
  const p = fixture();
  (p.tracks.find((t) => t.id === 'au')!.items as any[]).push({ id: 'o1', source: 's', in: 1, rate: 1, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' });
  expect(edgeTargets(p, resolveTimes(p), 2, ['c1', 'o1'], new Set())).toEqual(['c1']);
});

test('edgeTargets: another sound hung on a selected clip is cut too when it is selected (only the own sound goes with the clip)', () => {
  const p = fixture();
  (p.tracks.find((t) => t.id === 'au')!.items as any[]).push({ id: 'n1', source: 'a', in: 0, rate: 1, start: 0.5, end: 3, gain: 0, fadeIn: 0, fadeOut: 0, parent: 'c1' });
  expect(edgeTargets(p, resolveTimes(p), 2, ['c1', 'n1'], new Set())).toEqual(['c1', 'n1']);
});

test('edgeTargets: nothing under the playhead, or an empty project → null', () => {
  const p = fixture();
  expect(edgeTargets(p, resolveTimes(p), 15, [], new Set())).toBeNull();
  p.tracks = [];
  expect(edgeTargets(p, resolveTimes(p), 1, [], new Set())).toBeNull();
  expect(cutPoints(p, resolveTimes(p))).toEqual([0, 20]);
});
