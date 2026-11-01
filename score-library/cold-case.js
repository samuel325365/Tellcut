// Cold case (from the true-crime acceptance film's own score, there called interrogation): a low suspense bed for talk clips.
// A dry wall-clock tick on every beat (tick / tock), a held minor drone (sub + dark pad) moving i – VI – iv – i, and two lonely
// bell notes every other bar.
// Cues: `reveal` drops everything out for 2 s (the twist line); `cliff` cuts the music dead (the clip stops before
// the answer) and only a low held tonic comes back for the end card. A new id, so the source project's own copy keeps loading.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'cold-case',
  label: '懸案低音',
  doc: '懸疑講述的低音床（60 BPM、小調）：每拍一下乾乾的掛鐘滴答、小調低音長音（i–VI–iv–i）、偶爾兩個鐘音；cue reveal 抽空 2 秒、cliff 整個斷掉只剩片尾一個低音；真實案件、懸案、懸疑講述、調查切片（gain 約 -14，配 c.duck）',
  defaults: { bpm: 60, key: 'Dm' },
  swing: 0,
  build(c) {
    const out = [];
    const reveal = c.cues.reveal ?? -99;
    const cliff = c.cues.cliff ?? 1e9;
    const quiet = (t) => (t >= reveal && t < reveal + 2) || t >= cliff;
    const push = (t, inst, vel, pan, midi, dur) => {
      if (quiet(t)) return;
      let d = dur;
      if (d !== undefined) {
        if (t < reveal && t + d > reveal) d = reveal - t;
        if (t < cliff && t + d > cliff) d = cliff - t;
      }
      out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(d !== undefined ? { dur: d } : {}) });
    };
    const prog = [1, 6, 4, 1];
    for (let b = 0; b < c.bars; b++) {
      const t0 = c.at(b, 0);
      if (c.role(b) === 'end') {
        // the end card: one low tonic, allowed after the cliff
        const tEnd = Math.max(t0, cliff + 0.6);
        out.push({ t: tEnd, inst: 'sub', vel: 0.38, pan: 0, midi: c.scaleNote(1, 1), dur: c.bar * 1.5 });
        out.push({ t: tEnd, inst: 'pad', vel: 0.12, pan: 0, midi: c.scaleNote(1, 3), dur: c.bar * 1.5 });
        continue;
      }
      const deg = prog[b % prog.length];
      push(t0, 'sub', 0.36, 0, c.scaleNote(deg, 1), c.bar);
      push(t0, 'pad', 0.11, -0.15, c.scaleNote(deg, 3), c.bar);
      push(t0, 'pad', 0.07, 0.15, c.scaleNote(deg + 2, 3), c.bar);
      for (let k = 0; k < 4; k++) push(c.at(b, k), 'clock', k % 2 ? 0.16 : 0.22, 0.25, k % 2 ? 84 : 89, 0.05);
      if (b % 2 === 1 && c.layers(b) >= 1) {
        push(c.at(b, 1.5), 'bell', 0.07, -0.3, c.scaleNote(deg + 4, 4), c.beat * 2);
        push(c.at(b, 3), 'bell', 0.05, 0.3, c.scaleNote(deg + 2, 4), c.beat * 2);
      }
    }
    return out;
  },
  voices: {
    // a dry wall-clock tick: a very short sine ping with a noise click on top
    clock: (sr, r, e) => {
      const n = Math.floor(sr * 0.05);
      const out = new Float32Array(n);
      const f = 440 * 2 ** ((e.midi - 69) / 12);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 140);
        out[i] = (Math.sin(2 * Math.PI * f * t) * 0.6 + (r() * 2 - 1) * 0.4 * Math.exp(-t * 400)) * env;
      }
      return out;
    },
  },
};
