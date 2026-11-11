// @vitest-environment jsdom
// common.binocular / common.photostack, the title look storybook and the heading backing frame (2026-11-06, the Wes Anderson pilot
// film). jsdom has no canvas: the window and card helpers, the declared stills, the look's lines and the backing's boxes are tested.
import { binocular, windowCentres } from './binocular.ts';
import { cardIn, parseCards, photostack, stackLayout } from './photostack.ts';
import { isSoftLine, storybook } from './caption/looks/title.ts';
import { buildBacking, drawBacking } from './heading/backing.ts';

describe('common.binocular', () => {
  test('an overlay frame; two windows a radius less their overlap apart, a spyglass one', () => {
    expect([binocular.kind, binocular.category, photostack.kind, photostack.category]).toEqual(['overlay', 'frame', 'scene', 'photo']);
    expect(windowCentres('binocular', 500, 100, 0.3)).toEqual([430, 570]);
    expect(windowCentres('spyglass', 500, 100, 0.3)).toEqual([500]);
  });
});

describe('common.photostack', () => {
  test('cards read source|seconds|label|focus; each declared as a still', () => {
    expect(parseCards('a|2|latte|0.3,0.6\nb')).toEqual([{ source: 'a', t: 2, label: 'latte', fx: 0.3, fy: 0.6, zoom: 1 }, { source: 'b', t: 0, label: '', fx: 0.5, fy: 0.5, zoom: 1 }]);
    const item = { id: 'p', type: photostack.type, start: 0, end: 3, params: { cards: 'a|2|x\nb|5|y' } } as any;
    expect(photostack.media!(item, {} as any)).toEqual({ videos: [], stills: [{ source: 'a', t: 2, w: 1080 }, { source: 'b', t: 5, w: 1080 }] });
  });
  test('cards sized by the short side; a stack too tall for the frame shrinks until the last ends at the safe area\'s bottom', () => {
    const p = { w: 0.7, aspect: 0.5, top: 0.11 };
    // 9:16 as it always was: 0.7 of the width, three cards well above the captions
    expect(stackLayout(3, 1080, 1920, p, 0.22)).toMatchObject({ cw: 756, ch: 378, gap: 30, x: 162 });
    for (const [W, H, safe] of [[1920, 1080, 0.12], [1080, 1080, 0.08], [1080, 1920, 0.22]]) for (const n of [1, 3, 5]) {
      const L = stackLayout(n, W, H, p, safe), end = L.y0 + n * L.ch + (n - 1) * L.gap;
      expect(end).toBeLessThanOrEqual((1 - safe) * H + 1e-6);
      expect(L.cw).toBeLessThanOrEqual(0.7 * Math.min(W, H) + 1e-6);
      expect(L.ch / L.cw).toBeCloseTo(0.5, 6);
    }
    // one card at 16:9 keeps its size: 0.7 of the short side
    expect(stackLayout(1, 1920, 1080, p, 0.12).cw).toBeCloseTo(756, 6);
  });
  test('one card every `every` seconds, each sliding in over 0.4 s', () => {
    expect([cardIn(0, 1, 0.6), cardIn(0.6, 1, 0.6), cardIn(1.0, 1, 0.6)]).toEqual([0, 0, 1]);
    expect(cardIn(0.8, 1, 0.6)).toBeCloseTo(0.875, 6);
  });
});

describe('title look storybook', () => {
  test('a line without a capital, digit or CJK letter is a soft italic lead-in', () => {
    expect(['a day', 'in', 'and finally,', 'fin.', 'KYOTO', 'BLOOM.', '京都', '3 cafés', ' '].map(isSoftLine)).toEqual([true, true, true, true, false, false, false, false, false]);
    // capitals and digits of any script, kana, hangul
    expect(['Éze', 'ÎLE', 'Ωmega', '٣ days', 'すし', 'ラーメン', '서울', 'été', 'à la carte'].map(isSoftLine)).toEqual([false, false, false, false, false, false, false, true, true]);
  });
  test('lead-ins are set half size in italic; when every line is one they keep their size', () => {
    const mk = (texts: string[]) => texts.map((t) => Object.assign(document.createElement('div'), { textContent: t }));
    const three = mk(['a day', 'in', 'KYOTO']);
    storybook.lines!(three, {} as any);
    expect(three.map((l) => [l.style.fontStyle, l.style.fontSize])).toEqual([['italic', '0.5em'], ['italic', '0.5em'], ['', '']]);
    const fin = mk(['fin.']);
    storybook.lines!(fin, {} as any);
    expect([fin[0].style.fontStyle, fin[0].style.fontSize]).toEqual(['italic', '']);
  });
});

describe('heading backing frame', () => {
  test('the whole frame in the backing colour, a frame at least 78% wide and 30% high round the title', () => {
    const els = buildBacking(document.createElement('div'));
    drawBacking(els, { backing: 'frame', block: { x: 440, y: 900, w: 200, h: 120 }, fs: 100, W: 1080, H: 1920, k: 1, centered: true, color: '#4f8d88', accent: '#e8b13c', radius: 0, opacity: 1, ruleP: 1 });
    expect([els.full.style.display, els.full.style.background]).toEqual(['block', 'rgb(79, 141, 136)']);
    expect([els.card.style.width, els.card.style.height, els.card.style.left, els.card.style.top]).toEqual(['842.4px', '576px', '118.8px', '672px']);
    // the inner line is an outline pulled 16 px in, not an inset shadow of the page colour (which darkened a see-through page)
    expect([els.card.style.outlineWidth || els.card.style.outline.split(' ')[0], els.card.style.outlineOffset, els.card.style.boxShadow]).toEqual(['1.50px', '-16.00px', 'none']);
    // another backing afterwards leaves no frame line behind
    drawBacking(els, { backing: 'card', block: { x: 440, y: 900, w: 200, h: 120 }, fs: 100, W: 1080, H: 1920, k: 1, centered: true, color: '#000', accent: '#fff', radius: 0, opacity: 1, ruleP: 1 });
    expect([els.card.style.border, els.card.style.outline, els.card.style.outlineOffset]).toEqual(['', '', '']);
  });
});
