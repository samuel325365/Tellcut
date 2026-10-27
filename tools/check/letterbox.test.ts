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
