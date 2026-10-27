// Candle glow (from the katie-sweet16 short's own score, there called porchlight): a warm celebration score — felt-ish electric
// piano, a soft string pad, celesta glints, a plucked pulse. Its sections follow the film through cues (c.score(…, { cues })), each
// from its second until the next cue:
//   low     the trouble (rain, a setback): the relative minor, a low drone, sparse low piano, no pulse
//   bright  it turns out fine: the major chord blooms, the pulse comes back, the celesta answers
//   play    a playful moment: bouncing plucks
//   wait    the held breath before a surprise: a suspended chord swelling, a quickening piano
//   shout   the surprise itself: silence for the crowd (2.4 s, or up to the next cue), then bright again
//   party   the party: a gentle groove with shaker and soft snare
//   quiet   the room sings (happy birthday, a speech): only a soft pad, very low
//   tender  the wishes: piano alone
// Before the first cue it is a quiet piano motif. Without cues it opens quietly, blooms, and grooves in the second half.
// The last bar is a rolled tonic chord.
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'candle-glow',
  label: '燭光慶生',
  doc: '溫暖的慶生配樂（72 BPM、大調）：電鋼琴動機、弦樂 pad、鋼片琴點綴、撥弦律動；用 cues 跟著片子走：low 轉小調只剩低音嗡聲、bright 放晴回大調、play 俏皮撥弦、wait 驚喜前懸著、shout 全停讓歡呼、party 輕律動、quiet 只剩 pad 讓現場唱歌、tender 只剩鋼琴；生日、婚禮、畢業、送別、驚喜派對',
  defaults: { bpm: 72, key: 'D' },
  swing: 0.02,
  build(c) {
    const NAMES = ['low', 'bright', 'play', 'wait', 'shout', 'party', 'quiet', 'tender'];
    const marks = NAMES.filter((n) => Number.isFinite(c.cues[n])).map((n) => [c.cues[n], n]).sort((a, b) => a[0] - b[0]);
    const end = c.at(c.bars, 0), half = Math.floor(c.bars / 2);
    // the section at film time t
    const section = (t, bar) => {
      if (!marks.length) return c.role(bar) === 'intro' ? 'gentle' : bar >= half && c.layers(bar) >= 2 ? 'party' : 'bright';
      let cur = 'gentle', from = 0, next = end;
      for (let i = 0; i < marks.length; i++) if (t >= marks[i][0] - 0.05) { cur = marks[i][1]; from = marks[i][0]; next = marks[i + 1]?.[0] ?? end; }
      if (cur === 'shout' && t >= Math.min(next, from + 2.4)) return 'after';
      return cur;
    };
    const PROG = {
      gentle: [1, 4, 6, 5], low: [6, 4, 6, 3], bright: [1, 5, 6, 4], play: [4, 5, 1, 1], wait: [5, 5, 5, 5], after: [1, 4, 1, 5],
      party: [1, 6, 4, 5], quiet: [1], tender: [4, 1, 2, 5],
    };
    const out = [];
    const push = (t, inst, vel, pan, midi, dur) => {
      if (t < 0) return;
      const sec = section(t, Math.min(c.bars - 1, Math.floor(t / c.bar)));
      if (sec === 'shout') return;                                   // the crowd's shout stands alone
      if (sec === 'quiet' && inst !== 'pad' && inst !== 'sub') return; // the room sings
      out.push({ t, inst, vel: sec === 'quiet' ? vel * 0.35 : vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    };
    const motif = [[0, 5], [0.5, 3], [1, 2], [1.5, 1], [2, 5], [3, 6]];
    for (let b = 0; b < c.bars; b++) {
      const t0 = c.at(b, 0), sec = section(t0 + 0.01, b);
      if (c.role(b) === 'end') {
        c.chordOn(1, { octave: 4 }).forEach((m, k) => push(t0 + k * 0.08, 'epiano', 0.6, -0.3 + k * 0.3, m, c.beat * 6));
        push(t0, 'pad', 0.32, 0, c.scaleNote(1, 4), c.beat * 6);
        push(t0, 'sub', 0.5, 0, c.scaleNote(1, 2), c.beat * 6);
        push(t0 + 0.25, 'bell', 0.35, 0.3, c.scaleNote(8, 5), c.beat * 5);
        continue;
      }
      const prog = PROG[sec] || PROG.gentle, deg = prog[b % prog.length];
      const ch = c.chordOn(deg, { octave: 3 }), up = c.chordOn(deg, { octave: 4 }), bar = (beat) => c.at(b, beat);
      if (sec === 'gentle') {
        // broken chord on the piano, quiet; the celesta motif on even bars, a soft pluck pulse from the second half of the opening
        [ch[0], up[0], up[1], up[2]].forEach((m, k) => push(bar(k), 'epiano', 0.36 - k * 0.03, -0.2 + k * 0.12, m, c.beat * 2.5));
        push(bar(0), 'pad', 0.16, 0, c.scaleNote(deg, 4), c.bar);
        if (b % 2 === 0) motif.forEach(([bt, d]) => push(bar(bt), 'bell', 0.2, 0.3, c.scaleNote(d, 5), c.beat * 1.2));
        if (c.layers(b) >= 1) for (let s = 0; s < 8; s++) push(bar(s / 2), 'pluck', s % 2 ? 0.18 : 0.26, 0.25, s % 2 ? up[2] : up[0], c.beat * 0.8);
      } else if (sec === 'low') {
        push(bar(0), 'pad', 0.3, 0, c.scaleNote(deg, 2), c.bar);
        push(bar(0), 'sub', 0.42, 0, c.scaleNote(deg, 1), c.bar);
        push(bar(0), 'epiano', 0.32, -0.2, ch[0], c.beat * 3);
        push(bar(1.5), 'epiano', 0.24, 0.1, ch[2], c.beat * 2);
        push(bar(3), 'epiano', 0.2, 0.25, up[1], c.beat * 2);
      } else if (sec === 'bright' || sec === 'after' || sec === 'party') {
        const lift = sec === 'party' ? 1 : 0.85;
        push(bar(0), 'pad', 0.26 * lift, 0, c.scaleNote(deg, 4), c.bar);
        push(bar(0), 'pad', 0.18 * lift, 0, c.scaleNote(deg + 2, 4), c.bar);
        push(bar(0), 'bass', 0.42, 0, c.scaleNote(deg, 2), c.beat * 1.6);
        push(bar(2), 'bass', 0.32, 0, c.scaleNote(deg + 4, 2), c.beat * 1.4);
        const pat = [ch[0], up[0], up[1], up[2], up[0], up[1], up[2], up[1]];
        for (let s = 0; s < 8; s++) push(bar(s / 2), 'epiano', (s === 0 ? 0.36 : 0.26) * lift, -0.25 + (s % 4) * 0.15, pat[s], c.beat * 1.4);
        if (sec !== 'bright' || b % 2 === 1) [[0, 5], [1, 6], [1.5, 5], [2, 3], [3, 2]].forEach(([bt, d]) => push(bar(bt), 'bell', 0.24, 0.3, c.scaleNote(d + (deg === 4 ? 1 : 0), 5), c.beat * 1.2));
        if (sec !== 'bright') {
          for (let s = 0; s < 8; s++) push(bar(s / 2), 'shaker', s % 2 ? 0.12 : 0.18, 0.35);
          if (sec === 'party') for (const bt of [1, 3]) push(bar(bt), 'softSnare', 0.13, -0.05);
        }
      } else if (sec === 'play') {
        const pat = [up[0], up[2], up[1], up[2]];
        for (let s = 0; s < 8; s++) push(bar(s / 2), 'pluck', s % 2 ? 0.22 : 0.32, s % 2 ? 0.3 : -0.3, pat[s % 4] + 12, c.beat * 0.5);
        push(bar(0), 'bass', 0.38, 0, c.scaleNote(deg, 2), c.beat * 0.8);
        push(bar(2), 'bass', 0.3, 0, c.scaleNote(deg, 2), c.beat * 0.8);
        push(bar(0), 'pad', 0.14, 0, c.scaleNote(deg, 4), c.bar);
      } else if (sec === 'wait') {
        // a suspended chord over the fifth (the fourth above it held), swelling; the piano quickening on it
        push(bar(0), 'pad', 0.3, 0, c.scaleNote(5, 3), c.bar * 1.1);
        push(bar(0), 'pad', 0.26, 0, c.scaleNote(8, 3), c.bar * 1.1);
        push(bar(0), 'pad', 0.22, 0, c.scaleNote(9, 3), c.bar * 1.1);
        for (let s = 0; s < 8; s++) push(bar(s / 2), 'epiano', 0.12 + s * 0.015, 0.2, c.scaleNote(s % 2 ? 9 : 8, 4), c.beat * 0.6);
      } else if (sec === 'quiet') {
        push(bar(0), 'pad', 0.3, 0, c.scaleNote(1, 3), c.bar);
      } else if (sec === 'tender') {
        [ch[0], up[0], up[1], up[2], up[1], up[0]].forEach((m, k) => push(bar(k * 0.66), 'epiano', 0.3 - k * 0.02, -0.2 + k * 0.08, m, c.beat * 2.4));
        if (b % 2 === 1) push(bar(2), 'bell', 0.16, 0.3, c.scaleNote(deg + 4, 5), c.beat * 2);
      }
    }
    return out.sort((a, b) => a.t - b.t);
  },
};
