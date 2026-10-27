// Chiptune (from the fd-gacha short's arcade): 8-bit. A 25 % pulse lead (one four-bar phrase, the second time through with a
// harmony a third up), a 12.5 % pulse sixteenth arpeggio, a triangle bass bouncing root–octave, noise drums (sample-and-hold noise
// for the snare and hats, a swept triangle for the kick). I–V–vi–IV in a bright major key; closes on a rising arpeggio and the
// tonic chord. It never had fixed times: the layers come in with ctx.layers(), so it fits any length.

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
function pulseWave(sr, f, sec, duty) {
  const n = Math.floor(sr * sec), out = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += f / sr; const t = i / sr;
    const env = Math.min(1, t / 0.003) * (t < sec - 0.02 ? 1 : Math.max(0, (sec - t) / 0.02)) * (0.75 + 0.25 * Math.exp(-t * 8));
    out[i] = ((ph % 1) < duty ? 0.5 : -0.5) * env;
  }
  return out;
}

/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'chiptune',
  label: '8-bit 街機',
  doc: '8-bit 電玩：方波主旋律與快速琶音、三角波八度跳低音、雜訊鼓，明亮大調、輕快（150 BPM）；遊戲、扭蛋、抽卡、收集、闖關、復古',
  defaults: { bpm: 150, key: 'C' },
  swing: 0,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const prog = [1, 5, 6, 4];
    // a four-bar melody in scale degrees (eighths; null = rest); the seed may lift one note of every bar
    const shape = [[1, null, 3, 5, null, 5, 6, 5], [5, null, 7, null, 6, 5, 3, null], [3, 5, 6, null, 8, null, 6, 5], [4, null, 3, 2, 1, null, 2, null]];
    const flip = c.rng() < 0.5;
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b), deg = prog[b % 4];
      if (role === 'end') {
        const t = c.at(b, 0);
        [1, 3, 5, 8, 10].forEach((d, i) => push(t + i * 0.06, 'lead', 0.55, 0.1, c.scaleNote(d, 5), 0.18));
        c.chordOn(1, { octave: 5 }).forEach((m, i) => push(t + 0.32, 'lead', 0.4, -0.2 + i * 0.2, m, c.beat * 3));
        push(t, 'tri', 0.9, 0, c.scaleNote(1, 2), c.beat * 3);
        push(t, 'kick8', 0.9, 0);
        continue;
      }
      const root = c.scaleNote(deg, 2);
      // triangle bass: root / octave bounce in eighths
      for (let s = 0; s < 8; s++) push(c.at(b, s / 2), 'tri', s % 2 ? 0.55 : 0.8, 0, s % 2 ? root + 12 : root, c.beat * 0.45);
      // arpeggio (12.5 % pulse) on sixteenths once the loop has started
      const ch = c.chordOn(deg, { octave: 5 });
      if (role !== 'intro' && lv >= 1) for (let s = 0; s < 16; s++) push(c.at(b, s / 4), 'arp', 0.22, 0.25, ch[s % 3] + (s % 6 >= 3 ? 12 : 0), c.beat * 0.22);
      // lead melody; every second time through the phrase a harmony a third up joins it
      if (role !== 'intro') {
        const row = shape[b % 4], up = Math.floor(b / 4) % 2 === 1;
        row.forEach((d, s) => {
          if (d === null) return;
          const dd = flip && s === 6 ? d + 1 : d;
          push(c.at(b, s / 2), 'lead', 0.42, -0.1, c.scaleNote(dd, 5), c.beat * 0.42);
          if (up) push(c.at(b, s / 2) + 0.012, 'lead', 0.16, 0.2, c.scaleNote(dd + 2, 5), c.beat * 0.4);
        });
      }
      // noise drums
      push(c.at(b, 0), 'kick8', 0.85, 0); push(c.at(b, 2), 'kick8', 0.75, 0);
      if (lv >= 2) push(c.at(b, 2.5), 'kick8', 0.5, 0);
      if (role !== 'intro') { push(c.at(b, 1), 'snare8', 0.6, 0); push(c.at(b, 3), 'snare8', 0.65, 0); }
      for (let s = 0; s < 8; s++) push(c.at(b, s / 2), 'hat8', s % 2 ? 0.32 : 0.2, 0.3);
      if (role === 'fill') for (let s = 0; s < 4; s++) push(c.at(b, 3 + s / 4), 'snare8', 0.35 + s * 0.1, -0.1);
    }
    return out;
  },
  voices: {
    lead: (sr, r, e) => pulseWave(sr, hz(e.midi), e.dur ?? 0.2, 0.25),
    arp: (sr, r, e) => pulseWave(sr, hz(e.midi), e.dur ?? 0.1, 0.125),
    tri: (sr, r, e) => {
      const f = hz(e.midi), sec = e.dur ?? 0.2, n = Math.floor(sr * sec), out = new Float32Array(n); let ph = 0;
      for (let i = 0; i < n; i++) { ph += f / sr; const p = ph % 1, t = i / sr; const env = Math.min(1, t / 0.003) * (t < sec - 0.015 ? 1 : Math.max(0, (sec - t) / 0.015)); out[i] = (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) * 0.75 * env; }
      return out;
    },
    kick8: (sr) => {
      const n = Math.floor(sr * 0.16), out = new Float32Array(n); let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr, f = 40 + 180 * Math.exp(-t * 35); ph += f / sr; const p = ph % 1; out[i] = (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) * Math.exp(-t * 18); }
      return out;
    },
    snare8: (sr, r) => {
      const n = Math.floor(sr * 0.14), out = new Float32Array(n); let hold = 0, acc = 0;
      for (let i = 0; i < n; i++) { acc += 11000 / sr; if (acc >= 1) { acc -= 1; hold = r() * 2 - 1; } const t = i / sr; out[i] = hold * 0.6 * Math.exp(-t * 22); }
      return out;
    },
    hat8: (sr, r) => {
      const n = Math.floor(sr * 0.035), out = new Float32Array(n); let hold = 0, acc = 0;
      for (let i = 0; i < n; i++) { acc += 30000 / sr; if (acc >= 1) { acc -= 1; hold = r() * 2 - 1; } const t = i / sr; out[i] = hold * 0.35 * Math.exp(-t * 90); }
      return out;
    },
  },
};
