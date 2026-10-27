// Queue call: the food-deep short's queue-chime without its fixed cue times. A light marimba broken chord, plucked bass, shaker and a
// soft kit (I–vi–IV–V); the queue machine's ding-dong (a third falling to the tonic) lands on the first bar after the intro and on the
// bar after every fill — wherever a new section starts — and a low hit marks the bar before the close. Any length, any key.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'queue-call',
  label: '叫號小調',
  doc: '輕快木琴＋撥弦貝斯＋沙鈴，每段開頭叫號機「叮咚」、收尾前一記低鼓重拍；小吃店、排隊名店、一家一家介紹、第幾個理由（換號的叮咚音效另有 common.dingdong）',
  defaults: { bpm: 100, key: 'F' },
  swing: 0.08,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const prog = [1, 6, 4, 5];
    // the ding-dong: the third of the key above the tonic, then the tonic (A5 → F5 in F)
    const ding = (t) => { push(t, 'dingdong', 1, 0, c.scaleNote(3, 5), 1.2); push(t + 0.32, 'dingdong', 0.95, 0, c.scaleNote(1, 5), 1.6); };
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b), deg = prog[b % 4], prev = b > 0 ? c.role(b - 1) : 'intro';
      if (role === 'end') {
        const t = c.at(b, 0);
        c.chordOn(1, { octave: 4, seventh: false }).forEach((m, k) => push(t + k * 0.03, 'marimba', 0.7, -0.2 + k * 0.2, m, c.beat * 4));
        push(t, 'sub', 0.7, 0, c.scaleNote(1, 2), c.beat * 4);
        push(t, 'bell', 0.5, 0.2, c.scaleNote(1, 6), c.beat * 4);
        continue;
      }
      // a new section starts: the first bar after the intro, or the bar after a fill
      if (role !== 'intro' && (prev === 'intro' || prev === 'fill' || b === 0)) ding(c.at(b, 0));
      // the bar before the close: a low hit on its downbeat
      if (b === c.bars - 2 && c.bars > 2) { push(c.at(b, 0), 'kick', 1, 0); push(c.at(b, 0), 'tom', 0.8, 0, c.scaleNote(1, 2), 0.5); push(c.at(b, 0), 'sub', 0.8, 0, c.scaleNote(1, 2), 0.6); }
      const ch = c.chordOn(deg, { octave: 4 });
      const arp = [ch[0], ch[1], ch[2], ch[1] + 12 > 84 ? ch[1] : ch[0] + 12, ch[2], ch[1], ch[0], ch[1]];
      arp.forEach((m, i) => push(c.at(b, i / 2), 'marimba', (role === 'intro' ? 0.4 : 0.5) * (i % 2 ? 0.75 : 1), i % 2 ? 0.25 : -0.15, c.inKey(m) ? m : ch[0], c.beat * 0.5));
      const root = c.scaleNote(deg, 2);
      [[0, root, 0.85], [1.5, root + 7, 0.55], [2, root, 0.7], [3.5, root + 12, 0.45]].forEach(([beat, m, v]) =>
        push(c.at(b, beat), 'pluck', v, 0, c.inKey(m) ? m : root, c.beat * 0.6));
      for (let s = 0; s < 8; s++) push(c.at(b, s / 2), 'shaker', s % 2 ? 0.45 : 0.3, 0.3);
      if (role === 'intro') continue;
      push(c.at(b, 0), 'kick', 0.6, 0); push(c.at(b, 2.5), 'kick', 0.45, 0);
      if (lv >= 1) { push(c.at(b, 1), 'softSnare', 0.4, -0.05); push(c.at(b, 3), 'softSnare', 0.45, -0.05); }
      if (lv >= 2 && b % 2 === 1) push(c.at(b, 0), 'pad', 0.25, 0, c.scaleNote(deg, 4), c.bar);
      if (role === 'fill') for (let s = 0; s < 3; s++) push(c.at(b, 3 + s / 3), 'tom', 0.35 + s * 0.08, -0.2 + s * 0.2, c.scaleNote(3 - s, 3), c.beat * 0.3);
    }
    return out;
  },
  voices: {
    // a clean two-partial chime with a soft attack, like a ticket-number bell
    dingdong: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), n = Math.floor(sr * (e.dur ?? 1.2)), out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.min(1, t / 0.004) * Math.exp(-t * 3.2);
        out[i] = env * (0.62 * Math.sin(2 * Math.PI * f * t) + 0.22 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 6) + 0.1 * Math.sin(2 * Math.PI * f * 3.01 * t) * Math.exp(-t * 9));
      }
      return out;
    },
  },
};
