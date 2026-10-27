// Receipt hop: a light, bouncy shop-counter groove. Staccato pluck chords on the off-beats, a walking bass,
// shaker eighths, a soft clap on 2 and 4, a little marimba tag every other bar and a tiny "till" tick.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'receipt-hop',
  label: '收據小跳步',
  doc: '輕快的收銀台小日常：反拍撥弦和弦、走路低音、沙鈴與輕拍手、木琴小尾巴、收銀機般的小滴答；美食記帳、清單、逛街',
  defaults: { bpm: 104, key: 'G' },
  swing: 0.08,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const prog = [1, 6, 4, 5];
    const tag = [[2.5, 5], [2.75, 6], [3, 8], [3.5, 6]];
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b), t0 = c.at(b, 0);
      if (role === 'end') {
        c.chordOn(1, { octave: 4 }).forEach((m, k) => push(t0 + k * 0.03, 'pluck', 0.7, -0.25 + k * 0.25, m, c.beat * 4));
        push(t0, 'bass', 0.8, 0, c.scaleNote(1, 2), c.beat * 3);
        push(t0 + c.beat * 0.5, 'bell', 0.5, 0.3, c.scaleNote(5, 5), c.beat * 3);
        push(t0 + c.beat * 1, 'bell', 0.42, 0.3, c.scaleNote(8, 5), c.beat * 3);
        continue;
      }
      const deg = prog[b % 4], ch = c.chordOn(deg, { octave: 4 });
      // off-beat staccato chords
      for (const beat of [0.5, 1.5, 2.5, 3.5]) ch.forEach((m, k) => push(c.at(b, beat) + k * 0.01, 'pluck', role === 'intro' ? 0.42 : 0.52, -0.3 + k * 0.3, m, c.beat * 0.3));
      // shaker eighths
      for (let s = 0; s < 8; s++) push(c.at(b, s / 2), 'shaker', s % 2 ? 0.3 : 0.45, 0.25);
      if (role === 'intro') continue;
      // walking bass: root, fifth, sixth, approach
      const root = c.scaleNote(deg, 2), steps = [[0, root], [1, root + 7], [2, root + 9], [3, c.scaleNote(prog[(b + 1) % 4], 2) - 2]];
      for (const [beat, m] of steps) push(c.at(b, beat), 'bass', beat === 0 ? 0.85 : 0.65, 0, c.inKey(m) ? m : root, c.beat * 0.55);
      push(t0, 'kick', 0.7, 0); push(c.at(b, 2), 'kick', 0.55, 0);
      if (lv >= 1) for (const beat of [1, 3]) push(c.at(b, beat), 'clap', 0.45, 0.05);
      if (lv >= 1) push(c.at(b, 3.75), 'till', 0.35, 0.4, 96, 0.06);
      if (lv >= 2 && b % 2 === 1) tag.forEach(([beat, d]) => push(c.at(b, beat), 'marimba', 0.5, -0.2, c.scaleNote(d, 5), c.beat * 0.4));
      if (lv >= 3) push(t0, 'pad', 0.25, 0, c.scaleNote(deg, 4), c.bar);
      if (role === 'fill') for (let s = 0; s < 4; s++) push(c.at(b, 3 + s / 4), 'marimba', 0.4 + s * 0.08, 0.2, c.scaleNote(5 + s, 5), c.beat * 0.25);
    }
    return out;
  },
  voices: {
    // a short bright tick, like a till key
    till: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), n = Math.floor(sr * 0.06), out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr; out[i] = Math.exp(-t * 90) * (0.6 * Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 1.5 * t)); }
      return out;
    },
  },
};
