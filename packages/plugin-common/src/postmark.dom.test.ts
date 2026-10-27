// @vitest-environment jsdom
// Review 4: the postmark and the stamp were painted at 1080 units and stretched by CSS, soft on a 4K frame. Their canvases now hold
// as many pixels as the frame shows (never fewer than before: a 1080 frame looks the same). jsdom has no 2D context: a stand-in.
import { createRegistry, Stage } from '@tellcut/engine';
import { drawMark, drawStamp, markEl, markSize, postmark, STAMP_H, STAMP_W, stampEl } from './postmark.ts';
import { postcard } from './postcard.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const real = { getContext: HTMLCanvasElement.prototype.getContext, toDataURL: HTMLCanvasElement.prototype.toDataURL };
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : t[k]) }); };
  HTMLCanvasElement.prototype.toDataURL = () => 'data:,';
});
afterAll(() => Object.assign(HTMLCanvasElement.prototype, real));

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
const project = (type: string, width: number, height: number): any => ({
  version: 1, meta: { width, height, fps: 30, duration: 3, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
  tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type, start: 0, end: 3, params: {} }] }],
});
/** the canvases of a block drawn at 1 s on a W×H frame (not the ones never drawn), as "backing width / css width" */
function ratios(type: typeof postmark | typeof postcard, W: number, H: number) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [type] } as any]), media);
  st.load(project(type.type, W, H));
  st.draw(1);
  return [...root.querySelectorAll('canvas')].filter((c) => c.style.width.endsWith('px') && !(c.width === 300 && c.height === 150)).map((c) => c.width / parseFloat(c.style.width));
}

test('drawMark and drawStamp paint at dpr device pixels per px; at dpr 1 (stamp: 2) as before', () => {
  const m = markEl(document.createElement('div')), S = markSize(74);
  drawMark(m, { top: 'A', bottom: 'B', date: '1' }, 74, 100, 100, 1, true, '#000');
  expect([m.cv.width, m.cv.height, m.cv.style.width]).toEqual([S.w, S.h, `${S.w}px`]);
  drawMark(m, { top: 'A', bottom: 'B', date: '1' }, 74, 100, 100, 1, true, '#000', true, 0.82, 2);
  expect([m.cv.width, m.cv.height, m.cv.style.width]).toEqual([S.w * 2, S.h * 2, `${S.w}px`]);
  const st = stampEl(document.createElement('div'));
  drawStamp(media, st, { label: 'FRANCE' }, null, 0, 0, 0, 1.9);
  expect([st.cv.width, st.cv.height]).toEqual([STAMP_W * 2, STAMP_H * 2]);
  drawStamp(media, st, { label: 'FRANCE' }, null, 0, 0, 0, 1.9, 3.8);
  expect([st.cv.width, st.cv.height]).toEqual([Math.ceil(STAMP_W * 3.8), Math.ceil(STAMP_H * 3.8)]);
});

test('postmark and postcard: on a 4K frame the postmark, the stamps and the card paper hold the pixels they show', () => {
  for (const type of [postmark, postcard]) {
    const hd = ratios(type, 1080, 1920), uhd = ratios(type, 2160, 3840);
    expect(hd.length).toBeGreaterThan(0);
    expect(uhd.length).toBe(hd.length);
    for (const r of hd) expect([1, 2]).toContain(r);           // 1080: as before (the stamp's paper was always drawn at 2)
    for (const r of uhd) expect(r).toBeGreaterThanOrEqual(2);   // 4K: the layer is scaled by 2
  }
  // common.postmark's stamp is scaled up by its size too (13 % of the short side: 1.9 times): 3.8 device px per stamp px at 4K
  expect(Math.max(...ratios(postmark, 2160, 3840))).toBeCloseTo(3.8, 1);
});
