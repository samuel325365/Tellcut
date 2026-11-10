// @vitest-environment jsdom
// common.monoframe / common.filmstrip and the title look cycle (2026-11-05, the Mono Frame pilot film's fx.monoframe / fx.filmstrip /
// fx.monotitle). jsdom has no canvas: the window keys, the strips' stills and the look's per-line styles are tested directly.
import { filmstrip, monoframe, monoWindow, parseStills, stripFrames, stripStill } from './mono.ts';
import { CYCLE_STEP, cycle } from './caption/looks/title.ts';

describe('common.monoframe', () => {
  test('a frame overlay; the window is the frame inside the border unless keys say otherwise', () => {
    expect([monoframe.kind, monoframe.category, filmstrip.kind, filmstrip.category]).toEqual(['overlay', 'frame', 'scene', 'frame']);
    const r = monoWindow('', 1, 1080, 1920, 0.05);
    expect(r[0]).toBe(0.05); expect(r[1]).toBeCloseTo(0.028125, 6); expect(r[2]).toBeCloseTo(0.9, 6);
  });

  test('keys hold before the first, ease between, hold after the last', () => {
    const keys = '0|0.1,0.4,0.8,0.2\n1|0.1,0.4,0.8,0.2\n2|0,0,1,1';
    expect(monoWindow(keys, -1, 1080, 1920, 0.05)).toEqual([0.1, 0.4, 0.8, 0.2]);
    expect(monoWindow(keys, 0.5, 1080, 1920, 0.05)).toEqual([0.1, 0.4, 0.8, 0.2]);
    const mid = monoWindow(keys, 1.5, 1080, 1920, 0.05);
    expect(mid[0]).toBeCloseTo(0.05, 6); expect(mid[3]).toBeCloseTo(0.6, 6);
    expect(monoWindow(keys, 9, 1080, 1920, 0.05)).toEqual([0, 0, 1, 1]);
  });
});

describe('common.filmstrip', () => {
  test('stills read as numbers; it declares one still each', () => {
    expect(parseStills('53.6, 837.4 990.5,，x')).toEqual([53.6, 837.4, 990.5]);
    const item = { id: 'f', type: filmstrip.type, start: 0, end: 4, params: { source: 'v', stills: '1, 2' } } as any;
    expect(filmstrip.media!(item, {} as any)).toEqual({ videos: [], stills: [{ source: 'v', t: 1, w: 640 }, { source: 'v', t: 2, w: 640 }] });
  });

  test('a frame keeps its still as the strip scrolls a whole frame on; the right strip starts half way through the list', () => {
    // scrolling up one frame: the frame that was row k is now row k-1, with the same still
    expect(stripStill(2, 0, 0, 8)).toBe(stripStill(1, 0, 1, 8));
    // scrolling down one frame: row k is now row k+1
    expect(stripStill(2, 1, 0, 8)).toBe(stripStill(3, 1, 1, 8));
    expect(stripStill(0, 1, 0, 8)).toBe(4);
    expect(stripStill(-3, 0, 0, 8)).toBe(5);
  });
});

describe('common.filmstrip frames', () => {
  // a frame on the film keeps its place, still and edge number as the strip scrolls: just before, at and just after a whole
  // number of frames scrolled (the strip used to jump a frame at exactly k × pitch, and its numbers ran two a frame)
  test.each([0, 1])('strip %i: nothing jumps at whole frames', (col) => {
    const pitch = 300, H = 1920, n = 5;
    for (const m of [0, 1, 2, 7]) {
      const at = (run: number) => stripFrames(run, pitch, col, n, H);
      const before = at(m * pitch - 0.01 + (m ? 0 : 0.02)), exact = at(m * pitch), after = at(m * pitch + 0.01);
      for (const other of [before, after]) for (const f of exact) {
        if (f.y < 0 || f.y > H) continue;
        const g = other.find((o) => Math.abs(o.y - f.y) < 0.5);
        expect(g, `m ${m} y ${f.y}`).toBeDefined();
        expect([g!.still, g!.no]).toEqual([f.still, f.no]);
      }
    }
  });
});

describe('title look cycle', () => {
  test('one line solid, the others outlined in the words\' colour; the solid one steps down every CYCLE_STEP', () => {
    const lines = [0, 1, 2].map(() => document.createElement('div'));
    const env = (local: number) => ({ p: { color: '#ffffff' }, local, px: 100 }) as any;
    cycle.lines!(lines, env(CYCLE_STEP * 1.5));
    const solid = lines.map((l) => (l as any)._c?.color === '' || l.style.color === '');
    expect(lines.map((l) => ((l as any)._c ?? {}).webkitTextStroke ?? l.style.getPropertyValue('-webkit-text-stroke'))).toEqual(['2.8px #ffffff', '0', '2.8px #ffffff']);
    expect(solid[1]).toBe(true);
    cycle.lines!(lines, env(CYCLE_STEP * 3.2));
    expect(((lines[0] as any)._c ?? {}).webkitTextStroke).toBe('0');
  });
});

// a 2D context that counts what it is asked to draw (jsdom has none)
function counting() {
  const n: Record<string, number> = {};
  const g: any = new Proxy({}, { get: (_t, k) => (typeof k === 'symbol' ? undefined : k === 'measureText' ? (s: string) => ({ width: String(s).length * 10 }) : (..._a: unknown[]) => { n[k as string] = (n[k as string] ?? 0) + 1; }), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
  return n;
}
const frameCtx = (params: Record<string, unknown>) => {
  const all = { ...Object.fromEntries(monoframe.params.map((d) => [d.key, d.default])), ...params } as any;
  return { root: document.createElement('div'), params: all, W: 1080, H: 1920, t: 1, local: 1, dur: 3 } as any;
};

describe('common.monoframe: fixes', () => {
  afterEach(() => vi.restoreAllMocks());
  test('window keys written out of order are eased in time order', () => {
    const keys = '2|0,0,1,1\n0|0.1,0.4,0.8,0.2';
    expect(monoWindow(keys, 0, 1080, 1920, 0.05)).toEqual([0.1, 0.4, 0.8, 0.2]);
    expect(monoWindow(keys, 1, 1080, 1920, 0.05)).toEqual(monoWindow('0|0.1,0.4,0.8,0.2\n2|0,0,1,1', 1, 1080, 1920, 0.05));
    expect(monoWindow(keys, 3, 1080, 1920, 0.05)).toEqual([0, 0, 1, 1]);
  });
  test('no words: the bands alone, no line of blanks written across every band', () => {
    const n = counting(), ctx = frameCtx({ text: '' }), s = monoframe.build(ctx);
    monoframe.draw(ctx, s);
    expect(n.fillRect).toBeGreaterThan(10);
    expect(n.fillText ?? 0).toBe(0);
    const m = counting(), c2 = frameCtx({ text: '  ' }), s2 = monoframe.build(c2);
    monoframe.draw(c2, s2);
    expect(m.fillText ?? 0).toBe(0);
  });
  test('a font that fails to load does not fail ready', async () => {
    const was = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => Promise.reject(new Error('no font')) } });
    try {
      await expect(monoframe.ready!({ text: 'X' } as any)).resolves.toBeUndefined();
    } finally { was ? Object.defineProperty(document, 'fonts', was) : delete (document as any).fonts; }
  });
});
