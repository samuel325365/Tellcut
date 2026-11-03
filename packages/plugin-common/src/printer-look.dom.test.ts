// @vitest-environment jsdom
// 2026-11-01: common.printer redrawn as a real POS printer on a counter. jsdom has no 2D context: the canvas is a stand-in that
// answers every call, the tests read the block's state and what cssCamel last wrote (`_c`).
import { resolveTheme, withDefaults, type ItemType } from '@tellcut/engine';
import { bodyWidth, printer, printerFontOk, printerLines } from './printer.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === 'width' ? 10 : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const real = { getContext: HTMLCanvasElement.prototype.getContext };
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : t[k]) }); }; });
afterAll(() => Object.assign(HTMLCanvasElement.prototype, real));

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
function run<S>(type: ItemType<any, S>, params: Record<string, unknown>, local: number, W = 1080, H = 1920) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const item: any = { id: 'x', type: type.type, start: 0, end: 4, params };
  const project: any = { version: 1, meta: { width: W, height: H, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [], tracks: [] };
  const ctx: any = { t: local, local, dur: 4, item, params: withDefaults(type.params, params, theme), root, top: document.createElement('div'), project, media, W, H, fps: 30, theme, grades: {}, motion: {} };
  const s = type.build(ctx);
  type.draw(ctx, s);
  return { s: s as any, theme, draw: (t: number) => { ctx.t = ctx.local = t; type.draw(ctx, s); } };
}
const css = (el: Element) => (el as any)._c as Record<string, string>;

describe('common.printer: the real-printer look', () => {
  test('the body is 920 units wide, wider for a wide paper so the slot and its tear bar stay inside it', () => {
    expect(bodyWidth(Math.round(0.685 * 1080))).toBe(920);
    expect(bodyWidth(Math.round(0.85 * 1080))).toBe(918 + 150);
  });

  test('a lit counter is laid under a video window (clip set), not with surface none, and not when clip is -1', () => {
    expect(run(printer, { clip: 0.4 }, 1).s.counterC).toBeTruthy();
    expect(run(printer, { clip: 0.4, surface: 'none' }, 1).s.counterC).toBeNull();
    expect(run(printer, {}, 1).s.counterC).toBeNull();
  });

  test('the counter, body, paper and its shadow are drawn once and reused frame after frame', () => {
    const r = run(printer, { clip: 0.4 }, 0.5), { counterC, bodyC, paperC, shadowC, barC, glassC } = r.s;
    expect([counterC, bodyC, paperC, shadowC, barC, glassC].every(Boolean)).toBe(true);
    r.draw(1.5); r.draw(0.2);
    expect([r.s.counterC, r.s.bodyC, r.s.paperC, r.s.shadowC, r.s.barC, r.s.glassC]).toEqual([counterC, bodyC, paperC, shadowC, barC, glassC]);
  });

  test('by default the VFD recess rests on the bottom safe line: the model name sits in the controls row under it', () => {
    const { s, theme } = run(printer, {}, 1), slotY = (1 - theme.safe.bottom) * 1920 - 134;
    expect(parseFloat(css(s.modelG).top)).toBeCloseTo(slotY + 200 + 11);
    expect(parseFloat(css(s.modelG).left)).toBeCloseTo((1080 - 920) / 2 + 920 - 64);
    // a given slot still puts the slot there
    expect(parseFloat(css(run(printer, { slot: 0.6 }, 1).s.modelG).top)).toBeCloseTo(0.6 * 1920 + 211);
  });
});

describe('common.printer on a frame whose short side is under 1080', () => {
  // a 2D context that keeps its transform (setTransform, scale, save/restore) and notes it at every clearRect
  function recorder() {
    let m = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [], clears: number[][] = [];
    const own: Record<string, unknown> = {
      setTransform: (...a: number[]) => { m = a.slice(0, 6); },
      scale: (x: number, y: number) => { m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]]; },
      save: () => { stack.push(m); }, restore: () => { m = stack.pop() ?? m; },
      clearRect: () => { clears.push(m); },
    };
    return { clears, g: new Proxy(anything, { get: (t, k) => (k in own ? own[k as string] : t[k]) }) };
  }

  test('the second frame is cleared whole: draw leaves no scale behind for canvasAt to clear with', () => {
    const r = run(printer, {}, 0.5, 720, 1280), rec = recorder();
    (r.s.cv as any).getContext = () => rec.g;
    r.draw(1); r.draw(1.5);
    expect(rec.clears).toEqual([[1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 0]]);
  });
});

describe('common.printer: its fonts', () => {
  const fonts = (doc: any) => { const was = Object.getOwnPropertyDescriptor(document, 'fonts'); Object.defineProperty(document, 'fonts', { value: doc, configurable: true }); return () => (was ? Object.defineProperty(document, 'fonts', was) : delete (document as any).fonts); };

  test('ready loads the receipt font in the weights it uses and the stamp\'s own characters', async () => {
    const loads: string[][] = [];
    const undo = fonts({ load: async (f: string, text: string) => { loads.push([f, text]); return []; }, check: () => true });
    try {
      const params = withDefaults(printer.params, { font: 'Inter', stamp: '吃飽了' }, resolveTheme(undefined, { width: 1080, height: 1920 }));
      const s: any = printer.build({ params, root: document.createElement('div') } as any);
      await printer.ready!(s);
    } finally { undo(); }
    expect(loads.some(([f]) => f.startsWith("500 20px 'Inter'"))).toBe(true);
    expect(loads.some(([f]) => f.startsWith("700 20px 'Inter'"))).toBe(true);
    expect(loads).toContainEqual(["900 74px 'Noto Serif TC', serif", '吃飽了']);
  });

  test('the font counts as there only when every weight a line uses is, and the model name\'s 700 too', () => {
    const L = printerLines('0|title|標題\n0.5|shop|店名', false).lines, have = new Set<string>();
    const undo = fonts({ check: (f: string) => have.has(f.split(' ')[0]) });
    try {
      have.add('700');
      expect(printerFontOk(L, 'Inter', '')).toBe(false);   // the title is 500
      have.add('500');
      expect(printerFontOk(L, 'Inter', 'TP-16')).toBe(true);
      have.delete('700');
      expect(printerFontOk(printerLines('0|title|標題', false).lines, 'Inter', 'TP-16')).toBe(false);   // the model is 700
    } finally { undo(); }
  });
});
