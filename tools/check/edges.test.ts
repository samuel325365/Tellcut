import { parseProject, resolveTimes } from '@tellcut/engine';
import { edgeFindings, tc2 } from './edges.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
const crop = { x: 0.5, y: 0.5, zoom: 1 };
const flash = { type: 'core.flash', params: { peak: 1, rise: 0, hold: 0, fall: 0.3, power: 1, color: '#fff' } };
const project = (clips: Array<Record<string, unknown>>, overlays: Array<Record<string, unknown>> = []) => parseProject({
  version: 1, meta: { name: 't', width: 1080, height: 1920, fps: 30, duration: 10, plugins: [], mix: MIX },
  sources: { a: { path: 'a.mp4', duration: 100, width: 1280, height: 720 }, ph: { path: 'p.jpg', duration: 5, width: 1280, height: 720, kind: 'image' } },
  media: {}, grids: [],
  tracks: [{ id: 'v1', kind: 'video', items: clips.map((c, i) => ({ id: `c${i}`, source: 'a', speed: 1, crop: { from: crop, to: crop }, ...c })) },
    { id: 'o1', kind: 'overlay', items: overlays.map((o) => ({ ...flash, ...o })) }],
});
const run = (p: ReturnType<typeof project>, cuts: Record<string, number[] | null>) => edgeFindings(p, resolveTimes(p), cuts);

test('a clip starting just before a shot change of its source shows the previous shot first; one ending just after it, the next shot', () => {
  const p = project([
    { start: 0, end: 2, in: 9.9 },        // the source changes shot at 10.0: the first 0.1 s is the shot before
    { start: 2, end: 4, in: 18.1 },       // ends at 20.1, the source changes at 20.0: the last 0.1 s is the next shot
    { start: 4, end: 6, in: 30 },         // a change in the middle (31.0) is the editor's own choice
    { start: 6, end: 8, in: 40.01 },      // a change 0.03 s after the in point is the in point itself (a frame at most)
  ]);
  const f = run(p, { a: [10, 20, 31, 40.04] });
  expect(f.map((x) => [x.ids, x.t])).toEqual([[['c0'], [0, 0.1]], [['c1'], [3.9, 4]]]);
  expect(f[0].msg).toContain('上一個鏡頭');
  expect(f[0].msg).toContain('進點往後移過 0:10.00');   // two decimals: following it lands past the change, not a frame short
  expect(f[1].msg).toContain('下一個鏡頭');
});

test('a frozen clip only shows its source up to the freeze; speed stretches the edge in film time', () => {
  const p = project([
    { start: 0, end: 4, in: 50, freezeAt: 1 },   // shows 50–51 and holds: a change at 53.9 is never on screen
    { start: 4, end: 6, in: 60, speed: 0.5 },    // shows 60–61: a change at 60.15 is 0.3 s of film
  ]);
  const f = run(p, { a: [53.9, 60.15] });
  expect(f.map((x) => [x.ids, x.t])).toEqual([[['c1'], [4, 4.3]]]);
});

test('a freeze just after a shot change holds the next shot to the clip end: the freeze point has to move (R3-E1)', () => {
  const p = project([
    { start: 0, end: 4, in: 50, freezeAt: 1 },   // the source changes at 50.9: the held frame is the next shot, 0.9–4.0
    { start: 4, end: 8, in: 60, freezeAt: 1 },   // a change 0.5 s before the freeze point: the editor froze on that shot
    { start: 8, end: 10, in: 70, freezeAt: 1 },  // a change 0.03 s after the freeze point: detection can be that frame off
  ]);
  const f = run(p, { a: [50.9, 60.5, 71.03] });
  expect(f.map((x) => [x.ids, x.t])).toEqual([[['c0'], [0.9, 4]], [['c2'], [9, 10]]]);
  expect(f[0].msg).toContain('停在畫面上 3.10 秒');
  expect(f[0].msg).toContain('定格點往前移，freezeAt 改到 0.85 以前');
  expect(f[0].msg).not.toContain('出點');
  expect(f[1].msg).toContain('可能已經是');
});

test('screen seconds in the message; a run counts when it is short in source or on screen (R3-E2)', () => {
  const p = project([
    { start: 0, end: 4, in: 9.7, speed: 0.25 },  // 0.3 s of the previous shot is 1.2 s on screen
    { start: 4, end: 6, in: 20, speed: 4 },      // 1.2 s of source before the change at 21.2 is 0.3 s on screen
    { start: 6, end: 8, in: 30, speed: 4 },      // 2 s of source (0.5 s on screen) before 32 is a shot of its own
  ]);
  const f = run(p, { a: [10, 21.2, 32] });
  expect(f.map((x) => [x.ids, x.t])).toEqual([[['c0'], [0, 1.2]], [['c1'], [4, 4.3]]]);
  expect(f[0].msg).toContain('片段開頭 1.20 秒（原片 0.30 秒）');
  expect(f[1].msg).toContain('片段開頭 0.30 秒（原片 1.20 秒）');
});

test('a run-in under the faded half of a transition does not show; a longer one does', () => {
  const p = project([
    { start: 0, end: 3, in: 18 },                                                // last 0.1 s (2.9–3) is the next shot, under c1's dissolve
    { start: 2.5, end: 5, in: 39.9, transitionIn: { type: 'dissolve', dur: 0.5 } }, // first 0.1 s still mostly faded out
    { start: 6, end: 8, in: 59.7, transitionIn: { type: 'slide', dur: 0.2 } },     // 0.3 s outlasts the 0.2 s slide
  ]);
  const f = run(p, { a: [20.9, 40, 60] });
  expect(f.map((x) => [x.ids, x.t])).toEqual([[['c2'], [6, 6.3]]]);
});

test('a seam where the next clip carries on from the same source second is no edge: the picture runs straight through', () => {
  const p = project([
    { start: 0, end: 2, in: 18 },      // ends at 20.0; the source changes at 19.9, and c1 goes on from 20.0
    { start: 2, end: 4, in: 20 },      // starts on the shot the change brought in: carries on, not a run-in
    { start: 4, end: 6, in: 30.2 },    // the source changes at 30.3; c2 does not follow on from c1 (22.0), so this one counts
    { start: 6, end: 8, in: 40, speed: 0.5 },   // ends at 41.0 (source); c4 jumps ahead to 41.5: not a continuation
    { start: 8, end: 10, in: 41.5, speed: 0.5 },
  ]);
  const f = run(p, { a: [19.9, 30.3, 40.9] });
  expect(f.map((x) => [x.ids, x.t])).toEqual([[['c2'], [4, 4.1]], [['c3'], [7.8, 8]]]);
});

test('an item placed by its parent is reported at its film time', () => {
  const p = project([{ start: 1, end: 3, in: 9.9, parent: 'o' }], [{ id: 'o', start: 3, end: 6 }]);
  expect(run(p, { a: [10] }).map((x) => x.t)).toEqual([[4, 4.1]]);
});

test('no analysis, or a photo, gives nothing', () => {
  const p = project([{ start: 0, end: 2, in: 9.9 }]);
  expect(run(p, { a: null })).toEqual([]);
  expect(run(project([{ start: 0, end: 2, in: 0, source: 'ph' }]), { ph: [0.1] })).toEqual([]);
});

test('tc2 keeps two decimals', () => {
  expect([tc2(10), tc2(65.044), tc2(59.996)]).toEqual(['0:10.00', '1:05.04', '1:00.00']);
});
