import { DEFAULT_THEME } from '@tellcut/engine';
import { LOOKS, TEMPLATES, templateOf, withTemplate, bigColorOf, caption, glossColorOf, karaokeRange, lineColorKey, qaBadge, qaBadgeColors, speakerColor, styleFontOf, stylePop } from './caption.ts';
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

// showcase films (spec 2026-10-30 part 2): bilingual captions
test('a gloss is the highlight colour unless set, and the ink on the paper styles, where the highlight colour does not read', () => {
  const p = { glossColor: '', hl: '#ffe14d', outline: '#1a1a1a' };
  expect(['outline', 'plain', 'box', 'bar', 'qa', 'auto', 'big'].map((style) => glossColorOf({ ...p, style }))).toEqual(Array(7).fill('#ffe14d'));
  expect(['bubble', 'ticket', 'crayon', 'strip'].map((style) => glossColorOf({ ...p, style }))).toEqual(Array(4).fill('#1a1a1a'));
  expect(glossColorOf({ ...p, style: 'bubble', glossColor: '#c0392b' })).toBe('#c0392b');
  // the parameter each style draws its line in (voiceCaptions gives the gloss the line's colour)
  expect(['outline', 'bubble', 'strip', 'big'].map(lineColorKey)).toEqual(['color', 'outline', 'outline', 'hl']);
});

test('the gloss can be set bigger and in its own colour; by default it stays small and in the highlight colour', () => {
  const p = Object.fromEntries(caption.params.map((d) => [d.key, d]));
  expect(p.glossSize).toMatchObject({ type: 'number', default: 0.52, min: 0.3, max: 1 });
  expect(p.glossColor).toMatchObject({ type: 'color', default: '' });
});

// acceptance films 2026-11-01 (P3, X3): the speakers' colours said, qa's badge, big's colour and font
test('the speaker parameter says which colour each speaker takes', () => {
  const d = caption.params.find((p) => p.key === 'speaker')!;
  expect(d.label).toMatch(/1＝主題 accent2、2＝高亮色 hl、3＝主色 accent/);
  expect(caption.doc).toMatch(/speaker 1＝主題 accent2、2＝高亮色 hl、3＝主色 accent/);
});

test('qa: one letter keeps the square badge and indent; a short name widens both', () => {
  expect(qaBadge('Q')).toEqual({ square: true, w: 1.03, indent: 1.45 });
  expect(qaBadge('我')).toEqual({ square: true, w: 1.03, indent: 1.45 });
  expect(qaBadge('')).toEqual({ square: true, w: 1.03, indent: 1.45 });
  const amber = qaBadge('Amber');
  expect(amber.w).toBeGreaterThan(2.2);
  expect(amber.indent).toBeCloseTo(amber.w + 0.42);
});

test('qa: the badge is the accent colour for every speaker unless badgeTint, which takes the speaker colour with readable letters', () => {
  const t = { ...DEFAULT_THEME, palette: { ...DEFAULT_THEME.palette, accent: '#e63a2e', accent2: '#3d7bff', hl: '#ffe14d', ink: '#111111' } };
  expect(qaBadgeColors(0, '#ffffff', t, true)).toEqual({ bg: '#ffffff', fg: '#111111' });
  expect([1, 2].map((s) => qaBadgeColors(s, '#ffffff', t, false))).toEqual([{ bg: '#e63a2e', fg: '#ffffff' }, { bg: '#e63a2e', fg: '#ffffff' }]);
  expect(qaBadgeColors(1, '#ffffff', t, true)).toEqual({ bg: '#3d7bff', fg: '#ffffff' });
  expect(qaBadgeColors(2, '#ffffff', t, true)).toEqual({ bg: '#ffe14d', fg: '#111111' });
  expect(caption.params.find((p) => p.key === 'badgeTint')).toMatchObject({ type: 'bool', default: false });
});

test('big: its words are bigColor when set, else the highlight colour; its gloss follows the line', () => {
  expect(bigColorOf({ bigColor: '', hl: '#ffe14d' })).toBe('#ffe14d');
  expect(bigColorOf({ bigColor: '#ff7a59', hl: '#ffe14d' })).toBe('#ff7a59');
  // a speaker's own colour (c.speechCaptions with speakers) wins over hl, bigColor over both
  expect(bigColorOf({ bigColor: '', hl: '#ffe14d' }, '#4dabf7')).toBe('#4dabf7');
  expect(bigColorOf({ bigColor: '#ff7a59', hl: '#ffe14d' }, '#4dabf7')).toBe('#ff7a59');
  expect(glossColorOf({ style: 'big', glossColor: '', hl: '#ffe14d', outline: '#000', bigColor: '#ff7a59' })).toBe('#ff7a59');
  expect(glossColorOf({ style: 'outline', glossColor: '', hl: '#ffe14d', outline: '#000', bigColor: '#ff7a59' })).toBe('#ffe14d');
  expect(caption.params.find((p) => p.key === 'bigColor')).toMatchObject({ type: 'color', default: '' });
});

test('a font the item sets itself replaces big’s handwriting and qa’s serif; styleFont still wins', () => {
  expect(styleFontOf('big', '', true)).toBe('');
  expect(styleFontOf('qa', '', true)).toBe('');
  expect(styleFontOf('big', 'Bungee', true)).toBe('Bungee');
  expect(styleFontOf('big', '', false)).toBe('LXGW WenKai TC');
});

test('templates: the item’s own parameters win, then its template, then the project’s, then the defaults and theme', () => {
  const params = { style: 'outline', size: 4.6, font: 'Noto Sans TC', hl: '#ffe14d' };
  expect(withTemplate(params, {}, undefined)).toBe(params);                                    // none: as they were
  expect(withTemplate(params, { template: 'sticker' })).toMatchObject({ style: 'big', position: 'center', size: 4.6 });
  expect(withTemplate({ ...params, style: 'box' }, { template: 'sticker', style: 'box' })).toMatchObject({ style: 'box', position: 'center' });
  expect(withTemplate(params, {}, 'darkbox')).toMatchObject({ style: 'box' });                // the project's default
  expect(withTemplate(params, { template: 'bubble' }, 'darkbox')).toMatchObject({ style: 'bubble' });
  expect(withTemplate(params, { template: 'gone' }, 'darkbox')).toBe(params);                  // an unknown one of its own: not the project's
  expect(TEMPLATES.map((t) => templateOf(t.id))).toEqual(TEMPLATES);
  expect(new Set(TEMPLATES.map((t) => t.params.style)).size).toBe(LOOKS.filter((l) => l.only !== 'title').length);   // every caption look has a template
});

test('a project’s own templates (copied from My caption templates) are found before the built-in ones', () => {
  const params = { style: 'outline' };
  const mine = { 'my-pink': { style: 'neon', hl: '#ff3db8' } };
  expect(withTemplate(params, { template: 'my-pink' }, undefined, mine)).toMatchObject({ style: 'neon', hl: '#ff3db8' });
  expect(withTemplate(params, {}, 'my-pink', mine)).toMatchObject({ style: 'neon' });
  expect(withTemplate(params, { template: 'my-gone' }, undefined, mine)).toBe(params);
});
