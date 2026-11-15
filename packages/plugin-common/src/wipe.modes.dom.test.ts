// @vitest-environment jsdom
// common.wipe's modes iris, blinds and ink (2026-11-15): each a pure function of time, covering the frame exactly at the item's middle.
// jsdom has no 2D canvas: a recording stand-in logs every call and property set, so a picture is its log.
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { blindTurn, INK_DIP, inkBlots, inkEdge, inkGrow, irisRadius, MODES, wipe } from './wipe.ts';

let log: string[] = [];
const fake = () => {
  const grad = (...a: number[]) => ({ addColorStop: (o: number, c: string) => log.push(`stop ${a.map((v) => v.toFixed(2))} ${o} ${c}`) });
  const g: any = { createLinearGradient: grad, createRadialGradient: grad };
  return new Proxy(g, {
    get: (t, k) => (k in t ? t[k] : (...a: unknown[]) => { log.push(`${String(k)}(${a.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join(',')})`); }),
    set: (t, k, v) => { log.push(`${String(k)}=${typeof v === 'object' ? 'grad' : v}`); t[k] = v; return true; },
  });
};
const real = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = fake; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = real; });

function draw(params: Record<string, unknown>, local: number, dur = 1, W = 1080, H = 1920) {
  const theme = resolveTheme(undefined, { width: W, height: H });
  const ctx: any = { t: local, local, dur, W, H, fps: 30, theme, motion, root: document.createElement('div'), params: withDefaults(wipe.params, params, theme) };
  const s = wipe.build(ctx);
  log = [];
  wipe.draw(ctx, s);
  return log;
}
const nums = (line: string) => line.slice(line.indexOf('(') + 1, -1).split(',').map(Number);

describe('common.wipe iris, blinds, ink', () => {
  test('band stays the default; the new modes are offered', () => {
    expect(withDefaults(wipe.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 })).mode).toBe('band');
    expect((wipe.params.find((p) => p.key === 'mode') as { options?: string[] }).options).toEqual([...MODES]);
  });

  test('each draws the same picture at the same moment and another a little later', () => {
    for (const mode of ['iris', 'blinds', 'ink']) for (const t of [0.2, 0.7]) {
      expect(draw({ mode }, t)).toEqual(draw({ mode }, t));
      expect(draw({ mode }, t)).not.toEqual(draw({ mode }, t + 0.05));
    }
  });

  test('iris: the circle starts past the farthest corner, closes to nothing at the middle and opens the same way', () => {
    const far = Math.hypot(0.62 * 1080, 0.6 * 1920);
    expect(irisRadius(0, 1080, 1920, 0.62, 0.4, 10)).toBeGreaterThan(far + 10);
    expect(irisRadius(1, 1080, 1920, 0.62, 0.4, 10)).toBe(irisRadius(0, 1080, 1920, 0.62, 0.4, 10));
    expect(irisRadius(0.5, 1080, 1920, 0.62, 0.4)).toBe(0);
    expect(irisRadius(0.3, 1080, 1920, 0.5, 0.5)).toBeCloseTo(irisRadius(0.7, 1080, 1920, 0.5, 0.5), 9);
    expect(irisRadius(0.3, 1080, 1920, 0.5, 0.5)).toBeGreaterThan(irisRadius(0.4, 1080, 1920, 0.5, 0.5));
    // at the middle: the whole frame in colour, no hole, no ring
    const mid = draw({ mode: 'iris', x: 0.62, y: 0.4 }, 0.5);
    expect(mid).toContain('rect(0.00,0.00,1080.00,1920.00)');
    expect(mid.some((l) => l.startsWith('arc('))).toBe(false);
    expect(draw({ mode: 'iris', x: 0.62, y: 0.4 }, 0.3).filter((l) => l.startsWith('arc(')).length).toBe(2);   // the hole and its ring
  });

  test('blinds: every slat is shut at the middle, open at both ends, the top one turning first', () => {
    for (let n = 2; n <= 30; n++) for (let i = 0; i < n; i++) {
      expect(blindTurn(0.5, i, n)).toBeCloseTo(Math.PI / 2, 9);
      expect(blindTurn(0, i, n)).toBe(0);
      expect(blindTurn(1, i, n)).toBeCloseTo(Math.PI, 9);
    }
    expect(blindTurn(0.2, 0, 9)).toBeGreaterThan(blindTurn(0.2, 8, 9));
    expect(blindTurn(0.7, 0, 9)).toBeGreaterThan(blindTurn(0.7, 8, 9));
    for (let u = 0; u < 1; u += 0.05) expect(blindTurn(u + 0.05, 4, 9)).toBeGreaterThanOrEqual(blindTurn(u, 4, 9));
    // at the middle the slats tile the frame from top to bottom with no gap
    for (const [W, H, rows] of [[1080, 1920, 9], [1920, 1080, 7], [1080, 1080, 13]]) {
      const rects = draw({ mode: 'blinds', rows }, 0.5, 1, W, H).filter((l) => l.startsWith('fillRect(')).map(nums).filter((r) => r[3] > 20);
      expect(rects.length).toBe(rows);
      let y = 0;
      for (const [x, top, w, h] of rects) { expect(x).toBe(0); expect(w).toBe(W); expect(top).toBeLessThanOrEqual(y); y = Math.max(y, top + h); }
      expect(y).toBeGreaterThanOrEqual(H);
    }
  });

  test('ink: seeded blots, one to a cell, inside the frame; a different seed moves them', () => {
    expect(inkBlots(3, 0, false)).toEqual(inkBlots(3, 0, false));
    expect(inkBlots(3, 0, false)).not.toEqual(inkBlots(4, 0, false));
    expect(inkBlots(3, 0, false)).not.toEqual(inkBlots(3, 1, false));
    for (const wide of [false, true]) {
      const b = inkBlots(7, 0, wide), cols = wide ? 3 : 2, rows = wide ? 2 : 3;
      expect(new Set(b.map((x) => Math.floor(x.x * cols) + cols * Math.floor(x.y * rows))).size).toBe(6);
      expect(b.filter((x) => x.at === 0).length).toBe(1);
      for (const x of b) { expect(x.at).toBeLessThan(0.35); expect(x.x).toBeGreaterThan(0); expect(x.x).toBeLessThan(1); expect(x.y).toBeGreaterThan(0); expect(x.y).toBeLessThan(1); }
    }
  });

  test('ink: a blot grows from nothing to a reach that alone covers the frame; at the middle the frame is all ink', () => {
    const big = (Math.hypot(1080, 1920) / (1 - INK_DIP)) * 1.02;
    expect(inkGrow(0.1, 0.2, 500, big)).toBe(0);
    expect(inkGrow(1, 0.3, 500, big)).toBeCloseTo(big, 6);
    for (let p = 0; p < 1; p += 0.05) expect(inkGrow(p + 0.05, 0.1, 500, big)).toBeGreaterThanOrEqual(inkGrow(p, 0.1, 500, big));
    for (let a = 0; a < 7; a += 0.01) expect(inkEdge(a, [1, 2, 3], 0.6)).toBeGreaterThanOrEqual(1 - INK_DIP);
    expect(big * (1 - INK_DIP)).toBeGreaterThan(Math.hypot(1080, 1920));
    const mid = draw({ mode: 'ink' }, 0.5);
    expect(mid).toContain('fillRect(0.00,0.00,1080.00,1920.00)');
    expect(mid.some((l) => l.startsWith('lineTo(') || l.startsWith('arc('))).toBe(false);   // no hole yet
    expect(draw({ mode: 'ink' }, 1).filter((l) => l.startsWith('lineTo(')).length).toBeGreaterThan(0);
  });
});
