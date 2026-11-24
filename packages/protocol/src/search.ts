// How a typed word is found, the same in the gallery's search, the editor's library and `catalog --find`. In prose (names,
// docs, aliases, group names) a Latin word only where a word starts, so `ring` finds "ringing" but not "during"; in an
// identifier (a type id, param key, enum option, variant value, template or combo id) where one of its parts starts, camelCase
// humps included (`dur` finds `fadeDur`, `art` does not find `heart`); any other word (CJK) anywhere in both. An all-lower-case
// compound type id (`common.healthbar`) gets its buried word as a search alias below. The gallery and the library read param
// names too, with limits catalog does not need (paramFinder).

/** a query of plain Latin letters, digits and a few joiners: it is matched only where a word starts */
const LATIN_QUERY = /^[a-z0-9 _.'-]+$/;
/** whether `q` is in `f` where a word starts: no ASCII letter or digit right before it (a space, punctuation, `.`, a CJK character) */
const atWordStart = (f: string, q: string) => { for (let i = f.indexOf(q); i >= 0; i = f.indexOf(q, i + 1)) if (i === 0 || !/[a-z0-9]/.test(f[i - 1])) return true; return false; };
/** a query matched by the word-start rule: plain Latin that starts with a letter or digit */
const isLatinWord = (q: string) => LATIN_QUERY.test(q) && /^[a-z0-9]/.test(q);

/** The test of one lower-case query `q` against lower-case texts: a Latin query that starts with a letter or digit is found only
 *  at a word's start; one with any other character in it (CJK), or that starts with punctuation, keeps the plain substring test.
 *  Made once per query, used on every text. */
export function wordFinder(q: string): (text: string) => boolean {
  return isLatinWord(q) ? (f) => atWordStart(f, q) : (f) => f.includes(q);
}

const isLetter = (c: string) => /[A-Za-z]/.test(c), isAlnum = (c: string) => /[A-Za-z0-9]/.test(c);
/** whether one of an identifier's parts starts at `i`: its start, right after a character that is no ASCII letter or digit (`.`,
 *  `-`, `_`, a space, `:`, a quote), at a camelCase hump (a lower-case letter or digit, then an upper-case one: `fade|Dur`), or
 *  where letters turn into digits or back (`step|2`) */
const partStart = (f: string, i: number) => {
  if (i === 0) return true;
  const a = f[i - 1], b = f[i];
  return !isAlnum(a) || (/[a-z0-9]/.test(a) && /[A-Z]/.test(b)) || (isAlnum(b) && isLetter(a) !== isLetter(b));
};
/** The test of one lower-case query `q` against identifiers in their own case (type ids, param keys, options, variant values,
 *  template and combo ids, clip-effect keys and cut.ts lines; their case marks where a camelCase part starts): a Latin query is
 *  found where one of the identifier's parts starts (partStart: `dur` in `fadeDur`, `icon` in `startIcon`, but not `art` in
 *  `heart` or `bar` in `healthbar`, which an all-lower-case compound hides: give such a type a SEARCH_ALIASES entry); any other
 *  (CJK) anywhere, as wordFinder. Case does not matter for the comparison itself. */
export function idFinder(q: string): (text: string) => boolean {
  if (!isLatinWord(q)) return (f) => f.toLowerCase().includes(q);
  return (f) => {
    // ASCII-only lower-casing keeps every index of `f` (a Latin query is ASCII)
    const low = f.replace(/[A-Z]/g, (c) => c.toLowerCase());
    for (let i = low.indexOf(q); i >= 0; i = low.indexOf(q, i + 1)) if (partStart(f, i)) return true;
    return false;
  };
}
/** whether a param value is an identifier (an option, a colour, a number: no space in it) a search reads with idFinder, not words
 *  in a sentence it reads with wordFinder */
export const idLike = (v: unknown): boolean => /^[\w.#-]+$/.test(String(v));

/** Words a search should also find a block, look or template by: words people type that none of its labels or docs contains (in
 *  any language), never shown anywhere. Keyed like the editor's blocks.en.ts: `<type>` a whole block, `<type>@<value>` one of its
 *  variants (an option of its `variants.param`), `<type>#<id>` one of its templates. Every language goes in the one list, as the
 *  searches read several at once; a Latin alias is found like any Latin text (at a word's start, each word of a query on its own
 *  in `catalog --find`). Add one only for a word that finds nothing of the target today (a new block whose type is an
 *  all-lower-case compound, like `common.healthbar`, gets its buried word); tools/catalog.test.ts checks every key names a real
 *  block, look or template. */
export const SEARCH_ALIASES: Record<string, readonly string[]> = {
  'common.pen@heart': ['心形', '紅心'],
  'common.pen@thumb': ['大拇指', 'like', 'サムズアップ'],
  'common.pen@check': ['勾勾', 'checkmark'],
  'common.pen@snow': ['下雪'],
  'common.sticker@heart': ['心形', '紅心'],
  'common.emoji@tap': ['心形', '紅心'],
  'common.list@check': ['勾勾', 'checkmark', 'チェックマーク'],
  'common.sparkle@confetti': ['彩帶', '紙花', 'streamers'],
  'common.countdown': ['計時器', '碼表', 'stopwatch', 'タイマー', 'ストップウォッチ'],
  'common.story@timer': ['計時器', '碼表', 'stopwatch', 'ストップウォッチ'],
  'common.receipt': ['發票', '帳單', 'invoice', 'bill', '請求書', '領収書'],
  'common.printer': ['發票', '帳單', 'invoice', 'bill', '請求書', '領収書'],
  'common.chart@line': ['折線'],
  // with the space too: the gallery and the library panel read a query as one phrase
  'common.candles': ['蠟燭', 'K棒', 'K 棒'],
  'common.film': ['膠卷', 'film roll', 'film reel'],
  'common.filmstrip': ['膠卷', 'film roll', 'film reel', 'strip'],
  'common.search': ['google'],
  'common.search@results': ['頭條', '快訊', 'headline', 'breaking news', '速報', 'ヘッドライン'],
  'common.wipe#band-steep': ['頭條', '快訊', 'headline', 'ヘッドライン'],
  'common.onomatopoeia': ['效果字', 'sound effect text'],
  'common.quote': ['名言', 'famous quote'],
  'common.strike': ['刪除線', 'strikethrough', '取り消し線'],
  'common.grid': ['分屏', 'split screen', '分割画面'],
  'common.slant': ['分屏', 'split screen', '分割画面'],
  'common.duo': ['分屏'],
  'common.outro@cta': ['訂閱', 'subscribe', 'チャンネル登録'],
  'common.rating': ['星等', '星評価'],
  'common.slam@led': ['霓虹燈', 'neon', 'ネオン'],
  // the second word of an all-lower-case compound type id, which idFinder cannot find inside it (only where the id's parts start),
  // when the block's own words in the catalog do not have it at a word's start either (filmstrip's is with its list above)
  'common.scoreboard': ['board'],
  'common.tripclock': ['clock'],
  'common.handwrite': ['write'],
  'common.hangtag': ['tag'],
  'common.timelapse': ['lapse'],
  'common.routeboard': ['board'],
  'common.mapjump': ['jump'],
  'common.postmark': ['mark'],
  'common.rolldoor': ['door'],
  'common.lockscreen': ['screen'],
  'common.casefile': ['file'],
  'common.healthbar': ['bar'],
  'common.monoframe': ['frame'],
  'common.photostack': ['stack'],
  'common.popcard': ['card'],
  'common.ringbell': ['bell'],
};

/** the aliases of `id` (a key of SEARCH_ALIASES) as one string for a search to read ('' when it has none) */
export const aliasText = (id: string): string => (Object.hasOwn(SEARCH_ALIASES, id) ? SEARCH_ALIASES[id] : []).join(' ');

/** A param key more than this share of the blocks searched have (size, color, x, y, font, text…) says nothing about any one of
 *  them: the gallery's and the editor library's search by param name skip it, or `size` would list half the blocks. catalog
 *  --find, read in full by an agent that ands several words, keeps every key. */
export const COMMON_PARAM_SHARE = 0.1;
/** and more blocks than this, so a short list (a few sounds, a test's handful) keeps every key */
export const COMMON_PARAM_MIN = 5;
/** the shortest query those searches read in param keys: one or two letters start a part of too many keys (`t`, `at`, `in`) */
export const PARAM_QUERY_MIN = 3;
/** the keys more than COMMON_PARAM_SHARE of `blocks`, and more than COMMON_PARAM_MIN of them, have, each block counted once */
export function commonParamKeys(blocks: Iterable<{ params?: ReadonlyArray<{ key: string }> }>): Set<string> {
  const n = new Map<string, number>();
  let total = 0;
  for (const b of blocks) { total++; for (const k of new Set((b.params ?? []).map((d) => d.key))) n.set(k, (n.get(k) ?? 0) + 1); }
  return new Set([...n].filter(([, c]) => c > Math.max(total * COMMON_PARAM_SHARE, COMMON_PARAM_MIN)).map(([k]) => k));
}
/** The test of one query against a block's params, for the gallery and the editor's library: a key not in `common` is found where
 *  one of its parts starts (idFinder, as catalog --find: `dur` finds `fadeDur`), for a query of PARAM_QUERY_MIN characters or
 *  more; a param's name (`names(param)`: its names in any language) only when the query is that whole name (字級, Font size),
 *  since a word inside a name (顏色, length) is in dozens of them. */
export function paramFinder(query: string, common: ReadonlySet<string>): <P extends { key: string }>(params: ReadonlyArray<P> | undefined, names: (p: P) => string[]) => boolean {
  const q = query.trim().toLowerCase();
  const id = q.length >= PARAM_QUERY_MIN ? idFinder(q) : undefined;
  return (params, names) => !!q && (params ?? []).some((d) => !common.has(d.key) && (!!id?.(d.key) || names(d).some((n) => n.trim().toLowerCase() === q)));
}
