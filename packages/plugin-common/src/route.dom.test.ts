// @vitest-environment jsdom
// common.route's card: the pencil streets fade in over their first second instead of appearing all at once. jsdom has no canvas,
// so a stand-in context records the alpha each stroke is drawn with; the golden pictures check how it looks.
import { createRegistry, Stage } from '@tellcut/engine';
import { route } from './route.ts';

interface Stroke { style: string; alpha: number }
let strokes: Stroke[] = [];
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function () {
    const g: any = { globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, canvas: this, measureText: () => ({ width: 10 }) };
    return new Proxy(g, {
      get: (t, k) => (k in t ? t[k] : k === 'stroke' ? () => strokes.push({ style: String(t.strokeStyle), alpha: t.globalAlpha }) : () => undefined),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });
const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };

/** the alpha of the streets' first (wide) pass at t: drawn in the ink at 0.28 */
function streetAlpha(t: number): number[] {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [route] } as any]), media);
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'r', type: 'common.route', start: 0, end: 3.5, params: {} }] }] } as any);
  strokes = [];
  st.draw(t);
  return strokes.filter((s) => s.style.endsWith('0.28)')).map((s) => s.alpha);
}

test('card: the streets fade in from 0.3 s to 1.1 s, then stay fully drawn', () => {
  expect(streetAlpha(0.2)).toEqual([]);
  const early = streetAlpha(0.35), mid = streetAlpha(0.6), late = streetAlpha(2);
  expect(early.length).toBeGreaterThan(0);
  expect(Math.max(...early)).toBeLessThan(0.3);
  expect(Math.max(...mid)).toBeGreaterThan(Math.max(...early));
  expect(Math.max(...mid)).toBeLessThan(1);
  expect(Math.max(...late)).toBe(1);
});
