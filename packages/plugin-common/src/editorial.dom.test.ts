// @vitest-environment jsdom
// common.masthead / common.spread / common.wordbands and the title look didone (2026-11-06, the Fashion pilot film's fx.cover /
// fx.taste / fx.column / fx.wordbands / fx.bighead). jsdom has no canvas: the timing helpers, the declared stills and the look are tested.
import { bandHeight, masthead, parseBands, spread, typedLetters, wordbands } from './editorial.ts';
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
  test('each band about twice as tall as the one before, never past the frame\'s diagonal', () => {
    const [a, b] = [bandHeight(0, 1080, 1920), bandHeight(1, 1080, 1920)];
    expect(b / a).toBeCloseTo(2.1, 6);
    expect(bandHeight(9, 1080, 1920)).toBeCloseTo(Math.hypot(1080, 1920), 6);
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
