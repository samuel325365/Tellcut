// The five starting styles of the score generator (toolkit phase 3). A style turns a tempo, a key and a number of bars into a list of events
// (when, which instrument, which note); rendering them to sound is a separate step, so what a style plays can be tested without audio.
import { chordOn, inKey, parseKey, PROGRESSIONS, scaleNote, type Key } from './theory.ts';
import type { Rng } from './synth.ts';

export type BuiltinInst = 'pluck' | 'marimba' | 'bell' | 'epiano' | 'bass' | 'sub' | 'pad' | 'pulse' | 'kick' | 'snare' | 'softSnare' | 'clap' | 'hat' | 'openHat' | 'shaker' | 'tom';
/** a built-in instrument, or one a style defines itself in `voices` */
export type Inst = BuiltinInst | (string & {});
export interface ScoreEvent { t: number; inst: Inst; midi?: number; dur?: number; vel: number; pan: number }

export type Role = 'intro' | 'loop' | 'fill' | 'outro' | 'end';
export interface StyleCtx {
  bpm: number; key: Key; bars: number; beat: number; bar: number; rng: Rng;
  /** the role of bar `i` in the arrangement and how many layers play in it (0 = just the opening) */
  role(i: number): Role;
  layers(i: number): number;
  /** time (s) of a beat position in a bar */
  at(bar: number, beat: number): number;
  /** music theory in the style's key, so a style file needs no imports: the note `degree` steps up the scale, a chord on a degree, whether a note is in the key */
  scaleNote(degree: number, octave?: number): number;
  chordOn(degree: number, o?: { octave?: number; seventh?: boolean }): number[];
  inKey(midi: number): boolean;
  /** moments of the film for the score to answer, film seconds by name (Cut.score({ cues: { lift: 43.2 } })); {} when none were given */
  cues: Record<string, number>;
}
/** A style's own instrument: one note or hit as samples. `synth` is the built-in instrument set to build on; use only `r` for chance. */
export type VoiceFn = (sr: number, r: Rng, e: ScoreEvent, synth: typeof import('./synth.ts')) => Float32Array;
export interface Style {
  id: string; label: string; doc: string; defaults: { bpm: number; key: string }; swing: number; build(c: StyleCtx): ScoreEvent[]; voices?: Record<string, VoiceFn>;
  /** a style that plays a mode outside the key's major / minor scale (Hijaz, say) names its notes here, as semitones above the key's root; the library check tests its notes against these */
  scale?: number[];
}

/** intro → loop (every fourth bar a fill) → outro → one closing bar; layers join every four bars. */
export function arrangement(bars: number): { role(i: number): Role; layers(i: number): number } {
  const intro = bars >= 8 ? 2 : bars >= 5 ? 1 : 0, outro = bars >= 7 ? 1 : 0;
  const role = (i: number): Role => (i === bars - 1 ? 'end' : outro && i === bars - 1 - outro ? 'outro' : i < intro ? 'intro' : (i + 1) % 4 === 0 && i < bars - 2 ? 'fill' : 'loop');
  const layers = (i: number) => (i < intro ? 0 : i >= bars - 1 - outro ? 1 : Math.min(3, 1 + Math.floor((i - intro) / 4)));
  return { role, layers };
}

const push = (out: ScoreEvent[], t: number, inst: BuiltinInst, vel: number, pan = 0, midi?: number, dur?: number) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
const degreeOf = (key: Key, c: StyleCtx, bar: number) => (key.minor ? PROGRESSIONS.minor.dark : PROGRESSIONS.major.bright)[bar % 4];
/** the closing bar: the tonic chord rolled once, a low root under it, nothing else */
function closing(c: StyleCtx, out: ScoreEvent[], inst: BuiltinInst, octave: number) {
  const t = c.at(c.bars - 1, 0), notes = chordOn(c.key, 1, { octave });
  notes.forEach((m, k) => push(out, t + k * 0.03, inst, 0.7, (k - 1) * 0.2, m, c.beat * 6));
  push(out, t, 'sub', 0.8, 0, scaleNote(c.key, 1, 2), c.beat * 6);
}

const pluckStyle: Style = {
  id: 'pluck', label: '輕快撥弦', doc: '明亮的撥弦琴分解和弦、木琴小旋律、輕輕的搖鈴與拍手；愉快的生活、美食、旅行、開箱', defaults: { bpm: 112, key: 'C' }, swing: 0,
  build(c) {
    const out: ScoreEvent[] = [];
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b);
      if (role === 'end') { closing(c, out, 'pluck', 4); continue; }
      const deg = degreeOf(c.key, c, b), ch = chordOn(c.key, deg, { octave: 4 });
      const pat = [0, 1, 2, 1, 0, 1, 2, 1];
      for (let s = 0; s < 8; s++) push(out, c.at(b, s / 2), 'pluck', (role === 'intro' ? 0.55 : 0.8) * (s % 2 ? 0.8 : 1), -0.2 + (s % 3) * 0.2, ch[pat[s]], c.beat * 1.4);
      if (role === 'intro') continue;
      push(out, c.at(b, 0), 'bass', 0.9, 0, scaleNote(c.key, deg, 2), c.beat * 0.9);
      push(out, c.at(b, 2), 'bass', 0.75, 0, scaleNote(c.key, deg + 4, 2), c.beat * 0.9);
      for (let s = 0; s < 8; s++) push(out, c.at(b, s / 2), 'shaker', s % 2 ? 0.6 : 0.9, 0.4);
      if (lv >= 1) for (const beat of [1, 3]) push(out, c.at(b, beat), 'clap', 0.7, 0.1);
      if (lv >= 2) for (const beat of [0, 2]) push(out, c.at(b, beat), 'kick', 0.85);
      if (lv >= 2) [0, 1.5, 2.5, 3].forEach((beat, k) => push(out, c.at(b, beat), 'marimba', 0.6, 0.3, scaleNote(c.key, deg + [4, 2, 4, 5][k] - 1, 5), c.beat));
      if (lv >= 3) push(out, c.at(b, 0), 'bell', 0.5, -0.3, scaleNote(c.key, deg + 7, 5), c.beat * 3);
      if (role === 'fill') for (let s = 0; s < 4; s++) push(out, c.at(b, 3 + s / 4), 'clap', 0.4 + s * 0.12, 0.1);
    }
    return out;
  },
};

const lofiStyle: Style = {
  id: 'lofi', label: 'Lo-fi', doc: '慵懶的電鋼琴七和弦、鬆鬆的鼓組（帶搖擺）、柔和的低音；讀書、聊天、日常、夜晚、回憶', defaults: { bpm: 78, key: 'Am' }, swing: 0.14,
  build(c) {
    const out: ScoreEvent[] = [], sw = (beat: number) => (Math.floor(beat * 2) % 2 === 1 ? 0.14 * 0.5 : 0);
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b);
      if (role === 'end') { closing(c, out, 'epiano', 3); continue; }
      const deg = degreeOf(c.key, c, b), ch = chordOn(c.key, deg, { octave: 3, seventh: true });
      ch.forEach((m, k) => push(out, c.at(b, 0) + k * 0.018, 'epiano', 0.7, -0.15 + k * 0.1, m, c.beat * 3.2));
      ch.forEach((m, k) => push(out, c.at(b, 2.5) + k * 0.018, 'epiano', 0.4, -0.15 + k * 0.1, m, c.beat * 1.4));
      if (role === 'intro') continue;
      push(out, c.at(b, 0), 'bass', 0.8, 0, scaleNote(c.key, deg, 2), c.beat * 1.6);
      push(out, c.at(b, 2.5), 'bass', 0.6, 0, scaleNote(c.key, deg + 4, 2), c.beat);
      push(out, c.at(b, 0), 'kick', 0.8);
      push(out, c.at(b, 2.5), 'kick', 0.55);
      for (const beat of [1, 3]) push(out, c.at(b, beat), 'softSnare', 0.7, 0.05);
      for (let s = 0; s < 8; s++) push(out, c.at(b, s / 2) + sw(s / 2) * c.beat, 'hat', (s % 2 ? 0.35 : 0.55) * (0.8 + c.rng() * 0.4), 0.25);
      if (lv >= 2) push(out, c.at(b, 3.5), 'openHat', 0.3, 0.25);
      if (lv >= 2 && b % 2 === 1) push(out, c.at(b, 1.5), 'bell', 0.35, -0.3, scaleNote(c.key, deg + [2, 4, 6][Math.floor(c.rng() * 3)], 5), c.beat * 2);
      if (role === 'fill') push(out, c.at(b, 3.75), 'softSnare', 0.45, 0.05);
    }
    return out;
  },
};

const cinematicStyle: Style = {
  id: 'cinematic', label: '電影感', doc: '緩慢展開的合成大鋪墊、低音長音、稀疏的鐘聲、漸強的鼓點；風景、預告、情緒、紀錄片', defaults: { bpm: 68, key: 'Dm' }, swing: 0,
  build(c) {
    const out: ScoreEvent[] = [];
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b);
      if (role === 'end') { closing(c, out, 'pad', 3); continue; }
      const deg = degreeOf(c.key, c, Math.floor(b / 2)), ch = chordOn(c.key, deg, { octave: 3, seventh: lv >= 2 });
      ch.forEach((m, k) => push(out, c.at(b, 0), 'pad', 0.75 - k * 0.05, -0.4 + k * 0.3, m, c.beat * 4.4));
      push(out, c.at(b, 0), 'sub', 0.7, 0, scaleNote(c.key, deg, 2), c.beat * 4.2);
      if (role === 'intro') continue;
      if (lvOk(lv, 1)) [0, 2].forEach((beat, k) => push(out, c.at(b, beat), 'bell', 0.4, k ? 0.3 : -0.3, scaleNote(c.key, deg + [4, 6][k], 5), c.beat * 3));
      if (lv >= 2 && b % 2 === 0) push(out, c.at(b, 0), 'tom', 0.8, 0, scaleNote(c.key, deg, 2) + 12, c.beat * 4);
      if (role === 'fill' && lv >= 2) for (let s = 0; s < 8; s++) push(out, c.at(b, 2 + s / 4), 'softSnare', 0.25 + s * 0.07, 0.05);
    }
    return out;
  },
};
const lvOk = (lv: number, n: number) => lv >= n;

const techStyle: Style = {
  id: 'tech', label: '科技脈衝', doc: '四四拍底鼓、十六分音符的脈衝低音、反拍開放鈸；科技、教學、數據、AI、剪輯、硬核', defaults: { bpm: 124, key: 'Em' }, swing: 0,
  build(c) {
    const out: ScoreEvent[] = [];
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b);
      if (role === 'end') { closing(c, out, 'pad', 3); continue; }
      const deg = degreeOf(c.key, c, b), root = scaleNote(c.key, deg, 2), fifth = scaleNote(c.key, deg + 4, 2);
      const line = [root, root, fifth, root, root + 12, root, fifth, root];
      for (let s = 0; s < 16; s++) {
        if (role === 'intro' && s % 4) continue;
        push(out, c.at(b, s / 4), 'pulse', 0.55 + (s % 4 === 0 ? 0.2 : 0) + (s % 2 ? -0.1 : 0), 0, line[s % 8] + 12, c.beat * 0.22);
      }
      push(out, c.at(b, 0), 'sub', 0.6, 0, root, c.beat * 1.9);
      if (role === 'intro') { for (let s = 0; s < 8; s++) push(out, c.at(b, s / 2), 'hat', 0.35, 0.3); continue; }
      for (let beat = 0; beat < 4; beat++) push(out, c.at(b, beat), 'kick', 0.95);
      for (let beat = 0; beat < 4; beat++) push(out, c.at(b, beat + 0.5), 'openHat', 0.45, 0.3);
      if (lv >= 1) for (const beat of [1, 3]) push(out, c.at(b, beat), 'clap', 0.75, 0);
      for (let s = 0; s < 16; s++) if (s % 2) push(out, c.at(b, s / 4), 'hat', 0.25, -0.3);
      if (lv >= 2) {
        const ch = chordOn(c.key, deg, { octave: 4 });
        ch.forEach((m, k) => push(out, c.at(b, 1.5), 'pad', 0.45, -0.3 + k * 0.3, m, c.beat * 0.9));
        const blip = scaleNote(c.key, 1 + Math.floor(c.rng() * 7), 6);
        push(out, c.at(b, 2.75), 'bell', 0.35, 0.35, blip, c.beat);
      }
      if (role === 'fill') for (let s = 0; s < 8; s++) push(out, c.at(b, 2 + s / 4), 'clap', 0.3 + s * 0.08, 0);
    }
    return out;
  },
};

const playfulStyle: Style = {
  id: 'playful', label: '俏皮木琴', doc: '蹦跳的木琴旋律、一低一高的 oom-pah 伴奏、搖鈴與拍手；可愛、搞笑、小孩、寵物、輕鬆日常', defaults: { bpm: 120, key: 'G' }, swing: 0.06,
  build(c) {
    const out: ScoreEvent[] = [];
    // a two-bar motif from the pentatonic notes, the same every time through for this seed; the second pass changes its last note
    const motif = Array.from({ length: 8 }, () => [1, 2, 3, 5, 6][Math.floor(c.rng() * 5)]);
    const rests = [3, 6].filter(() => c.rng() < 0.7);
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b);
      if (role === 'end') { closing(c, out, 'marimba', 4); continue; }
      const deg = degreeOf(c.key, c, b), ch = chordOn(c.key, deg, { octave: 4 });
      for (let s = 0; s < 4; s++) {
        const slot = (b % 2) * 4 + s;
        if (rests.includes(slot) || (role === 'intro' && s % 2)) continue;
        const d = motif[slot] + (b % 4 >= 2 && slot === 7 ? 1 : 0);
        push(out, c.at(b, s) + (s % 2 ? 0.03 : 0), 'marimba', 0.7, -0.15 + s * 0.1, scaleNote(c.key, d, 5), c.beat * 0.9);
        if (lv >= 1) push(out, c.at(b, s + 0.5), 'marimba', 0.45, 0.2, scaleNote(c.key, d + 2, 5), c.beat * 0.6);
      }
      if (role === 'intro') continue;
      for (const beat of [0, 2]) push(out, c.at(b, beat), 'bass', 0.85, 0, scaleNote(c.key, deg, 2), c.beat * 0.8);
      for (const beat of [1, 3]) ch.forEach((m, k) => push(out, c.at(b, beat) + k * 0.01, 'pluck', 0.4, 0.1 + k * 0.1, m - 12, c.beat * 0.7));
      for (let s = 0; s < 8; s++) push(out, c.at(b, s / 2), 'shaker', s % 2 ? 0.5 : 0.8, 0.4);
      if (lv >= 1) for (const beat of [1, 3]) push(out, c.at(b, beat), 'clap', 0.65, -0.1);
      if (lv >= 1) for (const beat of [0, 2]) push(out, c.at(b, beat), 'kick', 0.7);
      if (lv >= 3) push(out, c.at(b, 0), 'bell', 0.45, -0.3, scaleNote(c.key, deg + 7, 6), c.beat * 2);
      if (role === 'fill') for (let s = 0; s < 4; s++) push(out, c.at(b, 3 + s / 4), 'marimba', 0.4 + s * 0.1, 0, scaleNote(c.key, 5 + s, 5), c.beat * 0.3);
    }
    return out;
  },
};

export const STYLES: Record<string, Style> = { pluck: pluckStyle, lofi: lofiStyle, cinematic: cinematicStyle, tech: techStyle, playful: playfulStyle };

/** The events of a style for `bars` bars at `bpm` in `keyName`; `seed` fixes every random choice. */
export function composeEvents(style: Style, o: { bpm: number; key: string; bars: number; rng: Rng; cues?: Record<string, number> }): ScoreEvent[] {
  const key = parseKey(o.key), beat = 60 / o.bpm, bar = beat * 4, arr = arrangement(o.bars);
  const swing = (beatPos: number) => (Math.floor(beatPos * 2 + 1e-9) % 2 === 1 && Math.abs((beatPos * 2) % 1) < 1e-9 ? style.swing * beat * 0.5 : 0);
  const ctx: StyleCtx = { bpm: o.bpm, key, bars: o.bars, beat, bar, rng: o.rng, ...arr, at: (b, p) => b * bar + p * beat + swing(p),
    scaleNote: (d, oct) => scaleNote(key, d, oct), chordOn: (d, co) => chordOn(key, d, co), inKey: (m) => inKey(key, m), cues: { ...(o.cues ?? {}) } };
  return style.build(ctx).sort((a, b) => a.t - b.t);
}
