// @vitest-environment jsdom
// common.grade / common.wash / common.viewfinder / common.echo / common.poster / common.band, countdown's look slant and the caption
// look boxes (2026-11-06, the Single Color pilot film). jsdom has no canvas: the step and photo helpers, the declared stills and the
// layers' blend modes are tested.
import { band, echo, grade, gradeFill, parsePhotos, parseSteps, photoIndex, poster, posterLayout, shotNo, stepAt, stepsOf, viewfinder, wash } from './onecolor.ts';
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
  test('parsed once per value: the same text gives the list kept, another text a new one', () => {
    const m = { list: [] as Array<{ t: number; v: string }> }, a = stepsOf(m, '0|bw\n1|mono');
    expect(stepsOf(m, '0|bw\n1|mono')).toBe(a);
    expect(stepsOf(m, '0|mono')).toEqual([{ t: 0, v: 'mono' }]);
  });
  test('the wash starts with the grade\'s own steps, as its doc says', () => {
    const def = (b: { params: Array<{ key: string; default: unknown }> }) => b.params.find((x) => x.key === 'steps')!.default;
    expect(def(wash as any)).toBe(def(grade as any));
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
  test('the layout of 9:16 as it always was; at 16:9 and 1:1 the card shrinks so the words and the barcode stay inside the frame', () => {
    const tall = posterLayout(1080, 1920, true);
    expect([tall.cw, tall.ch, tall.cx, tall.cy, tall.tpx, tall.byy, tall.bh].map((v) => +v.toFixed(3))).toEqual([820.8, 615.6, 129.6, 451.2, 190, 1699.2, 44]);
    expect(tall.ty).toBeCloseTo(0.235 * 1920 - 0.07 * 1920, 6);
    expect(tall.by).toBeCloseTo(0.235 * 1920 + 615.6 + 0.062 * 1920, 6);
    for (const [W, H] of [[1080, 1920], [1920, 1080], [1080, 1080], [1080, 1350]]) for (const barcode of [true, false]) {
      const L = posterLayout(W, H, barcode), half = 0.55 * L.tpx;
      expect(L.ty - half).toBeGreaterThanOrEqual(0);                       // the top word's top
      expect(L.cy).toBeGreaterThan(L.ty + half);                           // the card under it
      expect(L.by - half).toBeGreaterThan(L.cy + L.ch);                    // the bottom word under the card
      expect(L.by + half).toBeLessThanOrEqual(barcode ? L.byy : H);        // and over the barcode
      expect(L.byy + L.bh + 40 * L.u).toBeLessThanOrEqual(H);              // the barcode and its line inside
      expect(L.cx).toBeGreaterThanOrEqual(0); expect(L.cx + L.cw).toBeLessThanOrEqual(W);
      expect(L.ch / L.cw).toBeCloseTo(0.75, 6);
    }
    const wide = posterLayout(1920, 1080, true);
    expect(wide.u).toBe(1);
    expect(wide.cy + wide.ch).toBeLessThan(0.75 * 1080);
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
