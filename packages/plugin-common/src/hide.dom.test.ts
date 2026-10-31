// @vitest-environment jsdom
// Review 4: a full-frame 2D canvas kept its pixels (about 8 MB at 1080×1920) for as long as the item lived, shown or not. hide()
// gives them back; the next draw sizes and paints them again (a block that paints once per key clears its key), so a frame drawn
// after hiding is the same as before. jsdom has no 2D context: a stand-in that takes any call is enough to see the sizes.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { ambient } from './ambient.ts';
import { caption } from './caption.ts';
import { chart } from './chart/index.ts';
import { emoji } from './emoji.ts';
import { frame } from './frame.ts';
import { gauge } from './gauge.ts';
import { mapcam } from './mapcam.ts';
import { mapjump } from './mapjump.ts';
import { meter } from './meter.ts';
import { outro } from './outro.ts';
import { panel } from './panel.ts';
import { paper } from './paper.ts';
import { pen } from './pen.ts';
import { postcard } from './postcard.ts';
import { printer } from './printer.ts';
import { progress } from './progress.ts';
import { route } from './route.ts';
import { shader } from './shader.ts';
import { sparkle } from './sparkle.ts';
import { speedlines } from './speedlines.ts';
import { strike } from './strike.ts';
import { tag } from './tag.ts';
import { timelapse } from './timelapse.ts';
import { touch } from './touch.ts';
import { wipe } from './wipe.ts';
import { worldmap } from './worldmap.ts';

// a 2D context (and whatever it hands back) that accepts anything: a number where one is read, a no-op where one is called
const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
const W = 1080, H = 1920;
const project = (type: string, params: Record<string, unknown>): any => ({
  version: 1, meta: { width: W, height: H, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
  tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type, start: 0, end: 3, params }] }],
});
// a canvas never drawn keeps the 300×150 it was made with: counted as nothing
const areas = (root: HTMLElement) => [...root.querySelectorAll('canvas')].map((c) => (c.width === 300 && c.height === 150 ? 0 : c.width * c.height));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const CASES: Array<[ItemType<any, any>, Record<string, unknown>]> = [
  [ambient, {}], [caption, { style: 'crayon' }], [chart, {}], [emoji, { mode: 'float' }], [frame, { backdrop: 'desk' }], [gauge, {}], [mapcam, {}], [mapjump, {}],
  [meter, { look: 'ruler' }], [outro, {}], [panel, { look: 'hole' }], [paper, {}], [pen, { style: 'crayon' }], [pen, { kind: 'trace' }], [postcard, {}], [printer, {}], [progress, { mode: 'timeline' }], [route, {}],
  [route, { look: 'page' }], [shader, {}], [sparkle, {}], [speedlines, {}], [strike, {}], [tag, { look: 'pin' }], [timelapse, {}], [touch, {}],
  [wipe, { mode: 'hand' }], [worldmap, {}],
];

test.each(CASES.map(([t, p]) => [`${t.type} ${JSON.stringify(p)}`, t, p] as const))('%s: hide() frees its canvases, the next draw makes them again', (_n, t, params) => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'x', items: [t] } as any]), media);
  st.load(project(t.type, params));
  st.draw(1.5);
  const shown = areas(root);
  expect(sum(shown)).toBeGreaterThan(0);
  st.draw(3.5);                                                   // past the item: the stage hides it
  const hidden = areas(root);
  expect(Math.max(...hidden)).toBeLessThanOrEqual(512 * 512);     // what stays is small (postcard's stamps and postmarks)
  expect(sum(hidden)).toBeLessThanOrEqual(sum(shown) * 0.1);
  st.draw(1.5);
  expect(areas(root)).toEqual(shown);
});
