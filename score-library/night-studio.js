// Night studio (from the amber-podcast short's own score, there called studio-hush): a very quiet electric-piano bed for talk —
// slow seventh chords in a minor key (i – VI – III – VII), a held pad, a soft sub on the root, an airy shaker and a bell only in the fuller bars.
// Meant to sit far under speech (gain about -19 with c.duck). A new id, so the source project's own studio-hush keeps loading.
// The last bar is a held tonic chord.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'night-studio',
  label: '夜間錄音室',
  doc: '很輕的電鋼琴七和弦（小調 i–VI–III–VII，84 BPM）＋長音 pad＋低音，層次多的小節才加沙鈴和鈴聲；墊在對談、訪談、Podcast 切片底下，不搶人聲（gain 約 -19，配 c.duck）',
  defaults: { bpm: 84, key: 'Dm' },
  swing: 0.08,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const prog = [1, 6, 3, 7];   // i – VI – III – VII
    for (let b = 0; b < c.bars; b++) {
      const t0 = c.at(b, 0);
      if (c.role(b) === 'end') {
        c.chordOn(1, { octave: 3, seventh: true }).forEach((m, k) => push(t0 + k * 0.04, 'epiano', 0.42, -0.3 + k * 0.2, m, c.bar * 1.6));
        push(t0, 'pad', 0.18, 0, c.scaleNote(5, 4), c.bar * 1.6);
        push(t0, 'sub', 0.4, 0, c.scaleNote(1, 1), c.bar * 1.4);
        continue;
      }
      const deg = prog[b % prog.length];
      const chord = c.chordOn(deg, { octave: 3, seventh: true });
      chord.forEach((m, k) => push(t0 + k * 0.025, 'epiano', 0.34, -0.3 + k * 0.2, m, c.beat * 3));
      chord.slice(1).forEach((m, k) => push(c.at(b, 2.5) + k * 0.02, 'epiano', 0.18, 0.25 - k * 0.15, m, c.beat * 1.2));
      push(t0, 'pad', 0.14, -0.2, c.scaleNote(deg + 2, 4), c.bar);
      push(t0, 'sub', 0.34, 0, c.scaleNote(deg, 1), c.beat * 3.5);
      if (c.layers(b) >= 2) for (let e = 0; e < 8; e++) push(c.at(b, e * 0.5), 'shaker', e % 2 ? 0.05 : 0.08, 0.3);
      if (c.layers(b) >= 1 && b % 2 === 1) push(c.at(b, 3), 'bell', 0.1, 0.35, c.scaleNote(deg + 4, 5), c.beat);
    }
    return out;
  },
};
