// @vitest-environment jsdom
// common.panel: every look rounds its window by the video's own radius (raw px, as the stage draws the clip), on any frame size.
import { resolveTheme } from '@tellcut/engine';
import { panel } from './panel.ts';

afterEach(() => vi.restoreAllMocks());

function run(look: string, W: number, H: number) {
  const roundRects: number[] = [];
  const g: any = new Proxy({}, { get: (_t, k) => (k === 'roundRect' ? (...a: number[]) => roundRects.push(a[4]) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : typeof k === 'string' ? () => {} : undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
  const root = document.createElement('div'), params = { ...Object.fromEntries(panel.params.map((d) => [d.key, d.default])), look, radius: 28 } as any;
  const ctx: any = { root, params, W, H, t: 1, local: 1, dur: 3, theme: resolveTheme({}, { width: W, height: H }), item: { id: 'p', type: 'common.panel', start: 0, end: 3, params } };
  const s = panel.build(ctx);
  panel.draw(ctx, s);
  return { box: s.box, roundRects };
}

test('offset, bezel and hole round the window as the video is rounded: 28 px stays 28 px on a 720-wide frame', () => {
  expect(run('offset', 720, 1280).box.style.borderRadius).toBe('28px');
  expect(run('bezel', 720, 1280).box.style.borderRadius).toBe(`${28 + 12 * (720 / 1080)}px`);
  expect(run('hole', 720, 1280).roundRects).toEqual([28]);
});

test('on a 1080 short side nothing changes', () => {
  expect(run('offset', 1080, 1920).box.style.borderRadius).toBe('28px');
  expect(run('bezel', 1080, 1920).box.style.borderRadius).toBe('40px');
  expect(run('hole', 1920, 1080).roundRects).toEqual([28]);
});
