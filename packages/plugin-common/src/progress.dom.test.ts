// @vitest-environment jsdom
// common.progress pencil: a frame drawn on the canvas kept from the frame before looks the same as one drawn on a fresh canvas.
import { createRegistry, motion, resolveTheme, Stage, withDefaults, type ItemType } from '@tellcut/engine';
import { progress, TOP_LANE } from './progress.ts';

const css = (el: Element) => ((el as any)._c ?? {}) as Record<string, string>;

function recorder() {
  const log: Array<{ op: string; globalAlpha: number; args: unknown[] }> = [];
  const st: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, lineCap: 'butt', lineJoin: 'miter' };
  const g: any = new Proxy({}, {
    get: (_t, k) => (typeof k === 'symbol' ? undefined : k in st ? st[k as string]
      : (...args: unknown[]) => { log.push({ op: String(k), globalAlpha: st.globalAlpha as number, args }); return k === 'measureText' ? { width: 10 } : /^create\w*Gradient$/.test(String(k)) ? { addColorStop() {} } : undefined; }),
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
  for (const mode of ['runner', 'stretch', 'paws', 'segments', 'fuse', 'battery']) {
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
