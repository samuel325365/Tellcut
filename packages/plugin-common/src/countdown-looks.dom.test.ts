// @vitest-environment jsdom
// common.countdown's looks flip (a split-flap card) and leader (an old film leader): drawn on a canvas, the number kept as DOM text.
// jsdom has no 2D canvas: a recording stand-in logs every call and property set, so a picture is its log.
import { motion, resolveTheme, withDefaults } from '@tellcut/engine';
import { countdown, flipAt, leaderFlicker } from './countdown.ts';

let log: string[] = [];
const fake = () => {
  // measureText: 0.6 em a letter at the font set last
  const g: any = {};
  g.measureText = (t: string) => ({ width: [...t].length * 0.6 * parseFloat(/([\d.]+)px/.exec(String(g.font))![1]) });
  return new Proxy(g, {
    get: (t, k) => (k in t ? t[k] : (...a: unknown[]) => { log.push(`${String(k)}(${a.map((v) => (typeof v === 'number' ? v.toFixed(2) : JSON.stringify(v))).join(',')})`); }),
    set: (t, k, v) => { log.push(`${String(k)}=${v}`); t[k] = v; return true; },
  });
};
const real = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = fake; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = real; });

function run(params: Record<string, unknown>, local: number, W = 1080, H = 1920, dur = 3) {
  const theme = resolveTheme(undefined, { width: W, height: H });
  const ctx: any = { t: local, local, dur, W, H, fps: 30, theme, motion, root: document.createElement('div'), params: withDefaults(countdown.params, params, theme) };
  log = [];
  const s = countdown.build(ctx);
  countdown.draw(ctx, s);
  return { s, log: log.join('\n'), css: (e: Element) => ((e as any)._c ?? {}) as Record<string, string> };
}

describe('common.countdown flip and leader', () => {
  test('ring stays the default and draws nothing on the canvas, which stays hidden', () => {
    expect(withDefaults(countdown.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 })).look).toBe('ring');
    for (const look of ['ring', 'slant']) {
      const r = run({ look }, 0.5);
      expect(r.css(r.s.cv).display).toBe('none');
      expect(r.log).toBe('');
    }
  });

  test('flip and leader draw the same picture at the same moment, and keep the step as DOM text check can measure', () => {
    for (const look of ['flip', 'leader']) {
      expect(run({ look }, 1.1).log).toBe(run({ look }, 1.1).log);
      expect(run({ look }, 1.1).log).not.toBe(run({ look }, 1.3).log);
      const r = run({ look }, 0.5);
      expect(r.css(r.s.cv).display).toBe('block');
      expect(r.s.num.textContent).toBe('3');
      expect(run({ look }, 2.9).s.num.textContent).toBe('GO!');
      expect(r.css(r.s.svg as unknown as HTMLElement).display).toBe('none');
    }
    // flip's DOM copy is transparent over the drawn halves; leader's number is the ink colour
    expect(run({ look: 'flip' }, 0.5).css(run({ look: 'flip' }, 0.5).s.num).color).toBe('transparent');
    const l = run({ look: 'leader' }, 0.5);
    expect(l.css(l.s.num).color).toBe('#1a1a1a');
  });

  test('flip: the flap turns over the first 0.42 s of a step, from the old number to the new; the first step does not flip', () => {
    expect(flipAt(3, 0, 4, 0.2)).toEqual({ text: '3', prev: '', turn: Math.PI, step: 0 });
    const a = flipAt(3, 0, 4, 1.0), b = flipAt(3, 0, 4, 1.21), c = flipAt(3, 0, 4, 1.5);
    expect([a.text, a.prev, a.turn]).toEqual(['2', '3', 0]);
    expect(b.turn).toBeCloseTo(Math.PI / 2, 6);
    expect(c.turn).toBe(Math.PI);
    expect(flipAt(3, 0, 4, 3.5, 'GO!')).toMatchObject({ text: 'GO!', prev: '1' });
    // a short step: the flap takes 60 % of it
    expect(flipAt(9, 0, 2, 0.2 + 0.06).turn).toBeCloseTo(Math.PI / 2, 6);
    // the card's halves: the flap squashed toward the hinge mid-turn
    expect(run({ look: 'flip' }, 1.1, 1080, 1920, 3).log).toMatch(/scale\(1\.00,0\.\d\d\)/);
  });

  test('flip: a word wider than the card shrinks to fit it; the numbers keep the full size', () => {
    const size = (t: number, end = 'GO!') => parseFloat(run({ look: 'flip', end }, t).s.num.style.fontSize);
    expect(size(0.5)).toBeCloseTo(0.42 * 1080 * 0.74, 6);
    expect(size(2.9)).toBeLessThan(size(0.5));
    // the stand-in font: 0.6 em a letter; GO! fills 84 % of the card, 0.78 of its height wide
    expect(size(2.9) * 3 * 0.6).toBeCloseTo(0.42 * 1080 * 0.78 * 0.84, 6);
  });

  test('leader: the hand sweeps one turn a tick; the flicker is the frame number\'s, not the time\'s', () => {
    const arc = (t: number) => run({ look: 'leader' }, t, 1080, 1920, 4).log.split('\n').find((l) => l.startsWith('arc(') && l.includes('-1.57,'))!;
    expect(arc(0.5)).toContain(`${(-Math.PI / 2 + 0.5 * Math.PI * 2).toFixed(2)})`);
    expect(arc(1.75)).toContain(`${(-Math.PI / 2 + 0.75 * Math.PI * 2).toFixed(2)})`);
    expect(leaderFlicker(12, 1)).toEqual(leaderFlicker(12, 1));
    expect(leaderFlicker(12, 1)).not.toEqual(leaderFlicker(13, 1));
    for (let f = 0; f < 60; f++) {
      const x = leaderFlicker(f, 2);
      expect(x.light).toBeGreaterThanOrEqual(0.86); expect(x.light).toBeLessThanOrEqual(0.98);
      expect(Math.abs(x.dx)).toBeLessThanOrEqual(4); expect(x.specks.length).toBeLessThanOrEqual(3);
    }
  });
});
