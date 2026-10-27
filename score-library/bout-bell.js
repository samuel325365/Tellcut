// Bout bell: the podcast-versus short's versus-bell without the cue times its cut.ts wrote into it. A light quiz-show pulse in a minor
// key (i–VI–III–VII at 100 bpm: bass, kick, soft snare, hats, a pad and a marimba motif) laid out by the arrangement: a boxing-ring
// bell and a hit open the film; every new section (the bar after the intro or after a fill) is a new round — a whoosh into it, the
// bell twice, a low hit, the hats holding off for its first beat; every fill bar ends the round — a stamp (tom and clap) on beat 2 and
// a chord stab on beat 4; the outro bar rolls a snare into the last bar, which lands a hit, the bell and a bright III chord with bells.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'bout-bell',
  label: '擂台回合',
  doc: '輕快益智節目感的脈動（小調、100 bpm）：開場拳擊擂台鈴＋重擊，每段開頭（新回合）咻聲＋鈴「叮叮」＋低音重擊，每段結尾一記蓋章悶響和定格和弦，最後小鼓滾進明亮的收尾和弦；上下分割對談、辯論、他說她說、兩方比較（擂台鈴音效另有 common.ringbell）',
  defaults: { bpm: 100, key: 'Am' },
  swing: 0.02,
  voices: {
    // boxing bell: inharmonic partials, a hard strike and a long shimmer
    ring: (sr, r, e) => {
      const f = 440 * 2 ** (((e.midi ?? 88) - 69) / 12), n = Math.floor(sr * 1.4), out = new Float32Array(n);
      const parts = [[1, 1, 2.2], [2.32, 0.55, 3.5], [4.25, 0.32, 5.5], [6.8, 0.18, 8]];
      for (let i = 0; i < n; i++) {
        const t = i / sr; let v = 0;
        for (const [m, a, d] of parts) v += a * Math.sin(2 * Math.PI * f * m * t) * Math.exp(-d * t);
        out[i] = v * 0.32 * Math.min(1, t / 0.0015);
      }
      return out;
    },
    // filtered noise that swells and falls away
    whoosh: (sr, r, e) => {
      const d = e.dur ?? 0.45, n = Math.floor(sr * d), out = new Float32Array(n);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const p = i / n, env = Math.sin(Math.PI * p) ** 2, cut = 0.04 + 0.5 * p;
        y += cut * ((r() * 2 - 1) - y);
        out[i] = y * env * 0.9;
      }
      return out;
    },
  },
  build(c) {
    const out = [], len = c.bars * c.bar, last = c.bars - 1;
    const push = (t, inst, vel, pan, midi, dur) => { if (t >= 0 && t < len) out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) }); };
    const bell = c.scaleNote(5, 5), root = c.scaleNote(1, 1);   // the bell on the fifth (E6 in A minor), the low hit on the tonic
    const prog = [1, 6, 3, 7], motif = [[0, 5], [0.75, 3], [1.5, 4], [2.5, 1]];
    const round = (t) => { push(t - 0.25, 'whoosh', 0.7, 0, undefined, 0.5); push(t + 0.08, 'ring', 0.75, 0.2, bell); push(t + 0.36, 'ring', 0.6, -0.2, bell); push(t + 0.08, 'kick', 0.85, 0); push(t + 0.08, 'sub', 0.7, 0, root, c.beat * 1.5); };
    for (let b = 0; b < last; b++) {
      const t0 = c.at(b, 0), role = c.role(b), prev = b > 0 ? c.role(b - 1) : 'intro', deg = prog[b % 4], newRound = b > 0 && role !== 'intro' && (prev === 'intro' || prev === 'fill');
      if (newRound) round(t0);
      for (const beat of [0, 1.5, 2, 3.5]) push(c.at(b, beat), 'bass', beat % 2 ? 0.55 : 0.75, 0, c.scaleNote(deg, 2), c.beat * 0.4);
      for (let s = newRound ? 2 : 0; s < 8; s++) push(c.at(b, s / 2), 'hat', s % 2 ? 0.16 : 0.26, -0.25);
      if (role !== 'intro') { push(t0, 'kick', 0.5, 0); push(c.at(b, 2), 'kick', 0.42, 0); push(c.at(b, 1), 'softSnare', 0.22, 0.1); push(c.at(b, 3), 'softSnare', 0.25, 0.1); }
      c.chordOn(deg, { octave: 3 }).forEach((m, k) => push(t0 + k * 0.01, 'pad', 0.16, -0.3 + k * 0.3, m, c.bar));
      if (b % 2 === 0 && c.layers(b) >= 1) motif.forEach(([beat, d]) => push(c.at(b, beat), 'marimba', 0.34, 0.3, c.scaleNote(d, 3), c.beat * 0.5));
      // the round's end: a stamp, then a chord stab
      if (role === 'fill') {
        push(c.at(b, 1), 'tom', 0.55, 0, c.scaleNote(1, 2)); push(c.at(b, 1), 'clap', 0.35, 0.1);
        c.chordOn(1, { octave: 4 }).forEach((m, k) => push(c.at(b, 3) + k * 0.012, 'epiano', 0.5, -0.2 + k * 0.2, m, c.beat * 1.4));
      }
      // into the last bar: a snare roll and a whoosh
      if (b === last - 1) { for (let s = 0; s < 8; s++) push(c.at(b, 2) + s * c.beat / 4, 'snare', 0.12 + s * 0.04, 0); push(c.at(last, 0) - 0.3, 'whoosh', 0.8, 0, undefined, 0.45); }
    }
    // the opening: a hit and the bell
    push(0, 'kick', 1, 0); push(0, 'sub', 0.9, 0, root, c.beat * 2); push(0.02, 'ring', 0.8, 0.15, bell); push(0.4, 'ring', 0.55, -0.15, bell);
    // the close: a hit, the bell, a bright III chord, bells climbing, plucks on the beats
    const t = c.at(last, 0);
    push(t, 'kick', 1, 0); push(t, 'sub', 0.85, 0, c.scaleNote(3, 1), c.beat * 4); push(t + 0.02, 'ring', 0.6, 0.1, bell);
    c.chordOn(3, { octave: 3, seventh: true }).forEach((m, k) => push(t + k * 0.03, 'epiano', 0.55, -0.25 + k * 0.17, m, c.beat * 6));
    [5, 7, 10].forEach((d, k) => push(t + 0.5 + k * 0.25, 'bell', 0.32, k % 2 ? 0.3 : -0.3, c.scaleNote(d, 5), c.beat * 2));
    [3, 5, 7, 10].forEach((d, beat) => push(c.at(last, beat), 'pluck', 0.3, 0.2, c.scaleNote(d, 4), c.beat * 0.6));
    return out.sort((a, b) => a.t - b.t);
  },
};
