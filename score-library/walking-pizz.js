// Walking pizz (from the fd-map short's stroll): a walk through town. Pizzicato strings pick out the chords on a light swing, an
// upright bass walks in quarter notes, soft brushes keep time, a glockenspiel answers at the end of every second bar, and a whistled
// tune comes in on the fuller bars. Ends on a plucked tonic with a glockenspiel "ding". It never had fixed times: the layers come in
// with ctx.layers(), so it fits any length.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'walking-pizz',
  label: '城市散步',
  doc: '散步感（100 BPM、輕搖擺）：撥奏弦樂和弦、木貝斯四分音符 walking bass、刷鼓、鐘琴小回應、口哨旋律；地圖路線、逛街、散步、走路吃、城市小旅行',
  defaults: { bpm: 100, key: 'F' },
  swing: 0.12,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const prog = [1, 6, 2, 5, 1, 4, 2, 5];
    // a whistled 4-bar phrase (scale degrees, beat, length in beats) — repeats with a variation every other time
    const tune = [
      [[5, 0, 1], [6, 1, 0.5], [5, 1.5, 0.5], [3, 2, 1.5]],
      [[2, 0, 0.5], [3, 0.5, 0.5], [4, 1, 1], [6, 2, 1], [5, 3, 1]],
      [[5, 0, 1], [8, 1, 1], [7, 2, 0.5], [6, 2.5, 0.5], [5, 3, 1]],
      [[4, 0, 1], [3, 1, 1], [2, 2, 2]],
    ];
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b), t0 = c.at(b, 0);
      if (role === 'end') {
        c.chordOn(1, { octave: 4 }).forEach((m, k) => push(t0 + k * 0.045, 'pizz', 0.8, -0.3 + k * 0.3, m, c.beat * 3));
        push(t0, 'upright', 0.9, 0, c.scaleNote(1, 2), c.beat * 3);
        push(t0 + c.beat * 0.5, 'glock', 0.55, 0.35, c.scaleNote(8, 5), c.beat * 3);
        continue;
      }
      const deg = prog[b % 8], ch = c.chordOn(deg, { octave: 4 });
      // pizzicato: bass note of the chord on 1, the rest on the "and"s
      push(t0, 'pizz', 0.6, -0.35, ch[0], c.beat * 0.6);
      for (const beat of [1.5, 2.5, 3.5]) ch.slice(1).forEach((m, k) => push(c.at(b, beat) + k * 0.012, 'pizz', role === 'intro' ? 0.42 : 0.5, -0.1 + k * 0.35, m, c.beat * 0.5));
      // brushes on every beat, a softer swish on the off-beats
      for (let s = 0; s < 4; s++) { push(c.at(b, s), 'brush', s % 2 ? 0.5 : 0.35, 0.2); push(c.at(b, s + 0.5), 'brush', 0.18, 0.2); }
      // the opening: the bass just on 1 and 3 (without it the pizzicato alone sits far below the rest once the level is set)
      if (role === 'intro') { for (const beat of [0, 2]) push(c.at(b, beat), 'upright', 0.6, 0, c.scaleNote(deg, 2), c.beat * 1.2); continue; }
      // walking bass
      const root = c.scaleNote(deg, 2), next = c.scaleNote(prog[(b + 1) % 8], 2);
      const walk = [root, c.inKey(root + 4) ? root + 4 : root + 3, c.inKey(root + 7) ? root + 7 : root + 5, next + (next > root ? -1 : 2)];
      walk.forEach((m, beat) => push(c.at(b, beat), 'upright', beat === 0 ? 0.85 : 0.6, 0, c.inKey(m) ? m : root, c.beat * 0.8));
      push(t0, 'kick', 0.35, 0);
      // glockenspiel answer every second bar
      if (b % 2 === 1) [[2.5, 5], [3, 6], [3.5, 8]].forEach(([beat, d]) => push(c.at(b, beat), 'glock', 0.42, 0.4, c.scaleNote(d, 5), c.beat * 0.6));
      // whistle on the fuller bars
      if (lv >= 2) {
        const ph = tune[b % 4];
        for (const [d, beat, len] of ph) push(c.at(b, beat), 'whistle', 0.5, -0.15, c.scaleNote(d, 5), c.beat * len * 0.95);
      }
      if (role === 'fill') for (let s = 0; s < 4; s++) push(c.at(b, 3 + s / 4), 'pizz', 0.45 + s * 0.08, 0.3, c.scaleNote(5 + s, 4), c.beat * 0.25);
    }
    return out;
  },
  voices: {
    // plucked string: a short Karplus–Strong with a woody body thump
    pizz: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), dur = Math.min(1.2, (e.dur ?? 0.4) + 0.25), n = Math.floor(sr * dur), out = new Float32Array(n);
      const N = Math.max(2, Math.round(sr / f)), buf = new Float32Array(N);
      for (let i = 0; i < N; i++) buf[i] = (r() * 2 - 1) * (1 - i / N) * 0.9;
      let p = 0;
      for (let i = 0; i < n; i++) {
        const a = buf[p], b = buf[(p + 1) % N]; buf[p] = 0.994 * 0.5 * (a + b) * 0.995; p = (p + 1) % N;
        const t = i / sr; out[i] = a * Math.exp(-t * 4.5) + Math.exp(-t * 60) * 0.25 * Math.sin(2 * Math.PI * 180 * t);
      }
      return out;
    },
    // upright bass: sine + soft second harmonic, a finger thump at the start
    upright: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), dur = (e.dur ?? 0.5) + 0.15, n = Math.floor(sr * dur), out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.min(1, t / 0.008) * Math.exp(-t * 3.2) * Math.min(1, (dur - t) / 0.06);
        out[i] = env * (0.8 * Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t) + 0.08 * Math.sin(6 * Math.PI * f * t)) + (t < 0.02 ? (r() * 2 - 1) * 0.15 * (1 - t / 0.02) : 0);
      }
      return out;
    },
    // glockenspiel: bright partials, quick decay
    glock: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), dur = 1.4, n = Math.floor(sr * dur), out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr; out[i] = Math.min(1, t / 0.002) * (Math.exp(-t * 3.5) * 0.6 * Math.sin(2 * Math.PI * f * t) + Math.exp(-t * 9) * 0.25 * Math.sin(2 * Math.PI * f * 2.76 * t) + Math.exp(-t * 18) * 0.12 * Math.sin(2 * Math.PI * f * 5.4 * t)); }
      return out;
    },
    // whistle: a pure tone with vibrato that grows, a little breath noise, a slide up into the note
    whistle: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), dur = (e.dur ?? 0.4) + 0.05, n = Math.floor(sr * dur), out = new Float32Array(n);
      let ph = 0, lpn = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.min(1, t / 0.04) * Math.min(1, (dur - t) / 0.05);
        const fr = f * (1 - 0.03 * Math.exp(-t * 30)) * (1 + 0.012 * Math.min(1, t / 0.25) * Math.sin(2 * Math.PI * 5.5 * t));
        ph += (2 * Math.PI * fr) / sr; lpn += 0.08 * ((r() * 2 - 1) - lpn);
        out[i] = env * (0.55 * Math.sin(ph) + 0.05 * Math.sin(2 * ph) + 0.08 * lpn);
      }
      return out;
    },
    // brush: a short filtered noise swish
    brush: (sr, r) => {
      const n = Math.floor(sr * 0.12), out = new Float32Array(n); let y = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; y += 0.35 * ((r() * 2 - 1) - y); out[i] = y * Math.min(1, t / 0.01) * Math.exp(-t * 28) * 0.6; }
      return out;
    },
  },
};
