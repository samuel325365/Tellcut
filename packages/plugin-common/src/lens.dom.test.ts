// @vitest-environment jsdom
// common.lens: the pure parts (each look's strength mapping, the envelope, the travel, the box, the displacement and ripple maps,
// the mosaic's pick) and build / draw in jsdom. jsdom has no layout, filters or 2D canvas: a stand-in canvas takes the map, and the
// tests read what cssCamel and attr last wrote (`_c`, `_a`).
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { bend, LOOKS, lens, lensAmount, lensBox, lensCentre, lensEnvelope, lensMap, MAX_MAGNIFY, mapScale, mosaicPick, rippleMap, rippleTile } from './lens.ts';

const realGet = HTMLCanvasElement.prototype.getContext, realUrl = HTMLCanvasElement.prototype.toDataURL;
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} });
  (HTMLCanvasElement.prototype as any).toDataURL = () => 'data:image/png;base64,AAAA';
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGet; HTMLCanvasElement.prototype.toDataURL = realUrl; });

const theme = resolveTheme(undefined, { width: 1080, height: 1920 });
function run(params: Record<string, unknown>, local: number, dur = 3, W = 1080, H = 1920) {
  const root = document.createElement('div'), top = document.createElement('div');
  const ctx: any = { t: local, local, dur, item: { id: 'x', type: lens.type, start: 0, end: dur, params }, params: withDefaults(lens.params, params, theme), root, top, W, H, fps: 30, theme, motion };
  const s = lens.build(ctx);
  lens.draw(ctx, s);
  return { s, root, ctx };
}
const css = (e: Element | undefined) => ((e as any)?._c ?? {}) as Record<string, string>;
const attrs = (e: Element) => ((e as any)._a ?? {}) as Record<string, string>;
/** everything a lens drew: each element's styles and each filter node's attributes, ids left out (each item has its own) */
const picture = (root: HTMLElement) => JSON.stringify([...root.querySelectorAll('*')].map((e) => [e.tagName, css(e), (e as any)._a ?? null])).replace(/tc-lens-\d+/g, 'id');
const env = (enter: string, exit: string, t: number, dur = 3) => lensEnvelope({ enter, exit } as any, t, dur, motion);

describe('common.lens', () => {
  test('params: the six looks, magnify a circle by default; named as new blocks are', () => {
    const d = withDefaults(lens.params, {}, theme);
    expect(d.look).toBe('magnify'); expect(d.shape).toBe('circle');
    expect(lens.params.find((p) => p.key === 'look')).toMatchObject({ options: [...LOOKS] });
    expect(lens.params.map((p) => p.key)).toEqual(['look', 'shape', 'x', 'y', 'size', 'strength', 'enter', 'exit', 'from', 'travel', 'axis', 'speed', 'rim', 'seed']);
    expect(lens.kind).toBe('overlay'); expect(lens.blend).toBeUndefined();
  });

  test('strength maps to each look\'s own amount, scaled with the short side', () => {
    expect(lensAmount('magnify', 0, 1080, 200)).toBe(1); expect(lensAmount('magnify', 1, 1080, 200)).toBe(2.5);
    expect(lensAmount('magnify', 1.3, 1080, 200)).toBe(MAX_MAGNIFY);   // a pop's overshoot never passes the cap
    expect(lensAmount('fisheye', 1, 1080, 200)).toBeCloseTo(0.75); expect(lensAmount('fisheye', 2, 1080, 200)).toBe(0.85);
    for (const s of [0.1, 0.33, 0.5, 0.8, 1]) { const c = lensAmount('mosaic', s, 1080, 200); expect(c % 2).toBe(1); expect(c).toBeLessThanOrEqual(0.06 * 1080 + 1); }
    expect(lensAmount('mosaic', 1, 2160, 200)).toBeCloseTo(2 * lensAmount('mosaic', 1, 1080, 200), -1);
    expect(lensAmount('ripple', 1, 1080, 200)).toBeCloseTo(0.12 * 1080); expect(lensAmount('streak', 0.5, 1080, 200)).toBeCloseTo(0.02 * 1080);
    expect(lensAmount('prism', 1, 1080, 200)).toBeCloseTo(0.06 * 200);
    expect(lensAmount('prism', 1, 1080, 2000)).toBeCloseTo(0.06 * 0.4 * 1080);   // the whole frame splits no farther than a big lens
  });

  test('the envelope: none is full throughout; grow rises from 0 and falls back to 0; pop overshoots both ways', () => {
    for (const t of [0, 1.5, 3]) expect(env('none', 'none', t)).toBe(1);
    expect(env('grow', 'grow', 0)).toBe(0); expect(env('grow', 'grow', 1.5)).toBe(1); expect(env('grow', 'grow', 3)).toBe(0);
    expect(env('grow', 'grow', 0.2)).toBeGreaterThan(0); expect(env('grow', 'grow', 0.2)).toBeLessThan(1);
    expect(Math.max(...Array.from({ length: 45 }, (_, i) => env('pop', 'none', i / 30)))).toBeGreaterThan(1.05);
    expect(Math.max(...Array.from({ length: 14 }, (_, i) => env('none', 'pop', 2.55 + i / 30)))).toBeGreaterThan(1);
    expect(env('none', 'pop', 3)).toBeCloseTo(0, 5);
    // a short item: grow in and out each over half of it, the peak in the middle (mosaic's pixelate cut)
    expect(env('grow', 'grow', 0.4, 0.8)).toBeCloseTo(1); expect(env('grow', 'grow', 0.2, 0.8)).toBeLessThan(1);
  });

  test('travel passes (x, y) halfway, from the side named; a corner goes at 45° in px; 0 stays put', () => {
    expect(lensCentre({ x: 0.3, y: 0.6, from: 'l', travel: 0 }, 0.9, 1080, 1920)).toEqual([0.3, 0.6]);
    expect(lensCentre({ x: 0.5, y: 0.5, from: 'l', travel: 0.8 }, 0.5, 1080, 1920)).toEqual([0.5, 0.5]);
    expect(lensCentre({ x: 0.5, y: 0.5, from: 'l', travel: 0.8 }, 0, 1080, 1920)[0]).toBeCloseTo(0.1);
    expect(lensCentre({ x: 0.5, y: 0.5, from: 'b', travel: 0.4 }, 1, 1080, 1920)[1]).toBeCloseTo(0.3);
    const [x, y] = lensCentre({ x: 0.5, y: 0.5, from: 'tr', travel: 0.6 }, 1, 1080, 1920);
    expect((0.5 - x) * 1080).toBeCloseTo((y - 0.5) * 1920);
  });

  test('the box: a square of size % of the short side; the frame for full, twice it round a moving mapped centre', () => {
    expect(lensBox({ look: 'magnify', shape: 'circle', size: 40, x: 0.5, y: 0.5, travel: 0 }, 1080, 1920)).toMatchObject({ w: 432, h: 432, cx: 216, R: 216, moves: true });
    expect(lensBox({ look: 'magnify', shape: 'box', size: 40, x: 0.5, y: 0.5, travel: 0 }, 1920, 1080).w).toBe(432);
    expect(lensBox({ look: 'fisheye', shape: 'full', size: 40, x: 0.3, y: 0.6, travel: 0 }, 1080, 1920)).toMatchObject({ w: 1080, h: 1920, cx: 324, cy: 1152, moves: false });
    expect(lensBox({ look: 'prism', shape: 'full', size: 40, x: 0.3, y: 0.6, travel: 0.5 }, 1080, 1920)).toMatchObject({ w: 2160, h: 3840, cx: 1080, cy: 1920, moves: true });
    expect(lensBox({ look: 'mosaic', shape: 'full', size: 40, x: 0.3, y: 0.6, travel: 0.5 }, 1080, 1920)).toMatchObject({ w: 1080, moves: false });
  });

  test('a full mapped lens whose travel takes its centre out of the frame still covers the whole frame at both ends', () => {
    const cases = [
      { look: 'magnify', x: 0.5, y: 0.5, travel: 1.2, from: 'l' },
      { look: 'fisheye', x: 0.2, y: 0.8, travel: 1.5, from: 'tr' },
      { look: 'prism', x: 0.5, y: 0.1, travel: 0.6, from: 'b' },
    ] as const;
    for (const W of [1080, 1920]) for (const c of cases) {
      const H = W === 1080 ? 1920 : 1080, p = { ...c, shape: 'full', size: 40 } as const, b = lensBox(p, W, H);
      for (const k of [0, 0.5, 1]) {
        const [fx, fy] = lensCentre(p, k, W, H), left = fx * W - b.cx, top = fy * H - b.cy;
        expect(left).toBeLessThanOrEqual(0); expect(left + b.w).toBeGreaterThanOrEqual(W);
        expect(top).toBeLessThanOrEqual(0); expect(top + b.h).toBeGreaterThanOrEqual(H);
      }
    }
    // the drawn div too, at the item's first and last moment
    for (const t of [0, 3]) {
      const { s } = run({ look: 'magnify', shape: 'full', travel: 1.2, enter: 'none', exit: 'none' }, t), st = css(s.lens);
      expect(parseFloat(st.left)).toBeLessThanOrEqual(0); expect(parseFloat(st.left) + parseFloat(st.width)).toBeGreaterThanOrEqual(1080);
    }
  });

  test('the bends: magnify pulls in proportion, fisheye only inside the radius, prism nothing in the middle and most at the rim', () => {
    expect(bend('magnify', 30, -40, 100)).toEqual([-30, 40]);
    expect(bend('fisheye', 120, 0, 100)).toEqual([0, 0]);
    expect(bend('fisheye', 50, 0, 100)[0]).toBeCloseTo(-25);
    expect(bend('prism', 0, 0, 100)).toEqual([0, 0]);
    expect(Math.abs(bend('prism', 100, 0, 100)[0])).toBeGreaterThan(Math.abs(bend('prism', 50, 0, 100)[0]) * 3);
  });

  test('a map: 128 where nothing moves, its unit the biggest offset, its long side MAP_SIDE; the scale undoes the unit', () => {
    const box = lensBox({ look: 'magnify', shape: 'circle', size: 40, x: 0.5, y: 0.5, travel: 0 }, 1080, 1920), m = lensMap('magnify', box);
    expect([m.mw, m.mh]).toEqual([256, 256]);
    expect(m.unit).toBeCloseTo(216, -1);
    const mid = (128 * 256 + 128) * 4;
    expect(Math.abs(m.data[mid] - 128)).toBeLessThanOrEqual(1); expect(m.data[3]).toBe(255);
    expect(m.data[0]).toBeGreaterThan(250); expect(m.data[(256 * 256 - 1) * 4]).toBeLessThan(5);   // left edge pulls right, right edge left
    // at magnification m a pixel at the edge (216 px out) takes the one 216/m px out: offset 216(1 - 1/m)
    const sc = mapScale(m.unit, 1 - 1 / 2), edge = (m.data[0] / 255 - 0.5) * sc;
    expect(edge).toBeCloseTo(108, -1);
    const full = lensMap('fisheye', lensBox({ look: 'fisheye', shape: 'full', size: 40, x: 0.5, y: 0.5, travel: 0 }, 1080, 1920));
    expect(full.mh).toBe(256); expect(full.mw).toBe(144);
  });

  test('mosaic\'s pick is odd and dilates to exactly its cell', () => {
    for (const c of [3, 5, 21, 39, 41, 65]) { const { d, radius } = mosaicPick(c); expect(d % 2).toBe(1); expect(d + 2 * radius).toBe(c); expect(Number.isInteger(radius)).toBe(true); }
  });

  test('the ripple map tiles without a seam, the same for a seed, another for another', () => {
    const [tw, th] = rippleTile({ w: 1080, h: 1920 }, true);
    expect([tw, th]).toEqual([1080, 960]);
    const a = rippleMap(tw, th, true, 7, 1080), b = rippleMap(tw, th, true, 7, 1080), c = rippleMap(tw, th, true, 8, 1080);
    expect(a.data).toEqual(b.data); expect(c.data).not.toEqual(a.data);
    const px = (x: number, y: number) => a.data[(y * a.mw + x) * 4];
    // the last column runs on into the first, as neighbouring columns do (one map pixel's step)
    let worst = 0, step = 0;
    for (let y = 0; y < a.mh; y++) { worst = Math.max(worst, Math.abs(px(a.mw - 1, y) - px(0, y))); step = Math.max(step, Math.abs(px(1, y) - px(0, y))); }
    expect(worst).toBeLessThanOrEqual(step + 2);
    for (let x = 0; x < a.mw; x++) expect(Math.abs(px(x, a.mh - 1) - px(x, 0))).toBeLessThanOrEqual(40);
  });

  test('every look builds a filter of its own and draws the same picture at the same moment', () => {
    const ids = new Set<string>();
    for (const look of LOOKS) for (const shape of ['circle', 'box', 'full']) {
      const { s, root } = run({ look, shape, travel: 0.4 }, 1.2);
      const f = root.querySelector('svg filter')!;
      expect(f.getAttribute('primitiveUnits')).toBe('userSpaceOnUse');
      expect(css(s.lens).backdropFilter).toBe(`url(#${f.id})`);
      ids.add(f.id);
      expect(picture(run({ look, shape, travel: 0.4 }, 1.2).root)).toBe(picture(root));
    }
    expect(ids.size).toBe(LOOKS.length * 3);
  });

  test('at the very start of a grow there is nothing to bend: the filter is off and the rim hidden', () => {
    for (const look of LOOKS) {
      const { s } = run({ look }, 0);
      expect(css(s.lens).backdropFilter).toBe('none');
      expect(css(s.rim).display).toBe('none');
    }
  });

  test('magnify sets the scale for its magnification; prism splits both ways; the rim only round a circle or box', () => {
    const { s } = run({ look: 'magnify', strength: 1 }, 1.5);
    expect(Number(attrs(s.nodes[0]).scale)).toBeCloseTo(mapScale(s.unit, 1 - 1 / 2.5), 1);
    const pr = run({ look: 'prism', strength: 1 }, 1.5).s;
    expect(Number(attrs(pr.nodes[0]).scale)).toBeGreaterThan(0);
    expect(Number(attrs(pr.nodes[1]).scale)).toBeCloseTo(-Number(attrs(pr.nodes[0]).scale));
    expect(css(run({ look: 'magnify', rim: 'glass' }, 1.5).s.rim).display).toBe('block');
    expect(css(run({ look: 'magnify', shape: 'full', rim: 'glass' }, 1.5).s.rim).display).toBe('none');
  });

  test('mosaic\'s cells sit on the frame\'s grid wherever the box is', () => {
    for (const t of [0.6, 1.5, 2.2]) {
      const { s } = run({ look: 'mosaic', shape: 'box', travel: 0.7, strength: 1 }, t);
      const left = parseFloat(css(s.lens).left), cell = attrs(s.nodes[2]), c = Number(cell.width);
      expect((Math.round(left) + Number(cell.x)) % c).toBe(0);
    }
  });

  test('ripple flows: the waves move with time at speed, and stay put at speed 0', () => {
    const at = (t: number, speed = 8) => attrs(run({ look: 'ripple', shape: 'full', speed }, t).s.nodes[0]).dy;
    expect(at(1)).not.toBe(at(1.5));
    expect(at(1, 0)).toBe(at(1.5, 0));
    const down = run({ look: 'ripple', shape: 'full', axis: 'down' }, 1).s;
    expect(Number(attrs(down.nodes[0]).dx)).toBeGreaterThan(0); expect(Number(attrs(down.nodes[0]).dy)).toBe(0);
  });

  test('streak blurs one way only', () => {
    expect(attrs(run({ look: 'streak', shape: 'full', strength: 1 }, 1.5).s.nodes[0]).stdDeviation).toMatch(/^[\d.]+ 0$/);
    expect(attrs(run({ look: 'streak', shape: 'full', axis: 'down', strength: 1 }, 1.5).s.nodes[0]).stdDeviation).toMatch(/^0 [\d.]+$/);
  });
});
