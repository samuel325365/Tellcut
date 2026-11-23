import { aliasText, idFinder, SEARCH_ALIASES, wordFinder } from './search.ts';

test('aliasText joins an id\'s aliases into one string a search reads, and is empty for an id with none', () => {
  expect(aliasText('common.pen@heart')).toBe(SEARCH_ALIASES['common.pen@heart'].join(' '));
  expect(aliasText('common.pen@heart')).toContain('心形');
  expect([aliasText('common.no-such-block'), aliasText(''), aliasText('constructor'), aliasText('toString')]).toEqual(['', '', '', '']);
  // a block's aliases are its own, not its looks', and the reverse
  expect(aliasText('common.countdown')).toContain('計時器');
  expect(aliasText('common.pen')).toBe('');
});

test('every list holds words, each once, that a search finds in its own text', () => {
  for (const [key, words] of Object.entries(SEARCH_ALIASES)) {
    expect([key, words.length > 0]).toEqual([key, true]);
    expect([key, new Set(words.map((w) => w.toLowerCase())).size]).toEqual([key, words.length]);
    for (const w of words) {
      expect([key, w, w.trim() === w && w.length > 0]).toEqual([key, w, true]);
      expect([key, w, wordFinder(w.toLowerCase())(aliasText(key).toLowerCase())]).toEqual([key, w, true]);
    }
  }
});

test('wordFinder: a Latin word only where a word starts, any other word anywhere', () => {
  const has = (q: string, f: string) => wordFinder(q)(f);
  expect([has('ring', 'a ring'), has('ring', 'during'), has('ring', 'common.ring'), has('bar', 'common.healthbar')]).toEqual([true, false, true, false]);
  expect([has('環', '圓環'), has('度條', '進度條')]).toEqual([true, true]);
});

test("idFinder: a Latin word where one of an identifier's parts starts, camelCase humps included; CJK anywhere", () => {
  const has = (q: string, f: string) => idFinder(q)(f);
  // the id's start, after punctuation or a space, at a camelCase hump, where letters and digits meet; case does not matter
  expect([has('common', 'common.progress'), has('prog', 'common.progress'), has('common.prog', 'common.progress'), has('corner', 'ring-corner'), has('x', 'a_x'), has('true', 'outline: true')]).toEqual([true, true, true, true, true, true]);
  expect([has('dur', 'fadeDur'), has('icon', 'startIcon'), has('y', 'barY'), has('2', 'step2'), has('d', 'step2d'), has('fadedur', 'fadeDur'), has('dur', 'FADEDUR')]).toEqual([true, true, true, true, true, true, false]);
  // not inside a part: an all-lower-case compound hides its words (SEARCH_ALIASES gives a type its buried word)
  expect([has('bar', 'common.healthbar'), has('art', 'heart'), has('art', 'common.chart'), has('line', 'outline: true'), has('ogress', 'common.progress'), has('ade', 'fadeDur')]).toEqual([false, false, false, false, false, false]);
  // an upper-case letter after another upper-case one is no hump
  expect(has('b', 'RGB')).toBe(false);
  // a query that is not plain Latin is the plain substring test, in any case
  expect([has('環', 'common.圓環'), has('-dur', 'fade-dur'), has('.prog', 'common.Progress')]).toEqual([true, true, true]);
});

test("an all-lower-case compound type's buried word: not found in the id, found in its search aliases", () => {
  for (const [key, w] of [['common.healthbar', 'bar'], ['common.ringbell', 'bell'], ['common.filmstrip', 'strip'], ['common.lockscreen', 'screen']] as const) {
    expect([key, idFinder(w)(key)]).toEqual([key, false]);
    expect([key, wordFinder(w)(aliasText(key).toLowerCase())]).toEqual([key, true]);
  }
});
