// @vitest-environment jsdom
// The looks of common.echo and common.band (2026-11-24): where the copies and the bands are at a moment, as pure functions of time,
// and the default looks drawn as they always were. jsdom has no canvas: the band is drawn on a proxy that counts the calls.
import { withDefaults, resolveTheme } from '@tellcut/engine';
import { band, bandStrips, type BandLook } from './band.ts';
import { echo, echoCopies, type EchoLook } from './echo.ts';

describe('common.echo looks', () => {
  const looks = echo.variants!.list.map((v) => v.value as EchoLook), px = 250;
  test('stack is the default and puts the copies where it always did: above and below, 0.8 of the word apart, fainter outward', () => {
    expect(withDefaults(echo.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 })).look).toBe('stack');
    expect(echoCopies('stack', 2, 1, px)).toEqual([
      { dx: 0, dy: -400, scale: 1, alpha: 0.375 }, { dx: 0, dy: 400, scale: 1, alpha: 0.375 },
      { dx: 0, dy: -200, scale: 1, alpha: 0.75 }, { dx: 0, dy: 200, scale: 1, alpha: 0.75 },
    ]);
  });
  test('every look is a pure function of time, starts on the word and draws as many copies as echoes says', () => {
    for (const look of looks) {
      expect(echoCopies(look, 3, 0.7, px), look).toEqual(echoCopies(look, 3, 0.7, px));
      expect(echoCopies(look, 0, 1, px), look).toEqual([]);
      expect(echoCopies(look, 2, 1, px).length, look).toBe(look === 'stack' || look === 'wave' ? 4 : 2);
      // at the very start every copy sits on the word and is not seen yet
      for (const c of echoCopies(look, 2, 0, px)) expect([Math.abs(c.dx), Math.abs(c.dy), c.alpha, c.scale], look).toEqual([0, 0, 0, 1]);
    }
  });
  test('trail: behind the word, each further down and to the right and fainter, drawn farthest first', () => {
    const c = echoCopies('trail', 3, 1.5, px);
    expect(c.map((e) => e.dx > 0 && e.dy > 0 && e.scale === 1)).toEqual([true, true, true]);
    expect(c[0].dx).toBeGreaterThan(c[1].dx); expect(c[1].dx).toBeGreaterThan(c[2].dx);
    expect(c[0].alpha).toBeLessThan(c[1].alpha); expect(c[1].alpha).toBeLessThan(c[2].alpha);
  });
  test('zoom: on the word\'s centre, about 1.25, 1.55 and 1.9 times its size once out, breathing a little after', () => {
    const c = echoCopies('zoom', 3, 1, px);
    expect(c.every((e) => e.dx === 0 && e.dy === 0)).toBe(true);
    for (const [i, want] of [1.25, 1.55, 1.9].entries()) expect(Math.abs(c[2 - i].scale - want)).toBeLessThan(0.08);
    expect(echoCopies('zoom', 1, 1.2, px)[0].scale).not.toBe(echoCopies('zoom', 1, 1.7, px)[0].scale);
  });
  test('wave: the stack\'s places, swaying sideways, each layer a phase behind the one before, above and below alike', () => {
    const w = echoCopies('wave', 2, 1.4, px), s = echoCopies('stack', 2, 1.4, px);
    expect(w.map((e) => e.dy)).toEqual(s.map((e) => e.dy));
    expect(w[0].dx).toBe(w[1].dx);
    expect(Math.sign(w[0].dx)).not.toBe(Math.sign(w[2].dx));   // the outer and inner layers lean opposite ways at this moment
    expect(Math.max(...w.map((e) => Math.abs(e.dx)))).toBeLessThanOrEqual(0.2 * px);
  });
});

describe('common.band looks', () => {
  const p = { angle: -10, color: '#ff5a1f', ink: '#111111' };
  test('tape is the default: one band of color with ink words scrolling left, wiped in from the left', () => {
    expect(withDefaults(band.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 })).look).toBe('tape');
    expect(bandStrips('tape', p, 1)).toEqual([{ angle: -10, bh: 62, fpx: 30, dir: -1, wipe: 1, from: 'left', fill: '#ff5a1f', text: '#111111', edges: 'none', edge: '#111111' }]);
  });
  test('caution is taller with striped edges; outline has no fill, its lines and words in color', () => {
    const [c] = bandStrips('caution', p, 1), [o] = bandStrips('outline', p, 1);
    expect(c.bh).toBeGreaterThan(62); expect([c.edges, c.fill, c.edge]).toEqual(['stripes', '#ff5a1f', '#111111']);
    expect([o.fill, o.text, o.edges, o.edge]).toEqual([null, '#ff5a1f', 'lines', '#ff5a1f']);
  });
  test('cross: a second band under the first at the opposite angle, scrolling the other way, wiped in from the right a moment later', () => {
    const [second, first] = bandStrips('cross', p, 0.22);
    expect([first.angle, second.angle, first.dir, second.dir, second.from]).toEqual([-10, 10, -1, 1, 'right']);
    expect(first.wipe).toBe(1);
    expect(second.wipe).toBeLessThan(0.5);
    expect(bandStrips('cross', p, 1)[0].wipe).toBe(1);
  });
  test('drawn: tape fills one band, cross two, outline only its two edge lines; every look writes its words', () => {
    const n: Record<string, number> = {};
    const g: any = new Proxy({}, { get: (_t, k) => (typeof k === 'symbol' ? undefined : k === 'measureText' ? (s: string) => ({ width: String(s).length * 10 }) : (..._a: unknown[]) => { n[k as string] = (n[k as string] ?? 0) + 1; }), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
    const fills: Record<string, number> = {};
    for (const look of band.variants!.list.map((v) => v.value as BandLook)) {
      for (const k of Object.keys(n)) delete n[k];
      const params = { ...Object.fromEntries(band.params.map((d) => [d.key, d.default])), look } as any;
      const ctx: any = { root: document.createElement('div'), params, W: 1080, H: 1920, t: 1, local: 1, dur: 3 }, s = band.build(ctx);
      band.draw(ctx, s);
      fills[look] = n.fillRect ?? 0;
      expect(n.fillText, look).toBeGreaterThan(0);
    }
    // caution's band plus its two thin inner lines; outline's two edge lines only
    expect(fills).toEqual({ tape: 1, caution: 3, cross: 2, outline: 2 });
    vi.restoreAllMocks();
  });
});
