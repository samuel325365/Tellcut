// @vitest-environment jsdom
// common.masthead / common.spread / common.wordbands and the title look didone (2026-11-06, the Fashion pilot film's fx.cover /
// fx.taste / fx.column / fx.wordbands / fx.bighead). jsdom has no canvas: the timing helpers, the declared stills and the look are tested.
import { bandHeight, graphemes, masthead, mastheadY, parseBands, scriptLines, spread, typedLetters, wordbands } from './editorial.ts';
import { didone } from './caption/looks/title.ts';
import type { ItemType } from '@tellcut/engine';

describe('common.masthead', () => {
  test('a frame overlay; the back cover alone declares its photo', () => {
    expect([masthead.kind, masthead.category, spread.kind, spread.category, wordbands.kind, wordbands.category]).toEqual(['overlay', 'frame', 'scene', 'frame', 'scene', 'moment']);
    const item = (mode: string) => ({ id: 'm', type: masthead.type, start: 0, end: 3, params: { mode, source: 'p', t: 2 } }) as any;
    expect(masthead.media!(item('front'), {} as any)).toEqual({ videos: [], stills: [] });
    expect(masthead.media!(item('back'), {} as any)).toEqual({ videos: [], stills: [{ source: 'p', t: 2, w: 1080 }] });
  });

  test('the masthead types a letter every 0.07 s, the first at once, never more than it has', () => {
    expect(typedLetters(-0.1, 7)).toBe(0);
    expect(typedLetters(0, 7)).toBe(1);
    expect(typedLetters(0.15, 7)).toBe(3);
    expect(typedLetters(9, 7)).toBe(7);
  });
  test('the masthead is typed a grapheme at a time: a flag or a ZWJ family comes in whole', () => {
    expect(graphemes('NY🇺🇸👨‍👩‍👧')).toEqual(['N', 'Y', '🇺🇸', '👨‍👩‍👧']);
  });
  test('the masthead moves down under the issue lines only where it would run into them: a square frame, not a tall or wide one', () => {
    const title = { w: 900, asc: 80 }, small = 22, under = 70 + 11 + 26 + 80;
    expect(mastheadY(1080, 1080, 1, false, title, 400, 400, small)).toBeCloseTo(under, 6);
    expect(mastheadY(1080, 1920, 1, false, title, 400, 400, small)).toBeCloseTo(0.13 * 1920, 6);
    expect(mastheadY(1920, 1080, 1, false, title, 400, 400, small)).toBeCloseTo(0.13 * 1080, 6);
    // no issue lines, nothing to clear; the back cover sits lower to begin with
    expect(mastheadY(1080, 1080, 1, false, title, 0, 0, small)).toBeCloseTo(0.13 * 1080, 6);
    expect(mastheadY(1080, 1080, 1, true, { w: 900, asc: 40 }, 200, 250, small)).toBeCloseTo(0.165 * 1080, 6);
  });
  test('the italic line: words half and half; a line of Chinese too wide cut between its characters, one that fits left whole', () => {
    const w = (l: string) => l.length * 100;
    expect(scriptLines('Market Days', w, 960)).toEqual(['Market', 'Days']);
    expect(scriptLines('Days', w, 960)).toEqual(['Days']);
    expect(scriptLines('市場的日子', w, 960)).toEqual(['市場的日子']);
    expect(scriptLines('在市場裡慢慢走過的一個早上', w, 960)).toEqual(['在市場裡慢慢走', '過的一個早上']);
    // a long word with no CJK in it is shrunk by the caller, never cut
    expect(scriptLines('Supercalifragilistic', w, 960)).toEqual(['Supercalifragilistic']);
  });
});

describe('common.spread', () => {
  test('both layouts declare the page photo', () => {
    const item = { id: 's', type: spread.type, start: 0, end: 2, params: { layout: 'column', source: 'v', t: 5 } } as any;
    expect(spread.media!(item, {} as any)).toEqual({ videos: [], stills: [{ source: 'v', t: 5, w: 1080 }] });
  });
});

describe('common.wordbands', () => {
  test('bands read seconds|word|band|word colour, missing colours filled in', () => {
    expect(parseBands('0|EAT|#c23b2c|#fff\n0.4|EVERY\n\n')).toEqual([{ t: 0, word: 'EAT', bc: '#c23b2c', tc: '#fff' }, { t: 0.4, word: 'EVERY', bc: '#c23b2c', tc: '#ffffff' }]);
  });
  test('the last band just covers the tipped frame at any angle, ratio and count; each before it about half the next', () => {
    const cover = (W: number, H: number, deg: number) => { const a = (deg * Math.PI) / 180; return W * Math.abs(Math.sin(a)) + H * Math.abs(Math.cos(a)); };
    for (const [W, H] of [[1080, 1920], [1920, 1080], [1080, 1080]]) for (const deg of [-30, -9, 0, 17, 30]) for (const n of [1, 2, 3, 4, 8]) {
      expect(bandHeight(n - 1, n, W, H, deg)).toBeCloseTo(cover(W, H, deg), 6);
      for (let k = 0; k < n - 1; k++) {
        const r = bandHeight(k + 1, n, W, H, deg) / bandHeight(k, n, W, H, deg);
        expect(r).toBeGreaterThan(1); expect(r).toBeLessThanOrEqual(2.1 + 1e-9);
        expect(bandHeight(k, n, W, H, deg)).toBeGreaterThanOrEqual(0.12 * H - 1e-6);
      }
    }
    expect(bandHeight(1, 2, 1080, 1920, -9) / bandHeight(0, 2, 1080, 1920, -9)).toBeCloseTo(2.1, 6);
  });
});

describe('title look didone', () => {
  test('with two lines the first is set small; one line is left alone', () => {
    const two = [document.createElement('div'), document.createElement('div')];
    didone.lines!(two, {} as any);
    expect(((two[0] as any)._c ?? {}).fontSize ?? two[0].style.fontSize).toBe('0.45em');
    const one = [document.createElement('div')];
    didone.lines!(one, {} as any);
    expect(((one[0] as any)._c ?? {}).fontSize ?? one[0].style.fontSize).toBeFalsy();
  });
});

// a stand-in 2D context that keeps every word drawn with its font size and tracking, and measures a grapheme as 0.6 em plus the tracking
interface Drawn { text: string; x: number; y: number; px: number; ls: number; w: number }
function recorder() {
  const drawn: Drawn[] = [];
  const st: Record<string, any> = { font: '10px serif', letterSpacing: '0px' };
  const px = () => Number(/([\d.]+)px/.exec(st.font)![1]), ls = () => parseFloat(st.letterSpacing) || 0;
  const width = (t: string) => { const n = graphemes(String(t)).length; return n * px() * 0.6 + n * ls(); };
  const g: any = new Proxy(st, {
    get: (o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: width(t), actualBoundingBoxAscent: px() * 0.7 });
      if (k === 'fillText') return (t: string, x: number, y: number) => { drawn.push({ text: String(t), x, y, px: px(), ls: ls(), w: width(t) }); };
      if (k in o) return o[k as string];
      return () => undefined;
    },
    set: (o, k, v) => { o[k as string] = v; return true; },
  });
  return { g, drawn };
}
const defaults = (t: ItemType<any, any>) => Object.fromEntries(t.params.map((d) => [d.key, d.default]));
function drawOnce(t: ItemType<any, any>, params: Record<string, unknown>, W: number, H: number, local: number) {
  const { g, drawn } = recorder();
  const ctx: any = { root: document.createElement('div'), W, H, local, dur: 9, params: { ...defaults(t), ...params }, media: { stillUrl: () => '' }, reportText: () => undefined };
  const s = t.build(ctx);
  (s.c as HTMLCanvasElement).getContext = (() => g) as any;
  t.draw(ctx, s);
  return drawn;
}
const by = (drawn: Drawn[], text: string) => drawn.filter((d) => d.text === text);

describe('editorial text stays on its page', () => {
  test('a long contents list closes up within 0.13 H; three lines keep their 52 px and their size', () => {
    const many = Array.from({ length: 8 }, (_, i) => `0${i + 1} — LINE`);
    const d8 = drawOnce(masthead, { contents: many.join('\n') }, 1080, 1920, 3.2);
    const ys = many.map((l) => by(d8, l)[0].y);
    expect(ys[7] - ys[0]).toBeLessThanOrEqual(0.13 * 1920 + 1e-6);
    expect(by(d8, many[0])[0].px).toBeLessThan(32);
    const d3 = drawOnce(masthead, {}, 1080, 1920, 3.2);
    const rows = ['01 — TASTE', '02 — SEE', '03 — WALK'].map((l) => by(d3, l)[0]);
    expect(rows.map((r) => r.y - rows[0].y)).toEqual([0, 52, 104]);
    expect(rows.map((r) => r.px)).toEqual([32, 32, 32]);
  });

  test('the issue lines shrink together when they would meet; the default ones keep 22 px', () => {
    const W = 1080, H = 1080;
    const issueL = 'N° 07 — JULY 2025 — THE LONG SUMMER EDITION', issueR = 'THE CITY & MARKET & HARBOUR & GARDENS ISSUE';
    const d = drawOnce(masthead, { issueL, issueR }, W, H, 3.2);
    const l = by(d, issueL)[0], r = by(d, issueR)[0];
    expect(l.px).toBe(r.px);
    expect(l.px).toBeLessThan(22);
    expect(l.w + r.w).toBeLessThanOrEqual((W - 160) * 1.01);
    const d0 = drawOnce(masthead, {}, W, H, 3.2);
    expect(by(d0, 'N° 07 — JULY 2025')[0].px).toBe(22);
    expect(by(d0, 'THE CITY & MARKET ISSUE')[0].px).toBe(22);
  });

  test('the back cover\'s line under the masthead fits the width; the default one is left alone', () => {
    const sub = 'THE CITY & MARKET & HARBOUR & GARDENS & NIGHT FOOD ISSUE · N° 07';
    const d = by(drawOnce(masthead, { mode: 'back', sub }, 1080, 1920, 3.2), sub)[0];
    expect(d.w).toBeLessThanOrEqual((1080 - 120) * 1.01);
    expect(by(drawOnce(masthead, { mode: 'back' }, 1080, 1920, 3.2), 'THE CITY & MARKET ISSUE · N° 07')[0].px).toBe(22);
  });

  test('swatch: a long name ends before the card, a long code and colour name stay on it; the defaults keep their sizes', () => {
    const W = 1080, H = 1920, sw = 291.6, sx = W - 64 - sw;
    const name = '海鮮與市場裡的螃蟹大餐', code = 'SEA 18-1550 TCX EXTRA', cname = 'CRAB RED AND HARBOUR ORANGE';
    const d = drawOnce(spread, { name, code, cname }, W, H, 1);
    const n = by(d, name)[0], c = by(d, code)[0], cn = by(d, cname)[0];
    expect(n.x + n.w).toBeLessThanOrEqual(sx - 20 + 1e-6);
    expect(c.w).toBeLessThanOrEqual(sw - 32 + 1e-6);
    expect(cn.w).toBeLessThanOrEqual((sw - 32) * 1.01);
    const d0 = drawOnce(spread, {}, W, H, 1);
    expect([by(d0, '海鮮')[0].px, by(d0, 'SEA 18-1550')[0].px, by(d0, 'CRAB RED')[0].px]).toEqual([64, 24, 16]);
  });
});
