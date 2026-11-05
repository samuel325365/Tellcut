// @vitest-environment jsdom
// common.emoji mode cover hides a face: unlike the sticker (which pops in, wobbles and fades), it must be whole on the item's first
// frame and its last, and it is a canvas, not DOM text, so check never measures it as words. jsdom has no 2D context: a stand-in
// records what is drawn.
import { createRegistry, Stage } from '@tellcut/engine';
import { emoji } from './emoji.ts';

interface Drawn { text: string; x: number; y: number; alpha: number; font: string; transform: number[]; rotated: boolean; clipped: number[] | null }
let drawn: Drawn[] = [];
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function () {
    const st = { globalAlpha: 1, font: '', transform: [1, 0, 0, 1, 0, 0], rotated: false, path: null as number[] | null, clip: null as number[] | null };
    const g: any = {
      canvas: this, fillStyle: '', strokeStyle: '', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0, textAlign: 'left', textBaseline: 'alphabetic',
      get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v: number) { st.globalAlpha = v; },
      get font() { return st.font; }, set font(v: string) { st.font = v; },
      setTransform: (...m: number[]) => { st.transform = m; }, rotate: () => { st.rotated = true; },
      clearRect() {}, save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, rect: (...r: number[]) => { st.path = r; }, clip: () => { st.clip = st.path; },
      measureText: () => ({ width: 100, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 100, actualBoundingBoxAscent: 90, actualBoundingBoxDescent: 10 }),
      fillText: (text: string, x: number, y: number) => drawn.push({ text, x, y, alpha: st.globalAlpha, font: st.font, transform: st.transform, rotated: st.rotated, clipped: st.clip }),
    };
    return g;
  };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
const W = 1080, H = 1920, FPS = 30;
const stageOf = (params: Record<string, unknown>, transform?: unknown) => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'x', items: [emoji] } as any]), media);
  st.load({ version: 1, meta: { width: W, height: H, fps: FPS, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type: 'common.emoji', start: 1, end: 3, params, ...(transform ? { transform } : {}) }] }] } as any);
  return { root, st };
};

test('cover: whole, opaque and still on the first frame and the last, at the same place; no DOM text for check to measure', () => {
  const { root, st } = stageOf({ mode: 'cover', char: '🌸', x: 0.4, y: 0.3, size: 20 });
  const at = (t: number) => { drawn = []; st.draw(t); expect(drawn).toHaveLength(1); return drawn[0]; };
  const first = at(1), last = at(3 - 1 / FPS), mid = at(2);
  for (const d of [first, last, mid]) {
    expect(d).toMatchObject({ text: '🌸', alpha: 1, rotated: false, clipped: null });
    expect(d.font).toContain(`${0.2 * W}px`);
  }
  expect(last).toEqual(first);
  expect(mid).toEqual(first);
  const cv = root.querySelector<HTMLCanvasElement>('canvas:last-of-type')!;
  expect(cv.style.opacity).toBe('');
  expect(cv.style.transform).toBe('');
  // the canvas is a square around the point: its middle is the point
  expect(parseFloat(cv.style.left) + parseFloat(cv.style.width) / 2).toBeCloseTo(0.4 * W);
  expect(parseFloat(cv.style.top) + parseFloat(cv.style.height) / 2).toBeCloseTo(0.3 * H);
  expect(root.textContent?.trim()).toBe('');
});

test('the sticker is not: it pops in from nothing and turns, so it cannot hide a face on the first frame', () => {
  const { root, st } = stageOf({ mode: 'sticker', char: '🌸' });
  st.draw(1);
  const d = [...root.querySelectorAll('div')].find((e) => e.textContent === '🌸' && !e.children.length)!;
  expect(Number(d.style.opacity)).toBe(0);
  st.draw(1.3);
  expect(d.style.transform).toMatch(/rotate\((?!0deg)/);
});

test('cover under a follow transform: drawn at the scale it shows at, and its box stays where it is on the frame', () => {
  // the layer scaled 3× about (0.5, 0.5) and moved up a tenth of the frame
  const { root, st } = stageOf({ mode: 'cover', char: '🌸', x: 0.5, y: 0.5, size: 10, box: '0.5,0,0.5,1' }, { x: 0, y: -0.1, scale: 3, ox: 0.5, oy: 0.5 });
  drawn = []; st.draw(2);
  const cv = root.querySelector<HTMLCanvasElement>('canvas:last-of-type')!, side = parseFloat(cv.style.width);
  expect(cv.width).toBe(Math.round(side * 3));
  expect(drawn[0].transform).toEqual([3, 0, 0, 3, 0, 0]);
  // the box's left edge is the frame's middle: in the layer that is its middle too (scaled about it), the canvas's middle
  expect(drawn[0].clipped![0]).toBeCloseTo(side / 2);
});

test('cover moves along its path', () => {
  const { st } = stageOf({ mode: 'cover', char: '🌸', size: 20, path: '0|0.2|0.5\n2|0.6|0.5|10' });
  drawn = []; st.draw(1); const a = drawn[0];
  drawn = []; st.draw(2); const b = drawn[0];
  expect(a.font).toContain(`${0.2 * W}px`);
  expect(b.font).toContain(`${0.15 * W}px`);
});

test('cover with a box: a moving cover is clipped by this frame\'s box only, whatever was drawn before (draw(t) is a pure function of t)', () => {
  // a real 2D context keeps its clip across frames while the canvas keeps its size, and clips intersect until restored
  const real = HTMLCanvasElement.prototype.getContext, ctxs = new WeakMap<HTMLCanvasElement, any>();
  (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement) {
    const old = ctxs.get(this);
    if (old && old.w === this.width && old.h === this.height) return old.g;
    const st = { path: null as number[] | null, clip: null as number[] | null, stack: [] as Array<number[] | null> };
    const meet = (a: number[] | null, b: number[]) => {
      if (!a) return b;
      const l = Math.max(a[0], b[0]), t = Math.max(a[1], b[1]), r = Math.min(a[0] + a[2], b[0] + b[2]), bt = Math.min(a[1] + a[3], b[1] + b[3]);
      return [l, t, Math.max(0, r - l), Math.max(0, bt - t)];
    };
    const g: any = {
      canvas: this, setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
      save: () => { st.stack.push(st.clip); }, restore: () => { st.clip = st.stack.pop() ?? null; },
      rect: (...r: number[]) => { st.path = r; }, clip: () => { st.clip = meet(st.clip, st.path!); },
      measureText: () => ({ width: 100, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 100, actualBoundingBoxAscent: 90, actualBoundingBoxDescent: 10 }),
      fillText: (text: string, x: number, y: number) => drawn.push({ text, x, y, alpha: 1, font: '', transform: [], rotated: false, clipped: st.clip }),
    };
    ctxs.set(this, { w: this.width, h: this.height, g });
    return g;
  };
  try {
    const params = { mode: 'cover', char: '🌸', size: 20, box: '0.3,0.3,0.4,0.4', path: '0|0.3|0.5\n2|0.7|0.5' };
    const at = (st: Stage, t: number) => { drawn = []; st.draw(t); return drawn[0].clipped; };
    const fresh = stageOf(params).st, walked = stageOf(params).st;
    for (const t of [1, 1.4, 1.8, 2.2]) at(walked, t);
    expect(at(walked, 2.6)).toEqual(at(fresh, 2.6));
  } finally { (HTMLCanvasElement.prototype as any).getContext = real; }
});
