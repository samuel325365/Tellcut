// @vitest-environment jsdom
// common.frame is a scene block, under the video, and the clip that plays in its window (frame: frameWindow(params)) lies above it.
// While the frame came in, turned over or showed its back, that clip played on in the window over it (acceptance film E3: the
// back of a turned frame never showed). Not settled, the object and the desk inside the window go into the top container, above
// the clip; settled, back under the video, where the clip plays through the hole.
import { createRegistry, Stage } from '@tellcut/engine';
import { frame, frameWindow } from './frame.ts';

// jsdom has no 2D context: a stand-in that takes any call (as hide.dom.test.ts)
const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video: () => document.createElement('video'), place() {}, stillUrl: () => 'still.jpg', fileUrl: () => '', sync: async () => {}, image() {} };
const W = 1080, H = 1920;
const project = (params: Record<string, unknown>): any => ({
  version: 1, meta: { width: W, height: H, fps: 30, duration: 6, background: '#000', plugins: [] },
  sources: { s: { path: 's.mp4', duration: 60, width: 1280, height: 720, kind: 'video', audio: false } }, media: {}, grids: [],
  tracks: [
    { id: 'bgfx', kind: 'scene', items: [{ id: 'f', type: 'common.frame', start: 0, end: 5, params: { source: 's', ...params } }] },
    { id: 'v1', kind: 'video', items: [{ id: 'c', source: 's', in: 10, speed: 0.5, start: 0, end: 5, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, frame: frameWindow(params, W, H) }] },
  ],
});

function stage(params: Record<string, unknown>) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [frame] } as any]), media);
  st.load(project(params));
  const top = root.querySelector('.st-top')!, item = root.querySelector('.st-item[data-id="f"]')!;
  // the moving object: the one element turned and scaled by the pose
  const obj = () => [...root.querySelectorAll('div')].find((d) => d.style.transform.includes('rotate('))!;
  const at = (t: number) => { st.draw(t); return top.contains(obj()) ? 'over the clip' : item.contains(obj()) ? 'under the clip' : 'nowhere'; };
  const patch = () => top.querySelector('canvas')!;
  return { at, patch };
}

test('frame: coming in, turned over and leaving it lies over the clip in its window; settled, under it', () => {
  const f = stage({ backdrop: 'desk', flipAt: 2, flipDur: 0.8, exit: 'left', exitDur: 0.6 });
  expect(f.at(0.3)).toBe('over the clip');     // dropping in (enterDur 0.7)
  expect(f.at(1.0)).toBe('under the clip');    // settled: the clip plays through the hole
  expect(f.at(2.4)).toBe('over the clip');     // edge-on
  expect(f.patch().style.display).toBe('block');   // the desk covers the bare part of the window
  expect(f.patch().width).toBeGreaterThan(1);
  expect(f.at(3.5)).toBe('over the clip');     // its back faces us
  expect(f.at(4.7)).toBe('over the clip');     // leaving
});

test('frame: live off stays under the video as before; without a backdrop nothing covers the bare window', () => {
  expect(stage({ live: false, flipAt: 1 }).at(2.5)).toBe('under the clip');
  const none = stage({ backdrop: 'none', flipAt: 1 });
  expect(none.at(2.5)).toBe('over the clip');
  expect(none.patch().style.display).toBe('none');  // no desk to cover with
});
