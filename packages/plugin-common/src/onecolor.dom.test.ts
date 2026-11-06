// @vitest-environment jsdom
// common.grade / common.wash / common.viewfinder / common.echo / common.poster / common.band, countdown's look slant and the caption
// look boxes (2026-11-06, the Single Color pilot film). jsdom has no canvas: the step and photo helpers, the declared stills and the
// layers' blend modes are tested.
import { band, echo, grade, gradeFill, parsePhotos, parseSteps, photoIndex, poster, shotNo, stepAt, viewfinder, wash } from './onecolor.ts';
import { stepColor } from './countdown.ts';
import { boxes } from './caption/looks/paper.ts';

describe('kinds and blends', () => {
  test('the grade blends colour, the wash multiplies, the poster sits under the footage', () => {
    expect([grade.blend, wash.blend, grade.kind, wash.kind]).toEqual(['color', 'multiply', 'overlay', 'overlay']);
    expect([viewfinder, echo, poster, band].map((b) => [b.kind, b.category])).toEqual([['overlay', 'frame'], ['overlay', 'text'], ['scene', 'frame'], ['overlay', 'text']]);
  });
});

describe('steps', () => {
  const steps = parseSteps('0.8|none\n0|bw\n0.4|mono\n\n');
  test('read in time order; the value in force at a time, none before the first', () => {
    expect(steps).toEqual([{ t: 0, v: 'bw' }, { t: 0.4, v: 'mono' }, { t: 0.8, v: 'none' }]);
    expect([stepAt(steps, 0.2), stepAt(steps, 0.4), stepAt(steps, 5)]).toEqual(['bw', 'mono', 'none']);
    expect(stepAt(parseSteps('1|bw'), 0.5)).toBe('none');
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
