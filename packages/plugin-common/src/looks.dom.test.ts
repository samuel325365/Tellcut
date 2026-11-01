// @vitest-environment jsdom
// acceptance films 2026-11-01 (E1/V1 polaroid, E2 snap, X2 paper): the polaroid's crop and font, snap's window, paper's doodles and
// signature, drawn on a stage. jsdom lays nothing out and the canvas is a stand-in: these check the elements, the golden pictures how
// it looks.
import { createRegistry, Stage } from '@tellcut/engine';
import { paper } from './paper.ts';
import { polaroid, polaroidCrop } from './polaroid.ts';
import { snap, snapWindow } from './snap.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => 'still.jpg', fileUrl: () => '', sync: async () => {}, image() {} };

function stage(type: string, params: Record<string, unknown>, t = 1.5) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [polaroid, snap, paper] } as any]), media);
  st.load({
    version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: { v: { path: 'v.mp4', duration: 60, width: 1280, height: 720, kind: 'video', audio: false } }, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'i', type, start: 0, end: 3, params }] }],
  } as any);
  st.draw(t);
  return { root, st };
}

test('polaroid: crop is { x, y, zoom } like a clip’s, the middle at zoom 1 being the plain cover', () => {
  expect(polaroidCrop(undefined)).toBeNull();
  expect(polaroidCrop({ x: 0.5, y: 0.5, zoom: 1 })).toBeNull();
  expect(polaroidCrop({ x: 0.3 })).toEqual({ x: 0.3, y: 0.5, zoom: 1 });
  expect(polaroidCrop({ x: 2, y: -1, zoom: 0.5 })).toEqual({ x: 1, y: 0, zoom: 1 });
  expect(polaroid.params.find((p) => p.key === 'crop')).toMatchObject({ type: 'json', default: { x: 0.5, y: 0.5, zoom: 1 } });
});

test('polaroid: a crop places the loaded still in the photo window like a clip; without one it covers the window', () => {
  const { root, st } = stage('common.polaroid', { source: 'v', t: 2, crop: { x: 0.2, y: 0.5, zoom: 1.5 } });
  const img = root.querySelector('img')!;
  Object.defineProperty(img, 'naturalWidth', { value: 1280 }); Object.defineProperty(img, 'naturalHeight', { value: 720 });
  st.draw(1.6);
  expect(img.parentElement!.style.overflow).toBe('hidden');
  expect([img.style.position, img.style.objectFit]).toEqual(['absolute', 'fill']);
  expect(parseFloat(img.style.width)).toBeGreaterThan(parseFloat(img.parentElement!.style.height) * 1.5);
  const plain = stage('common.polaroid', { source: 'v', t: 2 }).root.querySelector('img')!;
  expect([plain.style.objectFit, plain.style.width, plain.style.position]).toEqual(['cover', '100%', '']);
});

test('polaroid: the font is the theme’s display font unless set, and the doc says how to make it handwritten', () => {
  const text = (params: Record<string, unknown>) => [...stage('common.polaroid', { caption: '最棒的一刻', ...params }).root.querySelectorAll('div')].filter((d) => d.textContent === '最棒的一刻').pop()!;
  expect(text({ font: 'LXGW WenKai TC' }).style.fontFamily).toMatch(/^"?LXGW WenKai TC/);
  expect(polaroid.doc).toMatch(/LXGW WenKai TC/);
});

test('snap: window is four numbers with a size, else the whole frame', () => {
  expect(snapWindow([])).toBeNull();
  expect(snapWindow([0.1, 0.2, 0, 0.5])).toBeNull();
  expect(snapWindow([0.1, 0.2, 0.8, 0.5])).toEqual([0.1, 0.2, 0.8, 0.5]);
  expect(snap.params.find((p) => p.key === 'window')).toMatchObject({ type: 'json', default: [] });
});

test('snap: by default the border frames the whole picture; with a window it goes round the window, the date in its corner', () => {
  const frameOf = (root: HTMLElement) => [...root.querySelectorAll('div')].find((d) => d.style.border.includes('solid'))!;
  const whole = frameOf(stage('common.snap', {}, 0.5).root);
  expect([whole.style.left, whole.style.top, whole.style.width, whole.style.height]).toEqual(['0px', '0px', '100%', '100%']);
  const { root } = stage('common.snap', { window: [0.1, 0.2, 0.8, 0.5], border: 20, date: '6 25' }, 0.5);
  const f = frameOf(root);
  expect([f.style.left, f.style.top, f.style.width, f.style.height]).toEqual(['88px', '364px', '904px', '1000px']);
  const stamp = [...root.querySelectorAll('div')].filter((d) => d.textContent === '6 25').pop()!;
  expect(parseFloat(stamp.style.right)).toBeCloseTo(1080 - 0.9 * 1080 + 20, 3);
  expect(parseFloat(stamp.style.top)).toBeLessThan(0.7 * 1920);
});

test('paper: the doodles can be chosen or left out, the signature changed or left out, and the doc says so', () => {
  expect(paper.params.find((p) => p.key === 'doodleSet')).toMatchObject({ type: 'enum', default: 'kitchen', options: ['kitchen', 'journal', 'travel'] });
  expect(paper.doc).toMatch(/doodleSet/);
  expect(paper.doc).toMatch(/doodles: false/);
  expect(paper.doc).toMatch(/sign 換簽名的字、空＝不要/);
  for (const doodleSet of ['kitchen', 'journal', 'travel']) expect(() => stage('common.paper', { doodleSet })).not.toThrow();
  const sign = (params: Record<string, unknown>) => [...stage('common.paper', params).root.querySelectorAll('div')].filter((d) => d.style.fontStyle === 'italic').pop()!;
  expect([sign({}).textContent, sign({}).style.display]).toEqual(['Recipe', 'block']);
  expect(sign({ sign: '' }).style.display).toBe('none');
  expect(sign({ sign: 'Day 3' }).textContent).toBe('Day 3');
});
