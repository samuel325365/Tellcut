import { parseProject, resolveTimes } from '@tellcut/engine';
import { barred, edgesOf, LB_H, LB_W, letterboxFindings, type Active } from './letterbox.ts';

/** a gray frame: picture (value 120 with grain) inside [x0,y0,x1,y1] rows/columns, black (16) outside */
function frame(x0: number, y0: number, x1: number, y1: number, fill = 120) {
  const g = new Uint8Array(LB_W * LB_H).fill(16);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * LB_W + x] = fill + ((x * 7 + y * 13) % 9);
  return g;
}

test('the black edge rows and columns are trimmed; a dark picture with grain is not black; an all-black frame has no picture', () => {
  expect(edgesOf(frame(0, 15, LB_W, 75))).toEqual([0, 15 / LB_H, 1, 75 / LB_H]);                 // letterbox
  expect(edgesOf(frame(20, 0, 140, LB_H))).toEqual([20 / LB_W, 0, 140 / LB_W, 1]);                 // pillarbox
  expect(edgesOf(frame(0, 0, LB_W, LB_H, 22))).toEqual([0, 0, 1, 1]);                               // deep water: dark, but grain above the black level
  expect(edgesOf(new Uint8Array(LB_W * LB_H).fill(16))).toBeNull();
});

test('a bar is one that stays: a lone sample or a tiny lit spot is not a bar', () => {
  const s = (t: number, box: Active['box']): Active => ({ t, box });
  const lb: Active['box'] = [0, 0.17, 1, 0.9];
  expect(barred([s(0, lb), s(0.5, lb), s(1, [0, 0, 1, 1])]).map((x) => x.t)).toEqual([0, 0.5]);
  expect(barred([s(0, [0, 0, 1, 1]), s(0.5, lb), s(1, [0, 0, 1, 1])])).toEqual([]);                  // one sample: a cut, not a bar
  expect(barred([s(0, [0.4, 0.4, 0.6, 0.6]), s(0.5, [0.4, 0.4, 0.6, 0.6])])).toEqual([]);              // a lit spot in the dark
  // a portrait picture pillarboxed in a landscape file keeps (9/16)² ≈ 31.6 % of it: still bars (CC4)
  const side: Active['box'] = [0.342, 0, 0.658, 1];
  expect(barred([s(0, side), s(0.5, side)]).map((x) => x.t)).toEqual([0, 0.5]);
  expect(barred([s(0, [0.3, 0.3, 0.7, 0.7]), s(0.5, [0.3, 0.3, 0.7, 0.7])])).toEqual([]);              // 16 %: a lit area, not a picture
});

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
const project = (crop: { x: number; y: number; zoom: number }) => parseProject({ version: 1, meta: { name: 't', width: 1080, height: 1920, fps: 30, duration: 10, plugins: [], mix: MIX },
  sources: { v: { path: 'v.mp4', duration: 60, width: 1920, height: 1080 } }, media: {}, grids: [],
  // a 16:9 panel in a portrait film, the source showing 10–20 s at film 0–10 s
  tracks: [{ id: 'v1', kind: 'video', items: [{ id: 'c', source: 'v', in: 10, speed: 1, start: 0, end: 10, frame: [0.04, 0.2, 0.92, 0.5], crop: { from: crop, to: crop } }] }] });

test('a bar inside the part of the source on screen is reported where it shows; one cropped away is not', () => {
  // source letterboxed: black above 17 % and below 90 %, from source 12 s to 14 s
  const bars = { c: [12, 12.5, 13, 13.5, 14].map((t): Active => ({ t, box: [0, 0.17, 1, 0.9] })) };
  const top = { x: 0.5, y: 0, zoom: 1.4 };
  const p = project(top), f = letterboxFindings(p, resolveTimes(p), bars);
  expect(f.map((x) => [x.level, x.t, x.ids])).toEqual([['warn', [2, 4], ['c']]]);
  expect(f[0].msg).toMatch(/原片自己的黑邊露出來了（上方約 \d+% 畫面高度，0:02\.0–0:04\.0）/);
  // zoomed in on the middle far enough that neither bar is inside the frame
  const mid = project({ x: 0.5, y: 0.53, zoom: 1.6 });
  expect(letterboxFindings(mid, resolveTimes(mid), bars)).toEqual([]);
});

test('a frozen clip: bars past the freeze point are never on screen; the held frame\'s bars stay up to the clip\'s end', () => {
  const top = { x: 0.5, y: 0, zoom: 1.4 }, freeze = (at: number) => { const p = project(top); (p.tracks[0].items[0] as any).freezeAt = at; return p; };
  // source 12–14 s barred; frozen at 1 s (source 11): the picture never reaches the bars
  const bars = { c: [12, 12.5, 13, 13.5, 14].map((t): Active => ({ t, box: [0, 0.17, 1, 0.9] })) };
  const early = freeze(1);
  expect(letterboxFindings(early, resolveTimes(early), bars)).toEqual([]);
  // frozen at 3 s (source 13), on a barred frame: bars from 2 s through the held frame to the clip's end
  const held = freeze(3), barsTo13 = { c: [12, 12.5, 13].map((t): Active => ({ t, box: [0, 0.17, 1, 0.9] })) };
  expect(letterboxFindings(held, resolveTimes(held), barsTo13).map((x) => x.t)).toEqual([[2, 10]]);
});

test('a side bar is said as a share of the frame\'s width, a top or bottom one of its height', () => {
  // a pillarboxed source (picture between 20 % and 80 % of its width) full screen in a landscape film
  const wide = parseProject({ version: 1, meta: { name: 't', width: 1920, height: 1080, fps: 30, duration: 10, plugins: [], mix: MIX },
    sources: { v: { path: 'v.mp4', duration: 60, width: 1920, height: 1080 } }, media: {}, grids: [],
    tracks: [{ id: 'v1', kind: 'video', items: [{ id: 'c', source: 'v', in: 10, speed: 1, start: 0, end: 10, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] }] });
  const bars = { c: [12, 12.5, 13].map((t): Active => ({ t, box: [0.2, 0, 0.8, 1] })) };
  expect(letterboxFindings(wide, resolveTimes(wide), bars)[0].msg).toMatch(/（左邊約 20% 畫面寬度，/);
});
