// @vitest-environment jsdom
// common.backdrop's patterns halftone, sunburst and waves through draw: the same picture at the same moment, moving over time, and the
// old patterns as they were (no canvas without words or bits). jsdom has no 2D canvas: a recording stand-in logs every call and
// property set, so a canvas picture is its log; the CSS is what cssCamel last wrote (`_c`).
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { backdrop } from './backdrop.ts';

let log: string[] = [];
const fake = () => new Proxy({} as any, {
  get: (t, k) => (k in t ? t[k] : (...a: unknown[]) => { log.push(`${String(k)}(${a.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join(',')})`); }),
  set: (t, k, v) => { log.push(`${String(k)}=${v}`); t[k] = v; return true; },
});
const real = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = fake; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = real; });

function run(params: Record<string, unknown>, local: number, W = 1080, H = 1920) {
  const theme = resolveTheme(undefined, { width: W, height: H });
  const ctx: any = { t: local, local, dur: 3, W, H, fps: 30, theme, motion, root: document.createElement('div'), params: withDefaults(backdrop.params, params, theme) };
  log = [];
  const s = backdrop.build(ctx);
  backdrop.draw(ctx, s);
  const css = (e: Element) => ((e as any)._c ?? {}) as Record<string, string>;
  return { canvas: css(s.cv).display, bg: css(s.el).backgroundImage, pos: css(s.el).backgroundPosition, log: log.join('\n') };
}

describe('common.backdrop halftone, sunburst, waves', () => {
  test('gingham stays the default and the old patterns draw no canvas', () => {
    expect(withDefaults(backdrop.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 })).pattern).toBe('gingham');
    for (const pattern of ['gingham', 'dots', 'stripes', 'grid', 'solid', 'gradient', 'diamond', 'spot']) {
      const r = run({ pattern, drift: 10 }, 1);
      expect(r.canvas).toBe('none');
      expect(r.log).toBe('');
      expect(r.pos).toBe('10px 10px');
    }
  });

  test('every new pattern draws the same picture at the same moment and moves over time with a drift', () => {
    for (const pattern of ['halftone', 'sunburst', 'waves']) {
      const a = run({ pattern, drift: 40 }, 1.2);
      expect(run({ pattern, drift: 40 }, 1.2)).toEqual(a);
      expect(run({ pattern, drift: 40 }, 1.7)).not.toEqual(a);
    }
  });

  test('without a drift every new pattern holds still', () => {
    for (const pattern of ['halftone', 'sunburst', 'waves']) expect(run({ pattern }, 1.2)).toEqual(run({ pattern }, 2));
    // waves still draws its bands
    expect(run({ pattern: 'waves' }, 2).log).toContain('fill()');
  });

  test('halftone and waves draw on the canvas, sunburst is CSS and keeps its gradient centred', () => {
    expect(run({ pattern: 'halftone' }, 1).canvas).toBe('block');
    expect(run({ pattern: 'waves' }, 1).canvas).toBe('block');
    const s = run({ pattern: 'sunburst', drift: 40 }, 1);
    expect(s.canvas).toBe('none');
    expect(s.bg).toContain('repeating-conic-gradient(from 4.000deg at 50% 50%');
    expect(run({ pattern: 'sunburst', drift: 0 }, 1).bg).toContain('repeating-conic-gradient(from 0.000deg at 50% 50%');
    expect(s.pos).toBe('0px 0px');
    // waves: four filled bands
    expect(run({ pattern: 'waves' }, 1).log.split('\n').filter((l) => l === 'fill()').length).toBe(4);
  });
});
