// @vitest-environment jsdom
// common.prints / common.scraps and common.wipe's mode tiles (2026-11-05, the Collage pilot film's fx.prints / fx.scraps / fx.mosaic).
import { rng } from '@tellcut/engine';
import { deckle, parsePrints, parseScraps, prints, scrapColor, scraps, type Scrap } from './scrapbook.ts';
import { tileTimes } from './wipe.ts';

describe('common.prints', () => {
  test('a frame block; a print reads seconds|source seconds|x,y,w|tilt|w:h|options', () => {
    expect([prints.kind, prints.category, scraps.category]).toEqual(['overlay', 'frame', 'mark']);
    const [a, b] = parsePrints('0.5|28.5|0.7,0.42,0.5|4|4:3|tape clip focus=0.3,0.6\n1|120|0.3,0.5,0.4|-2|3:4|tape=#c3b1f5');
    expect(a).toEqual({ at: 0.5, t: 28.5, x: 0.7, y: 0.42, w: 0.5, tilt: 4, ratio: 4 / 3, tape: 'rgba(236,226,190,0.82)', clip: true, fx: 0.3, fy: 0.6, source: '', crop: null });
    expect([b.ratio, b.tape, b.clip, b.fx]).toEqual([0.75, '#c3b1f5', false, 0.5]);
  });

  test('it declares one still a print, at its source second', () => {
    const item = { id: 'p', type: prints.type, start: 0, end: 3, params: { source: 'v', prints: '0|10|0.5,0.5,0.5\n0.3|12.5|0.5,0.5,0.5' } } as any;
    expect(prints.media!(item, {} as any)).toEqual({ videos: [], stills: [{ source: 'v', t: 10, w: 720 }, { source: 'v', t: 12.5, w: 720 }] });
    expect(prints.media!({ ...item, params: { ...item.params, source: '' } }, {} as any).stills).toEqual([]);
  });

  test('a deckled edge is the same for the same seed and stays inside the box', () => {
    expect(deckle(rng(4))).toBe(deckle(rng(4)));
    const nums = [...deckle(rng(9)).matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0); expect(Math.max(...nums)).toBeLessThanOrEqual(100);
  });
});

describe('common.scraps', () => {
  test('kinds read as written, unknown ones are paper; grid keeps its columns and rows in x, y', () => {
    expect(parseScraps('0|pin|0.3,0.3,0.04|0|#e0552f\n0.5|bogus|0.5,0.5,0.2,0.1\n1|grid|5,9|0|#ffffff')).toEqual([
      { at: 0, kind: 'pin', x: 0.3, y: 0.3, w: 0.04, h: 0.04, tilt: 0, color: '#e0552f' },
      { at: 0.5, kind: 'paper', x: 0.5, y: 0.5, w: 0.2, h: 0.1, tilt: 0, color: '' },
      { at: 1, kind: 'grid', x: 5, y: 9, w: 0.3, h: 0.3, tilt: 0, color: '#ffffff' }]);
  });

  test("a scrap with no colour takes its kind's own; a colour chosen is kept, even the paper default on a paperclip", () => {
    // the paperclip used to turn any #c3b1f5 grey, because that was also the colour the parser filled in when none was given
    expect(['paper', 'dots', 'tape', 'pin', 'clip', 'grid'].map((k) => scrapColor({ kind: k as Scrap['kind'], color: '' }))).toEqual(['#c3b1f5', '#c3b1f5', '#c3b1f5', '#c3b1f5', '#9aa3ab', '#ffffff']);
    expect(scrapColor({ kind: 'clip', color: '#c3b1f5' })).toBe('#c3b1f5');
    expect(scrapColor(parseScraps('0|clip|0.5,0.5,0.06,0.16')[0])).toBe('#9aa3ab');
  });
});

describe('common.wipe mode tiles', () => {
  test('every tile closes in the first half and opens in the second, so the frame is covered at the middle', () => {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) {
      const [a, b] = tileTimes(c, r, 5, 9);
      expect(a + 0.07).toBeLessThanOrEqual(0.5); expect(b).toBeGreaterThanOrEqual(0.5);
    }
    expect(tileTimes(2, 3, 5, 9)).toEqual(tileTimes(2, 3, 5, 9));
  });
});

describe('common.prints sizes and bad numbers', () => {
  test('a number that does not read falls back to its default instead of NaN', () => {
    const [a] = parsePrints('0|1|a,0.4,b|x|4:3|focus=q,0.2');
    expect([a.x, a.y, a.w, a.tilt, a.fx, a.fy]).toEqual([0.5, 0.4, 0.5, 0, 0.5, 0.2]);
  });
  test('the soft shadow scales with the short side (unchanged at 1080)', () => {
    const shadow = (W: number, H: number) => {
      const root = document.createElement('div'), params = { source: '', prints: '0|0|0.5,0.5,0.5', border: 0.035, paper: '#fbf8f1', seed: 3 };
      const s = prints.build({ params, root, W, H, media: { stillUrl: () => '' } } as any);
      return s.list[0].wrap.style.filter;
    };
    expect(shadow(1080, 1920)).toBe('drop-shadow(0 6px 10px rgba(40,25,10,0.38))');
    expect(shadow(1920, 1080)).toBe('drop-shadow(0 6px 10px rgba(40,25,10,0.38))');
    expect(shadow(540, 960)).toBe('drop-shadow(0 3px 5px rgba(40,25,10,0.38))');
  });
});
