// @vitest-environment jsdom
// common.masthead / common.spread / common.wordbands and the title look didone (2026-11-06, the Fashion pilot film's fx.cover /
// fx.taste / fx.column / fx.wordbands / fx.bighead). jsdom has no canvas: the timing helpers, the declared stills and the look are tested.
import { bandHeight, graphemes, masthead, parseBands, scriptLines, spread, typedLetters, wordbands } from './editorial.ts';
import { didone } from './caption/looks/title.ts';

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
