// @vitest-environment jsdom
// common.polaroid's hand-written line shrinks to stay on the print.
import { resolveTheme } from '@tellcut/engine';
import { polaroid } from './polaroid.ts';

function caption(text: string) {
  const W = 1080, H = 1920, root = document.createElement('div');
  const params = { ...Object.fromEntries(polaroid.params.map((d) => [d.key, d.default])), caption: text, source: '' } as any;
  const ctx: any = { root, params, W, H, t: 1, local: 1, dur: 3, theme: resolveTheme({}, { width: W, height: H }), item: { id: 'p', type: 'common.polaroid', start: 0, end: 3, params }, media: { stillUrl: () => '' } };
  const s = polaroid.build(ctx), w = (params.size / 100) * 1080;
  return { px: parseFloat(s.text.style.fontSize), w };
}

test('a short line keeps its size; a long one shrinks to the print\'s inner width', () => {
  const short = caption('那年夏天');
  expect(short.px).toBeCloseTo(short.w * 0.075, 9);
  const long = caption('我們在海邊等了整整一個下午的夕陽終於等到了');
  expect(long.px).toBeLessThan(long.w * 0.075);
  expect(long.px * 21).toBeLessThanOrEqual(long.w * (1 - 0.11) + 1e-6);
});
