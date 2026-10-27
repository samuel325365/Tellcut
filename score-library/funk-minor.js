// Funk minor (from the fd-quotes short's funk-scratch): a 96 BPM minor-key groove for kinetic typography. A slap-ish synth bass
// riff with octave pops, a boom-bap kick, snare + clap on 2 and 4, swung hats, a muted clav chord on the off-beats, a brass stab
// and a chord left ringing to close. The original's fixed cue times and the sound effects written into it (record scratches, stamps,
// brass hits on the punch words, the five rising 「超」 stabs, claps, shutter clicks, marker swishes) are gone: place those with
// c.sfx (common.scratch, common.thud, common.shutter, common.whoosh…) where the words land. What the cue times did for the groove is
// now done by the arrangement: the clav joins after the opening, ghost notes and an open hat with the layers, and the drums and bass
// drop out for the last half beat of every fill so the next section lands clean.
const TAU = Math.PI * 2;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
/** one-pole low-pass in place with a cutoff that follows cutoff(t) */
function lowpass(buf, sr, cutoff) {
  let y = 0;
  for (let i = 0; i < buf.length; i++) { const fc = cutoff(i / sr); const a = 1 - Math.exp((-TAU * fc) / sr); y += a * (buf[i] - y); buf[i] = y; }
  return buf;
}

/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'funk-minor',
  label: '小調放克',
  doc: '96 BPM 小調放克：彈撥感合成貝斯（八度 pop）、boom-bap 鼓、2/4 拍拍手、搖擺 hi-hat、反拍悶音 clavinet，每段落前鼓和貝斯空半拍；語錄、動態文字、金句、搞笑、街頭感（刷碟、蓋章等音效用 c.sfx 放）',
  defaults: { bpm: 96, key: 'Em' },
  swing: 0.12,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan = 0, midi, dur) => out.push({ t, inst, vel: vel * 0.68, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    // a two-bar bass riff in scale degrees on sixteenths (0 = rest), octave pops marked 8
    const RIFF = [1, 0, 0, 1, 0, 0, 8, 0, 1, 0, 3, 0, 4, 0, 5, 4,
      1, 0, 0, 1, 0, 0, 8, 0, 6, 0, 5, 0, 4, 3, 1, 0];
    const PROG = [1, 1, 4, 5];
    for (let b = 0; b < c.bars; b++) {
      const role = c.role(b), lv = c.layers(b), t0 = c.at(b, 0);
      if (role === 'end') {
        // a stab, then a minor seventh that rings out, hats thinning away
        c.chordOn(1, { octave: 4 }).forEach((m, k) => push(t0 + k * 0.004, 'stab', 0.4, -0.2 + k * 0.2, m, 0.3));
        c.chordOn(1, { octave: 4, seventh: true }).forEach((m, k) => push(t0 + k * 0.01, 'pad', 0.55, -0.3 + k * 0.2, m, c.bar * 0.95));
        push(t0, 'sub', 0.8, 0, c.scaleNote(1, 2), c.bar * 0.9);
        push(t0, 'kick', 0.9, 0); push(t0, 'clap', 0.6, 0);
        for (let s = 1; s < 8; s++) push(c.at(b, s / 2), 'hat', 0.3 * (1 - s / 9), 0.3);
        continue;
      }
      const intro = role === 'intro', deg = PROG[b % 4];
      // the last half beat of a fill (and of the bar before the close) is left open for the next downbeat
      const gap = (role === 'fill' || b === c.bars - 2) && c.bars >= 6 ? c.at(b, 3.5) - 0.001 : Infinity;
      for (let s = 0; s < 16; s++) {
        const t = c.at(b, s / 4);
        if (t >= gap) break;
        if ([0, 7, 10].includes(s)) push(t, 'kick', s === 0 ? 0.95 : 0.75, 0);
        if (!intro && (s === 4 || s === 12)) { push(t, 'snare', 0.55, 0.05); push(t, 'clap', 0.55, -0.05); }
        if (s % 2 === 0) push(t, s === 14 && lv >= 2 ? 'openHat' : 'hat', s % 4 === 0 ? 0.32 : 0.42, 0.3);
        else if (!intro && s % 4 === 3) push(t, 'hat', 0.2, 0.35);
        // ghost snares once the groove is full
        if (lv >= 3 && (s === 6 || s === 9)) push(t, 'softSnare', 0.18, 0.1);
      }
      // the fill: a snare pickup into the gap
      if (role === 'fill' && !intro) for (const q of [2.75, 3, 3.25]) push(c.at(b, q), 'snare', 0.35 + (q - 2.75) * 0.6, 0.05);
      // bass
      for (let s = 0; s < 16; s++) {
        const d = RIFF[(b % 2) * 16 + s]; if (!d) continue;
        const t = c.at(b, s / 4); if (t >= gap) break;
        const pop = d === 8;
        const m = pop ? c.scaleNote(deg, 3) : c.scaleNote(((deg - 1 + d - 1) % 7) + 1, 2);
        push(t, 'slap', pop ? 0.75 : 0.9, 0, m, pop ? c.beat * 0.2 : c.beat * 0.4);
      }
      // muted clav on the off-beats after the opening
      if (!intro && lv >= 1) for (const q of [1.5, 3.5]) {
        const t = c.at(b, q); if (t >= gap) continue;
        c.chordOn(deg, { octave: 4, seventh: true }).forEach((m, k) => push(t + k * 0.005, 'clav', 0.32, -0.25 + k * 0.17, m, c.beat * 0.22));
      }
      // a stab on the downbeat where a full section starts
      if (lv >= 2 && b > 0 && c.role(b - 1) === 'fill') c.chordOn(deg, { octave: 4 }).forEach((m, k) => push(t0 + k * 0.004, 'stab', 0.42, -0.2 + k * 0.2, m, 0.26));
    }
    return out;
  },
  voices: {
    // slap-ish bass: saw + square through a closing low-pass, with a click on the attack
    slap: (sr, r, e) => {
      const f = hz(e.midi), dur = Math.max(0.08, e.dur ?? 0.3), n = Math.floor(sr * (dur + 0.08)), b = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr, ph = (t * f) % 1; b[i] = (2 * ph - 1) * 0.6 + (ph < 0.5 ? 0.35 : -0.35); }
      lowpass(b, sr, (t) => 180 + 2600 * Math.exp(-t * 28));
      for (let i = 0; i < n; i++) { const t = i / sr; const env = Math.min(1, t / 0.003) * (t < dur ? Math.exp(-t * 3.2) : Math.exp(-dur * 3.2) * Math.exp(-(t - dur) * 60)); b[i] *= env * 0.9; if (t < 0.006) b[i] += (r() - 0.5) * 0.5 * (1 - t / 0.006); }
      return b;
    },
    // muted clav: a short, bright, quickly damped pulse
    clav: (sr, r, e) => {
      const f = hz(e.midi), dur = e.dur ?? 0.15, n = Math.floor(sr * (dur + 0.05)), b = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr, ph = (t * f) % 1; b[i] = (ph < 0.3 ? 1 : -0.45); }
      lowpass(b, sr, (t) => 900 + 3500 * Math.exp(-t * 30));
      for (let i = 0; i < n; i++) { const t = i / sr; b[i] *= Math.min(1, t / 0.002) * Math.exp(-t * (t < dur ? 9 : 60)) * 0.35; }
      return b;
    },
    // brass-ish stab: detuned saws, a filter swell then a quick fall
    stab: (sr, r, e) => {
      const f = hz(e.midi), dur = e.dur ?? 0.26, n = Math.floor(sr * (dur + 0.12)), b = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr; b[i] = ((t * f * 1.004) % 1) + ((t * f * 0.996) % 1) - 1; }
      lowpass(b, sr, (t) => 600 + 4200 * Math.min(1, t / 0.03) * Math.exp(-t * 7));
      for (let i = 0; i < n; i++) { const t = i / sr; b[i] *= Math.min(1, t / 0.018) * (t < dur ? 1 - t / dur * 0.4 : 0.6 * Math.exp(-(t - dur) * 30)) * 0.5; }
      return b;
    },
  },
};
