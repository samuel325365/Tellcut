// The transcript side of the Cut API: which captions a clip's speech makes (speechCaptions), hand-written lines timed in source
// seconds (lines), where a word is said (wordTimes, censorSpeech). Pure: transcript and clip pieces in, film times out; Cut puts
// the items on the timeline.
import { r6, type Transcript } from '@tellcut/engine';
import { charKinds } from '@tellcut/plugin-common';

/** a word to bleep written in Latin letters (English): matched against whole transcript words */
export const LATIN_QUERY = /^[A-Za-z0-9'’ -]+$/;
/** a word of the query as compared: lower case, no punctuation around it */
const norm = (w: string) => w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

/** A moment of a source: seconds, or minutes:seconds as a player shows it ('1:23.5', '1:02:03'). */
export type SrcTime = number | string;
/** `t` as seconds (see SrcTime); `what` names it in the error */
export function secs(t: SrcTime, what = '時間'): number {
  if (typeof t === 'number') {
    if (!Number.isFinite(t)) throw new Error(`${what}不是數字（${t}）`);
    return t;
  }
  const m = /^\s*(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\s*$/.exec(t);
  if (m && Number(m[3]) < 60 && (m[1] === undefined || Number(m[2]) < 60)) return r6((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3]));
  if (/^\s*\d+(\.\d+)?\s*$/.test(t)) return Number(t);
  throw new Error(`${what}「${t}」看不懂：寫秒數（83.5）或 分:秒（'1:23.5'、'1:02:03'）`);
}

/** one clip of the speech, in source seconds (in, out) and film seconds (start, end) */
export interface SpeechPiece { id: string; source: string; in: number; out: number; start: number; end: number; rate: number }
export interface CaptionOptions {
  highlight?: string[]; censor?: string[]; fix?: Record<string, string>; karaoke?: boolean; chunk?: number | Record<string, number>;
  speakers?: Array<[number, number, number]>; names?: string[];
  /** words left out of the captions (fillers: um, uh, 嗯), whole words in any case */
  drop?: string[];
  /** at most this many characters a caption (the words joined) */
  maxChars?: number;
  /** a new caption where the speaker pauses longer than this (seconds between two words) */
  pause?: number;
}
/** a caption to hang on `home`: `at` and `len` in the piece's own seconds, `extra` the params besides the text (words, speaker, name) */
export interface CaptionPlan { home: SpeechPiece; at: number; len: number; text: string; extra: Record<string, unknown> }

/** Source seconds → film seconds over `pieces`; a moment in a cut-out pause goes to the next piece's start (or the last piece's end). */
export function filmOf(pieces: SpeechPiece[], s: number, edge: 'start' | 'end'): number {
  const hit = pieces.find((x) => s >= x.in - 1e-6 && s <= x.out + 1e-6);
  if (hit) return hit.start + (s - hit.in) / hit.rate;
  if (edge === 'start') { const next = pieces.find((x) => x.in > s); return next ? next.start : pieces[pieces.length - 1].end; }
  const prev = [...pieces].reverse().find((x) => x.out < s); return prev ? prev.end : pieces[0].start;
}
/** the piece a film moment falls in (the last one past the end): what a caption hangs on */
const homeOf = (pieces: SpeechPiece[], fa: number) => pieces.find((x) => fa >= x.start - 1e-6 && fa < x.end - 1e-6) ?? pieces[pieces.length - 1];
/** film spans sorted by start, each cut back so it ends where the next begins: two captions are never up at once */
function noOverlap<T extends { fa: number; fb: number }>(list: T[]): T[] {
  const out = [...list].sort((x, y) => x.fa - y.fa);
  out.forEach((x, i) => { const next = out[i + 1]; if (next && x.fb > next.fa) x.fb = next.fa; });
  return out.filter((x) => x.fb - x.fa > 1e-6);
}

// an English word is matched as a whole word in any case ({ i: 'I' } must not touch "think"); Chinese anywhere in the text
const find = (w: string) => {
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return LATIN_QUERY.test(w) ? new RegExp(`(?<![\\p{L}\\p{N}'’])${esc}(?![\\p{L}\\p{N}'’])`, 'giu') : new RegExp(esc, 'gu');
};
// words as said: Whisper's English words carry their own leading space and Chinese ones none ("我們去 Tokyo玩"); two bare
// Latin words still get one between them
const joinWords = (ws: Array<{ word: string }>) => ws.reduce((s, w) => s + (/[\p{Script=Latin}\p{N}]$/u.test(s) && /^[\p{Script=Latin}\p{N}]/u.test(w.word) ? ' ' : '') + w.word, '')
  .replace(/\s+/g, ' ').trim();
/** a word as `drop` compares it: lower case, no punctuation around it (any script) */
const bare = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
/** a word that ends a sentence (its closing quote or bracket aside) */
const SENTENCE_END = /[.?!。？！…]["'”’)）」』]*$/;
/** how long a caption broken at a pause (or a speaker change, a sentence end) stays up after its last word, at most */
const HOLD = 0.4;

/** The captions `pieces` (clips of one source, in film order) make of the transcript `tr`, sentence by sentence (see Cut.speechCaptions). */
export function captionPlan(tr: Transcript, pieces: SpeechPiece[], o: CaptionOptions = {}): CaptionPlan[] {
  const toFilm = (s: number, edge: 'start' | 'end') => filmOf(pieces, s, edge);
  const first = pieces[0].start, last = pieces[pieces.length - 1].end;
  const swap = (s: string, w: string, to: (found: string) => string) => s.replace(find(w), to);
  const mark = (text: string) => {
    let s = text;
    for (const [heard, meant] of Object.entries(o.fix ?? {})) s = swap(s, heard, () => meant);   // words the transcript got wrong
    s = s.replace(/ {2,}/g, ' ').trim();                                                         // a word fixed away leaves no gap
    for (const w of o.censor ?? []) s = swap(s, w, (x) => `{${x}}`);
    for (const w of o.highlight ?? []) s = swap(s, w, (x) => `【${x}】`);
    return s;
  };
  const r3 = (t: number) => Math.round(t * 1000) / 1000;
  const marked = [...Object.keys(o.fix ?? {}), ...(o.censor ?? []), ...(o.highlight ?? [])].filter(Boolean);
  const size = typeof o.chunk === 'object' ? o.chunk[tr.language ?? ''] ?? o.chunk['*'] : o.chunk;
  const n = Math.floor(size ?? 0), maxChars = Math.floor(o.maxChars ?? 0), grouping = n >= 1 || maxChars >= 1;
  const dropped = new Set((o.drop ?? []).map(bare).filter(Boolean));
  // a word is in the film when its middle is inside a piece: the words before the clip's in point and after its out point (and in
  // the pauses tighten() cut) used to come along with the rest of their sentence ("Ideally", "Um" over a clip that never says them)
  const shown = (w: { start: number; end: number }) => { const m = (w.start + w.end) / 2; return pieces.some((x) => m >= x.in - 1e-6 && m <= x.out + 1e-6); };
  const whoAt = (t: number) => o.speakers?.find(([a, b]) => t >= a && t <= b)?.[2];
  const mid = (w: { start: number; end: number }) => (w.start + w.end) / 2;
  type Seg = (typeof tr.segments)[number];
  // a sentence in captions: `chunk` words or `maxChars` characters each (a piece that would end inside a fixed, censored or
  // highlighted word runs on past it, or neither piece would match it — Whisper gives Chinese one character a word: 幹 | 你娘
  // went out unbleeped), and a new one at a pause, at a change of speaker and (when chunked) after a sentence's end. A chunk
  // runs from its first word to the next one's; one broken at a pause stays HOLD after its last word at most.
  const pieceOf = (seg: Seg): Seg[] => {
    const all = seg.words ?? [];
    if (!all.length) return [seg];   // no word times: the sentence as it is
    const ws = all.filter((w) => shown(w) && !dropped.has(bare(w.word)));
    if (!ws.length) return [];
    const raw = joinWords(ws), ends = ws.map((_, k) => joinWords(ws.slice(0, k + 1)).length);
    const spans = marked.flatMap((w) => [...raw.matchAll(find(w))].map((m) => [m.index!, m.index! + m[0].length]));
    const groups: Array<{ ws: typeof ws; soft: boolean }> = [];
    for (let k = 0; k < ws.length;) {
      let e = k + 1, soft = false;
      for (; e < ws.length; e++) {
        const prev = ws[e - 1], next = ws[e];
        if ((o.pause !== undefined && next.start - prev.end > o.pause) || (o.speakers && whoAt(mid(next)) !== whoAt(mid(prev))) || (grouping && SENTENCE_END.test(prev.word.trim()))) { soft = true; break; }
        if ((n >= 1 && e - k >= n) || (maxChars >= 1 && joinWords(ws.slice(k, e + 1)).length > maxChars)) break;
      }
      let hit: number[] | undefined;
      while (!soft && (hit = spans.find(([a, b]) => e < ws.length && a < ends[e - 1] && ends[e - 1] < b))) while (ends[e - 1] < hit[1]) e++;
      groups.push({ ws: ws.slice(k, e), soft });
      k = e;
    }
    // a lone last word joins the one before (not across a pause or a sentence's end, nor past maxChars)
    const [before, lone] = groups.slice(-2);
    if (lone && lone.ws.length === 1 && !before.soft && !(maxChars >= 1 && joinWords([...before.ws, ...lone.ws]).length > maxChars)) before.ws.push(...groups.pop()!.ws);
    if (groups.length === 1 && ws.length === all.length) return [seg];
    return groups.map((g, k) => {
      const a = g.ws[0], z = g.ws[g.ws.length - 1], next = groups[k + 1];
      const end = !next ? (z === all[all.length - 1] ? seg.end : z.end) : g.soft ? Math.min(next.ws[0].start, z.end + HOLD) : next.ws[0].start;
      return { ...seg, start: a === all[0] ? seg.start : a.start, end, text: joinWords(g.ws), words: g.ws };
    });
  };
  // sentence by sentence, so each caption knows its words (their times) and its source moment (who says it)
  const timed = tr.segments.flatMap(pieceOf).flatMap((seg) => {
    const fa = r3(Math.max(first, toFilm(seg.start, 'start'))), fb = r3(Math.min(last, toFilm(seg.end, 'end')));
    return fb - fa < 0.3 || !seg.text.trim() ? [] : [{ seg, fa, fb }];
  });
  return noOverlap(timed).map(({ seg, fa, fb }) => {
    // it hangs on the piece it starts in, in that piece's own seconds
    const home = homeOf(pieces, fa);
    const text = mark(seg.text.trim()), extra: Record<string, unknown> = {};
    if (o.karaoke && seg.words?.length) {
      // the transcript's words onto the caption's visible letters, by proportion (a fixed word may change the count); a step ends
      // on a letter, so spaces between English words never shift it (they used to: "w|e stumbled", the step a letter late)
      const chars = charKinds(text), total = chars.length, solid = chars.flatMap((x, k) => (/\s/.test(x.c) ? [] : [k]));
      const lens = seg.words.map((w) => [...w.word.replace(/\s+/g, '')].length), all = lens.reduce((a, b) => a + b, 0) || 1;
      const endAt = (k: number) => (k <= 0 ? 0 : k >= solid.length ? total : solid[k - 1] + 1);
      let cum = 0;
      extra.words = seg.words.map((w, i) => { cum += lens[i]; return [r6(Math.max(0, toFilm(w.start, 'start') - fa)), i === seg.words!.length - 1 ? total : endAt(Math.round((cum / all) * solid.length))]; });
    }
    const who = whoAt((seg.start + seg.end) / 2);
    if (who) { extra.speaker = who; if (o.names?.[who]) extra.name = o.names[who]; }
    return { home, at: r6(fa - home.start), len: r6(fb - fa), text, extra };
  });
}

/** a hand-written caption: from, to (source seconds of the clip it is over), its text and its own params */
export type Line = [from: SrcTime, to: SrcTime, text: string, params?: Record<string, unknown>];

/**
 * Hand-written captions (a translation, a cleaned-up line) over `pieces`, timed in the source's seconds (see Cut.lines). `hold` keeps
 * each one up that much longer while the next has not begun, never past the clip's end; two are never up at once.
 */
export function linePlan(pieces: SpeechPiece[], lines: Line[], o: { hold?: number } = {}): CaptionPlan[] {
  const first = pieces[0].start, last = pieces[pieces.length - 1].end, hold = o.hold ?? 0;
  const timed = lines.map(([from, to, text, params], i) => {
    const what = `c.lines 第 ${i + 1} 行「${text}」`, a = secs(from, `${what}的開始`), b = secs(to, `${what}的結束`);
    if (!(b > a)) throw new Error(`${what}：結束（${b} 秒）要在開始（${a} 秒）之後`);
    if (!pieces.some((x) => a < x.out - 1e-6 && b > x.in + 1e-6)) throw new Error(`${what}（素材 ${a}–${b} 秒）不在片段裡：片段是素材的 ${pieces.map((x) => `${r6(x.in)}–${r6(x.out)}`).join('、')} 秒`);
    return { fa: Math.max(first, filmOf(pieces, a, 'start')), fb: Math.min(last, filmOf(pieces, b, 'end')), text, params: params ?? {} };
  }).sort((x, y) => x.fa - y.fa);
  timed.forEach((x, i) => { const next = timed[i + 1]?.fa ?? last; x.fb = Math.max(x.fb, Math.min(next, x.fb + hold, last)); });
  return noOverlap(timed).map((x) => { const home = homeOf(pieces, x.fa); return { home, at: r6(x.fa - home.start), len: r6(x.fb - x.fa), text: x.text, extra: x.params }; });
}

/** Where `word` is said in the transcript, as film times of the clip `it` (start/end in film seconds, `in` in source seconds) played at `speed` (see Cut.wordTimes). */
export function wordSpans(tr: Transcript, it: { start: number; end: number; in: number }, speed: number, word: string): Array<[number, number]> {
  if (!word) return [];
  const chars: Array<{ c: string; a: number; b: number }> = [];
  /** the same characters with the spaces kept (word breaks), lower case, each with its whole word's time: for English */
  const lchars: Array<{ c: string; a: number; b: number }> = [];
  for (const seg of tr.segments) {
    const ws = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    for (const w of ws) {
      const cs = [...w.word.replace(/\s+/g, '')], d = (w.end - w.start) / Math.max(1, cs.length);
      cs.forEach((c, k) => chars.push({ c, a: w.start + k * d, b: w.start + (k + 1) * d }));
      // one entry per UTF-16 unit, so a match's index in the joined text is its index here
      const lw = w.word.toLowerCase();
      for (let k = 0; k < lw.length; k++) lchars.push({ c: lw[k], a: w.start, b: w.end });
    }
    lchars.push({ c: ' ', a: seg.end, b: seg.end });
    chars.push({ c: '\n', a: seg.end, b: seg.end });   // a word is not found across two sentences
  }
  const spans: Array<[number, number]> = [];
  if (LATIN_QUERY.test(word)) {
    // an English word (or phrase) matches whole words only, case and punctuation aside: "ass" is not inside "class". Whisper
    // in Chinese mode splits English into pieces ("Go" "ogle"), so the pieces are joined and only letters around a match count
    const text = lchars.map((x) => x.c).join('');
    const pat = word.trim().toLowerCase().split(/\s+/).map(norm).filter(Boolean).map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]*');
    if (pat) for (const m of text.matchAll(new RegExp(`(?<![a-z0-9])${pat}(?![a-z0-9])`, 'g'))) {
      const i = m.index!;
      spans.push([lchars[i].a, lchars[i + m[0].length - 1].b]);
    }
  } else {
    // Chinese has no spaces: the word is found in the characters, each word's time spread over its characters
    const text = chars.map((x) => x.c).join(''), n = [...word].length;
    for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + 1)) { const ci = [...text.slice(0, i)].length; spans.push([chars[ci].a, chars[ci + n - 1].b]); }
  }
  const out: Array<[number, number]> = [];
  for (const [a, b] of spans) {
    const ta = it.start + (a - it.in) / speed, tb = it.start + (b - it.in) / speed;
    // a word cut by the clip's in or out point is still bleeped, over the part the clip shows
    if (tb > it.start + 1e-6 && ta < it.end - 1e-6) out.push([r6(Math.max(ta, it.start)), r6(Math.min(tb, it.end))]);
  }
  return out;
}
