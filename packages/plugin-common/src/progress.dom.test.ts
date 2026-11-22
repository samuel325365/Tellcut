// @vitest-environment jsdom
// common.progress pencil: a frame drawn on the canvas kept from the frame before looks the same as one drawn on a fresh canvas.
import { createRegistry, motion, resolveTheme, Stage, withDefaults, type ItemType } from '@tellcut/engine';
import { progress } from './progress.ts';

const css = (el: Element) => ((el as any)._c ?? {}) as Record<string, string>;

function recorder() {
  const log: Array<{ op: string; globalAlpha: number }> = [];
  const st: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, lineCap: 'butt', lineJoin: 'miter' };
  const g: any = new Proxy({}, {
    get: (_t, k) => (typeof k === 'symbol' ? undefined : k in st ? st[k as string]
      : (..._a: unknown[]) => { log.push({ op: String(k), globalAlpha: st.globalAlpha as number }); return k === 'measureText' ? { width: 10 } : undefined; }),
    set: (_t, k, v) => { st[k as string] = v; return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
  return log;
}
afterEach(() => vi.restoreAllMocks());

const media: any = { begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'), video: () => document.createElement('video'), stillUrl: () => '', fileUrl: (p: string) => p };

test('pencil: the title underline is drawn opaque on the next frame too, after a frame whose last circle was ticked', () => {
  const log = recorder(), root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [progress as ItemType] }]), media, { onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'p', type: 'common.progress', start: 0, end: 4, params: { mode: 'pencil', dots: 3, at: '0.2, 0.6, 1, 1.4' } }] }] } as any);
  st.draw(2);   // all done: every circle ticked, the last tick with the 0.9 pen
  const fresh = log.find((c) => c.op === 'stroke')!.globalAlpha;
  log.length = 0;
  st.draw(2.1);
  expect(fresh).toBe(1);
  expect(log.find((c) => c.op === 'stroke')!.globalAlpha).toBe(1);
});

// the character modes (spec 2026-11-22, progress characters): their own elements under S.more, the old modes' hidden meanwhile
const ctxOf = (params: Record<string, unknown>, local = 1, root = document.createElement('div'), W = 1080, H = 1920) => {
  const theme = resolveTheme(undefined, { width: W, height: H });
  return { t: local, local, dur: 4, W, H, theme, root, motion, media, reportText: () => {}, params: withDefaults(progress.params, params, theme) } as any;
};

test('runner hides the old modes, bar hides runner, and back again', () => {
  const ctx = ctxOf({ mode: 'runner' }), s = progress.build(ctx);
  progress.draw(ctx, s);
  expect(css(s.track).display).toBe('none');
  expect(css(s.row).display).toBe('none');
  for (const el of [s.title, s.count, s.slots]) expect(css(el).display).toBe('none');
  expect(s.more).not.toBeNull();
  expect(css(s.more!.root).display).not.toBe('none');
  const bar = ctxOf({ mode: 'bar' }, 1, ctx.root);
  progress.draw(bar, s);
  expect(css(s.more!.root).display).toBe('none');
  expect(css(s.track).display).toBe('block');
  expect(() => progress.draw(ctx, s)).not.toThrow();
  expect(css(s.more!.root).display).not.toBe('none');
  expect(css(s.track).display).toBe('none');
  // one root at a time: switching back reuses it rather than piling up copies
  expect(ctx.root.querySelectorAll(':scope > [data-more]').length).toBe(1);
});

test('a canvas mode before a character mode leaves no picture behind, nor one after it', () => {
  recorder();
  const pencil = ctxOf({ mode: 'pencil', dots: 3 }), s = progress.build(pencil);
  progress.draw(pencil, s);
  expect(s.cv.width).toBeGreaterThan(0);
  progress.draw(ctxOf({ mode: 'segments' }, 1, pencil.root), s);
  // a mode with nothing to draw on the canvas: hidden and given back
  expect(css(s.cv).display).toBe('none');
  expect(s.cv.width).toBe(0);
  progress.draw(pencil, s);
  expect(css(s.cv).display).toBe('block');
  expect(css(s.more!.root).display).toBe('none');
});

test('changing the dots, runner, goal or look rebuilds the mode, other params do not', () => {
  const ctx = ctxOf({ mode: 'runner' }), s = progress.build(ctx);
  progress.draw(ctx, s);
  const first = s.more!.root;
  progress.draw(ctxOf({ mode: 'runner', color: '#00f' }, 2, ctx.root), s);
  expect(s.more!.root).toBe(first);
  progress.draw(ctxOf({ mode: 'runner', look: 'cat' }, 2, ctx.root), s);
  expect(s.more!.root).not.toBe(first);
  expect(first.isConnected).toBe(false);
});

test.each([0, 0.3, 0.8, 1.19])('a %s s character item draws without throwing', (dur) => {
  for (const mode of ['runner', 'stretch', 'paws', 'segments', 'fuse', 'battery']) {
    const ctx = { ...ctxOf({ mode }), dur }, s = progress.build(ctx);
    for (const local of [0, dur / 2, dur]) expect(() => progress.draw({ ...ctx, local, t: local }, s)).not.toThrow();
  }
});
