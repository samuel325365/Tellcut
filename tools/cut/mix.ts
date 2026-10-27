// The music side of Cut.save(): the generated score, and the music's volume curve (ducking under speech, dips, the level curve).
import { basename } from 'node:path';
import { addItem, r6, resolveTimes, type Project, type Transcript } from '@tellcut/engine';
import { loadAllStyles, scoreFiles, STYLES } from '@tellcut/media-node';

export interface ScoreRequest { style: string; bpm?: number; key?: string; seed?: number; name?: string; gain?: number; fadeIn?: number; fadeOut?: number; cues?: Record<string, number> }

/** Composes the score asked for with Cut.score(): whole bars that run at least to the film's end, the first beat at 0. */
export async function addScore(p: Project, dir: string, s: ScoreRequest, duration: number) {
  const { styles } = await loadAllStyles(dir), style = STYLES[s.style] ?? styles[s.style];
  if (!style) throw new Error(`沒有「${s.style}」這個配樂風格（npm run score -- --styles ${basename(dir)}）`);
  const bpm = s.bpm ?? style.defaults.bpm, bar = (60 / bpm) * 4, bars = Math.max(4, Math.ceil((duration - 1.2) / bar));
  const w = scoreFiles(dir, { style: s.style, styles, bars, length: bars * bar, bpm, key: s.key, seed: s.seed, name: s.name, cues: s.cues });
  p.media[w.mediaId] = { path: w.rel, duration: w.info.duration };
  const len = r6(Math.min(duration, w.info.duration));
  addItem(p, { track: 'music', item: { media: w.mediaId, in: 0, start: 0, end: len, gain: s.gain ?? -4, fadeIn: s.fadeIn ?? 0, fadeOut: Math.min(s.fadeOut ?? 1.2, len / 2), toEnd: true } });
  p.grids = [{ id: 'music', at: 0, bpm }];
}

/** at or under this level (dB, the item's and its track's) a clip's own sound is room tone under the music: its words do not duck it */
export const QUIET_DB = -20;
/** a stretch of speech in film seconds, and the dB the music ducks to under it when not duck()'s (Cut.clip's duck option) */
export type Speech = [a: number, b: number, db?: number];
/** how one clip sound counts: null = not at all, undefined = duck()'s level, a number = that dB. Default: room tone does not count */
export type SpeechLevel = (it: { id: string; parent?: string }, level: number) => number | null | undefined;

/** a source sound item on the timeline, as heardSpeech gives it */
export interface HeardItem { id: string; parent?: string; source: string; in: number; rate: number; gain: number; muted?: boolean }
/**
 * The sentences heard in the film: each transcript sentence over each source sound item that plays as the mix plays it (muted
 * tracks and items say nothing; when a sound track is solo only solo ones play), at least 0.3 s of it inside the item, in film
 * seconds. `span` gives an item's film start and end (default: resolveTimes). The music ducks under them (clipSpeech) and check
 * matches captions against them (check/rules.ts).
 */
export function heardSpeech(p: Project, transcriptOf: (source: string) => Transcript | null | undefined, span?: (id: string) => [number, number]): Array<{ item: HeardItem; level: number; t: [number, number]; text: string }> {
  const times = span ? null : resolveTimes(p), at = span ?? ((id: string): [number, number] => { const x = times!.get(id)!; return [x.start, x.end]; });
  const solo = p.tracks.some((t) => (t.kind === 'audio' || t.kind === 'music' || t.kind === 'sfx') && !t.muted && (t as { solo?: boolean }).solo);
  const out: Array<{ item: HeardItem; level: number; t: [number, number]; text: string }> = [];
  for (const t of p.tracks) {
    if (t.kind !== 'audio' || t.muted || (solo && !(t as { solo?: boolean }).solo)) continue;
    for (const c of t.items as HeardItem[]) {
      const tr = transcriptOf(c.source);
      if (!tr || c.muted) continue;
      const [cs, ce] = at(c.id), level = (c.gain ?? 0) + ((t as { gain?: number }).gain ?? 0);
      for (const seg of tr.segments) {
        if (!seg.text.trim()) continue;
        const a = Math.max(cs, cs + (seg.start - c.in) / c.rate), b = Math.min(ce, cs + (seg.end - c.in) / c.rate);
        if (b - a >= 0.3) out.push({ item: c, level, t: [a, b], text: seg.text.trim() });
      }
    }
  }
  return out;
}

/** speech heard in the clips' own sound (heardSpeech), each with the level the music ducks to under it (see SpeechLevel) */
export function clipSpeech(p: Project, transcriptOf: (source: string) => Transcript | null | undefined, count: SpeechLevel = (_, level) => (level > QUIET_DB ? undefined : null)): Speech[] {
  return heardSpeech(p, transcriptOf).flatMap(({ item, level, t: [a, b] }): Speech[] => {
    const db = count(item, level);
    return db === null ? [] : [db === undefined ? [a, b] : [a, b, db]];
  });
}

/**
 * The music's volume curve: it dips under the narration and under `speech` (Cut.duck), and where dip() asked for a drop; where two
 * overlap the lower one wins; the level curve (Cut.level) adds under it. Every music item that is not narration gets it (one with
 * its own envelope is left alone).
 */
export function addDucking(p: Project, o: { duckDb: number | false; speech: Speech[]; dips: Array<{ at: number; len: number; db: number }>; curve: Array<[number, number]> }) {
  const RAMP = 0.25, spans: Array<{ a: number; b: number; db: number }> = [];
  // the narration and the speech at duck()'s level (none when it is false), and speech a clip gave its own level
  const voices = o.duckDb === false ? [] : ((p.tracks.find((t) => t.id === 'voice')?.items ?? []) as Array<{ start: number; end: number }>).map((v): [number, number, number] => [v.start, v.end, o.duckDb as number]);
  const own = o.speech.flatMap(([a, b, db]): Array<[number, number, number]> => (db !== undefined ? [[a, b, db]] : o.duckDb === false ? [] : [[a, b, o.duckDb]]));
  const merged: Array<[number, number, number]> = [];
  for (const [a, b, db] of [...voices, ...own].sort((x, y) => x[0] - y[0])) {
    const last = [...merged].reverse().find((m) => m[2] === db);
    if (last && a - last[1] < 1) last[1] = Math.max(last[1], b); else merged.push([a, b, db]);   // a short breath does not bring the music back up
  }
  for (const [a, b, db] of merged) spans.push({ a, b, db });
  for (const d of o.dips) spans.push({ a: d.at, b: d.at + d.len, db: d.db });
  if (!spans.length && !o.curve.length) return;
  // the level curve in dB at film time t (0 dB without one)
  const cv = o.curve, smooth = (x: number) => x * x * (3 - 2 * x), db = (g: number) => (g > 0 ? 20 * Math.log10(g) : -60);
  const curveAt = (t: number) => {
    if (!cv.length) return 0;
    if (t <= cv[0][0]) return db(cv[0][1]);
    for (let i = 1; i < cv.length; i++) if (t <= cv[i][0]) { const [t0, g0] = cv[i - 1], [t1, g1] = cv[i]; return db(g0 + (g1 - g0) * smooth((t - t0) / (t1 - t0 || 1))); }
    return db(cv[cv.length - 1][1]);
  };
  const curveTimes = cv.flatMap(([t], i) => (i ? [1, 2, 3, 4].map((k) => cv[i - 1][0] + ((t - cv[i - 1][0]) * k) / 5).concat(t) : [t]));
  for (const t of p.tracks) {
    if (t.kind !== 'music' || t.id === 'voice') continue;
    for (const it of t.items as Array<{ start: number; end: number; envelope?: Array<[number, number]> }>) {
      if (it.envelope?.length) continue;
      const len = it.end - it.start, rel = spans.map((x) => ({ a: x.a - it.start, b: x.b - it.start, db: x.db })).filter((x) => x.b > 0 && x.a < len);
      if (!rel.length && !cv.length) continue;
      // each span ramps down over RAMP before it, holds, ramps back up after; the lowest span wins; the level curve adds under it
      const level = (tt: number) => curveAt(tt + it.start) + Math.min(0, ...rel.map((x) => (tt <= x.a - RAMP || tt >= x.b + RAMP ? 0 : tt < x.a ? (x.db * (tt - (x.a - RAMP))) / RAMP : tt <= x.b ? x.db : (x.db * (x.b + RAMP - tt)) / RAMP)));
      const at = [...new Set([...rel.flatMap((x) => [x.a - RAMP, x.a, x.b, x.b + RAMP]), ...curveTimes.map((tt) => tt - it.start)].filter((tt) => tt <= len).map((tt) => r6(Math.max(0, tt))))].sort((x, y) => x - y);
      const pts = at.map((tt): [number, number] => [tt, r6(level(tt))]);
      // a point between two of the same level says nothing
      it.envelope = pts.filter((pt, i) => !(i > 0 && i < pts.length - 1 && pts[i - 1][1] === pt[1] && pts[i + 1][1] === pt[1]));
    }
  }
}
