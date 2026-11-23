// How a typed word is found in a text, the same in the gallery's search and `catalog --find`: a Latin word only where a word
// starts, so `ring` finds "ringing" and `common.ring` but not "during"; any other word (CJK) anywhere in the text.

/** a query of plain Latin letters, digits and a few joiners: it is matched only where a word starts */
const LATIN_QUERY = /^[a-z0-9 _.'-]+$/;
/** whether `q` is in `f` where a word starts: no ASCII letter or digit right before it (a space, punctuation, `.`, a CJK character) */
const atWordStart = (f: string, q: string) => { for (let i = f.indexOf(q); i >= 0; i = f.indexOf(q, i + 1)) if (i === 0 || !/[a-z0-9]/.test(f[i - 1])) return true; return false; };

/** The test of one lower-case query `q` against lower-case texts: a Latin query that starts with a letter or digit is found only
 *  at a word's start; one with any other character in it (CJK), or that starts with punctuation, keeps the plain substring test.
 *  Made once per query, used on every text. */
export function wordFinder(q: string): (text: string) => boolean {
  return LATIN_QUERY.test(q) && /^[a-z0-9]/.test(q) ? (f) => atWordStart(f, q) : (f) => f.includes(q);
}

/** Words a search should also find a block, look or template by: words people type that none of its labels or docs contains (in
 *  any language), never shown anywhere. Keyed like the editor's blocks.en.ts: `<type>` a whole block, `<type>@<value>` one of its
 *  variants (an option of its `variants.param`), `<type>#<id>` one of its templates. Every language goes in the one list, as the
 *  searches read several at once; a Latin alias is found like any Latin text (at a word's start, each word of a query on its own
 *  in `catalog --find`). Add one only for a word that finds nothing of the target today; tools/catalog.test.ts checks every key
 *  names a real block, look or template. */
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
  'common.filmstrip': ['膠卷', 'film roll', 'film reel'],
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
};

/** the aliases of `id` (a key of SEARCH_ALIASES) as one string for a search to read ('' when it has none) */
export const aliasText = (id: string): string => (Object.hasOwn(SEARCH_ALIASES, id) ? SEARCH_ALIASES[id] : []).join(' ');
