// Guzheng pop (from the fd-hakka short's hakka-pluck): a guzheng-like plucked lead on the major pentatonic (its own voice: many
// partials, a small slide into each note, the long notes pressed up a tone or a semitone at the back half — the 按音), a yueqin-like
// bright arpeggio above it, and a light electronic beat underneath (kick, soft clap, fine hats). Laid out by the bar count: the
// guzheng alone for the opening (a couple of notes a bar, like tuning up), then kick and sub, then hats and clap, then the full band
// (yueqin, shaker, pad), and the last bars back to the guzheng and the pad before a rolled tonic chord. Written in D; another key
// moves every note (a minor key plays its relative major's pentatonic).
const PROG = [[38, [62, 66, 69]], [35, [59, 62, 66]], [43, [59, 62, 67]], [45, [61, 64, 69]]]; // D  Bm  G  A (as written in D)
// one phrase a bar: [beat, midi, beats long, press (semitones)]
const MOTIFS = [
  [[0, 74, 1], [1, 71, 0.5], [1.5, 69, 0.5], [2, 71, 1, 1], [3, 66, 1]],
  [[0, 69, 0.5], [0.5, 71, 0.5], [1, 74, 1], [2, 76, 0.5], [2.5, 74, 0.5], [3, 71, 1]],
  [[0, 76, 1.5, 2], [1.5, 74, 0.5], [2, 71, 1], [3, 69, 1]],
  [[0, 71, 0.5], [0.5, 69, 0.5], [1, 66, 1], [2, 64, 1], [3, 62, 1]],
  [[0, 81, 0.5], [0.5, 78, 0.5], [1, 76, 1], [2, 74, 0.5], [2.5, 76, 0.5], [3, 74, 1]],
  [[0, 66, 0.5], [0.5, 69, 0.5], [1, 71, 0.5], [1.5, 74, 1.5, 2], [3, 71, 1]],
];
const RUN = [62, 64, 66, 69, 71, 74, 76, 78];

/** how full each bar is: 'open' (the guzheng tuning up), 1–3 (beat, then hats and clap, then the whole band), 0 (back to the guzheng and pad), 'end' */
export function guzhengPlan(bars, introBars) {
  const last = bars - 1, tail = bars >= 12 ? 2 : bars >= 8 ? 1 : 0, span = Math.max(1, last - tail - introBars);
  return Array.from({ length: bars }, (_, b) => {
    if (b === last) return 'end';
    if (b < introBars) return 'open';
    if (b >= last - tail) return 0;
    const f = (b - introBars) / span;
    return f < 0.25 ? 1 : f < 0.5 ? 2 : 3;
  });
}

/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'guzheng-pop',
  label: '古箏輕電子',
  doc: '五聲音階的古箏撥弦（有按音上滑）＋月琴分解和弦＋輕電子節拍（96 BPM），由疏到滿再收回箏聲；客家、台灣傳統、東方味但現代的資訊解說、文化介紹、在地美食',
  defaults: { bpm: 96, key: 'D' },
  swing: 0.06,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur, extra) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}), ...(extra || {}) });
    // the shift from D to this key (the relative major for a minor key), kept within a fourth
    const tonic = ((c.key.root + (c.key.minor ? 3 : 0)) % 12), up = (tonic - 2 + 12) % 12, sh = up > 5 ? up - 12 : up;
    let intro = 0;
    while (intro < c.bars && c.role(intro) === 'intro') intro++;
    const plan = guzhengPlan(c.bars, intro);
    for (let b = 0; b < c.bars; b++) {
      const t0 = c.at(b, 0), lvl = plan[b];
      const [root, chord] = PROG[b % 4];
      if (lvl === 'end') {
        // a D chord rolled low to high on the guzheng, a high note after it
        [50, 57, 62, 66, 69, 74].forEach((m, k) => push(t0 + k * 0.07, 'zheng', 0.7 - k * 0.04, -0.3 + k * 0.12, m + sh, c.beat * 6));
        push(t0, 'sub', 0.8, 0, 26 + sh, c.beat * 5);
        push(t0, 'pad', 0.3, 0, 62 + sh, c.beat * 6); push(t0, 'pad', 0.25, 0, 69 + sh, c.beat * 6);
        push(c.at(b, 1), 'zheng', 0.5, 0.3, 86 + sh, c.beat * 4);
        continue;
      }
      if (lvl === 'open') {
        // two plucks a bar, the first one pressed up
        const k = b % 2;
        push(t0, 'zheng', 0.7, -0.1, (k ? 69 : 74) + sh, c.beat * 2.5, { bend: k ? 0 : 2 });
        push(c.at(b, 2), 'zheng', 0.55, 0.1, (k ? 66 : 71) + sh, c.beat * 2);
        push(c.at(b, 3.5), 'zheng', 0.35, 0.2, 62 + sh, c.beat * 1);
        continue;
      }
      const mot = MOTIFS[(b * 5 + Math.floor(c.rng() * 2)) % MOTIFS.length];
      // a pressed note is a hair longer, so the cache never mixes it up with a plain note of the same pitch
      for (const [beat, m, d, bend] of mot) push(c.at(b, beat), 'zheng', beat === 0 ? 0.72 : 0.58, -0.12, m + sh, c.beat * Math.max(0.6, d * 1.4) + (bend ? 0.0013 * bend : 0), bend ? { bend } : undefined);
      const low = root - 12 + (root < 40 ? 12 : 0) + sh;
      if (lvl >= 1) {
        push(t0, 'kick', 0.85, 0); push(c.at(b, 2), 'kick', 0.7, 0); push(c.at(b, 2.75), 'kick', 0.4, 0);
        push(t0, 'sub', 0.7, 0, low, c.beat * 1.6);
        push(c.at(b, 2.5), 'sub', 0.55, 0, low, c.beat * 1.2);
      }
      const fill = c.role(b) === 'fill' && lvl >= 2;
      if (lvl >= 2) {
        for (const beat of [1, 3]) push(c.at(b, beat), 'clap', 0.32, 0.06);
        for (let s = 0; s < (fill ? 6 : 8); s++) push(c.at(b, s / 2), 'hat', s % 2 ? 0.2 : 0.32, 0.3);
      }
      // a fill: a quick run up the pentatonic into the next bar
      if (fill) RUN.slice(c.rng() < 0.5 ? 0 : 2).slice(0, 6).forEach((m, k) => push(c.at(b, 3 + k / 6), 'zheng', 0.32 + k * 0.05, 0.15, m + sh, c.beat * 0.6));
      if (lvl >= 3) {
        // yueqin: eighth-note arpeggio an octave up, to one side
        for (let s = 0; s < 8; s++) push(c.at(b, s / 2) + 0.005, 'yueqin', s % 2 ? 0.26 : 0.34, 0.35, chord[s % 3] + 12 + sh, c.beat * 0.45);
        for (let s = 0; s < 16; s += 2) push(c.at(b, s / 4 + 0.25), 'shaker', 0.18, -0.35);
        push(t0, 'pad', 0.16, 0, chord[0] + sh, c.bar); push(t0, 'pad', 0.12, 0, chord[2] + sh, c.bar);
      }
      if (lvl === 0) { push(t0, 'pad', 0.22, 0, chord[0] + sh, c.bar); push(t0, 'pad', 0.18, 0, chord[1] + sh, c.bar); }
    }
    return out;
  },
  voices: {
    // guzheng: an additive string sliding in from +35 cents; a note with `bend` is pressed up in its back half
    zheng: (sr, r, e) => {
      const f0 = 440 * 2 ** ((e.midi - 69) / 12), dur = (e.dur ?? 0.8) + 0.6, n = Math.round(sr * dur), out = new Float32Array(n);
      const bend = e.bend ?? 0;
      const ph = new Array(9).fill(0);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const glide = 0.35 * Math.exp(-t * 60) + (bend ? bend * Math.min(1, Math.max(0, (t - (e.dur ?? 0.8) * 0.45) / 0.18)) : 0);
        const vib = bend ? 0.08 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t * 2) : 0;
        const f = f0 * 2 ** ((glide + vib) / 12);
        let s = 0;
        for (let k = 1; k <= 8; k++) {
          ph[k] += (2 * Math.PI * f * k * (1 + 0.0007 * k * k)) / sr;
          s += Math.sin(ph[k]) * Math.exp(-t * (1.6 + k * 1.1)) / k ** 1.15;
        }
        const atk = Math.min(1, t / 0.003), tail = Math.min(1, (n - i) / (sr * 0.05));
        out[i] = (s * atk * 0.55 + (t < 0.012 ? r() * 0.25 * (1 - t / 0.012) : 0)) * tail;
      }
      return out;
    },
    // yueqin: a brighter, shorter pluck
    yueqin: (sr, r, e, synth) => synth.pluck(sr, r, 440 * 2 ** ((e.midi - 69) / 12), e.dur ?? 0.3, 0.85),
  },
};
