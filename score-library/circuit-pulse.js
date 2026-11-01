// Circuit pulse (from the tech-brand acceptance film's own score): a precise, cool electronic bed that follows a brand film's parts
// through cues, each from its second until the next:
//   intro  (0 → build): a low eighth-note pulse and a thin pad
//   build  (→ drums):    + a sixteenth-note pluck arpeggio (the cells lighting one by one)
//   drums  (→ full):     + kick and closed hats
//   full   (→ breath):   + clap on 2 and 4, a brighter pad (the proof)
//   breath (→ hit):      everything drops to the pad and a slow bell (the breath before the name)
//   hit:                 one low hit and a bell chord on the logo, then pad and bells to the last chord
// Without cues they fall at the same shares of the length as in that film, on bar lines. A new id, so the source project's own
// copy keeps loading.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'circuit-pulse',
  label: '電路脈衝',
  doc: '冷調精準的電子墊底（100 BPM、大調）：低音八分脈衝、十六分撥弦琶音、輕鼓；用 cues（build 加琶音、drums 進鼓、full 加拍手、breath 只剩 pad、hit 商標一下重音）跟著段落起伏；科技、App、硬體、新創的品牌片和產品介紹',
  defaults: { bpm: 100, key: 'A' },
  swing: 0,
  build(ctx) {
    const out = [];
    // without cues: the same shares of the length as the film it was written for, on bar lines
    const cue = (k, f) => ctx.cues?.[k] ?? Math.max(1, Math.round(f * ctx.bars)) * ctx.bar;
    const tBuild = cue('build', 0.17), tDrums = cue('drums', 0.3), tFull = cue('full', 0.6), tBreath = cue('breath', 0.78), tHit = cue('hit', 0.9);
    const prog = [1, 6, 4, 5];           // I – vi – IV – V
    const b16 = ctx.beat / 4;
    for (let b = 0; b < ctx.bars; b++) {
      const T = ctx.at(b, 0), role = ctx.role(b);
      const deg = prog[b % 4];
      const chord = ctx.chordOn(deg, { octave: 4 });
      const root = ctx.scaleNote(deg, 2);
      if (role === 'end') {
        for (const m of ctx.chordOn(1, { octave: 4 })) out.push({ t: T, inst: 'pad', midi: m, dur: ctx.bar, vel: 0.35, pan: 0 });
        out.push({ t: T, inst: 'bell', midi: ctx.scaleNote(1, 5), dur: ctx.bar, vel: 0.35, pan: 0.1 });
        out.push({ t: T, inst: 'sub', midi: ctx.scaleNote(1, 1), dur: ctx.bar, vel: 0.5, pan: 0 });
        continue;
      }
      const breath = T >= tBreath - 0.01 && T < tHit - 0.01;
      const afterHit = T >= tHit - 0.01;
      // pad: thin at first, fuller in the proof, alone in the breath
      const padVel = T < tBuild ? 0.16 : T < tFull ? 0.2 : breath ? 0.18 : afterHit ? 0.22 : 0.26;
      for (const m of chord) out.push({ t: T, inst: 'pad', midi: m, dur: ctx.bar * 0.98, vel: padVel, pan: 0 });
      if (afterHit) {
        // the logo: one hit on its first beat, then slow bells
        if (Math.abs(T - tHit) < ctx.bar / 2) {
          out.push({ t: tHit, inst: 'kick', vel: 1, pan: 0 });
          out.push({ t: tHit, inst: 'sub', midi: ctx.scaleNote(1, 1), dur: ctx.bar * 1.5, vel: 0.7, pan: 0 });
          ctx.chordOn(1, { octave: 5 }).forEach((m, i) => out.push({ t: tHit + i * 0.03, inst: 'bell', midi: m, dur: ctx.bar * 2, vel: 0.42, pan: (i - 1) * 0.2 }));
        } else {
          out.push({ t: T, inst: 'bell', midi: chord[ctx.rng() < 0.5 ? 1 : 2] + 12, dur: ctx.bar, vel: 0.2, pan: 0.15 });
        }
        continue;
      }
      if (breath) {
        out.push({ t: T + ctx.beat * 2, inst: 'bell', midi: chord[2] + 12, dur: ctx.bar, vel: 0.16, pan: -0.15 });
        continue;
      }
      // the pulse: eighth notes on the root, quieter before the build
      for (let e = 0; e < 8; e++) out.push({ t: T + e * ctx.beat / 2, inst: 'bass', midi: root, dur: ctx.beat * 0.4, vel: (T < tBuild ? 0.32 : 0.42) * (e % 2 ? 0.75 : 1), pan: 0 });
      // the arpeggio: sixteenths through the chord, two octaves, from the build on
      if (T >= tBuild - 0.01) {
        const tones = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 12, chord[2]];
        for (let s = 0; s < 16; s++) {
          const t = T + s * b16;
          if (T < tDrums && s % 2) continue;
          out.push({ t, inst: 'pluck', midi: tones[s % tones.length] + 12, dur: b16 * 1.6, vel: (s % 4 === 0 ? 0.3 : 0.2), pan: s % 2 ? 0.25 : -0.25 });
        }
      }
      // the drums
      if (T >= tDrums - 0.01) {
        out.push({ t: T, inst: 'kick', vel: 0.75, pan: 0 }, { t: T + ctx.beat * 2, inst: 'kick', vel: 0.65, pan: 0 });
        for (let e = 0; e < 8; e++) out.push({ t: T + e * ctx.beat / 2, inst: 'hat', vel: e % 2 ? 0.22 : 0.14, pan: 0.2 });
        if (T >= tFull - 0.01) { out.push({ t: T + ctx.beat, inst: 'clap', vel: 0.4, pan: 0 }, { t: T + ctx.beat * 3, inst: 'clap', vel: 0.4, pan: 0 }); }
      }
    }
    return out;
  },
};
