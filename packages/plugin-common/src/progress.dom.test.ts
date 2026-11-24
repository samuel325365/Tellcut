// @vitest-environment jsdom
// common.progress pencil: a frame drawn on the canvas kept from the frame before looks the same as one drawn on a fresh canvas.
import { createRegistry, motion, resolveTheme, Stage, unsetValue, withDefaults, type ItemType } from '@tellcut/engine';
import { progress, TOP_LANE } from './progress.ts';
import { band, corner, landscape, MODE_DEFAULTS, MORE_MODES, withModeDefaults } from './progress/shared.ts';
import { BACKING } from './progress/ring.ts';
import { vineSize } from './progress/vine.ts';

const css = (el: Element) => ((el as any)._c ?? {}) as Record<string, string>;

function recorder() {
  const log: Array<{ op: string; globalAlpha: number; args: unknown[]; fillStyle?: unknown }> = [];
  const st: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, lineCap: 'butt', lineJoin: 'miter' };
  const g: any = new Proxy({}, {
    get: (_t, k) => (typeof k === 'symbol' ? undefined : k in st ? st[k as string]
      : (...args: unknown[]) => { log.push({ op: String(k), globalAlpha: st.globalAlpha as number, args, fillStyle: st.fillStyle }); return k === 'measureText' ? { width: 10 } : /^create\w*Gradient$/.test(String(k)) ? { addColorStop() {} } : undefined; }),
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
  return { t: local, local, dur: 4, W, H, theme, root, motion, media, reportText: () => {}, item: { id: 'p', type: 'common.progress', start: 0, end: 4, params }, params: withDefaults(progress.params, params, theme) } as any;
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

test('switching rocket → bar → ring → fuse → rocket: one root at a time, the canvas cleared, the old elements hidden', () => {
  recorder();
  const rocket = ctxOf({ mode: 'rocket' }), s = progress.build(rocket);
  progress.draw(rocket, s);
  expect(s.more!.root.dataset.more).toBe('rocket');
  expect(css(s.cv).display).toBe('block');   // the flame
  progress.draw(ctxOf({ mode: 'bar' }, 1, rocket.root), s);
  expect(css(s.more!.root).display).toBe('none');
  expect(css(s.cv).display).toBe('none');
  expect(s.cv.width).toBe(0);
  expect(css(s.track).display).toBe('block');
  const ring = ctxOf({ mode: 'ring' }, 1, rocket.root);
  progress.draw(ring, s);
  expect(s.more!.root.dataset.more).toBe('ring');
  expect(css(s.track).display).toBe('none');
  // a mode that paints on the canvas, then one that has not painted on it (yet): the picture is given back
  progress.draw(ctxOf({ mode: 'fuse' }, 1, rocket.root), s);
  expect(css(s.cv).display).toBe('block');
  progress.draw(rocket, s);
  expect(s.more!.root.dataset.more).toBe('rocket');
  expect(css(s.cv).display).toBe('block');
  expect(rocket.root.querySelectorAll(':scope > [data-more]').length).toBe(1);
  for (const el of [s.title, s.count, s.slots]) expect(css(el).display).toBe('none');
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

// runner: the runner and the goal inside the side safe margins all the way, the goal's arrival bounce too
const box = (el: HTMLElement) => {
  const c = css(el), left = parseFloat(c.left), width = parseFloat(c.width), sc = Number(/scale\(([\d.]+)/.exec(c.transform ?? '')?.[1] ?? 1);
  return { left: left + (width * (1 - sc)) / 2, right: left + (width * (1 + sc)) / 2 };
};

test('runner: the runner and the goal stay inside the side safe margins on 9:16', () => {
  const ctx = ctxOf({ mode: 'runner' }), s = progress.build(ctx), side = ctx.theme.safe.side * ctx.W;
  for (const local of [0, 2, 3.1, 3.2, 3.5]) {
    progress.draw({ ...ctx, local, t: local }, s);
    for (const part of ['runner', 'goal']) {
      const b = box(s.more!.el[part]);
      expect(b.left).toBeGreaterThanOrEqual(side - 0.01);
      expect(b.right).toBeLessThanOrEqual(ctx.W - side + 0.01);
    }
  }
  // it went somewhere, and the goal bounced on arrival
  progress.draw({ ...ctx, local: 0, t: 0 }, s);
  const start = parseFloat(css(s.more!.el.runner).left);
  progress.draw({ ...ctx, local: 3.2, t: 3.2 }, s);
  expect(parseFloat(css(s.more!.el.runner).left)).toBeGreaterThan(start + ctx.W * 0.5);
  expect(css(s.more!.el.goal).transform).toMatch(/scale\(1\.[1-2]/);
});

test('runner: one time drawn twice is the same', () => {
  const ctx = ctxOf({ mode: 'runner' }), s = progress.build(ctx);
  progress.draw({ ...ctx, local: 1.37, t: 1.37 }, s);
  const once = s.more!.root.innerHTML;
  progress.draw({ ...ctx, local: 2.9, t: 2.9 }, s);
  progress.draw({ ...ctx, local: 1.37, t: 1.37 }, s);
  expect(s.more!.root.innerHTML).toBe(once);
});

test('runner: goal none draws no goal; an emoji runner shows its first grapheme', () => {
  const ctx = ctxOf({ mode: 'runner', goal: 'none', runner: '🚗🚕' }), s = progress.build(ctx);
  progress.draw(ctx, s);
  expect(s.more!.el.goal).toBeUndefined();
  expect(s.more!.el.runner.textContent).toBe('🚗');
});

test('runner: a picture is loading from build on (so ready() can wait for it); one that fails falls back to the dog', () => {
  const ctx = ctxOf({ mode: 'runner', runner: 'media/nope.png' }), s = progress.build(ctx);
  const img = s.more!.root.querySelector('img')!;
  expect(img.getAttribute('src')).toBe('media/nope.png');
  Object.defineProperty(img, 'complete', { value: true });
  Object.defineProperty(img, 'naturalWidth', { value: 0 });
  progress.draw(ctx, s);
  expect(css(img).display).toBe('none');
  const text = [...s.more!.el.runner.querySelectorAll('span')].find((e) => css(e).display !== 'none');
  expect(text?.textContent).toBe('🐕');
});

test('runner: ready() waits for a picture; one that fails loses its src (the export passes it by) and the dog and flag stand in', async () => {
  const ctx = ctxOf({ mode: 'runner', runner: 'media/nope.png', goal: 'media/gone.png' }), s = progress.build(ctx);
  const imgs = [...s.more!.root.querySelectorAll('img')];
  expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['media/gone.png', 'media/nope.png']);
  for (const i of imgs) i.decode = () => Promise.reject(new Error('404'));
  await progress.ready!(s);
  expect(imgs.map((i) => i.getAttribute('src'))).toEqual([null, null]);
  progress.draw(ctx, s);
  expect(css(s.more!.el.runnerText).display).toBe('block');
  expect(s.more!.el.runnerText.textContent).toBe('🐕');
  expect(css(s.more!.el.goalText).display).toBe('block');
  expect(s.more!.el.goalText.textContent).toBe('🏁');
  expect(css(s.more!.el.goalPole).display).toBe('block');
});

// stretch: all on the canvas, shown and faded by the mode itself; the pen's alpha back to 1 after every frame
test.each(['dog', 'cat', 'worm'])('stretch %s: draws at the start, midway and the end, leaving globalAlpha at 1', (look) => {
  const log = recorder(), ctx = ctxOf({ mode: 'stretch', look }), s = progress.build(ctx), g = s.cv.getContext('2d') as any;
  const ops: Record<number, string> = {};
  for (const local of [0, 1.7, 3.4, 3.85, 4, 1.7]) {
    log.length = 0;
    expect(() => progress.draw({ ...ctx, local, t: local }, s)).not.toThrow();
    expect(log.filter((c) => c.op === 'fill').length).toBeGreaterThan(5);
    expect(g.globalAlpha).toBe(1);
    expect(css(s.cv).display).toBe('block');
    const seq = log.map((c) => `${c.op}@${c.globalAlpha}`).join(' ');
    if (local in ops) expect(seq).toBe(ops[local]);   // one time drawn twice is the same
    ops[local] = seq;
  }
  progress.draw({ ...ctx, local: 0, t: 0 }, s);
  expect(Number(css(s.cv).opacity)).toBe(1);
  progress.draw({ ...ctx, local: 4, t: 4 }, s);
  expect(Number(css(s.cv).opacity)).toBe(0);
  // the old modes' elements stay hidden under it
  expect(css(s.track).display).toBe('none');
});

test.each([0, 0.3, 0.8, 1.19])('a %s s character item draws without throwing', (dur) => {
  recorder();   // jsdom has no 2D context of its own: the canvas modes draw on the recorder
  for (const mode of MORE_MODES) {
    const ctx = { ...ctxOf({ mode }), dur }, s = progress.build(ctx);
    for (const local of [0, dur / 2, dur]) expect(() => progress.draw({ ...ctx, local, t: local }, s)).not.toThrow();
  }
});

// paws: the default prints on the canvas, each placed by a translate to its centre; an emoji stamp is DOM
const centres = (log: ReturnType<typeof recorder>) => log.filter((c) => c.op === 'translate').map((c) => c.args as [number, number]);

test('paws: the drawn prints stay in the side margins and in the top lane, more of them as it goes, the same twice', () => {
  const log = recorder(), ctx = ctxOf({ mode: 'paws', dots: 12 }), s = progress.build(ctx), g = s.cv.getContext('2d') as any;
  const side = ctx.theme.safe.side * ctx.W, top = ctx.theme.safe.top * ctx.H, lane = TOP_LANE * ctx.H;
  let before = 0;
  const seqs: Record<number, string> = {};
  for (const local of [0, 0.5, 1.5, 2.9, 3.5, 1.5]) {
    log.length = 0;
    progress.draw({ ...ctx, local, t: local }, s);
    expect(css(s.cv).display).toBe('block');
    expect(g.globalAlpha).toBe(1);
    const at = centres(log);
    for (const [x, y] of at) {
      expect(x).toBeGreaterThanOrEqual(side);
      expect(x).toBeLessThanOrEqual(ctx.W - side);
      expect(y).toBeGreaterThanOrEqual(top);
      expect(y).toBeLessThanOrEqual(top + lane);
    }
    if (local !== 1.5 || !(1.5 in seqs)) { expect(at.length).toBeGreaterThanOrEqual(before); before = at.length; }
    const seq = JSON.stringify(log.map((c) => [c.op, c.globalAlpha, c.args]));
    if (local in seqs) expect(seq).toBe(seqs[local]);
    seqs[local] = seq;
  }
  // all twelve down by the end, on both sides of the line
  progress.draw({ ...ctx, local: 3.5, t: 3.5 }, s);
  expect(new Set(centres(log).slice(-12).map(([, y]) => y.toFixed(2))).size).toBe(2);
  expect(s.more!.root.children.length).toBe(0);
});

test('paws: an emoji stamp is DOM, not mirrored, inside the side margins, the same twice', () => {
  const ctx = ctxOf({ mode: 'paws', dots: 6, runner: '⭐' }), s = progress.build(ctx), side = ctx.theme.safe.side * ctx.W;
  expect(s.more!.list).toHaveLength(6);
  progress.draw({ ...ctx, local: 3.5, t: 3.5 }, s);
  expect(css(s.cv).display).toBe('none');
  for (const el of s.more!.list) {
    expect(el.textContent).toBe('⭐');
    expect(css(el).display).toBe('block');
    expect(css(el).transform).not.toMatch(/scale\(-/);
    const b = box(el);
    expect(b.left).toBeGreaterThanOrEqual(side);
    expect(b.right).toBeLessThanOrEqual(ctx.W - side);
  }
  progress.draw({ ...ctx, local: 0, t: 0 }, s);
  expect(s.more!.list.filter((el) => css(el).display === 'block').length).toBe(0);
  progress.draw({ ...ctx, local: 1.37, t: 1.37 }, s);
  const once = s.more!.root.innerHTML;
  progress.draw({ ...ctx, local: 2.9, t: 2.9 }, s);
  progress.draw({ ...ctx, local: 1.37, t: 1.37 }, s);
  expect(s.more!.root.innerHTML).toBe(once);
});

// segments: DOM, where bar is, one segment filling at a time
test('segments: in the side margins at the bar\'s height and place, filling left to right, the same twice', () => {
  const ctx = ctxOf({ mode: 'segments', dots: 5 }), s = progress.build(ctx), side = ctx.theme.safe.side * ctx.W;
  progress.draw({ ...ctx, local: 1.5, t: 1.5 }, s);
  const segs = s.more!.list;
  expect(segs).toHaveLength(5);
  const bar = ctxOf({ mode: 'bar' }), sb = progress.build(bar);
  progress.draw(bar, sb);
  for (const el of segs) {
    const c = css(el);
    expect(parseFloat(c.left)).toBeGreaterThanOrEqual(side);
    expect(parseFloat(c.left) + parseFloat(c.width)).toBeLessThanOrEqual(ctx.W - side + 0.01);
    expect(c.top).toBe(css(sb.track).top);
    expect(c.height).toBe(css(sb.track).height);
  }
  // 1.5 s of 3: segments 0 and 1 full, 2 half, the rest empty
  expect(segs.map((el) => css(el.firstElementChild!).width)).toEqual(['100%', '100%', '50%', '0%', '0%']);
  const once = s.more!.root.innerHTML;
  progress.draw({ ...ctx, local: 2.9, t: 2.9 }, s);
  progress.draw({ ...ctx, local: 1.5, t: 1.5 }, s);
  expect(s.more!.root.innerHTML).toBe(once);
  expect(css(s.cv).display).toBe('none');
});

// fuse: the rope and spark on the canvas, the bomb (DOM) at the right end inside the margins, popping on arrival
test('fuse: the bomb stays inside the side safe margins, pops on arrival, and the frame is the same twice', () => {
  const log = recorder(), ctx = ctxOf({ mode: 'fuse' }), s = progress.build(ctx), side = ctx.theme.safe.side * ctx.W, g = s.cv.getContext('2d') as any;
  const seqs: Record<number, string> = {};
  for (const local of [0, 1.5, 2.9, 3.05, 3.15, 3.5, 1.5]) {
    log.length = 0;
    progress.draw({ ...ctx, local, t: local }, s);
    expect(css(s.cv).display).toBe('block');
    expect(g.globalAlpha).toBe(1);
    const b = box(s.more!.el.goal);
    expect(b.left).toBeGreaterThanOrEqual(side - 0.01);
    expect(b.right).toBeLessThanOrEqual(ctx.W - side + 0.01);
    const seq = JSON.stringify(log.map((c) => [c.op, c.globalAlpha, c.args])) + s.more!.root.innerHTML;
    if (local in seqs) expect(seq).toBe(seqs[local]);
    seqs[local] = seq;
  }
  expect(s.more!.el.goalText.textContent).toBe('💣');
  progress.draw({ ...ctx, local: 3.15, t: 3.15 }, s);
  expect(css(s.more!.el.goal).transform).toMatch(/scale\(1\.[1-3]/);
  progress.draw({ ...ctx, local: 3.6, t: 3.6 }, s);
  expect(css(s.more!.el.goal).transform).toMatch(/scale\(1(\.0+)?\)/);
  expect(ctxOf({ mode: 'fuse', goal: 'none' }) && (() => { const c2 = ctxOf({ mode: 'fuse', goal: 'none' }), s2 = progress.build(c2); progress.draw(c2, s2); return s2.more!.el.goal; })()).toBeUndefined();
});

test('fuse: the spark (its glow and rays) stays inside the side margins, and is gone once arrived', () => {
  const log = recorder(), ctx = ctxOf({ mode: 'fuse' }), s = progress.build(ctx), side = ctx.theme.safe.side * ctx.W;
  const arcs = () => log.filter((c) => c.op === 'arc' || c.op === 'createRadialGradient');
  for (const local of [0, 1.5, 2.99]) {
    log.length = 0;
    progress.draw({ ...ctx, local, t: local }, s);
    const at = log.filter((c) => c.op === 'createRadialGradient');
    expect(at.length).toBeGreaterThan(0);
    for (const c of at) {
      const [x, , , , , r] = c.args as number[];
      expect(x - r).toBeGreaterThanOrEqual(side - 0.01);
      expect(x + r).toBeLessThanOrEqual(ctx.W - side + 0.01);
    }
  }
  log.length = 0;
  progress.draw({ ...ctx, local: 3.3, t: 3.3 }, s);
  expect(arcs().filter((c) => c.op === 'createRadialGradient')).toHaveLength(0);
});

// battery: DOM in a corner of the safe area, the percentage beside it
test.each(['right', 'center', 'left'])('battery %s: the battery and its percentage inside the side safe margins, the same twice', (align) => {
  const ctx = ctxOf({ mode: 'battery', align }), s = progress.build(ctx), side = ctx.theme.safe.side * ctx.W;
  for (const local of [0, 1.5, 3.2, 3.5]) {
    progress.draw({ ...ctx, local, t: local }, s);
    const el = s.more!.el, body = css(el.body), nub = css(el.nub), text = css(el.text);
    const left = parseFloat(body.left), right = parseFloat(nub.left) + parseFloat(nub.width);
    expect(left).toBeGreaterThanOrEqual(side - 0.01);
    expect(right).toBeLessThanOrEqual(ctx.W - side + 0.01);
    if (align === 'left') {
      expect(left).toBeCloseTo(side, 1);
      // the text starts right of the nub
      expect(parseFloat(text.left)).toBeGreaterThan(right);
      expect(text.transform ?? 'none').toBe('none');
    } else {
      expect(right).toBeCloseTo(ctx.W - side, 1);
      // the text ends left of the battery
      expect(text.transform).toBe('translateX(-100%)');
      expect(parseFloat(text.left)).toBeLessThan(left);
    }
    // not the full width
    expect(right - left).toBeLessThan(ctx.W * 0.3);
  }
  progress.draw({ ...ctx, local: 1.37, t: 1.37 }, s);
  const once = s.more!.root.innerHTML;
  progress.draw({ ...ctx, local: 3.3, t: 3.3 }, s);
  progress.draw({ ...ctx, local: 1.37, t: 1.37 }, s);
  expect(s.more!.root.innerHTML).toBe(once);
  expect(css(s.cv).display).toBe('none');
});

test('battery: the cells light one by one, red while low, all the done colour when full; the percentage counts up', () => {
  const ctx = ctxOf({ mode: 'battery', dots: 5, color: '#00ff00', done: '#0000ff' }), s = progress.build(ctx);
  expect(s.more!.list).toHaveLength(5);
  progress.draw({ ...ctx, local: 0.2, t: 0.2 }, s);
  expect(s.more!.el.text.textContent).toBe('6%');
  expect(css(s.more!.list[0]).background).toBe('#ff4d4f');
  progress.draw({ ...ctx, local: 1.5, t: 1.5 }, s);
  expect(s.more!.el.text.textContent).toBe('50%');
  expect(s.more!.list.slice(0, 2).map((c) => css(c).background)).toEqual(['#00ff00', '#00ff00']);
  progress.draw({ ...ctx, local: 3.5, t: 3.5 }, s);
  expect(s.more!.el.text.textContent).toBe('100%');
  for (const c of s.more!.list) expect(css(c).background).toBe('#0000ff');
});

// rocket: upright along the side safe edge; the rocket, the goal and every canvas point inside the safe area
const box4 = (el: HTMLElement) => {
  const c = css(el), left = parseFloat(c.left), top = parseFloat(c.top), w = parseFloat(c.width), hh = parseFloat(c.height);
  const sc = Number(/scale\(([\d.]+)\)/.exec(c.transform ?? '')?.[1] ?? 1);
  return { left: left + (w * (1 - sc)) / 2, right: left + (w * (1 + sc)) / 2, top: top + (hh * (1 - sc)) / 2, bottom: top + (hh * (1 + sc)) / 2 };
};
/** every point a recorded canvas call names: path points, arcs and gradients with their radius */
const canvasBoxes = (log: ReturnType<typeof recorder>) => log.flatMap((c) => {
  const a = c.args as number[];
  if (c.op === 'arc') return [[a[0] - a[2], a[1] - a[2]], [a[0] + a[2], a[1] + a[2]]];
  if (c.op === 'createRadialGradient') return [[a[3] - a[5], a[4] - a[5]], [a[3] + a[5], a[4] + a[5]]];
  if (['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo'].includes(c.op)) return Array.from({ length: a.length / 2 }, (_, i) => [a[2 * i], a[2 * i + 1]]);
  return [];
});

test.each([[1080, 1920], [1920, 1080]])('rocket %sx%s: the rocket, the goal and the flame and fireworks inside the safe area, the same twice', (W, H) => {
  const log = recorder(), ctx = ctxOf({ mode: 'rocket' }, 0, document.createElement('div'), W, H), s = progress.build(ctx), g = s.cv.getContext('2d') as any;
  const sf = ctx.theme.safe, L = sf.side * W, R = W - sf.side * W, T = sf.top * H, B = H * (1 - sf.bottom);
  const seqs: Record<number, string> = {};
  let points = 0;
  for (const local of [0, 1.5, 3.05, 3.2, 3.4, 3.5, 1.5]) {
    log.length = 0;
    progress.draw({ ...ctx, local, t: local }, s);
    expect(g.globalAlpha).toBe(1);
    for (const part of ['runner', 'goal']) {
      const b = box4(s.more!.el[part]);
      expect(b.left).toBeGreaterThanOrEqual(L - 0.01);
      expect(b.right).toBeLessThanOrEqual(R + 0.01);
      expect(b.top).toBeGreaterThanOrEqual(T - 0.01);
      expect(b.bottom).toBeLessThanOrEqual(B + 0.01);
    }
    for (const [x, y] of canvasBoxes(log)) {
      points++;
      expect(x).toBeGreaterThanOrEqual(L - 0.01);
      expect(x).toBeLessThanOrEqual(R + 0.01);
      expect(y).toBeGreaterThanOrEqual(T - 0.01);
      expect(y).toBeLessThanOrEqual(B + 0.01);
    }
    const seq = JSON.stringify(log.map((c) => [c.op, c.globalAlpha, c.args])) + s.more!.root.innerHTML;
    if (local in seqs) expect(seq).toBe(seqs[local]);
    seqs[local] = seq;
  }
  expect(points).toBeGreaterThan(0);
  // it climbed, against the right edge, and the goal popped and the fireworks went off on arrival
  progress.draw({ ...ctx, local: 0, t: 0 }, s);
  const start = box4(s.more!.el.runner);
  expect(start.right).toBeGreaterThan(W / 2);
  progress.draw({ ...ctx, local: 3.2, t: 3.2 }, s);
  const top = box4(s.more!.el.runner);
  expect(top.top).toBeLessThan(start.top - H * 0.25);
  expect(top.top).toBeGreaterThanOrEqual(parseFloat(css(s.more!.el.goal).top) + parseFloat(css(s.more!.el.goal).height) - 0.01);
  expect(css(s.more!.el.goal).transform).toMatch(/scale\(1\.[01]/);
  log.length = 0;
  progress.draw({ ...ctx, local: 3.3, t: 3.3 }, s);
  expect(log.filter((c) => c.op === 'stroke').length).toBeGreaterThan(3);
  expect(s.more!.el.runnerText.textContent).toBe('🚀');
  expect(css(s.more!.el.runnerText).transform).toBe('rotate(-45deg)');
  expect(s.more!.el.goalText.textContent).toBe('🌙');
});

test('rocket: align left keeps it on the left; another emoji stands unturned with no flame; goal none draws none', () => {
  const log = recorder(), ctx = ctxOf({ mode: 'rocket', align: 'left', runner: '🎈', goal: 'none' }, 1.5), s = progress.build(ctx), side = ctx.theme.safe.side * ctx.W;
  progress.draw(ctx, s);
  const b = box4(s.more!.el.runner);
  expect(b.left).toBeGreaterThanOrEqual(side - 0.01);
  expect(b.right).toBeLessThan(ctx.W / 2);
  expect(s.more!.el.goal).toBeUndefined();
  // unturned: only 🎈 nudged left inside its box, onto the track (its string hangs to the left)
  expect(css(s.more!.el.runnerText).transform).toMatch(/^translateX\(-[\d.]+px\)$/);
  expect(css(s.cv).display).toBe('none');
  expect(log.length).toBe(0);
  // flip mirrors it
  const f = ctxOf({ mode: 'rocket', flip: true }, 1.5), sf = progress.build(f);
  progress.draw(f, sf);
  expect(css(sf.more!.el.runner).transform).toBe('scale(-1, 1)');
});

test('rocket: a picture that fails falls back to an upright 🚀 with its flame', () => {
  const log = recorder(), ctx = ctxOf({ mode: 'rocket', runner: 'media/nope.png' }, 1.5), s = progress.build(ctx);
  const img = s.more!.root.querySelector('img')!;
  expect(img.getAttribute('src')).toBe('media/nope.png');
  Object.defineProperty(img, 'complete', { value: true });
  Object.defineProperty(img, 'naturalWidth', { value: 0 });
  progress.draw(ctx, s);
  expect(css(img).display).toBe('none');
  expect(css(s.more!.el.runnerText).display).toBe('block');
  expect(s.more!.el.runnerText.textContent).toBe('🚀');
  expect(css(s.more!.el.runnerText).transform).toBe('rotate(-45deg)');
  expect(log.filter((c) => c.op === 'bezierCurveTo').length).toBeGreaterThan(0);
});

test('rocket: a short wide frame with a big rocket keeps the rocket below the goal and inside the safe area', () => {
  recorder();
  for (const params of [{ iconSize: 3 }, { iconSize: 3, thickness: 60 }]) {
    const ctx = ctxOf({ mode: 'rocket', ...params }, 0, document.createElement('div'), 1920, 1080), s = progress.build(ctx), sf = ctx.theme.safe;
    for (const local of [0, 1.5, 3.2]) {
      progress.draw({ ...ctx, local, t: local }, s);
      const r = box4(s.more!.el.runner);
      for (const v of [r.left, r.top, r.right, r.bottom]) expect(Number.isFinite(v)).toBe(true);
      // the rocket under the goal (as drawn, before its pop)
      expect(r.top).toBeGreaterThanOrEqual(parseFloat(css(s.more!.el.goal).top) + parseFloat(css(s.more!.el.goal).height) - 0.01);
      expect(r.bottom).toBeLessThanOrEqual(1080 * (1 - sf.bottom) + 0.01);
      expect(parseFloat(css(s.more!.el.fill).height)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(css(s.more!.el.track).height)).toBeGreaterThanOrEqual(0);
    }
  }
});

test('rocket: a 0.5 s item draws without throwing', () => {
  recorder();
  const ctx = { ...ctxOf({ mode: 'rocket' }), dur: 0.5 }, s = progress.build(ctx);
  for (const local of [0, 0.1, 0.25, 0.4, 0.5]) expect(() => progress.draw({ ...ctx, local, t: local }, s)).not.toThrow();
});

// ring: a ring in a corner of the safe area; the box it keeps (1.25 diameters) holds the pop and the ripple
const ringBox = (ctx: any) => {
  const d = (ctx.params.size * 2.6 / 100) * ctx.H * landscape(ctx.W, ctx.H), b = 1.25 * d, { left, top } = corner(ctx, ctx.params, b, b);
  return { L: left, T: top, R: left + b, B: top + b, cx: left + b / 2, cy: top + b / 2, d };
};
const inside = (x: number, y: number, b: { L: number; T: number; R: number; B: number }) => {
  expect(x).toBeGreaterThanOrEqual(b.L - 0.01);
  expect(x).toBeLessThanOrEqual(b.R + 0.01);
  expect(y).toBeGreaterThanOrEqual(b.T - 0.01);
  expect(y).toBeLessThanOrEqual(b.B + 0.01);
};

test.each([[1080, 1920, 'center'], [1080, 1920, 'left'], [1920, 1080, 'right'], [1920, 1080, 'left']])('ring %sx%s %s: the ring, its backing, the pop and the ripple inside the box it keeps in a corner of the safe area, the same twice', (W, H, align) => {
  const log = recorder(), ctx = ctxOf({ mode: 'ring', align }, 0, document.createElement('div'), W as number, H as number), s = progress.build(ctx), g = s.cv.getContext('2d') as any;
  const sf = ctx.theme.safe, safe = { L: sf.side * ctx.W, R: ctx.W - sf.side * ctx.W, T: sf.top * ctx.H, B: ctx.H * (1 - sf.bottom) }, rb = ringBox(ctx);
  // the box itself: in the safe area, against the top and the side align says
  inside(rb.L, rb.T, safe); inside(rb.R, rb.B, safe);
  expect(rb.T).toBeCloseTo(safe.T, 6);
  if (align === 'left') expect(rb.L).toBeCloseTo(safe.L, 6);
  else expect(rb.R).toBeCloseTo(safe.R, 6);
  const seqs: Record<number, string> = {};
  let arcs = 0;
  for (const local of [0, 1.5, 3.05, 3.2, 3.4, 3.6, 1.5, 3.2]) {
    log.length = 0;
    progress.draw({ ...ctx, local, t: local }, s);
    expect(g.globalAlpha).toBe(1);
    for (const c of log.filter((c) => c.op === 'arc')) {
      arcs++;
      expect((c.args as number[])[2]).toBeGreaterThan(0);
    }
    for (const [x, y] of canvasBoxes(log)) inside(x, y, rb);
    // the dark ground: the first thing drawn, a disc round the ring's centre (inside the box: canvasBoxes above), under the line
    const ground = log.find((c) => c.op === 'arc')!.args as number[];
    expect(ground[0]).toBeCloseTo(rb.cx, 1);
    expect(ground[1]).toBeCloseTo(rb.cy, 1);
    expect(log.find((c) => c.op === 'fill')!.fillStyle).toBe(BACKING);
    expect(log.findIndex((c) => c.op === 'fill')).toBeLessThan(log.findIndex((c) => c.op === 'stroke'));
    // the percentage: centred on the ring, inside the box
    const t = css(s.more!.el.text), tl = parseFloat(t.left), tw = parseFloat(t.width), tt = parseFloat(t.top), fs = parseFloat(t.fontSize);
    expect(tl + tw / 2).toBeCloseTo(rb.cx, 1);
    expect(tt + fs / 2).toBeCloseTo(rb.cy, 0);
    inside(tl, tt, rb); inside(tl + tw, tt + fs, rb);
    const seq = JSON.stringify(log.map((c) => [c.op, c.globalAlpha, c.args])) + s.more!.root.innerHTML;
    if (local in seqs) expect(seq).toBe(seqs[local]);
    seqs[local] = seq;
  }
  expect(arcs).toBeGreaterThan(0);
  expect(css(s.cv).display).toBe('block');
});

test('ring: the arc from twelve o\'clock clockwise with round caps; the percentage counts up; full turns the done colour, pops and ripples', () => {
  const log = recorder(), ctx = ctxOf({ mode: 'ring', color: '#00ff00', track: '#222222', done: '#0000ff', paper: '#ffffff' }), s = progress.build(ctx), g = s.cv.getContext('2d') as any;
  log.length = 0;
  progress.draw({ ...ctx, local: 0, t: 0 }, s);
  expect(s.more!.el.text.textContent).toBe('0%');
  // nothing swept yet: only the ground and the track's circle
  expect(log.filter((c) => c.op === 'arc')).toHaveLength(2);
  log.length = 0;
  progress.draw({ ...ctx, local: 1.5, t: 1.5 }, s);
  expect(s.more!.el.text.textContent).toBe('50%');
  expect(css(s.more!.el.text).color).toBe('#ffffff');
  // (the ground's disc first, then the line's)
  const arcs = log.filter((c) => c.op === 'arc').map((c) => c.args as number[]).slice(1);
  expect(arcs).toHaveLength(2);
  expect(arcs[1][3]).toBeCloseTo(-Math.PI / 2, 9);
  expect(arcs[1][4]).toBeCloseTo(-Math.PI / 2 + Math.PI, 9);
  expect(g.lineCap).toBe('round');
  const size = arcs[1][2];
  log.length = 0;
  progress.draw({ ...ctx, local: 3.2, t: 3.2 }, s);
  expect(s.more!.el.text.textContent).toBe('100%');
  expect(css(s.more!.el.text).color).toBe('#0000ff');
  const full = log.filter((c) => c.op === 'arc').map((c) => c.args as number[]).slice(1);
  // popped: the ring bigger than before; and the ripple's thin ring outside it
  expect(full[0][2]).toBeGreaterThan(size * 1.05);
  expect(Math.max(...full.map((a) => a[2]))).toBeGreaterThan(full[0][2]);
  log.length = 0;
  progress.draw({ ...ctx, local: 3.9, t: 3.9 }, s);
  // settled: one done-coloured circle at the size it had
  const end = log.filter((c) => c.op === 'arc').map((c) => c.args as number[]).slice(1);
  expect(end).toHaveLength(1);
  expect(end[0][2]).toBeCloseTo(size, 6);
});

test('ring: position bottom keeps it against the bottom safe edge', () => {
  const log = recorder();
  const ctx = ctxOf({ mode: 'ring', position: 'bottom' }, 1.5), s = progress.build(ctx), rb = ringBox(ctx);
  expect(rb.B).toBeCloseTo(ctx.H * (1 - ctx.theme.safe.bottom), 6);
  progress.draw(ctx, s);
  expect((log.find((c) => c.op === 'arc')!.args as number[])[1]).toBeCloseTo(rb.cy, 1);
  expect(rb.cy).toBeGreaterThan(ctx.H / 2);
});

test('ring: a runner stands in the middle instead of the percentage; a picture that fails gives the percentage back', () => {
  recorder();
  const ctx = ctxOf({ mode: 'ring', runner: '🍕' }, 1.5), s = progress.build(ctx), rb = ringBox(ctx);
  progress.draw(ctx, s);
  expect(css(s.more!.el.text).display).toBe('none');
  expect(s.more!.el.text.textContent).toBe('');
  expect(s.more!.el.runnerText.textContent).toBe('🍕');
  const r = box4(s.more!.el.runner);
  expect((r.left + r.right) / 2).toBeCloseTo(rb.cx, 1);
  expect((r.top + r.bottom) / 2).toBeCloseTo(rb.cy, 1);
  expect(r.right - r.left).toBeLessThan(rb.d * 0.6);
  const p = ctxOf({ mode: 'ring', runner: 'media/nope.png' }, 1.5), sp = progress.build(p);
  const img = sp.more!.root.querySelector('img')!;
  expect(img.getAttribute('src')).toBe('media/nope.png');
  Object.defineProperty(img, 'complete', { value: true });
  Object.defineProperty(img, 'naturalWidth', { value: 0 });
  progress.draw(p, sp);
  expect(css(img).display).toBe('none');
  expect(css(sp.more!.el.text).display).toBe('block');
  expect(sp.more!.el.text.textContent).toBe('50%');
  expect(css(sp.more!.el.runner).display).toBe('none');
});

test('ring: a chapter of four fills a quarter more and never goes full', () => {
  recorder();
  const ctx = ctxOf({ mode: 'ring', dots: 4, step: 1 }), s = progress.build(ctx);
  progress.draw({ ...ctx, local: 0, t: 0 }, s);
  expect(s.more!.el.text.textContent).toBe('25%');
  progress.draw({ ...ctx, local: 3.5, t: 3.5 }, s);
  expect(s.more!.el.text.textContent).toBe('50%');
});

test.each([{ size: 1, thickness: 60 }, { size: 8, thickness: 60 }, { size: 1, thickness: 2 }])('ring %o draws without throwing, no arc of a negative radius', (params) => {
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) {
    const log = recorder(), ctx = ctxOf({ mode: 'ring', ...params }, 0, document.createElement('div'), W, H), s = progress.build(ctx), rb = ringBox(ctx);
    for (const local of [0, 1.5, 3.2, 3.5]) {
      log.length = 0;
      expect(() => progress.draw({ ...ctx, local, t: local }, s)).not.toThrow();
      for (const c of log.filter((c) => c.op === 'arc')) expect((c.args as number[])[2]).toBeGreaterThan(0);
      for (const [x, y] of canvasBoxes(log)) inside(x, y, rb);
      for (const v of log.find((c) => c.op === 'arc')!.args as number[]) expect(Number.isFinite(v)).toBe(true);
    }
  }
});

test('ring: a 0.5 s item (and one of none) draws without throwing', () => {
  recorder();
  for (const dur of [0.5, 0]) {
    const ctx = { ...ctxOf({ mode: 'ring' }), dur }, s = progress.build(ctx);
    for (const local of [0, 0.1, 0.25, 0.4, 0.5]) expect(() => progress.draw({ ...ctx, local, t: local }, s)).not.toThrow();
  }
});

// vine: all on the canvas (a goal emoji or picture aside), inside the side safe margins and the band its size keeps
const vineBand = (ctx: any) => {
  const p = withModeDefaults(ctx.params, ctx.item?.params), s = vineSize(p.thickness * Math.min(ctx.W, ctx.H) / 1080), b = band(ctx, p, s.height);
  return { L: b.x, R: b.x + b.w, T: b.top, B: b.top + s.height };
};

test.each([[1080, 1920, 'bottom'], [1920, 1080, 'bottom'], [1080, 1920, 'top']])('vine %sx%s %s: every canvas point inside the side margins and its band, the same twice', (W, H, position) => {
  const log = recorder(), ctx = ctxOf({ mode: 'vine', position, color: '#4caf50', done: '#ff8fb1' }, 0, document.createElement('div'), W as number, H as number);
  const s = progress.build(ctx), g = s.cv.getContext('2d') as any, vb = vineBand(ctx), sf = ctx.theme.safe;
  // the band itself in the safe area, against the edge position names
  expect(vb.T).toBeGreaterThanOrEqual(sf.top * ctx.H - 0.01);
  expect(vb.B).toBeLessThanOrEqual(ctx.H * (1 - sf.bottom) + 0.01);
  if (position === 'bottom') expect(vb.B).toBeCloseTo(ctx.H * (1 - sf.bottom), 6);
  const seqs: Record<number, string> = {};
  const counts: number[] = [];
  for (const local of [0, 0.8, 1.5, 2.9, 3.05, 3.2, 3.5, 3.9, 1.5, 3.2]) {
    log.length = 0;
    progress.draw({ ...ctx, local, t: local }, s);
    expect(g.globalAlpha).toBe(1);
    expect(css(s.cv).display).toBe('block');
    const pts = canvasBoxes(log);
    expect(pts.length).toBeGreaterThan(20);
    for (const [x, y] of pts) inside(x, y, vb);
    for (const c of log.filter((c) => c.op === 'arc')) expect((c.args as number[])[2]).toBeGreaterThan(0);
    // (the fill colour each fill uses: what is left set from the frame before shows on the other calls)
    const seq = JSON.stringify(log.map((c) => [c.op, c.globalAlpha, c.args, c.op === 'fill' ? c.fillStyle : null]));
    if (local in seqs) expect(seq).toBe(seqs[local]);
    else counts.push(log.filter((c) => c.op === 'fill').length);
    seqs[local] = seq;
  }
  // more drawn as it grows (the leaves come out), and the flower's petals only once arrived
  expect(counts[3]).toBeGreaterThan(counts[0] + 5);
  const petals = (local: number) => { log.length = 0; progress.draw({ ...ctx, local, t: local }, s); return log.filter((c) => c.op === 'fill' && c.fillStyle === '#ff8fb1').length; };
  expect(petals(2.9)).toBe(0);
  expect(petals(3.6)).toBeGreaterThanOrEqual(5);
  expect(s.more!.root.children.length).toBe(0);
});

test('vine: a chapter that is not the last keeps its bud, never opening the flower', () => {
  const log = recorder(), ctx = ctxOf({ mode: 'vine', dots: 4, step: 1, done: '#0000ff' }), s = progress.build(ctx);
  for (const local of [0, 1.5, 3.2, 3.6]) {
    log.length = 0;
    progress.draw({ ...ctx, local, t: local }, s);
    expect(log.filter((c) => c.op === 'fill' && c.fillStyle === '#0000ff')).toHaveLength(0);
  }
  // the last chapter does open it
  const last = ctxOf({ mode: 'vine', dots: 4, step: 3, done: '#0000ff' }), sl = progress.build(last);
  log.length = 0;
  progress.draw({ ...last, local: 3.6, t: 3.6 }, sl);
  expect(log.filter((c) => c.op === 'fill' && c.fillStyle === '#0000ff').length).toBeGreaterThanOrEqual(5);
});

test.each([[1080, 1920], [1920, 1080]])('vine %sx%s: a goal emoji pops out at the end on arrival, inside the safe area, in place of the flower', (W, H) => {
  const log = recorder(), ctx = ctxOf({ mode: 'vine', position: 'bottom', goal: '🍓', done: '#0000ff' }, 0, document.createElement('div'), W, H), s = progress.build(ctx);
  const sf = ctx.theme.safe, vb = vineBand(ctx);
  progress.draw({ ...ctx, local: 2, t: 2 }, s);
  expect(s.more!.el.goalText.textContent).toBe('🍓');
  expect(css(s.more!.el.goal).display).toBe('none');
  for (const local of [3.05, 3.15, 3.3, 3.6]) {
    log.length = 0;
    progress.draw({ ...ctx, local, t: local }, s);
    expect(css(s.more!.el.goal).display).toBe('block');
    const b = box4(s.more!.el.goal);
    expect(b.left).toBeGreaterThanOrEqual(sf.side * W - 0.01);
    expect(b.right).toBeLessThanOrEqual(W - sf.side * W + 0.01);
    expect(b.top).toBeGreaterThanOrEqual(vb.T - 0.01);
    expect(b.bottom).toBeLessThanOrEqual(vb.B + 0.01);
    expect(log.filter((c) => c.op === 'fill' && c.fillStyle === '#0000ff')).toHaveLength(0);
  }
  progress.draw({ ...ctx, local: 3.6, t: 3.6 }, s);
  expect(css(s.more!.el.goal).transform).toMatch(/scale\(1(\.0+)?\)/);
});

test('vine: goal none draws neither bud nor flower; a picture goal that fails opens the drawn flower', () => {
  const log = recorder(), ctx = ctxOf({ mode: 'vine', goal: 'none', done: '#0000ff' }), s = progress.build(ctx);
  for (const local of [1.5, 3.6]) {
    log.length = 0;
    progress.draw({ ...ctx, local, t: local }, s);
    expect(log.filter((c) => c.op === 'fill' && c.fillStyle === '#0000ff')).toHaveLength(0);
  }
  expect(s.more!.el.goal).toBeUndefined();
  const p = ctxOf({ mode: 'vine', goal: 'media/nope.png', done: '#0000ff' }), sp = progress.build(p);
  const img = sp.more!.root.querySelector('img')!;
  expect(img.getAttribute('src')).toBe('media/nope.png');
  Object.defineProperty(img, 'complete', { value: true });
  Object.defineProperty(img, 'naturalWidth', { value: 0 });
  log.length = 0;
  progress.draw({ ...p, local: 3.6, t: 3.6 }, sp);
  expect(css(sp.more!.el.goal).display).toBe('none');
  expect(log.filter((c) => c.op === 'fill' && c.fillStyle === '#0000ff').length).toBeGreaterThanOrEqual(5);
});

test.each([{ thickness: 2 }, { thickness: 60 }, { thickness: 60, position: 'top' }])('vine %o: draws without throwing, inside its band and the side margins', (params) => {
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) {
    const log = recorder(), ctx = ctxOf({ mode: 'vine', ...params }, 0, document.createElement('div'), W, H), s = progress.build(ctx), vb = vineBand(ctx);
    for (const local of [0, 1.5, 3.2, 3.5]) {
      log.length = 0;
      expect(() => progress.draw({ ...ctx, local, t: local }, s)).not.toThrow();
      for (const [x, y] of canvasBoxes(log)) inside(x, y, vb);
    }
  }
});

test('vine: a 0.5 s item (and one of none) draws without throwing', () => {
  recorder();
  for (const dur of [0.5, 0]) {
    const ctx = { ...ctxOf({ mode: 'vine' }), dur }, s = progress.build(ctx);
    for (const local of [0, 0.1, 0.25, 0.4, 0.5]) expect(() => progress.draw({ ...ctx, local, t: local }, s)).not.toThrow();
  }
});

// stamps: a small card in a corner of the safe area, tilted, its box (the tilt's corners and the jump when full included) inside
const cardBox = (el: HTMLElement) => {
  const c = css(el), w = parseFloat(c.width), hh = parseFloat(c.height);
  const ty = Number(/translateY\((-?[\d.]+)px\)/.exec(c.transform ?? '')?.[1] ?? 0), deg = Number(/rotate\((-?[\d.]+)deg\)/.exec(c.transform ?? '')?.[1] ?? 0);
  const a = (Math.abs(deg) * Math.PI) / 180, bw = w * Math.cos(a) + hh * Math.sin(a), bh = w * Math.sin(a) + hh * Math.cos(a);
  const cx = parseFloat(c.left) + w / 2, cy = parseFloat(c.top) + hh / 2 + ty;
  return { L: cx - bw / 2, R: cx + bw / 2, T: cy - bh / 2, B: cy + bh / 2, deg, ty };
};
const shown = (s: any) => s.more!.list.map((el: HTMLElement) => css(el).display === 'block' && Number(css(el).opacity) > 0);

test.each([[1080, 1920, 'right', 'bottom'], [1080, 1920, 'left', 'top'], [1920, 1080, 'right', 'bottom'], [1920, 1080, 'center', 'top']])('stamps %sx%s %s %s: the tilted card inside the safe area all along (its jump too), against the corner, no wider than 45% of it, the same twice', (W, H, align, position) => {
  const ctx = ctxOf({ mode: 'stamps', align, position }, 0, document.createElement('div'), W as number, H as number), s = progress.build(ctx);
  const sf = ctx.theme.safe, L = sf.side * ctx.W, R = ctx.W - sf.side * ctx.W, T = sf.top * ctx.H, B = ctx.H * (1 - sf.bottom);
  const seqs: Record<number, string> = {};
  let jumped = 0;
  for (const local of [0, 0.7, 1.5, 2.95, 3.05, 3.2, 3.4, 3.6, 3.9, 1.5, 3.4]) {
    progress.draw({ ...ctx, local, t: local }, s);
    const b = cardBox(s.more!.el.card);
    expect(b.deg).toBeCloseTo(-2, 6);
    expect(b.L).toBeGreaterThanOrEqual(L - 0.01);
    expect(b.R).toBeLessThanOrEqual(R + 0.01);
    expect(b.T).toBeGreaterThanOrEqual(T - 0.01);
    expect(b.B).toBeLessThanOrEqual(B + 0.01);
    expect(b.R - b.L).toBeLessThanOrEqual((R - L) * 0.45 + 0.01);
    // the jump goes into the frame: up from the bottom, down from the top
    if (position === 'bottom') expect(b.ty).toBeLessThanOrEqual(0); else expect(b.ty).toBeGreaterThanOrEqual(0);
    jumped = Math.max(jumped, Math.abs(b.ty));
    if (local < 3) {
      // at rest: against the corner align and position name
      if (align === 'left') expect(b.L).toBeCloseTo(L, 1); else expect(b.R).toBeCloseTo(R, 1);
      if (position === 'bottom') expect(b.B).toBeCloseTo(B, 1); else expect(b.T).toBeCloseTo(T, 1);
    }
    const seq = s.more!.root.innerHTML;
    if (local in seqs) expect(seq).toBe(seqs[local]);
    seqs[local] = seq;
  }
  expect(jumped).toBeGreaterThan(0);
  expect(css(s.cv).display).toBe('none');
});

test('stamps: one stamp more at each fifth, the newest crisp and the older ones lighter; full turns them all the done colour and the card jumps', () => {
  const ctx = ctxOf({ mode: 'stamps', position: 'bottom', color: '#00ff00', done: '#0000ff' }), s = progress.build(ctx);
  expect(s.more!.list).toHaveLength(5);
  progress.draw({ ...ctx, local: 0.5, t: 0.5 }, s);
  expect(shown(s)).toEqual([false, false, false, false, false]);
  progress.draw({ ...ctx, local: 1.5, t: 1.5 }, s);
  expect(shown(s)).toEqual([true, true, false, false, false]);
  const [old, newest] = s.more!.list.map((el) => Number(css(el).opacity));
  expect(newest).toBe(1);
  expect(old).toBeCloseTo(0.9, 6);
  for (const el of s.more!.list.slice(0, 2)) expect(css(el).color).toBe('#00ff00');
  // each stamp turned its own way, fixed by its number
  const tilts = s.more!.list.map((el) => Number(/rotate\((-?[\d.]+)deg\)/.exec(css(el).transform)?.[1]));
  for (const t of tilts) expect(Math.abs(t)).toBeLessThanOrEqual(12);
  expect(new Set(tilts.map((t) => t.toFixed(2))).size).toBeGreaterThan(2);
  // landing: bigger and fainter just after the progress reaches it
  progress.draw({ ...ctx, local: 1.85, t: 1.85 }, s);
  const landing = css(s.more!.list[2]);
  expect(Number(/scale\(([\d.]+)\)/.exec(landing.transform)?.[1])).toBeGreaterThan(1.1);
  expect(Number(landing.opacity)).toBeLessThan(1);
  progress.draw({ ...ctx, local: 3.1, t: 3.1 }, s);
  expect(shown(s)).toEqual([true, true, true, true, true]);
  expect(css(s.more!.list[4]).color).toBe('#00ff00');
  expect(cardBox(s.more!.el.card).ty).toBe(0);
  progress.draw({ ...ctx, local: 3.4, t: 3.4 }, s);
  for (const el of s.more!.list) expect(css(el).color).toBe('#0000ff');
  expect(cardBox(s.more!.el.card).ty).toBeLessThan(0);
  progress.draw({ ...ctx, local: 3.8, t: 3.8 }, s);
  expect(cardBox(s.more!.el.card).ty).toBe(0);
  for (const el of s.more!.list) expect(css(el).color).toBe('#0000ff');
});

test('stamps: the empty cells are dashed ink circles; twelve make two rows; the drawn stamp is a ring with a star', () => {
  const ctx = ctxOf({ mode: 'stamps', dots: 12, ink: '#102030' }), s = progress.build(ctx);
  progress.draw({ ...ctx, local: 1, t: 1 }, s);
  const cells = Array.from({ length: 12 }, (_, i) => s.more!.el[`cell${i}`]);
  for (const c of cells) {
    expect(css(c).borderStyle).toBe('dashed');
    expect(css(c).borderRadius).toBe('50%');
    expect(css(c).borderColor).toBe('rgba(16, 32, 48, 0.35)');
  }
  expect(new Set(cells.map((c) => css(c).top)).size).toBe(2);
  const svg = s.more!.list[0].querySelector('svg')!;
  expect(svg).not.toBeNull();
  expect(svg.querySelectorAll('circle').length).toBeGreaterThanOrEqual(1);
  expect(svg.querySelector('polygon, path')).not.toBeNull();
});

test('stamps: a chapter has the stamps before it down from the start', () => {
  const ctx = ctxOf({ mode: 'stamps', dots: 5, step: 2 }), s = progress.build(ctx);
  progress.draw({ ...ctx, local: 0, t: 0 }, s);
  expect(shown(s)).toEqual([true, true, false, false, false]);
  progress.draw({ ...ctx, local: 3.5, t: 3.5 }, s);
  expect(shown(s)).toEqual([true, true, true, false, false]);
  // not the last chapter: never full, so no jump
  expect(cardBox(s.more!.el.card).ty).toBe(0);
  // a step past the last cell is the last chapter
  const last = ctxOf({ mode: 'stamps', dots: 5, step: 9 }), sl = progress.build(last);
  progress.draw({ ...last, local: 0, t: 0 }, sl);
  expect(shown(sl)).toEqual([true, true, true, true, false]);
});

test('stamps: an emoji stamp is the emoji (not recoloured, not mirrored); a picture that fails gives the drawn stamp back', () => {
  const ctx = ctxOf({ mode: 'stamps', runner: '⭐' }, 3.5), s = progress.build(ctx);
  progress.draw(ctx, s);
  for (let i = 0; i < 5; i++) {
    expect(s.more!.el[`stamp${i}Text`].textContent).toBe('⭐');
    expect(css(s.more!.el[`stamp${i}Text`]).display).toBe('block');
    expect(css(s.more!.el[`ink${i}`]).display).toBe('none');
    expect(css(s.more!.list[i]).transform).not.toMatch(/scale\(-/);
  }
  const p = ctxOf({ mode: 'stamps', runner: 'media/nope.png' }, 3.5), sp = progress.build(p);
  const imgs = [...sp.more!.root.querySelectorAll('img')];
  expect(imgs).toHaveLength(5);
  expect(imgs[0].getAttribute('src')).toBe('media/nope.png');
  for (const img of imgs) { Object.defineProperty(img, 'complete', { value: true }); Object.defineProperty(img, 'naturalWidth', { value: 0 }); }
  progress.draw(p, sp);
  for (let i = 0; i < 5; i++) {
    expect(css(imgs[i]).display).toBe('none');
    expect(css(sp.more!.el[`ink${i}`]).display).toBe('block');
  }
});

test.each([{ size: 1 }, { size: 8 }, { size: 8, dots: 12 }, { size: 8, dots: 2 }])('stamps %o: inside the safe area at 9:16 and 16:9, no NaN', (params) => {
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) {
    const ctx = ctxOf({ mode: 'stamps', position: 'bottom', ...params }, 0, document.createElement('div'), W, H), s = progress.build(ctx), sf = ctx.theme.safe;
    for (const local of [0, 1.5, 3.2, 3.4, 3.5]) {
      progress.draw({ ...ctx, local, t: local }, s);
      const b = cardBox(s.more!.el.card);
      for (const v of [b.L, b.R, b.T, b.B]) expect(Number.isFinite(v)).toBe(true);
      expect(b.L).toBeGreaterThanOrEqual(sf.side * W - 0.01);
      expect(b.R).toBeLessThanOrEqual(W - sf.side * W + 0.01);
      expect(b.T).toBeGreaterThanOrEqual(sf.top * H - 0.01);
      expect(b.B).toBeLessThanOrEqual(H * (1 - sf.bottom) + 0.01);
      expect(b.R - b.L).toBeLessThanOrEqual((W - 2 * sf.side * W) * 0.45 + 0.01);
      for (const el of s.more!.list) for (const v of [css(el).left, css(el).top, css(el).width]) expect(Number.isFinite(parseFloat(v))).toBe(true);
    }
  }
});

test('stamps: a 0.5 s item (and one of none) draws without throwing', () => {
  for (const dur of [0.5, 0]) {
    const ctx = { ...ctxOf({ mode: 'stamps' }), dur }, s = progress.build(ctx);
    for (const local of [0, 0.1, 0.25, 0.4, 0.5]) expect(() => progress.draw({ ...ctx, local, t: local }, s)).not.toThrow();
  }
});

test('switching stamps → ring → bar → stamps: one root at a time, the old elements hidden', () => {
  recorder();
  const st = ctxOf({ mode: 'stamps' }), s = progress.build(st);
  progress.draw(st, s);
  expect(s.more!.root.dataset.more).toBe('stamps');
  progress.draw(ctxOf({ mode: 'ring' }, 1, st.root), s);
  expect(s.more!.root.dataset.more).toBe('ring');
  progress.draw(ctxOf({ mode: 'bar' }, 1, st.root), s);
  expect(css(s.more!.root).display).toBe('none');
  progress.draw(st, s);
  expect(s.more!.root.dataset.more).toBe('stamps');
  expect(css(s.cv).display).toBe('none');
  expect(st.root.querySelectorAll(':scope > [data-more]').length).toBe(1);
});

// a mode's own colours (withModeDefaults): stretch, battery and vine, where the item gives none, over the project theme's accent too
test("stretch, battery and vine: their own colours where the item gives none, over the theme's accent; the item's own colour wins", () => {
  const log = recorder(), theme = resolveTheme({ palette: { accent: '#00ff00' } }, { width: 1080, height: 1920 });
  const themed = (params: Record<string, unknown>, local = 1.5) => ({ ...ctxOf(params, local), theme, params: withDefaults(progress.params, params, theme) });
  const fills = (ctx: any) => { const s = progress.build(ctx); log.length = 0; progress.draw(ctx, s); return new Set(log.filter((c) => c.op === 'fill').map((c) => c.fillStyle)); };
  const dog = themed({ mode: 'stretch' });
  expect(dog.params.color).toBe('#00ff00');
  expect(fills(dog).has('#c98a4b')).toBe(true);
  expect(fills(dog).has('#00ff00')).toBe(false);
  expect(fills(themed({ mode: 'stretch', color: '#123456' })).has('#123456')).toBe(true);
  const bat = themed({ mode: 'battery' }), sb = progress.build(bat);
  progress.draw(bat, sb);
  expect(css(sb.more!.list[0]).background).toBe('#34c759');
  const vine = fills(themed({ mode: 'vine' }, 3.6));
  for (const c of ['#4caf50', '#ff8fb1']) expect(vine.has(c)).toBe(true);
  // vine: as thick as its template, 16, unless the item gives a thickness
  const thick = themed({ mode: 'vine' }, 3.6), thin = themed({ mode: 'vine', thickness: 12 }, 3.6);
  const tall = (ctx: any) => { const s = progress.build(ctx); log.length = 0; progress.draw(ctx, s); const ys = canvasBoxes(log).map(([, y]) => y); return Math.max(...ys) - Math.min(...ys); };
  expect(tall(thick)).toBeGreaterThan(tall(thin) * 1.2);
});

test('paws, ring, stamps and battery on a 16:9 frame are as big as on 9:16; fuse grows by the square root of 16:9', () => {
  const log = recorder();
  const at = (params: Record<string, unknown>, W: number, H: number) => { const ctx = ctxOf(params, 2, document.createElement('div'), W, H), s = progress.build(ctx); log.length = 0; progress.draw(ctx, s); return s; };
  // ring: the ground's radius
  const ground = () => (log.find((c) => c.op === 'arc')!.args as number[])[2];
  at({ mode: 'ring' }, 1080, 1920); const tall = ground();
  at({ mode: 'ring' }, 1920, 1080); expect(ground()).toBeCloseTo(tall, 6);
  // stamps: the card's width
  const card = (s: any) => parseFloat(css(s.more!.el.card).width);
  expect(card(at({ mode: 'stamps' }, 1920, 1080))).toBeCloseTo(card(at({ mode: 'stamps' }, 1080, 1920)), 6);
  // paws: a toe's size
  const toe = () => (log.find((c) => c.op === 'ellipse')!.args as number[])[2];
  at({ mode: 'paws', dots: 12 }, 1080, 1920); const pt = toe();
  at({ mode: 'paws', dots: 12 }, 1920, 1080); expect(toe()).toBeCloseTo(pt, 6);
  // fuse: the bomb's box
  const bomb = (s: any) => parseFloat(css(s.more!.el.goal).width);
  expect(bomb(at({ mode: 'fuse' }, 1920, 1080)) / bomb(at({ mode: 'fuse' }, 1080, 1920))).toBeCloseTo(4 / 3, 3);
  // battery: its outline and the percentage's size
  const battery = (s: any) => [parseFloat(css(s.more!.el.body).width), parseFloat(css(s.more!.el.body).height), parseFloat(css(s.more!.el.text).fontSize)];
  const wide = battery(at({ mode: 'battery', position: 'bottom' }, 1920, 1080)), tallB = battery(at({ mode: 'battery', position: 'bottom' }, 1080, 1920));
  wide.forEach((v, i) => expect(v).toBeCloseTo(tallB[i], 1));
  // on 9:16 it is size % of the frame height, as before: 2.4 % of 1920 tall, 2.6 times that wide
  expect(tallB[0]).toBeCloseTo(0.024 * 1920 * 2.6, 1);
});

test('defaultsFor: the editor is told the colours stretch, battery, vine and ring draw with when unset, from the table drawing reads', () => {
  for (const mode of ['stretch', 'battery', 'vine', 'ring'] as const) expect(progress.defaultsFor!({ mode })).toEqual(MODE_DEFAULTS[mode]);
  expect(progress.defaultsFor!({ mode: 'vine' })).toMatchObject({ color: '#4caf50', done: '#ff8fb1', thickness: 16 });
  // the other modes, and an item with no mode (bar, the param's default): none of their own
  expect(progress.defaultsFor!({ mode: 'ring' })).toEqual({ track: '#ffffffb3' });
  for (const set of [{ mode: 'rocket' }, { mode: 'bar' }, {}]) expect(progress.defaultsFor!(set)).toEqual({});
  // what an unset field shows (engine unsetValue) is what withModeDefaults draws with; a set one, or a param the mode has none for, as before
  const theme = resolveTheme({ palette: { accent: '#00ff00' } }, { width: 1080, height: 1920 }), def = (k: string) => progress.params.find((d) => d.key === k)!;
  for (const set of [{ mode: 'battery' }, { mode: 'vine' }, { mode: 'stretch', color: '#123456' }, { mode: 'ring' }] as Array<Record<string, unknown>>) {
    const drawn = withModeDefaults(withDefaults(progress.params, set, theme) as any, set);
    for (const k of ['color', 'done', 'thickness', 'track']) if (!(k in set)) expect([set, k, unsetValue(progress, def(k), set, theme)]).toEqual([set, k, drawn[k]]);
  }
  expect(unsetValue(progress, def('color'), { mode: 'ring' }, theme)).toBe('#00ff00');
});
