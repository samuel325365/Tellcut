// @vitest-environment jsdom
// common.lockscreen: the count dots under the title come in with the counts when there is no title line.
import { resolveTheme } from '@tellcut/engine';
import { lockscreen } from './lockscreen.ts';

function at(params: Record<string, unknown>, t: number) {
  const W = 1080, H = 1920, root = document.createElement('div');
  const all = { ...Object.fromEntries(lockscreen.params.map((d) => [d.key, d.default])), ...params } as any;
  const ctx: any = { root, params: all, W, H, t, local: t, dur: 4, theme: resolveTheme({}, { width: W, height: H }), item: { id: 'l', type: 'common.lockscreen', start: 0, end: 4, params: all }, media: { stillUrl: () => '', image: () => document.createElement('img') } };
  const s = lockscreen.build(ctx);
  lockscreen.draw(ctx, s);
  return s;
}

test('no title: the dots show from the first count, fading in as they would under a title', () => {
  const s = at({ title: '', count: '0.5|0\n1.4|1' }, 1.5);
  expect(s.dots.style.display).toBe('flex');
  expect(Number(s.dots.style.opacity)).toBe(1);
  expect(at({ title: '', count: '0.5|0\n1.4|1' }, 0.3).dots.style.display).toBe('none');   // not before the first count
  // with a title the dots still follow the title's time
  expect(at({ title: '1|今天', count: '0.2|0' }, 0.6).dots.style.display).toBe('none');
});
