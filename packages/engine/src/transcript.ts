// Speech transcripts (spec 2026-10-14 §7, §9). Which captions a clip's speech makes is captionPlan (@tellcut/plugin-common/speech).
export interface Transcript { language: string; segments: Array<{ start: number; end: number; text: string; words?: Array<{ start: number; end: number; word: string }> }> }

/**
 * faster-whisper with VAD joins the speech on both sides of a long stretch without it into one segment: r3c-baking had a
 * "sentence" from 7:09 to 13:44 with 6 minutes of music inside, so everything read it as talk. Its word times keep the
 * pause: a segment is split where two words are more than `gap` seconds apart, each piece timed by its own words.
 */
export function splitAtPauses(t: Transcript, gap = 3): Transcript {
  const segments = t.segments.flatMap((s) => {
    const w = s.words ?? [];
    if (!w.some((x, i) => i > 0 && x.start - w[i - 1].end > gap)) return [s];
    const runs: (typeof w)[] = [[]];
    w.forEach((x, i) => { if (i > 0 && x.start - w[i - 1].end > gap) runs.push([]); runs.at(-1)!.push(x); });
    return runs.map((r) => ({ start: r[0].start, end: r.at(-1)!.end, text: r.map((x) => x.word).join('').trim(), words: r }));
  });
  return { ...t, segments };
}
