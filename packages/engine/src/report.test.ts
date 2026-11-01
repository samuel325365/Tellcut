// @vitest-environment jsdom
import { canvasTextBox, reportedBoxes, type TextCanvas } from './report.ts';
import { Stage } from './stage.ts';
import { createRegistry } from './registry.ts';
import type { ItemType } from './plugin.ts';

/** a 2D context as far as canvasTextBox reads it: 10 px of advance a letter, a 48 px font with a 1.16 / 0.29 em line box */
function fakeG(o: { font?: string; align?: CanvasTextAlign; alpha?: number; m?: [number, number, number, number, number, number]; canvas?: unknown } = {}): TextCanvas & { canvas: any } {
  const [a, b, c, d, e, f] = o.m ?? [1, 0, 0, 1, 0, 0];
  const align = o.align ?? 'left';
  return {
    font: o.font ?? '700 48px "Noto Sans TC"', globalAlpha: o.alpha ?? 1, textAlign: align, textBaseline: 'alphabetic', canvas: o.canvas,
    measureText: (s: string) => { const w = s.length * 10, left = align === 'center' ? w / 2 : align === 'right' ? w : 0;
      return { width: w, actualBoundingBoxLeft: left, actualBoundingBoxRight: w - left, fontBoundingBoxAscent: 55.68, fontBoundingBoxDescent: 13.92 } as TextMetrics; },
    getTransform: () => ({ a, b, c, d, e, f }) as DOMMatrix,
  };
}

test('canvasTextBox: the line box of fillText through the alignment and the transform, its type size scaled', () => {
  expect(canvasTextBox(fakeG(), 'Hello', 100, 200)).toEqual({ x: 100, y: 200 - 55.68, w: 50, h: 69.6, size: 48 });
  expect(canvasTextBox(fakeG({ align: 'center' }), 'Hello', 100, 200)).toMatchObject({ x: 75, w: 50 });
  // scaled by 2 and moved: the box and the type size follow
  const b = canvasTextBox(fakeG({ m: [2, 0, 0, 2, 10, 20] }), 'Hi', 0, 0)!;
  expect(b).toMatchObject({ x: 10, y: 20 - 111.36, w: 40, size: 96 });
  expect(b.h).toBeCloseTo(139.2);
  // maxWidth squeezes it across, as fillText does
  expect(canvasTextBox(fakeG(), 'Hello', 0, 100, 25)).toMatchObject({ w: 25, size: 48 });
  // nothing to see: blank words, nearly transparent ones
  expect(canvasTextBox(fakeG(), '  ', 0, 0)).toBeNull();
  expect(canvasTextBox(fakeG({ alpha: 0.02 }), 'Hi', 0, 0)).toBeNull();
});

const media: any = { begin() {}, place() {}, sync: async () => {}, video: () => document.createElement('video'), stillUrl: () => '', fileUrl: (p: string) => p };
const project = (): any => ({ version: 1, meta: { width: 200, height: 100, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
  tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'w', type: 'fx.words', start: 0, end: 2, params: {} }, { id: 'late', type: 'fx.words', start: 3, end: 4, params: {} }] }] });

/** an fx that draws on a canvas in the page, on an offscreen one, gives a box of its own, and hosts a copy of itself in a window */
const words: ItemType = {
  type: 'fx.words', label: 'w', kind: 'overlay', params: [],
  build(ctx) { const cv = document.createElement('canvas'); cv.width = 400; cv.height = 200; ctx.root.appendChild(cv); return { cv, win: Object.assign(document.createElement('div'), { id: 'win' }) }; },
  draw(ctx, s) {
    ctx.reportText(fakeG({ canvas: s.cv }) as any, 'on page', 10, 60);
    ctx.reportText(fakeG({ canvas: document.createElement('canvas') }) as any, 'offscreen', 0, 60);
    ctx.reportText({ text: '3D', x: 5, y: 6, w: 7, h: 8, size: 8 });
    const hosted = { ...ctx, root: s.win, W: 50, H: 25 };
    hosted.reportText({ text: 'inside', x: 0, y: 0, w: 10, h: 5, size: 5 });
  },
};

test('ctx.reportText: kept only while measuring, for this draw only; a canvas in the page, an offscreen one and a box each have their frame', () => {
  const plain = new Stage(document.createElement('div'), createRegistry([{ id: 'fx', items: [words] }]), media);
  plain.load(project());
  plain.draw(1);
  expect(plain.textReports()).toEqual([]);

  const root = document.createElement('div');
  document.body.appendChild(root);
  const st = new Stage(root, createRegistry([{ id: 'fx', items: [words] }]), media, { measure: true });
  st.load(project());
  st.draw(1);
  const r = st.textReports(), item = root.querySelector('.st-item[data-id="w"]')!, cv = item.querySelector('canvas')!;
  expect(r.map((x) => [x.id, x.text])).toEqual([['w', 'on page'], ['w', 'offscreen'], ['w', '3D'], ['w', 'inside']]);
  expect(r[0]).toMatchObject({ el: cv, pw: 400, ph: 200, x: 10, size: 48 });   // through its own canvas
  expect(r[1]).toMatchObject({ el: item, pw: 200, ph: 100 });                    // offscreen: 1:1 over the item's frame
  expect(r[2]).toMatchObject({ el: item, pw: 200, ph: 100, x: 5, y: 6, w: 7, h: 8, size: 8 });
  expect(r[3]).toMatchObject({ pw: 50, ph: 25 });   // the hosted block's own frame
  expect((r[3].el as HTMLElement).id).toBe('win');
  // the next frame starts empty: an item off screen reports nothing
  st.draw(2.5);
  expect(st.textReports()).toEqual([]);
  // a report that cannot be read is dropped, never thrown into the draw
  const bad: ItemType = { ...words, draw(ctx) { ctx.reportText({ text: 'x' } as any); ctx.reportText(null as any, 'y', 0, 0); } };
  const st2 = new Stage(document.createElement('div'), createRegistry([{ id: 'fx', items: [bad] }]), media, { measure: true, onError: (_i, m) => { throw new Error(m); } });
  st2.load(project());
  expect(() => st2.draw(1)).not.toThrow();
  expect(st2.textReports()).toEqual([]);
  root.remove();
});

test('reportedBoxes: each report placed through its element\'s on-screen box, in project pixels; hidden ones left out', () => {
  const stage = document.createElement('div'), cv = document.createElement('canvas'), gone = document.createElement('div');
  stage.append(cv, gone);
  document.body.appendChild(stage);
  const rect = (x: number, y: number, w: number, h: number) => () => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON() {} }) as DOMRect;
  // the stage shown at half size (a 200 px project in 100 px); the canvas, 400 px wide, shown 50 px wide 10 px in: a quarter of a
  // project pixel per canvas pixel
  stage.getBoundingClientRect = rect(0, 0, 100, 50);
  cv.getBoundingClientRect = rect(10, 5, 50, 25);
  gone.getBoundingClientRect = rect(0, 0, 100, 50);
  const out = reportedBoxes(stage, 200, [
    { id: 'a', text: 'Hi', size: 48, x: 40, y: 20, w: 80, h: 40, el: cv, pw: 400, ph: 200 },
    { id: 'b', text: 'no', size: 48, x: 0, y: 0, w: 10, h: 10, el: gone, pw: 200, ph: 100 },
  ], (el) => el !== gone);
  expect(out).toEqual([{ id: 'a', rects: [{ x: 30, y: 15, w: 20, h: 10, size: 12, text: 'Hi' }] }]);
  stage.remove();
});
