// Sunny hop (from the outdoor-brand acceptance film's own score, there called tide-pop): a bright, bouncy bed for kinetic type and
// playful brand films (108 BPM, D major). Ukulele-like off-beat plucks,
// a bouncing bass with octave pops, claps on 2 and 4, a marimba hook, and a "bloop" (a water drop) as its own colour.
// Sections follow the film through cues, each from its second until the next:
//   open    (0)        plucks and bloops only, the hook on the marimba, no drums
//   groove  (cues.groove)  kick, clap, shaker and the bouncing bass come in
//   lift    (cues.lift)    a touch fuller: off-beat hats, bell glints, the second hook
//   breath  (cues.breath)  silence
//   rise    (cues.rise)    a pad swells, plucks climb, a snare roll into the hit
//   hit     (cues.hit)     one big chord with kick, clap, bell and sub; then a light tail to the last chord
// Without cues the sections fall at shares of the length (no hit). A new id, so the source project's own copy keeps loading.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'sunny-hop',
  label: '晴天小跳步',
  doc: '明亮彈跳的配樂（108 BPM、大調）：反拍撥弦、八度跳的貝斯、拍手、木琴勾子、水滴「啵」聲；cues：groove 進鼓、lift 更滿、breath 抽空、rise 往上堆、hit 標誌重拍；動態大字、戶外、運動、輕快的品牌片',
  defaults: { bpm: 108, key: 'D' },
  swing: 0.04,
  build(c) {
    const NAMES = ['groove', 'lift', 'breath', 'rise', 'hit'];
    const marks = NAMES.filter((n) => Number.isFinite(c.cues[n])).map((n) => [c.cues[n], n]).sort((a, b) => a[0] - b[0]);
    const end = c.at(c.bars, 0);
    const section = (t) => {
      if (!marks.length) { const k = t / end; return k < 0.16 ? 'open' : k < 0.55 ? 'groove' : k < 0.79 ? 'lift' : k < 0.8 ? 'breath' : k < 0.86 ? 'rise' : 'tail'; }
      let cur = 'open', from = 0;
      for (const [m, n] of marks) if (t >= m - 0.02) { cur = n; from = m; }
      if (cur === 'hit' && t >= from + c.beat * 2) return 'tail';
      return cur;
    };
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => {
      if (t < 0 || t >= end) return;
      out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    };
    const PROG = [1, 5, 6, 4];
    const hook = [[0, 5], [0.5, 6], [1, 8], [2, 6], [2.5, 5], [3, 3]];
    const hook2 = [[0, 8], [0.5, 9], [1, 10], [1.5, 9], [2, 8], [3, 6]];
    const hitAt = c.cues.hit;
    if (Number.isFinite(hitAt)) {
      push(hitAt, 'kick', 1, 0); push(hitAt, 'clap', 0.75, 0); push(hitAt, 'openHat', 0.35, 0.3);
      c.chordOn(1, { octave: 3 }).forEach((m, k) => push(hitAt, 'epiano', 0.55, -0.3 + k * 0.3, m, c.bar));
      c.chordOn(1, { octave: 4 }).forEach((m, k) => push(hitAt + k * 0.03, 'bell', 0.42, -0.2 + k * 0.2, m + 12, c.bar));
      push(hitAt, 'pad', 0.34, 0, c.scaleNote(1, 3), c.bar * 1.5);
      push(hitAt, 'sub', 0.6, 0, c.scaleNote(1, 1), c.bar);
      push(hitAt, 'bloop', 0.5, 0.2, c.scaleNote(8, 5), 0.3);
    }
    for (let b = 0; b < c.bars; b++) {
      const t0 = c.at(b, 0);
      if (c.role(b) === 'end') {
        c.chordOn(1, { octave: 4 }).forEach((m, k) => push(t0 + k * 0.06, 'epiano', 0.42, -0.3 + k * 0.3, m, c.beat * 4));
        push(t0, 'pad', 0.24, 0, c.scaleNote(1, 3), c.beat * 4);
        push(t0, 'bass', 0.42, 0, c.scaleNote(1, 2), c.beat * 3);
        push(t0, 'kick', 0.5, 0);
        push(t0 + 0.12, 'marimba', 0.36, 0.3, c.scaleNote(8, 5), c.beat * 2);
        push(t0 + c.beat * 1.5, 'bloop', 0.3, -0.2, c.scaleNote(5, 5), 0.25);
        continue;
      }
      const deg = PROG[b % PROG.length];
      const ch = c.chordOn(deg, { octave: 4 });
      for (let h = 0; h < 8; h++) {
        const t = c.at(b, h / 2), sec = section(t + 0.001);
        if (sec === 'hit' || sec === 'breath') continue;
        const onBeat = h % 2 === 0, beatN = Math.floor(h / 2);
        const strum = (v) => ch.forEach((m, k) => push(t + k * 0.012, 'pluck', v, -0.25 + k * 0.2, m, c.beat * 0.4));
        const hookAt = (mel, v) => { for (const [bt, d] of mel) if (Math.abs(bt * 2 - h) < 0.01) push(t, 'marimba', v, 0.25, c.scaleNote(d, 5), c.beat); };
        if (sec === 'open') {
          if (!onBeat) strum(0.2);
          if (onBeat && beatN === 0) push(t, 'bass', 0.3, 0, c.scaleNote(deg, 2), c.beat * 1.5);
          if (b % 2 === 1) hookAt(hook, 0.3);
          if (b % 2 === 0 && h === 0) push(t + c.beat * 3.5, 'bloop', 0.32, 0.3, c.scaleNote(5, 5), 0.25);
        } else if (sec === 'groove' || sec === 'lift' || sec === 'tail') {
          const lift = sec === 'lift' ? 1.1 : sec === 'tail' ? 0.75 : 1;
          if (onBeat && (beatN === 0 || beatN === 2)) push(t, 'kick', 0.8 * lift, 0);
          if (h === 5 && sec !== 'tail') push(t, 'kick', 0.4 * lift, 0);
          if (onBeat && (beatN === 1 || beatN === 3)) push(t, 'clap', 0.48 * lift, 0);
          push(t, 'shaker', onBeat ? 0.16 : 0.11, 0.35);
          if (!onBeat) strum(0.24 * lift);
          // the bouncing bass: root on the beat, octave pop on the "and" of 2 and 4
          if (onBeat) push(t, 'bass', 0.46 * lift, 0, c.scaleNote(deg, 2), c.beat * 0.45);
          if (h === 3 || h === 7) push(t, 'bass', 0.32 * lift, 0, c.scaleNote(deg, 3), c.beat * 0.3);
          hookAt(sec === 'lift' && b % 2 ? hook2 : hook, 0.36 * lift);
          if (sec === 'lift' && !onBeat) push(t, 'hat', 0.12, -0.3);
          if (sec === 'lift' && h === 6 && b % 2 === 0) push(t, 'bell', 0.2, 0.4, c.scaleNote(deg + 7, 5), c.beat * 1.5);
          if (h === 6 && b % 4 === 3) push(t + c.beat * 0.5, 'bloop', 0.3, -0.3, c.scaleNote(8, 5), 0.25);
        } else if (sec === 'rise') {
          const k = Math.min(1, (t - (c.cues.rise ?? 0)) / Math.max(0.5, (hitAt ?? end) - (c.cues.rise ?? 0)));
          if (h === 0) { push(t, 'pad', 0.18 + 0.14 * k, 0, c.scaleNote(deg, 3), c.bar); push(t, 'pad', 0.12 + 0.1 * k, 0, c.scaleNote(deg + 4, 3), c.bar); }
          push(t, 'pluck', 0.16 + 0.18 * k, h % 2 ? 0.25 : -0.25, ch[h % 3] + (k > 0.5 ? 12 : 0), c.beat * 0.35);
          if (k > 0.6) { push(t, 'softSnare', 0.12 + 0.3 * k, 0); push(t + c.beat / 4, 'softSnare', 0.1 + 0.28 * k, 0); }
        }
      }
    }
    return out.sort((a, b) => a.t - b.t);
  },
  voices: {
    // a water drop: a sine that slides up fast, then dies
    bloop: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), n = Math.floor(sr * (e.dur ?? 0.25)), out = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; ph += 2 * Math.PI * f * (0.6 + 0.4 * Math.min(1, t / 0.03) + 0.25 * Math.min(1, t / 0.12)) / sr; out[i] = Math.sin(ph) * Math.exp(-t / 0.06) * 0.8; }
      return out;
    },
  },
};
