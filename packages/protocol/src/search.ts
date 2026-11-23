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
