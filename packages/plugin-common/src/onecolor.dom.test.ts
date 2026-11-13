// @vitest-environment jsdom
// common.grade / common.wash / common.viewfinder / common.echo / common.poster / common.band, countdown's look slant and the caption
// look boxes (2026-11-06, the Single Color pilot film). jsdom has no canvas: the step and photo helpers, the declared stills and the
// layers' blend modes are tested.
import { band } from './band.ts';
import { echo, echoMono } from './echo.ts';
import { grade, gradeFill } from './grade.ts';
import { parseValueSteps, stepsOf, valueAt } from './onecolor-kit.ts';
import { parsePhotos, photoIndex, poster, posterLayout } from './poster.ts';
import { shotNo, viewfinder } from './viewfinder.ts';
import { wash } from './wash.ts';
import { stepColor } from './countdown.ts';
import { boxes } from './caption/looks/paper.ts';
import { createRegistry, Stage } from '@tellcut/engine';

describe('kinds and blends', () => {
  test('the grade blends colour (then deep\'s multiply), the wash multiplies, the poster sits under the footage', () => {
    expect([grade.blend, wash.blend, grade.kind, wash.kind]).toEqual([['color', 'multiply'], 'multiply', 'overlay', 'overlay']);
    expect([viewfinder, echo, poster, band].map((b) => [b.kind, b.category])).toEqual([['overlay', 'frame'], ['overlay', 'text'], ['scene', 'frame'], ['overlay', 'text']]);
  });
});

describe('steps', () => {
  const steps = parseValueSteps('0.8|none\n0|bw\n0.4|mono\n\n');
  test('read in time order; the value in force at a time, none before the first', () => {
    expect(steps).toEqual([{ t: 0, v: 'bw' }, { t: 0.4, v: 'mono' }, { t: 0.8, v: 'none' }]);
    expect([valueAt(steps, 0.2), valueAt(steps, 0.4), valueAt(steps, 5)]).toEqual(['bw', 'mono', 'none']);
    expect(valueAt(parseValueSteps('1|bw'), 0.5)).toBe('none');
  });
  test('parsed once per value: the same text gives the list kept, another text a new one', () => {
    const m = { list: [] as Array<{ t: number; v: string }> }, a = stepsOf(m, '0|bw\n1|mono');
    expect(stepsOf(m, '0|bw\n1|mono')).toBe(a);
    expect(stepsOf(m, '0|mono')).toEqual([{ t: 0, v: 'mono' }]);
  });
  test('the wash starts with the grade\'s own steps, as its doc says', () => {
    const def = (b: { params: Array<{ key: string; default: unknown }> }) => b.params.find((x) => x.key === 'steps')!.default;
    expect(def(wash as any)).toBe(def(grade as any));
  });
  test('grade fills: grey for bw, its colour for mono, a #colour itself, nothing otherwise', () => {
    expect([gradeFill('bw', '#f50'), gradeFill('mono', '#f50'), gradeFill('#2a6fdb', '#f50'), gradeFill('none', '#f50'), gradeFill('teal', '#f50')])
      .toEqual(['#808080', '#f50', '#2a6fdb', 'transparent', 'transparent']);
  });
});

describe('common.viewfinder', () => {
  test('the counter counts the cuts that have come, never below one', () => {
    expect(shotNo('0, 1.2,2.4', 0)).toEqual({ n: 1, total: 3 });
    expect(shotNo('0,1.2,2.4', 1.3)).toEqual({ n: 2, total: 3 });
    expect(shotNo('2', 0)).toEqual({ n: 1, total: 1 });
  });
});

describe('common.poster', () => {
  test('photos read source|seconds|focus; each declared as a still', () => {
    expect(parsePhotos('a|2|0.3,0.6\nb')).toEqual([{ source: 'a', t: 2, fx: 0.3, fy: 0.6 }, { source: 'b', t: 0, fx: 0.5, fy: 0.5 }]);
    const item = { id: 'p', type: poster.type, start: 0, end: 2, params: { photos: 'a|2\nb|0' } } as any;
    expect(poster.media!(item, {} as any)).toEqual({ videos: [], stills: [{ source: 'a', t: 2, w: 1080 }, { source: 'b', t: 0, w: 1080 }] });
  });
  test('the layout of 9:16 as it always was; at 16:9 and 1:1 the card shrinks so the words and the barcode stay inside the frame', () => {
    const tall = posterLayout(1080, 1920, true);
    expect([tall.cw, tall.ch, tall.cx, tall.cy, tall.tpx, tall.byy, tall.bh].map((v) => +v.toFixed(3))).toEqual([820.8, 615.6, 129.6, 451.2, 190, 1699.2, 44]);
    expect(tall.ty).toBeCloseTo(0.235 * 1920 - 0.07 * 1920, 6);
    expect(tall.by).toBeCloseTo(0.235 * 1920 + 615.6 + 0.062 * 1920, 6);
    for (const [W, H] of [[1080, 1920], [1920, 1080], [1080, 1080], [1080, 1350]]) for (const barcode of [true, false]) {
      const L = posterLayout(W, H, barcode), half = 0.55 * L.tpx;
      expect(L.ty - half).toBeGreaterThanOrEqual(0);                       // the top word's top
      expect(L.cy).toBeGreaterThan(L.ty + half);                           // the card under it
      expect(L.by - half).toBeGreaterThan(L.cy + L.ch);                    // the bottom word under the card
      expect(L.by + half).toBeLessThanOrEqual(barcode ? L.byy : H);        // and over the barcode
      expect(L.byy + L.bh + 40 * L.u).toBeLessThanOrEqual(H);              // the barcode and its line inside
      expect(L.cx).toBeGreaterThanOrEqual(0); expect(L.cx + L.cw).toBeLessThanOrEqual(W);
      expect(L.ch / L.cw).toBeCloseTo(0.75, 6);
    }
    const wide = posterLayout(1920, 1080, true);
    expect(wide.u).toBe(1);
    expect(wide.cy + wide.ch).toBeLessThan(0.75 * 1080);
  });
  test('several photos take turns round and round; none is -1', () => {
    expect([photoIndex(0, 0.25, 3), photoIndex(0.3, 0.25, 3), photoIndex(0.8, 0.25, 3), photoIndex(1, 0.25, 0)]).toEqual([0, 1, 0, -1]);
  });
});

describe('common.countdown look slant', () => {
  test('the colours take turns; none listed is the number colour', () => {
    expect([stepColor('#f50, #fff', 0, '#000'), stepColor('#f50,#fff', 1, '#000'), stepColor('#f50,#fff', 2, '#000'), stepColor('', 1, '#000')]).toEqual(['#f50', '#fff', '#f50', '#000']);
  });
});

describe('caption look boxes', () => {
  test('every line its own square block of the accent colour, flush left', () => {
    const lines = [document.createElement('div'), document.createElement('div')];
    boxes.lines!(lines, { p: { accent: '#ff5a1f' }, theme: { palette: { accent: '#123456' } } } as any);
    expect(lines.map((l) => [l.style.display, l.style.background || (l as any)._c?.background])).toEqual([['table', 'rgb(255, 90, 31)'], ['table', 'rgb(255, 90, 31)']]);
    expect(lines[1].style.margin).toBe('0.16em 0px 0px');
    expect(boxes.left).toBe(true);
  });
});

describe('common.band: fixes', () => {
  afterEach(() => vi.restoreAllMocks());
  test('no words: the band alone, not a blank written every pixel along it', () => {
    const n: Record<string, number> = {};
    const g: any = new Proxy({}, { get: (_t, k) => (typeof k === 'symbol' ? undefined : k === 'measureText' ? (s: string) => ({ width: String(s).length * 10 }) : (..._a: unknown[]) => { n[k as string] = (n[k as string] ?? 0) + 1; }), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
    for (const words of ['', '   ']) {
      for (const k of Object.keys(n)) delete n[k];
      const params = { ...Object.fromEntries(band.params.map((d) => [d.key, d.default])), words } as any;
      const ctx: any = { root: document.createElement('div'), params, W: 1080, H: 1920, t: 1, local: 1, dur: 3 }, s = band.build(ctx);
      band.draw(ctx, s);
      expect(n.fillRect).toBe(1);
      expect(n.fillText ?? 0).toBe(0);
    }
  });
  test('a font that fails to load does not fail ready', async () => {
    const was = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => Promise.reject(new Error('no font')) } });
    try {
      await expect(band.ready!({} as any)).resolves.toBeUndefined();
    } finally { was ? Object.defineProperty(document, 'fonts', was) : delete (document as any).fonts; }
  });
});

describe('common.grade deep (what common.wash did, in the same item)', () => {
  const params = (over: Record<string, unknown> = {}) => ({ ...Object.fromEntries(grade.params.map((d) => [d.key, d.default])), ...over }) as any;
  const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
  const film = (p: Record<string, unknown>) => ({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'g', type: 'common.grade', start: 0, end: 3, params: p }, { id: 'w', type: 'common.wash', start: 0, end: 3, params: {} }] }] }) as any;
  const staged = (p: Record<string, unknown>) => {
    const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [grade, wash] } as any]), media);
    st.load(film(p));
    const own = root.querySelector<HTMLElement>('.st-item[data-id="g"]')!, deep = root.querySelector<HTMLElement>('.st-more[data-id="g"]')!;
    return { root, st, own, deep };
  };
  test('deep is off by default and tone is the old wash colour; the wash is an old block now, pointing at the grade', async () => {
    const p = params();
    expect([p.deep, p.tone]).toEqual([false, wash.params.find((d) => d.key === 'tone')!.default]);
    const { OLD_BLOCKS } = await import('@tellcut/engine');
    expect(OLD_BLOCKS['common.wash']).toBe('common.grade');
  });
  test('without deep the second layer draws nothing', () => {
    const { st, own, deep } = staged({ steps: '0|mono' });
    st.draw(0.5);
    expect(own.firstElementChild!.getAttribute('style')).toContain('background');
    expect((deep.firstElementChild as HTMLElement).style.background).toBe('transparent');
  });
  test('deep multiplies the tone over the mono steps from the stage\'s layer right above the grade, as a wash item after it did', () => {
    const p = { steps: '0|bw\n1|mono\n2|none', deep: true, tone: '#ffa070' }, { root, st, own, deep } = staged(p);
    st.draw(1.5);
    const fillOf = () => (deep.firstElementChild as HTMLElement).style.background;
    expect(own.nextElementSibling).toBe(deep);
    expect([own.style.mixBlendMode, deep.style.mixBlendMode, deep.style.zIndex, deep.style.display]).toEqual(['color', 'multiply', own.style.zIndex, '']);
    // the same fill the old wash gave at each step
    for (const [local, want] of [[0.5, 'transparent'], [1.5, 'rgb(255, 160, 112)'], [2.5, 'transparent']] as const) {
      st.draw(local);
      const old = wash.build({ root: document.createElement('div'), params: { steps: p.steps, tone: p.tone } } as any);
      wash.draw({ local, params: { steps: p.steps, tone: p.tone } } as any, old);
      expect([fillOf(), old.d.style.background]).toEqual([want, want]);
    }
    // the stage shows, moves and removes it with the grade
    st.draw(3.5);
    expect(deep.style.display).toBe('none');
    const moved = film(p);
    moved.tracks[0].items[0].transform = { x: 0.1, y: 0, scale: 2 };
    st.update(moved);
    st.draw(1.5);
    expect([deep.style.display, deep.style.transform]).toEqual(['', own.style.transform]);
    expect(deep.style.transform).toContain('scale(2)');
    const gone = film(p);
    gone.tracks[0].items.shift();
    st.update(gone);
    expect([deep.isConnected, root.querySelectorAll('[data-id="g"]').length]).toEqual([false, 0]);
  });
});

describe('common.echo: steps can be left out', () => {
  const proj = (items: any[]) => ({ tracks: [{ id: 'o', kind: 'overlay', items }] }) as any;
  const g = (start: number, end: number, steps: string) => ({ id: `g${start}`, type: 'common.grade', start, end, params: { steps } });
  test('empty steps follow the film\'s common.grade at the same moment (its own seconds, from its start)', () => {
    const p = proj([g(2, 10, '0|bw\n1|mono\n3|none'), { id: 'e', type: 'common.echo', start: 3, end: 6, params: {} }]), memo = {};
    expect([1, 2.5, 3.2, 4.9, 5.5].map((t) => echoMono(memo, p, '', t, t - 3))).toEqual([false, false, true, true, false]);
  });
  test('its own steps still win; no grade, or one with no steps given, is never mono', () => {
    const p = proj([g(0, 10, '0|mono')]), memo = {};
    expect([echoMono(memo, p, '', 1, 1), echoMono(memo, p, '0|none', 1, 1), echoMono(memo, p, '0.5|mono', 1, 1)]).toEqual([true, false, true]);
    expect(echoMono({}, proj([]), '', 1, 1)).toBe(false);
    expect(echoMono({}, undefined, '', 1, 1)).toBe(false);
    // a grade item with no steps of its own uses the grade's default steps (bw, then mono at 0.4, then none at 0.8)
    expect(echoMono({}, proj([{ id: 'g', type: 'common.grade', start: 0, end: 5, params: {} }]), '', 0.5, 0.5)).toBe(true);
  });
});
