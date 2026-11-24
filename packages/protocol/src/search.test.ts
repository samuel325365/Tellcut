import { aliasText, COMMON_PARAM_MIN, COMMON_PARAM_SHARE, commonParamKeys, idFinder, PARAM_QUERY_MIN, paramFinder, SEARCH_ALIASES, wordFinder } from './search.ts';

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

test('commonParamKeys: the keys more than a tenth of the blocks, and more than five, have, each block counted once', () => {
  const blocks = Array.from({ length: 80 }, (_, i) => ({ params: [{ key: 'size' }, { key: 'size' }, ...(i < 8 ? [{ key: 'fadeDur' }] : []), ...(i < 9 ? [{ key: 'gap' }] : [])] }));
  // size: all 80; gap: 9 of 81 (over a tenth); fadeDur: 8 of 81 (not over 8.1); a block with no params counts too
  expect([...commonParamKeys([...blocks, {}])].sort()).toEqual(['gap', 'size']);
  // a short list: a key on every one of five blocks is still no common key
  expect([...commonParamKeys(blocks.slice(70, 75))]).toEqual([]);
  expect([...commonParamKeys(blocks.slice(70, 76))]).toEqual(['size']);
  expect(commonParamKeys([]).size).toBe(0);
  expect([COMMON_PARAM_SHARE, COMMON_PARAM_MIN]).toEqual([0.1, 5]);
});

test('paramFinder: a key where one of its parts starts (3 characters or more), a name only whole; the common keys never', () => {
  const params = [{ key: 'fadeDur', label: '淡出秒數' }, { key: 'size', label: '大小' }, { key: 'tiltAngle', label: '傾斜' }];
  const names = (d: { label: string }) => [d.label, d.label === '傾斜' ? 'Tilt' : ''];
  const has = (q: string, common: string[] = []) => paramFinder(q, new Set(common))(params, names);
  expect([has('dur'), has('DUR'), has('fadedur'), has('angle'), has('size')]).toEqual([true, true, true, true, true]);
  // inside a part, too short, or only a common key: no
  expect([has('ade'), has('fa'), has('t'), has('size', ['size']), has(''), has('  ')]).toEqual([false, false, false, false, false, false]);
  // a name typed whole (any case, around spaces), not a word inside it
  expect([has('淡出秒數'), has('tilt'), has(' Tilt '), has('淡出'), has('大小', ['size'])]).toEqual([true, true, true, false, false]);
  expect(paramFinder('dur', new Set())<{ key: string; label: string }>(undefined, names)).toBe(false);
  expect(PARAM_QUERY_MIN).toBe(3);
});
