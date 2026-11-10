// @vitest-environment jsdom
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { stripeColors, stripeSpan, tileSeam, vortexAlpha, wipe } from './wipe.ts';

// jsdom has no canvas: curl's shadow is drawn on a 2D context that takes every call and does nothing
const noop: any = new Proxy(() => noop, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : noop), set: () => true });
beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => noop) as any; });

const media: any ={ begin() {}, video() {}, place() {}, stillUrl: () => '', sync: async () => {}, image() {} };
const project = (art: string): any => ({
  version: 1, meta: { width: 400, height: 400, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
  tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'w', type: 'common.wipe', start: 0, end: 4, params: { mode: 'curl', art } }] }],
});

test('curl: the blocks hosted on both sheets are disposed when the block is swapped or the wipe goes (a 3D block frees its GPU things)', () => {
  const log: string[] = [];
  const art = (type: string): ItemType => ({ type, label: type, kind: 'overlay', params: [], build: () => ({ type }),
    draw() {}, dispose: (s: any) => log.push(`dispose ${s.type}`) });
  const st = new Stage(document.createElement('div'), createRegistry([{ id: 'x', items: [wipe, art('fx.a'), art('fx.b')] } as any]), media);
  st.load(project('fx.a'));
  st.draw(1);
  st.update(project('fx.b'));
  st.draw(1);
  expect(log).toEqual(['dispose fx.a', 'dispose fx.a']);   // the front sheet and its ghost
  st.update({ ...project('fx.b'), tracks: [{ id: 'o', kind: 'overlay', items: [] }] });
  expect(log.slice(2)).toEqual(['dispose fx.b', 'dispose fx.b']);
});

test('dir left mirrors the band and the hand, but never the vortex: its words stay readable and it spins the other way instead', () => {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [wipe] } as any]), media);
  const at = (mode: string, dir: string) => {
    st.load({ ...project(''), tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'w', type: 'common.wipe', start: 0, end: 4, params: { mode, dir } }] }] });
    st.draw(1);
    const wrap = root.querySelector('canvas')?.parentElement as HTMLElement | undefined;
    return wrap?.style.transform;
  };
  expect(at('band', 'left')).toBe('scaleX(-1)');
  expect(at('hand', 'left')).toBe('scaleX(-1)');
  expect(at('vortex', 'left')).toBe('none');
  expect(at('vortex', 'right')).toBe('none');
  expect(at('tiles', 'left')).toBe('none');
});

describe('stripeSpan', () => {
  test('for 1 to 12 colours the last stripe covers all at the middle and every stripe has left at the end', () => {
    for (let n = 1; n <= 12; n++) {
      const [l, r] = stripeSpan(0.5, n - 1, n);
      expect(l).toBeLessThanOrEqual(-1); expect(r).toBeGreaterThanOrEqual(1 - 1e-9);
      for (let i = 0; i < n; i++) {
        const [, r0] = stripeSpan(0, i, n);
        expect(r0).toBeLessThanOrEqual(-1 + 1e-9);   // nothing shows at the start
        const [l1, r1] = stripeSpan(1, i, n);
        expect(l1).toBeGreaterThanOrEqual(r1 - 1e-9); expect(l1).toBeGreaterThanOrEqual(1 - 1e-9);
      }
    }
  });
  test('up to eight colours keep the 0.11 lag the dopamine film was made with', () => {
    // stripe 1 of 4 is 0.11 behind stripe 0: where stripe 0 is at u, stripe 1 is at u + 0.11 / 2
    expect(stripeSpan(0.2 + 0.055, 1, 4)[1]).toBeCloseTo(stripeSpan(0.2, 0, 4)[1], 9);
    expect(stripeSpan(0.2 + 0.055, 1, 8)[1]).toBeCloseTo(stripeSpan(0.2, 0, 8)[1], 9);
  });
});

describe('small modes', () => {
  test('vortex: a short item still reaches full cover at its middle (the fade is at most half the item)', () => {
    expect(vortexAlpha(0.1, 0.2)).toBe(1);
    expect(vortexAlpha(0.06, 1)).toBeCloseTo(0.5, 9);
    expect(vortexAlpha(0.5, 1)).toBe(1);
    expect(vortexAlpha(0.97, 1)).toBeCloseTo(0.25, 9);
  });
  test('tiles: line 0 means no seams at all; otherwise at least a pixel', () => {
    expect(tileSeam(0, 1)).toBe(0);
    expect(tileSeam(10, 1)).toBe(4);
    expect(tileSeam(1, 0.5)).toBe(1);
  });
  test('stripes: a colour that cannot be read is left out, not painted in the one before it', () => {
    expect(stripeColors('#ff3ea5, nope ,#3b4cf0', '#000000')).toEqual(['#ff3ea5', '#3b4cf0']);
    expect(stripeColors('', '#c6f03a')).toEqual(['#c6f03a']);
    expect(stripeColors('nope', '#c6f03a')).toEqual(['#c6f03a']);
  });
});
