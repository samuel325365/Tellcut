// Afternoon-kitchen folk (from the baking-steps short's garden-recipe): nylon-ish plucked arpeggios, a music-box melody every two
// bars, a warm pad, a soft shaker and brushed backbeat, no big drums; I–vi–IV–V and friends. Any length: the layers come in with
// ctx.layers() and it closes on a rolled tonic chord. The card's sound effects are no longer in the score: place
// common.page / common.xylo / common.thud / common.ding where the pictures need them.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'garden-folk',
  label: '午後廚房',
  doc: '溫柔的午後廚房民謠：撥弦分解和弦、音樂盒旋律、暖 pad、輕沙鈴與刷鼓，沒有大鼓；手寫食譜、烘焙、手作、慢生活 vlog',
  defaults: { bpm: 80, key: 'F' },
  swing: 0.04,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const prog = [1, 6, 4, 5, 1, 3, 4, 5, 6, 4, 1, 5, 4, 5, 3, 6];
    // a short music-box phrase per two bars: [beat, degree] (degrees above the tonic, octave 5)
    const phraseA = [[0, 5], [1, 6], [1.5, 5], [2, 3], [3, 2]], phraseB = [[0, 3], [0.5, 4], [1, 5], [2, 8], [3, 7], [3.5, 5]];
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b);
      if (role === 'end') {
        const t = c.at(b, 0);
        c.chordOn(1, { octave: 4 }).forEach((m, k) => push(t + k * 0.06, 'pluck', 0.7, -0.3 + k * 0.3, m, c.beat * 6));
        push(t, 'pad', 0.35, 0, c.scaleNote(1, 4), c.beat * 6);
        push(t, 'sub', 0.6, 0, c.scaleNote(1, 2), c.beat * 6);
        push(t + 0.2, 'bell', 0.4, 0.3, c.scaleNote(8, 5), c.beat * 5);
        continue;
      }
      const deg = prog[b % prog.length], ch = c.chordOn(deg, { octave: 3 }), up = c.chordOn(deg, { octave: 4 });
      // fingerpicked arpeggio on eighths: bass, fifth, third up, top, ...
      const pat = [ch[0], ch[2], up[1], up[2], up[0], ch[2], up[1], ch[2]];
      for (let s = 0; s < 8; s++) {
        const v = (role === 'intro' ? 0.42 : 0.5) * (s === 0 ? 1.15 : s % 2 ? 0.75 : 0.9) * (0.92 + c.rng() * 0.12);
        push(c.at(b, s / 2), 'pluck', v, -0.25 + (s % 4) * 0.15, pat[s], c.beat * 1.6);
      }
      push(c.at(b, 0), 'pad', role === 'intro' ? 0.18 : 0.24, 0, c.scaleNote(deg, 4), c.bar);
      if (role === 'intro') continue;
      push(c.at(b, 0), 'bass', 0.5, 0, c.scaleNote(deg, 2), c.beat * 1.5);
      push(c.at(b, 2), 'bass', 0.38, 0, c.scaleNote(deg + 4, 2), c.beat * 1.2);
      if (lv >= 1 && b % 2 === 0) {
        const ph = (b / 2) % 2 ? phraseB : phraseA;
        ph.forEach(([beat, d]) => push(c.at(b, beat), 'bell', 0.3, 0.25, c.scaleNote(d, 5), c.beat * 1.4));
      }
      if (lv >= 2) {
        for (let s = 0; s < 8; s++) push(c.at(b, s / 2), 'shaker', s % 2 ? 0.16 : 0.24, 0.35);
        for (const beat of [1, 3]) push(c.at(b, beat), 'softSnare', 0.16, -0.05);
      }
      if (lv >= 3) push(c.at(b, 0), 'pad', 0.14, 0, c.scaleNote(deg + 2, 5), c.bar);
      if (role === 'fill') push(c.at(b, 3.5), 'bell', 0.22, -0.3, c.scaleNote(5, 6), c.beat);
    }
    return out.sort((a, b) => a.t - b.t);
  },
};
