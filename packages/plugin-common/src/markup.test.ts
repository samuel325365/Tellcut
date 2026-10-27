import { charKinds, layoutMarkup } from './markup.ts';

test('charKinds drops the markers and tags each character', () => {
  expect(charKinds('好【吃】的{秘方}').map((x) => (x.kind === 'censor' ? '*' : x.c) + ':' + x.kind[0])).toEqual(['好:p', '吃:h', '的:p', '*:c', '*:c']);
  expect(charKinds('好{秘方}').slice(1).every((x) => /[＊＃％＠＆]/.test(x.c))).toBe(true);   // the word itself never reaches the screen
  expect(charKinds('a】b}').map((x) => x.c).join('')).toBe('a】b}');         // a closing marker with nothing open is text
  expect(charKinds('【沒關').map((x) => x.kind)).toEqual(['hl', 'hl']);        // an open marker runs to the end
});

test('lines keep the kind of every character, bleeped ones come out as symbols', () => {
  const r = layoutMarkup('這家【超好吃】的{秘密}', 20, 2);
  expect(r.plain).toMatch(/^這家超好吃的[＊＃％＠＆]{2}$/);
  expect(r.lines).toHaveLength(1);
  expect(r.lines[0].map((x) => x.kind)).toEqual(['plain', 'hl', 'plain', 'censor']);
  expect(r.lines[0][1].t).toBe('超好吃');
  expect(r.lines[0][3].t).toHaveLength(2);
  expect(r.lines[0][3].t).not.toMatch(/[秘密]/);
});

test('a long text breaks across lines and the highlight follows its characters', () => {
  const r = layoutMarkup('今天要介紹一家真的【非常非常】好吃的店', 8, 3);
  expect(r.lines.length).toBeGreaterThan(1);
  const all = r.lines.flat();
  expect(all.filter((x) => x.kind === 'hl').map((x) => x.t).join('')).toBe('非常非常');
  expect(all.map((x) => x.t).join('')).toBe('今天要介紹一家真的非常非常好吃的店');
});

test('typed keeps only that share of the visible characters', () => {
  const r = layoutMarkup('一二三四【五六七八】', 20, 2, 0.5);
  expect(r.lines.flat().map((x) => x.t).join('')).toBe('一二三四');
  expect(layoutMarkup('一二三四', 20, 2, 0).lines.flat()).toEqual([]);
});
