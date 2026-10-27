// Lullaby box (from the parenting-brain film's nightlight): a music-box tune over a warm pad, a soft bass and a felt-piano broken
// chord, 72 BPM. The original followed its film's seconds (SEC); here lullabyPlan() lays the same story out by the bar count:
//   intro   the opening bars: pad and the tune's downbeats
//   warm    I–vi–IV–V with the whole tune
//   minor   about 36–55 % of the way (6 bars or more): the chords lean on vi (vi–IV–vi–V), the tune thins, a low heartbeat joins
//   glow    back to major with a glockenspiel sparkle on 2 and 4
//   breath  near the end of a film of 12 bars or more: one soft felt note a half bar, nothing else (then, in a long film, two
//           more glow bars to answer it)
// and it closes on the tonic chord with a high music-box note, let ring out inside the score's tail (not cut by the fade).

/** the section of every bar (see the header) */
export function lullabyPlan(bars, role = () => 'loop') {
  const last = bars - 1, plan = Array.from({ length: bars }, (_, b) => (b === last ? 'end' : role(b) === 'intro' ? 'intro' : 'warm'));
  let stop = last;
  if (bars >= 12) {
    const answer = bars >= 24 ? 2 : 0, len = bars >= 24 ? Math.max(2, Math.round(bars * 0.07)) : 1;
    stop = last - answer - len;
    for (let b = stop; b < stop + len; b++) plan[b] = 'breath';
  }
  if (bars >= 6) {
    const a = Math.max(1, Math.round(bars * 0.36)), z = Math.min(stop - 1, Math.max(a + 1, Math.round(bars * 0.55)));
    for (let b = a; b < z; b++) if (plan[b] !== 'intro') plan[b] = 'minor';
    for (let b = z; b < last; b++) if (plan[b] === 'warm') plan[b] = 'glow';
  }
  return plan;
}

/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'lullaby-box',
  label: '夜燈音樂盒',
  doc: '溫柔的夜燈音樂盒（72 BPM、大調）：音樂盒旋律、暖 pad、柔和低音、毛氈鋼琴分解和弦；中段轉向小調加低頻心跳、後段加鐘琴、片尾前留白只剩單音；育兒、睡前、寶寶、溫暖的科普或回憶',
  defaults: { bpm: 72, key: 'F' },
  swing: 0,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const plan = lullabyPlan(c.bars, c.role);
    // I – vi – IV – V; the minor part leans on vi: vi – IV – vi – V (from its own first bar)
    const prog = [1, 6, 4, 5], progMinor = [6, 4, 6, 5], minorStart = plan.indexOf('minor');
    // a gentle music-box tune over four bars (scale degrees, in eighths; 0 = rest)
    const tune = [[5, 0, 3, 0, 1, 0, 3, 5], [6, 0, 5, 0, 3, 0, 2, 0], [4, 0, 6, 0, 1, 0, 6, 5], [5, 0, 2, 0, 7, 0, 5, 0]];
    for (let b = 0; b < c.bars; b++) {
      const t0 = c.at(b, 0), s = plan[b], lv = c.layers(b);
      if (s === 'end') {
        c.chordOn(1, { octave: 4 }).forEach((m, k) => push(t0 + k * 0.06, 'pad', 0.35, -0.2 + k * 0.2, m, c.bar + 1.3));
        push(t0, 'mbox', 0.6, 0.15, c.scaleNote(1, 6), c.bar);
        push(t0, 'sub', 0.5, 0, c.scaleNote(1, 2), c.bar + 1.1);
        continue;
      }
      const minor = s === 'minor', deg = minor ? progMinor[(b - minorStart) % 4] : prog[b % 4], ch = c.chordOn(deg, { octave: 4 });
      if (s === 'breath') {
        // a breath: one soft felt note a half bar, nothing else
        [0, 2].forEach((beat) => push(c.at(b, beat), 'felt', 0.35, 0, c.scaleNote(deg, 5), c.beat * 1.8));
        continue;
      }
      // warm pad, a whole bar
      ch.forEach((m, k) => push(t0 + k * 0.02, 'pad', minor ? 0.26 : 0.22, -0.3 + k * 0.3, m, c.bar * 1.05));
      // bass on 1 and 3 (the fifth on 3 except in the minor part)
      push(t0, 'sub', 0.5, 0, c.scaleNote(deg, 2), c.beat * 1.8);
      if (s !== 'intro') push(c.at(b, 2), 'sub', 0.35, 0, c.scaleNote(deg, 2) + (minor ? 0 : 7), c.beat * 1.6);
      // music-box tune (only its downbeats in the opening and the minor part)
      tune[b % 4].forEach((d, i) => {
        if (!d || ((minor || s === 'intro') && i % 4 !== 0)) return;
        push(c.at(b, i / 2), 'mbox', minor || s === 'intro' ? 0.4 : 0.55, 0.2, c.scaleNote(minor && d === 3 ? 2 : d, 5), c.beat * 1.2);
      });
      if (s === 'intro') continue;
      // felt-piano broken chord on the off-beats
      [0.5, 1.5, 2.5, 3.5].forEach((beat, i) => push(c.at(b, beat), 'felt', 0.28, -0.2, ch[i % 3], c.beat * 0.9));
      if (minor) for (const beat of [0, 0.35, 2, 2.35]) push(c.at(b, beat), 'beat', beat % 1 ? 0.45 : 0.7, 0);
      if (s === 'glow' || (s === 'warm' && lv >= 3)) for (const beat of [1, 3]) push(c.at(b, beat), 'bell', 0.22, 0.3, c.scaleNote(deg === 1 ? 5 : 1, 6), c.beat);
    }
    return out;
  },
  voices: {
    // music box: a bright sine with a quick inharmonic shimmer and a long, soft tail
    mbox: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), n = Math.floor(sr * ((e.dur ?? 1) + 1.2)), out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr, env = Math.min(1, t / 0.003) * Math.exp(-t * 2.6);
        out[i] = env * (0.6 * Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 4.01 * t) * Math.exp(-t * 9) + 0.12 * Math.sin(2 * Math.PI * f * 2 * t)); }
      return out;
    },
    // felt piano: muted, round
    felt: (sr, r, e, synth) => synth.epiano(sr, 440 * 2 ** ((e.midi - 69) / 12), (e.dur ?? 0.6) + 0.4, 0.6),
    // heartbeat: a soft low thump
    beat: (sr) => {
      const n = Math.floor(sr * 0.35), out = new Float32Array(n); let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; ph += (55 + 30 * Math.exp(-t * 25)) / sr; out[i] = Math.exp(-t * 14) * Math.sin(2 * Math.PI * ph); }
      return out;
    },
  },
};
