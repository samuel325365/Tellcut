import { aliasText, SEARCH_ALIASES, wordFinder } from './search.ts';

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
