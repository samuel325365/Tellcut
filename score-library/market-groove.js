// Night-market groove: city-pop flavoured, royal-road progression (IV-V-iii-vi), offbeat e-piano stabs,
// a bouncing bass, woodblock ticks and a short marimba hook. Busy but clean.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'market-groove',
  label: '夜市律動',
  doc: '王道進行的都會流行律動：電鋼琴切分和弦、彈跳貝斯、木魚與木琴小勾子；熱鬧但乾淨的街頭小吃、市集、探店',
  defaults: { bpm: 108, key: 'F' },
  swing: 0.06,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const prog = [4, 5, 3, 6];
    const hook = [[0, 5], [0.5, 6], [1, 8], [1.75, 6], [2.5, 5], [3, 3]];
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b);
      if (role === 'end') {
        const t = c.at(b, 0);
        c.chordOn(1, { octave: 4, seventh: true }).forEach((m, k) => push(t + k * 0.025, 'epiano', 0.75, -0.2 + k * 0.13, m, c.beat * 6));
        push(t, 'sub', 0.85, 0, c.scaleNote(1, 2), c.beat * 6);
        push(t, 'kick', 0.9, 0);
        push(t, 'bell', 0.45, 0.25, c.scaleNote(5, 5), c.beat * 5);
        continue;
      }
      const deg = prog[b % 4];
      const ch = c.chordOn(deg, { octave: 4, seventh: true });
      // e-piano: anticipated stabs on the "and"s
      for (const beat of [0, 1.5, 2.5, 3.5]) {
        const v = (role === 'intro' ? 0.5 : 0.62) * (beat === 0 ? 1 : 0.8);
        ch.forEach((m, k) => push(c.at(b, beat) + k * 0.012, 'epiano', v, -0.2 + k * 0.12, m, beat === 0 ? c.beat * 1.3 : c.beat * 0.45));
      }
      // woodblock-ish tick (the "street" colour), even in the intro
      for (let s = 0; s < 8; s++) if (s % 4 === 1 || s % 4 === 3) push(c.at(b, s / 2), 'wood', s % 4 === 3 ? 0.55 : 0.4, 0.35, s % 4 === 3 ? 84 : 79, 0.08);
      if (role === 'intro') continue;
      // bass: root, octave bounce, approach note
      const root = c.scaleNote(deg, 2);
      [[0, root, 0.95], [0.75, root + 12, 0.6], [1.5, root, 0.8], [2.5, root + 7, 0.7], [3.25, root + 12, 0.55], [3.5, c.scaleNote(prog[(b + 1) % 4], 2) - 1, 0.6]]
        .forEach(([beat, m, v]) => push(c.at(b, beat), 'bass', v, 0, c.inKey(m) ? m : root, c.beat * 0.45));
      // drums
      for (const beat of [0, 2.5]) push(c.at(b, beat), 'kick', 0.85, 0);
      if (lv >= 1) for (const beat of [1, 3]) push(c.at(b, beat), 'clap', 0.62, 0.05);
      for (let s = 0; s < (lv >= 2 ? 16 : 8); s++) {
        const beat = lv >= 2 ? s / 4 : s / 2;
        push(c.at(b, beat), 'hat', (s % 2 ? 0.35 : 0.55) * (lv >= 2 && s % 4 === 2 ? 1.2 : 1), -0.3);
      }
      if (lv >= 2 && b % 2 === 1) push(c.at(b, 3.5), 'openHat', 0.4, -0.3);
      // marimba hook every other bar once layered
      if (lv >= 2 && b % 2 === 0) hook.forEach(([beat, d]) => push(c.at(b, beat), 'marimba', 0.55, 0.3, c.scaleNote(d, 5), c.beat * 0.6));
      if (lv >= 3) push(c.at(b, 0), 'pad', 0.35, 0, c.scaleNote(deg, 4), c.bar);
      if (role === 'fill') for (let s = 0; s < 4; s++) push(c.at(b, 3 + s / 4), 'tom', 0.5 + s * 0.1, -0.2 + s * 0.13, 55 - s * 3, c.beat * 0.4);
    }
    return out;
  },
  voices: {
    // a short hollow woodblock: two detuned sines with a fast decay
    wood: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), n = Math.floor(sr * 0.09), out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.exp(-t * 55);
        out[i] = env * (0.7 * Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.76 * t));
      }
      return out;
    },
  },
};
