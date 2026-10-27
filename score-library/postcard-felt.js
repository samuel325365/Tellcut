// Postcard felt piano (from the uk-postcard short): a slow, warm felt-piano lullaby for a travel diary written to oneself — rolled chords in the left hand,
// a sparse right-hand tune that leaves room for the voice, a music-box bell answering now and then, a soft pad from the middle on.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'postcard-felt',
  label: '明信片毛氈鋼琴',
  doc: '慢板毛氈鋼琴：左手分解和弦、右手稀疏的小旋律、偶爾一聲音樂盒；溫柔、懷舊、像寫給自己的信，適合慢節奏的旅記與回憶',
  defaults: { bpm: 64, key: 'F' },
  swing: 0,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const prog = [1, 5, 6, 4, 1, 3, 4, 5];
    // right-hand motifs as [beat, scale degree] (degree 8 = tonic an octave up), one picked per bar from the seed
    const tunes = [
      [[0.5, 5], [1, 6], [2, 5], [3, 3]],
      [[1, 3], [1.5, 4], [2, 5], [3.5, 2]],
      [[0, 8], [1.5, 7], [2, 5]],
      [[0.5, 3], [2, 2], [2.5, 1]],
    ];
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b);
      if (role === 'end') {
        const t = c.at(b, 0);
        c.chordOn(1, { octave: 3 }).concat([c.scaleNote(1, 4), c.scaleNote(3, 4), c.scaleNote(5, 4)]).forEach((m, k) => push(t + k * 0.07, 'felt', 0.5 - k * 0.03, -0.3 + k * 0.1, m, c.beat * 7));
        push(t + 0.5, 'bell', 0.22, 0.3, c.scaleNote(5, 5), c.beat * 6);
        continue;
      }
      const deg = prog[b % prog.length];
      const ch = c.chordOn(deg, { octave: 3 });
      const root = c.scaleNote(deg, 2);
      const soft = role === 'intro' ? 0.8 : 1;
      // left hand: low root, then the chord broken upwards in eighths, the top note held
      push(c.at(b, 0), 'felt', 0.5 * soft, -0.25, root, c.beat * 3.5);
      const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1]];
      arp.forEach((m, k) => push(c.at(b, 0.5 + k * 0.5), 'felt', (0.3 + (k === 3 ? 0.06 : 0)) * soft, -0.15 + k * 0.05, m, c.beat * 2));
      if (role === 'intro') continue;
      // right hand: a short motif most bars, rests every fourth so the narration breathes
      if (b % 4 !== 3) {
        const tune = tunes[Math.floor(c.rng() * tunes.length)];
        for (const [beat, d] of tune) push(c.at(b, beat), 'felt', 0.36, 0.2, c.scaleNote(d, 5), c.beat * 1.6);
      }
      if (lv >= 1 && b % 2 === 1) push(c.at(b, 3), 'bell', 0.16, 0.35, c.scaleNote(prog[(b + 1) % prog.length] === 5 ? 5 : 3, 6), c.beat * 4);
      if (lv >= 2) ch.forEach((m, k) => push(c.at(b, 0), 'pad', 0.13, -0.3 + k * 0.3, m + 12, c.bar * 1.02));
      if (role === 'fill') push(c.at(b, 3.5), 'felt', 0.3, 0.25, c.scaleNote(prog[(b + 1) % prog.length], 4), c.beat * 1.5);
    }
    return out;
  },
  voices: {
    // felt piano: a few harmonics that die faster the higher they are, a slow-ish attack, a muffled hammer knock
    felt: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), len = (e.dur ?? 1) + 1.4, n = Math.floor(sr * len), out = new Float32Array(n);
      const amps = [1, 0.42, 0.2, 0.09, 0.05, 0.025], decay = 0.9 + Math.max(0, (e.midi - 48) / 30);
      let knock = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, att = Math.min(1, t / 0.012), rel = t > len - 0.6 ? Math.max(0, (len - t) / 0.6) : 1;
        let v = 0;
        for (let h = 0; h < amps.length; h++) v += amps[h] * Math.sin(2 * Math.PI * f * (h + 1) * (1 + h * h * 0.0004) * t) * Math.exp(-t * decay * (1 + h * 0.9));
        if (t < 0.03) knock += 0.25 * ((r() * 2 - 1) - knock);
        out[i] = 0.42 * (v * att * rel + (t < 0.03 ? knock * (1 - t / 0.03) * 0.5 : 0));
      }
      return out;
    },
  },
};
