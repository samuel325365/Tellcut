// A sneaky pizzicato "mischief" groove in D minor (from the baking-sin short's sin-mischief), laid out by the number of bars:
// hook stinger → one gentle bar (the calm before) → the groove piling up layer by layer → a hush (only a clock tick and a heartbeat)
// → a snare build → a roll → BOOM → a warm Bb–C turn → an open D chord. The sections are counted back from the end, so a short
// film drops the gentle bar and the hush first and keeps the build, the boom and the ending.
const D2 = 38;
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'mischief',
  label: '鬼祟撥弦',
  doc: '鬼祟撥弦律動（D 小調、120 bpm）：開場重音、溫柔一小節、逐層加厚的偷吃感律動、只剩滴答心跳的屏息、小鼓堆疊、鼓滾、爆、收在明亮的 D 空心和弦；搞笑反差、計分、爆表、越來越誇張的短片',
  defaults: { bpm: 120, key: 'Dm' },
  swing: 0.04,
  build(c) {
    const out = [];
    // written in D minor; another minor key moves every note by the distance between the tonics
    const shift = ((((c.scaleNote(1, 2) - D2) % 12) + 18) % 12) - 6;
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi: midi + shift } : {}), ...(dur !== undefined ? { dur } : {}) });
    const B = c.bars, last = B - 1;
    // the sections, counted back from the end: turn, boom, roll, build, hush; with fewer bars the earlier ones drop out
    const turn = B >= 4 ? last - 1 : -1, boom = B >= 5 ? last - 2 : -1, roll = B >= 6 ? last - 3 : -1, build = B >= 9 ? last - 4 : -1, hush = B >= 12 ? last - 5 : -1;
    const gentle = B >= 10 ? 1 : -1, g0 = gentle >= 0 ? 2 : 1, g1 = [hush, build, roll, boom, turn, last].filter((x) => x > 0)[0] - 1;
    const bassA = [[0, D2], [1, D2 + 7], [2, D2 + 12], [3, D2 + 7], [3.5, D2 + 7]];
    const bassB = [[0, D2 + 5], [1, D2 + 12], [2, D2 + 7], [2.5, D2 + 7], [3, D2 + 7], [3.5, D2 + 2]];
    const melA = [[0.5, 69], [1, 69], [1.5, 70], [2, 69], [3, 65], [3.5, 64]];
    const melB = [[0.5, 74], [1, 72], [1.5, 69], [2.5, 67], [3, 69]];
    const groove = (b, lv) => {
      const t0 = c.at(b, 0);
      (b % 2 ? bassB : bassA).forEach(([beat, m]) => push(c.at(b, beat), 'bass', 0.85, 0, m, c.beat * 0.32));
      for (const beat of [1, 3]) push(c.at(b, beat), 'clap', 0.38 + lv * 0.2, 0.08);
      for (let s = 0; s < 8; s++) push(c.at(b, s / 2), 'hat', s % 2 ? 0.28 : 0.42, -0.3);
      if (lv >= 0.25) (b % 2 ? melB : melA).forEach(([beat, m]) => push(c.at(b, beat), 'pluck', 0.62, 0.25, m, c.beat * 0.35));
      if (lv >= 0.5) { push(t0, 'kick', 0.8, 0); push(c.at(b, 2), 'kick', 0.7, 0); }
      if (lv >= 0.7) (b % 2 ? melB : melA).forEach(([beat, m]) => push(c.at(b, beat) + 0.01, 'marimba', 0.4, -0.25, m + 12, c.beat * 0.3));
      if (lv >= 0.85) { for (let s = 0; s < 16; s += 2) push(c.at(b, s / 4 + 0.25), 'shaker', 0.3, 0.4); push(t0, 'pad', 0.22, 0, b % 2 ? 67 : 62, c.bar); }
    };
    for (let b = 0; b < B; b++) {
      const t0 = c.at(b, 0);
      if (b === last) {
        // an open D (root, fifth, octave, ninth): warm and a little cheeky, the verdict
        [62, 69, 74, 76].forEach((m, k) => push(t0 + k * 0.03, 'epiano', 0.7, -0.2 + k * 0.13, m, c.beat * 6));
        push(t0, 'sub', 0.85, 0, D2 - 12, c.beat * 6);
        push(t0, 'kick', 0.9, 0);
        push(t0, 'bell', 0.5, 0.25, 81, c.beat * 5);
        push(c.at(b, 0.5), 'bell', 0.35, -0.25, 86, c.beat * 4);
      } else if (b === 0) {
        // hook: two low hits and a questioning bell
        push(t0, 'kick', 1, 0); push(t0, 'sub', 0.95, 0, D2 - 12, c.beat * 1.5);
        push(c.at(b, 0.75), 'kick', 0.9, 0); push(c.at(b, 0.75), 'sub', 0.85, 0, D2 - 12, c.beat * 1.2);
        push(c.at(b, 2.5), 'bell', 0.5, 0.2, 81, c.beat * 1.2); push(c.at(b, 3), 'bell', 0.55, -0.2, 86, c.beat * 1.5);
      } else if (b === gentle) {
        // the calm before: soft pad, a gentle bell arpeggio — cut off at beat 2.5 (room for a record scratch)
        [53, 57, 60, 64].forEach((m, k) => push(t0 + k * 0.02, 'pad', 0.32, -0.2 + k * 0.13, m, c.beat * 2.4));
        [77, 81, 84, 88, 84].forEach((m, k) => push(c.at(b, k * 0.5), 'bell', 0.32, k % 2 ? 0.3 : -0.3, m, c.beat * 1.2));
      } else if (b === hush) {
        // a hush: a clock tick and a heartbeat over a low pad
        for (let s = 0; s < 8; s++) push(c.at(b, s / 2), 'hat', s % 2 ? 0.25 : 0.5, s % 2 ? 0.4 : -0.4);
        for (const beat of [0, 0.35, 2, 2.35]) push(c.at(b, beat), 'kick', beat % 2 ? 0.45 : 0.6, 0);
        push(t0, 'pad', 0.28, 0, 50, c.bar); push(t0, 'pad', 0.22, 0, 57, c.bar);
      } else if (b === build) {
        // snare eighths, the bass climbing the scale
        const climb = [D2, D2 + 2, D2 + 3, D2 + 5, D2 + 7, D2 + 8, D2 + 10, D2 + 12];
        for (let s = 0; s < 8; s++) { push(c.at(b, s / 2), 'snare', 0.3 + s * 0.05, 0.1); push(c.at(b, s / 2), 'bass', 0.8, 0, climb[s], c.beat * 0.3); }
        for (const beat of [0, 1, 2, 3]) push(c.at(b, beat), 'kick', 0.75, 0);
      } else if (b === roll) {
        // sixteenths up to beat 3.5, then a breath before the boom
        const up = [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81, 82, 84];
        for (let s = 0; s < 14; s++) { push(c.at(b, s / 4), 'snare', 0.35 + s * 0.04, s % 2 ? 0.15 : -0.15); push(c.at(b, s / 4), 'pulse', 0.25 + s * 0.02, 0, up[s], c.beat * 0.2); }
        push(t0, 'kick', 0.8, 0); push(c.at(b, 2), 'kick', 0.8, 0);
      } else if (b === boom) {
        // BOOM, then room (a spoken line, a reaction)
        push(t0, 'kick', 1, 0); push(t0, 'sub', 1, 0, D2 - 12, c.beat * 3.5); push(t0, 'openHat', 0.8, 0.2); push(t0, 'snare', 0.9, -0.1); push(t0, 'clap', 0.8, 0.1);
        [50, 57, 62, 65].forEach((m, k) => push(t0 + k * 0.01, 'pad', 0.35, -0.2 + k * 0.13, m, c.beat * 3.5));
      } else if (b === turn) {
        // Bb – C, gentle, leading into the D major ending
        [58, 62, 65].forEach((m, k) => push(t0 + k * 0.02, 'epiano', 0.55, -0.15 + k * 0.15, m, c.beat * 1.8));
        [60, 64, 67].forEach((m, k) => push(c.at(b, 2) + k * 0.02, 'epiano', 0.6, -0.15 + k * 0.15, m, c.beat * 1.8));
        push(t0, 'bass', 0.8, 0, D2 - 4, c.beat * 1.6); push(c.at(b, 2), 'bass', 0.8, 0, D2 - 2, c.beat * 1.6);
        for (const beat of [1, 3]) push(c.at(b, beat), 'clap', 0.35, 0.05);
        [[0.5, 74], [1, 72], [1.5, 70], [2.5, 72], [3, 74], [3.5, 76]].forEach(([beat, m]) => push(c.at(b, beat), 'pluck', 0.55, 0.25, m, c.beat * 0.4));
      } else {
        // the groove, thicker every bar from g0 to g1
        groove(b, g1 > g0 ? (b - g0) / (g1 - g0) : 1);
      }
    }
    return out;
  },
};
