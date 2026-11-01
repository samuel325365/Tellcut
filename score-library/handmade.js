// Handmade (from the bakery acceptance film's own score, there called first-bake): a warm slow piece for handmade work and early
// mornings — a felt piano, a bowed bass-like drone and a soft pad. It opens with only the drone and a few piano notes; from `beats`
// broken chords and a very light shaker; `proof` is the fullest (a high melody); everything stops for the beat of `breath`; `we`
// opens one slow chord with a bell; `logo` lands one low piano octave with a bell; the last bar is the tonic chord. Without cues the
// sections fall at the same shares of the length (by bar). A new id, so the source project's own copy keeps loading.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'handmade',
  label: '手作慢板',
  doc: '毛氈鋼琴、像低音提琴的長音和柔 pad 的溫暖慢板（72 BPM、大調）；跟著 cues 從安靜漸漸滿起來（beats 加分解和弦、proof 最滿、breath 停一拍、we 慢慢展開一個和弦、logo 一記低音八度加鐘聲）；手作、烘焙、清晨、小店的品牌片',
  defaults: { bpm: 72, key: 'D' },
  swing: 0,
  build(ctx) {
    const out = [];
    const cues = ctx.cues || {};
    // without cues: the same shares of the length as the film it was written for, on bar lines
    const share = (f) => Math.max(1, Math.round(f * ctx.bars)) * ctx.bar;
    const beatsAt = cues.beats ?? share(0.17);
    const proofAt = cues.proof ?? share(0.72);
    const breathAt = cues.breath ?? share(0.83) - ctx.beat * 0.5;
    const weAt = cues.we ?? breathAt + ctx.beat * 0.5;
    const logoAt = cues.logo ?? share(0.94) - ctx.bar * 0.5;
    const prog = [0, 4, 5, 3]; // I – V – vi – IV (degrees from 0)
    const last = ctx.bars - 1;
    const inBreath = (t) => t >= breathAt - 0.02 && t < weAt;

    for (let b = 0; b < ctx.bars; b++) {
      const t0 = ctx.at(b, 0);
      const deg = b >= last ? 0 : prog[b % 4];
      const chord = ctx.chordOn(deg, { octave: 3 });
      const root = chord[0];
      const phase = t0 < beatsAt ? 'intro' : t0 < proofAt ? 'beats' : t0 < weAt ? 'proof' : t0 < logoAt - ctx.bar * 0.5 ? 'we' : 'logo';

      if (b === last) {
        // the close: one long tonic chord
        for (const m of chord) out.push({ t: t0, inst: 'felt', midi: m + 12, dur: ctx.bar, vel: 0.32, pan: 0 });
        out.push({ t: t0, inst: 'pad', midi: root, dur: ctx.bar, vel: 0.22, pan: 0 });
        out.push({ t: t0, inst: 'bowed', midi: root - 12, dur: ctx.bar, vel: 0.3, pan: 0 });
        continue;
      }

      // the pad and the drone: all the way through, thicker later on
      const padVel = { intro: 0.14, beats: 0.18, proof: 0.24, we: 0.22, logo: 0.2 }[phase];
      if (!inBreath(t0)) {
        out.push({ t: t0, inst: 'pad', midi: root, dur: ctx.bar, vel: padVel, pan: -0.2 });
        out.push({ t: t0, inst: 'pad', midi: chord[2], dur: ctx.bar, vel: padVel * 0.8, pan: 0.2 });
        out.push({ t: t0, inst: 'bowed', midi: root - 12, dur: ctx.bar * 0.98, vel: phase === 'intro' ? 0.22 : 0.3, pan: 0 });
      }

      if (phase === 'intro') {
        // a few piano notes: two a bar
        out.push({ t: ctx.at(b, 0), inst: 'felt', midi: chord[2] + 12, dur: ctx.beat * 2, vel: 0.24, pan: 0.15 });
        if (b > 0) out.push({ t: ctx.at(b, 2), inst: 'felt', midi: chord[1] + 12, dur: ctx.beat * 2, vel: 0.2, pan: -0.15 });
      } else if (phase === 'beats' || phase === 'proof') {
        // broken chords in eighths; proof adds a high melody and the shaker
        const arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12];
        for (let i = 0; i < 8; i++) {
          const t = ctx.at(b, i / 2);
          if (inBreath(t)) continue;
          out.push({ t, inst: 'felt', midi: arp[i % 4], dur: ctx.beat, vel: (i % 2 ? 0.16 : 0.22) * (phase === 'proof' ? 1.15 : 1), pan: i % 2 ? 0.2 : -0.2 });
        }
        for (let i = 1; i < 4; i += 2) {
          const t = ctx.at(b, i);
          if (!inBreath(t)) out.push({ t, inst: 'shaker', vel: phase === 'proof' ? 0.12 : 0.08, pan: 0.3 });
        }
        if (phase === 'proof') {
          const mel = [ctx.scaleNote(deg + 4, 5), ctx.scaleNote(deg + 2, 5)];
          if (!inBreath(ctx.at(b, 0))) out.push({ t: ctx.at(b, 0), inst: 'felt', midi: mel[0], dur: ctx.beat * 2, vel: 0.26, pan: 0 });
          if (!inBreath(ctx.at(b, 2))) out.push({ t: ctx.at(b, 2), inst: 'felt', midi: mel[1], dur: ctx.beat * 2, vel: 0.22, pan: 0 });
        }
      } else if (phase === 'we') {
        // we: one chord opening slowly
        chord.forEach((m, i) => { if (!inBreath(ctx.at(b, i * 0.5))) out.push({ t: ctx.at(b, i * 0.5), inst: 'felt', midi: m + 12, dur: ctx.bar, vel: 0.24, pan: (i - 1) * 0.2 }); });
      } else {
        // the logo section: only the pad, waiting for the landing
      }
    }

    // after the breath, the first note of `we`: a bell
    out.push({ t: weAt, inst: 'bell', midi: ctx.scaleNote(4, 5), dur: 2, vel: 0.18, pan: 0.1 });
    // logo: a low piano octave and a bell
    const tonic = ctx.chordOn(0, { octave: 2 })[0];
    out.push({ t: logoAt, inst: 'felt', midi: tonic, dur: 3, vel: 0.55, pan: 0 });
    out.push({ t: logoAt, inst: 'felt', midi: tonic + 12, dur: 3, vel: 0.42, pan: 0 });
    out.push({ t: logoAt, inst: 'bowed', midi: tonic, dur: 3, vel: 0.35, pan: 0 });
    out.push({ t: logoAt + 0.02, inst: 'bell', midi: tonic + 48, dur: 3, vel: 0.22, pan: 0 });
    return out.filter((n) => n.t < ctx.bars * ctx.bar);
  },
  voices: {
    // felt piano: a few partials, the higher dying faster, a slightly soft attack, a muffled hammer knock
    felt: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), len = (e.dur ?? 1) + 1.6, n = Math.floor(sr * len), out = new Float32Array(n);
      const amps = [1, 0.36, 0.16, 0.07, 0.03];
      const decay = 0.7 + Math.max(0, (e.midi - 48) / 34);
      let knock = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, att = Math.min(1, t / 0.015), rel = t > len - 0.7 ? Math.max(0, (len - t) / 0.7) : 1;
        let v = 0;
        for (let h = 0; h < amps.length; h++) v += amps[h] * Math.sin(2 * Math.PI * f * (h + 1) * (1 + h * h * 0.0003) * t) * Math.exp(-t * decay * (1 + h * 0.8));
        if (t < 0.025) knock += 0.2 * ((r() * 2 - 1) - knock);
        out[i] = 0.4 * (v * att * rel + (t < 0.025 ? knock * (1 - t / 0.025) * 0.4 : 0));
      }
      return out;
    },
    // a bowed bass-like drone: slow attack, slight vibrato, a warm low-passed saw
    bowed: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), len = (e.dur ?? 2) + 0.5, n = Math.floor(sr * len), out = new Float32Array(n);
      let ph = 0, lp = 0, lp2 = 0;
      const k = 1 - Math.exp(-2 * Math.PI * 650 / sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const vib = 1 + 0.003 * Math.sin(2 * Math.PI * 4.8 * t) * Math.min(1, t / 1.2);
        ph += f * vib / sr; ph -= Math.floor(ph);
        const saw = 2 * ph - 1;
        lp += k * (saw - lp); lp2 += k * (lp - lp2);
        const att = Math.min(1, t / 0.6), rel = t > len - 0.5 ? Math.max(0, (len - t) / 0.5) : 1;
        out[i] = 0.5 * lp2 * att * rel;
      }
      return out;
    },
  },
};
