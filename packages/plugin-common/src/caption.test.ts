import { DEFAULT_THEME } from '@tellcut/engine';
import { caption, karaokeRange, speakerColor, styleFontOf, stylePop } from './caption.ts';
import { layoutMarkup } from './markup.ts';

test('karaoke: the word being said is the range between the last step reached and the one before it', () => {
  const words: Array<[number, number]> = [[0, 2], [0.5, 4], [1.1, 7]];
  expect(karaokeRange(words, 0.2)).toEqual([0, 2]);
  expect(karaokeRange(words, 0.7)).toEqual([2, 4]);
  expect(karaokeRange(words, 3)).toEqual([4, 7]);
  expect(karaokeRange([], 1)).toBeNull();
  expect(karaokeRange([[0.5, 2]], 0.1)).toBeNull();                               // before the first word: nothing lit
});

test('a lit range of visible characters is drawn highlighted; the lines do not move as it travels', () => {
  const a = layoutMarkup('今天天氣很好我們出門', 6, 2, 1, [0, 2]), b = layoutMarkup('今天天氣很好我們出門', 6, 2, 1, [6, 8]);
  expect(a.lines.map((l) => l.map((r) => r.t).join(''))).toEqual(b.lines.map((l) => l.map((r) => r.t).join('')));
  expect(a.lines[0][0]).toEqual({ t: '今天', kind: 'hl' });
  expect(b.lines.flat().find((r) => r.kind === 'hl')!.t).toBe('我們');
  expect(layoutMarkup('{秘密}在這', 10, 1, 1, [0, 2]).lines[0][0].kind).toBe('censor');   // a bleep stays a bleep
});

test('speakers: 0 keeps the caption colour, 1–3 take the theme accent2, hl and accent', () => {
  const t = DEFAULT_THEME;
  expect([0, 1, 2, 3].map((s) => speakerColor(s, '#ffffff', t))).toEqual(['#ffffff', t.palette.accent2, t.palette.hl, t.palette.accent]);
});

test('styles bar, qa, auto and big are offered; the default stays outline', () => {
  const style = caption.params.find((p) => p.key === 'style') as { default: unknown; options: string[] };
  expect(style.default).toBe('outline');
  expect(style.options).toEqual(expect.arrayContaining(['bar', 'qa', 'auto', 'big']));
});

test('auto and big pop in over 0.14 s (big overshoots), the other styles do not', () => {
  expect(stylePop('auto', 0)).toBeCloseTo(0.88);
  expect(stylePop('big', 0)).toBeCloseTo(0.6);
  expect(Math.max(...[0.06, 0.08, 0.1, 0.12].map((t) => stylePop('big', t)!))).toBeGreaterThan(1);
  for (const s of ['auto', 'big']) expect(stylePop(s, 0.2)).toBeCloseTo(1);
  expect(stylePop('outline', 0)).toBeNull();
});

test('big writes by hand and qa in a serif unless styleFont says otherwise; other styles keep the caption font', () => {
  expect(styleFontOf('big', '')).toBe('LXGW WenKai TC');
  expect(styleFontOf('qa', '')).toBe('Noto Serif TC');
  expect(styleFontOf('qa', 'Cormorant Garamond')).toBe('Cormorant Garamond');
  expect(styleFontOf('box', '')).toBe('');
});
