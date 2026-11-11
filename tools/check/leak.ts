// A bleeped word that the footage's own subtitles still show (toolkit phase 5, "2e-lite"): which words were bleeped and when to
// look for them in the finished picture. The page layer renders those frames and reads them with the OCR provider.
import type { Project, Transcript } from '@tellcut/engine';
import type { Finding } from './rules.ts';
import { pictureTimeAt } from '../cut/frames.ts';

export interface LeakProbe { word: string; /** film times to read */ at: number[]; /** where the word is said (for the report) */ said: number }

const clean = (s: string) => s.replace(/[\s{}【】，。！？、,.!?]/g, '').toLowerCase();
/** a word in Latin letters (English): looked for as a whole word, not inside another ("ass" is not in "class") */
const LATIN = /^[a-z0-9'’ ]+$/i;
/** a probe's word as kept: English lower case with single spaces between its words, anything else cleaned */
const probeWord = (s: string) => (LATIN.test(s.trim()) ? s.trim().toLowerCase().replace(/\s+/g, ' ') : clean(s));
/** CJK has no spaces: a transcript word's time is spread over its characters (as wordTimes does). Han only (with Extension A and
 *  the compatibility ideographs), unlike stray.ts's and plugin-common words.ts's: a word with one is a Chinese word, spread over
 *  all its characters; a kana-only or Latin word is bleeped whole, its own word breaks kept */
const CJK = /[㐀-鿿豈-﫿]/;

/**
 * Words bleeped in the film and the frames to read for each: a `{word}` in a caption (over the caption's time), and the word heard
 * under each common.beep (from the clip's transcript). Footage subtitles stay up for the whole sentence, so the frames cover the
 * sentence the word is in (as far as the clip shows it), every 0.5 s.
 */
export function leakProbes(p: Project, times: Map<string, { start: number; end: number }>, transcripts: Record<string, Transcript | null>): LeakProbe[] {
  const clips = p.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.items as any[]);
  const under = (t: number) => clips.find((c) => { const ct = times.get(c.id)!; return ct.start <= t + 1e-6 && ct.end > t; });
  const out: LeakProbe[] = [];
  const add = (word: string, a: number, b: number) => {
    const w = probeWord(word);
    if (!w) return;
    const clip = under(a), ct = clip && times.get(clip.id)!, tr: Transcript | null | undefined = clip ? transcripts[clip.source] : undefined;
    let from = a, to = b;
    if (clip && ct && tr) {
      // the sentence around the word (heard: the clip's sound goes on past a freeze), then the film times whose picture shows it,
      // cut to the clip: past freezeAt the picture holds the frame at the freeze point, so only a sentence on that frame stays up
      const srcAt = clip.in + (a - ct.start) * clip.speed, seg = tr.segments.find((s) => s.start <= srcAt + 0.05 && s.end >= srcAt - 0.05);
      if (seg) {
        const len = ct.end - ct.start, moving = clip.freezeAt != null ? Math.min(len, clip.freezeAt) : len, held = pictureTimeAt(clip, len);
        const lo = Math.max(0, (seg.start - clip.in) / clip.speed), hi = moving < len && held >= seg.start && held <= seg.end ? len : Math.min(moving, (seg.end - clip.in) / clip.speed);
        if (lo > hi + 1e-6) return;   // the picture never shows that sentence
        from = ct.start + lo; to = ct.start + hi;
      }
    }
    const at: number[] = [];
    for (let t = from; t <= to + 1e-6; t += 0.5) at.push(Math.round(t * 100) / 100);
    // the same word from its caption and from its beep: one probe (their windows overlap)
    if (at.length && !out.some((x) => x.word === w && x.at[0] <= at[at.length - 1] && at[0] <= x.at[x.at.length - 1])) out.push({ word: w, at, said: a });
  };
  for (const t of p.tracks) for (const it of t.items as any[]) {
    const span = times.get(it.id);
    if (!span) continue;
    if ((t.kind === 'overlay' || t.kind === 'scene') && typeof it.params?.text === 'string')
      for (const m of String(it.params.text).matchAll(/\{([^{}]+)\}/g)) add(m[1], span.start, span.end);
    if (t.kind === 'sfx' && it.type === 'common.beep') {
      const clip = under(span.start), ct = clip && times.get(clip.id)!, tr: Transcript | null | undefined = clip ? transcripts[clip.source] : undefined;
      if (!clip || !ct || !tr) continue;
      const a = clip.in + (span.start - ct.start) * clip.speed, b = clip.in + (span.end - ct.start) * clip.speed;
      // what the beep covers: the characters of a Chinese word mostly inside it (its time spread over its characters), other
      // words when mostly inside it
      const inside = (s0: number, s1: number) => Math.min(b, s1) - Math.max(a, s0) > 0.5 * (s1 - s0);
      const heard = tr.segments.flatMap((s) => s.words ?? []).map((w) => {
        const cs = [...w.word.trim()];
        if (!cs.some((c) => CJK.test(c))) return inside(w.start, w.end) ? w.word : '';   // its own spaces kept: word breaks
        const d = (w.end - w.start) / Math.max(1, cs.length);
        return cs.filter((_, k) => inside(w.start + k * d, w.start + (k + 1) * d)).join('');
      }).join('');
      add(heard, span.start, span.end);
    }
  }
  return out;
}

/** Whether OCR'd text shows the word: an English word as a whole word, case aside; Chinese anywhere, spaces and punctuation aside. */
export function shows(text: string, word: string): boolean {
  if (!LATIN.test(word)) return clean(text).includes(word);
  const pat = word.split(' ').map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]+');
  return new RegExp(`(?<![a-z0-9])${pat}(?![a-z0-9])`).test(text.toLowerCase());
}

/**
 * The warnings: each probe whose word the OCR read in one of its frames, first such frame. `read` holds the frames' text in
 * Traditional characters (the page layer converts what OCR read, as the transcripts were).
 */
export function leakFindings(probes: LeakProbe[], read: Map<number, string>): Finding[] {
  const out: Finding[] = [];
  for (const pr of probes) {
    const t = pr.at.find((x) => shows(read.get(x) ?? '', pr.word));
    if (t !== undefined) out.push({ level: 'warn', t: [t, t], msg: `原片字幕露出被消音的「${pr.word}」（${t.toFixed(1)} 秒的畫面讀得到）：用 c.clip 的 avoidBurned、把那段裁掉，或在字幕上蓋一塊` });
  }
  return out;
}

/** each common.beep over a clip whose source has no transcript: what it bleeps is unknown, so its leak is not looked for */
export function leakUnchecked(p: Project, times: Map<string, { start: number; end: number }>, transcripts: Record<string, Transcript | null>): Finding[] {
  const clips = p.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.items as any[]);
  return p.tracks.filter((t) => t.kind === 'sfx').flatMap((t) => t.items as any[]).filter((it) => it.type === 'common.beep').flatMap((it): Finding[] => {
    const span = times.get(it.id), clip = span && clips.find((c) => { const ct = times.get(c.id)!; return ct.start <= span.start + 1e-6 && ct.end > span.start; });
    return span && clip && !transcripts[clip.source] ? [{ level: 'note', t: [span.start, span.end], ids: [it.id], msg: `這個消音下面的素材「${clip.source}」沒有逐字稿，沒辦法檢查被消音的字有沒有從原片字幕露出來` }] : [];
  });
}
