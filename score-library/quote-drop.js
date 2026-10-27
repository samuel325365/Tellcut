// Quote drop: the podcast-quote short's quote-pulse without its fixed cue times. A quiet talk-show bed in a minor key (i–VI–III–VII)
// with a heartbeat sub, muted plucks and soft hats, built around one punchline laid out by the bar count (quoteDropPlan): a teaser
// bar at the top (a low drone, a riser, a boom on its third beat), the bed, then halfway through the bar before the punchline
// everything stops but the drone and a riser; the boom, a kick, a held VI chord and a high bell land on the punchline's downbeat
// (bar ≈ 60 % in), after it the chords turn to the relative major (III–VII–i–VI) for the "you can choose" ending, and a major
// seventh on III rings over the last bar. Whooshes peak on the layout changes: the end of the teaser, the hush, the turn, the end.
/** where the parts go, in bars: the teaser (-1 when too short), the hush, the punchline, the turn to major and the closing bar */
export function quoteDropPlan(bars) {
  const end = bars - 1, hook = bars >= 8 ? 0 : -1;
  const hit = Math.min(end - 1, Math.max(hook + 2, Math.round(bars * 0.6)));
  return { hook, hush: hit - 1, hit, turn: hit + 1, end };
}

/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'quote-drop',
  label: '金句重拍',
  doc: '小調安靜的訪談底：心跳低音、悶撥弦、輕 hi-hat；開頭一小節預告（低音嗡鳴＋上升音＋重低音），約六成處的金句前半小節全停只剩上升音，落在金句小節第一拍一記重低音和高音鈴，之後轉大調收尾；Podcast 金句、訪談、演講的最強一句（金句放在 quoteDropPlan(小節數).hit 那一小節的第一拍）',
  defaults: { bpm: 84, key: 'Am' },
  swing: 0,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const P = quoteDropPlan(c.bars), total = c.bars * c.bar, drone = c.scaleNote(1, 2);
    const hookHit = P.hook >= 0 ? c.at(P.hook, 2) : -1, drop = c.at(P.hush, 2), hit = c.at(P.hit, 0), turn = c.at(P.turn, 0), end = c.at(P.end, 0);
    const minor = [1, 6, 3, 7], major = [3, 7, 1, 6];
    for (let b = P.hook + 1; b < P.end; b++) {
      if (b === P.hit) continue;
      const t0 = c.at(b, 0), after = b >= P.turn, deg = (after ? major : minor)[(after ? b - P.turn : b) % 4];
      const ch = c.chordOn(deg, { octave: 4 }), lv = Math.max(1, c.layers(b)), stop = b === P.hush ? drop : Infinity;
      // pad: the chord, soft and long (cut at the hush)
      ch.forEach((m, k) => push(t0 + k * 0.02, 'pad', 0.32, -0.25 + k * 0.25, m, Math.max(0.1, Math.min(c.bar * 1.05, stop - t0))));
      for (let s = 0; s < 8; s++) {
        const t = c.at(b, s / 2);
        if (t >= stop - 0.01) break;
        // heartbeat: lub-dub on beat 1 and its "and"; again on 3 once the music has grown
        if (s === 0 || s === 1 || (lv >= 2 && (s === 4 || s === 5))) push(t, 'sub', s % 2 ? 0.45 : 0.7, 0, c.scaleNote(deg, 2), c.beat * 0.45);
        const pat = [0, 1, 2, 1, 0, 2, 1, 2];
        push(t, 'pluck', (s % 2 ? 0.28 : 0.38) * (after ? 1.1 : 1), -0.3 + (s % 3) * 0.3, ch[pat[s]] + 12, c.beat * 0.35);
        if (lv >= 1) push(t, 'hat', s % 2 ? 0.18 : 0.12, 0.35);
        if (lv >= 2 && (s === 2 || s === 6)) push(t, 'softSnare', 0.22, 0.05);
      }
    }
    // the teaser: a low drone over the bar, a riser into its third beat, a boom on it
    if (P.hook >= 0) {
      push(0, 'drone', 0.5, 0, drone, c.bar);
      push(Math.max(0, hookHit - 1.0), 'riser', 0.5, 0, undefined, Math.min(1.0, hookHit));
      push(hookHit, 'boom', 0.5, 0);
    }
    // the punchline: silence but the drone and a riser, then the boom, a kick and a high bell over a held VI chord
    push(drop, 'drone', 0.45, 0, drone, hit - drop);
    push(Math.max(drop, hit - 1.3), 'riser', 0.6, 0, undefined, Math.min(1.3, hit - drop));
    push(hit, 'boom', 0.55, 0);
    push(hit, 'kick', 0.5, 0);
    c.chordOn(6, { octave: 4 }).forEach((m, k) => push(hit + k * 0.02, 'pad', 0.4, -0.25 + k * 0.25, m, turn - hit + 0.4));
    push(hit, 'bell', 0.35, 0.3, c.scaleNote(3, 6), 2.2);
    // whooshes peak on the layout changes
    for (const t of [P.hook >= 0 ? c.at(P.hook + 1, 0) : -1, drop, turn, end]) if (t > 0.22) push(t - 0.22, 'whoosh', 0.55, 0);
    // the ending: the major seventh on III rings over the closing bar
    c.chordOn(3, { octave: 4, seventh: true }).forEach((m, k) => push(end + k * 0.03, 'epiano', 0.28, -0.2 + k * 0.13, m, 2.6));
    push(end, 'sub', 0.32, 0, c.scaleNote(3, 2), 2.4);
    push(end + 0.05, 'bell', 0.16, 0.25, c.scaleNote(5, 6), 2.4);
    return out.filter((e) => e.t >= 0 && e.t < total - 0.05);
  },
  voices: {
    // band of noise that opens and closes, loudest ~0.22 s in (on the cut)
    whoosh: (sr, r) => {
      const d = 0.5, n = Math.floor(sr * d), o = new Float32Array(n);
      let lp = 0, lp2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, p = t / d, a = 0.03 + 0.35 * Math.sin(Math.PI * Math.min(1, p * 1.1));
        const x = r() * 2 - 1; lp += a * (x - lp); lp2 += 0.02 * (lp - lp2);
        const env = p < 0.44 ? Math.pow(p / 0.44, 2) : Math.exp(-(p - 0.44) * 9);
        o[i] = (lp - lp2) * env * 2.2;
      }
      return o;
    },
    // a sub drop with a click: 90 → 38 Hz
    boom: (sr, r) => {
      const d = 1.5, n = Math.floor(sr * d), o = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, f = 38 + 52 * Math.exp(-t * 9);
        ph += (2 * Math.PI * f) / sr;
        const click = t < 0.012 ? (r() * 2 - 1) * (1 - t / 0.012) * 0.6 : 0;
        o[i] = Math.tanh(1.6 * Math.sin(ph) * Math.exp(-t * 2.6)) * 0.9 + click;
      }
      return o;
    },
    // noise + a rising tone that stops dead at its end
    riser: (sr, r, e) => {
      const d = e.dur ?? 1, n = Math.max(1, Math.floor(sr * d)), o = new Float32Array(n);
      let lp = 0, ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, p = t / d;
        lp += (0.02 + 0.5 * p * p) * (r() * 2 - 1 - lp);
        ph += (2 * Math.PI * (220 + 660 * p * p)) / sr;
        o[i] = (lp * 0.8 + Math.sin(ph) * 0.12) * p * p * (i > n - 64 ? (n - i) / 64 : 1);
      }
      return o;
    },
    // a low root + fifth, slowly breathing
    drone: (sr, r, e) => {
      const d = e.dur ?? 2, n = Math.max(1, Math.floor(sr * d)), o = new Float32Array(n), f = 440 * 2 ** ((e.midi - 69) / 12);
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.min(1, t / 0.15) * Math.min(1, (d - t) / 0.12);
        o[i] = (Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * 1.5 * t) * 0.25 + Math.sin(2 * Math.PI * f * 2 * t) * 0.12) * env * (0.8 + 0.2 * Math.sin(t * 5));
      }
      return o;
    },
  },
};
