// Rail beat: a driving 120 BPM A-minor beat for a cut-to-the-beat travel edit (from the uk-beat short's rail-pulse), laid out by
// the number of bars: a half-time opening with a stamp hit, the first city in four-on-the-floor (three slams, a photo-burst bar of
// blips, a fill), a drum drop + riser at each change of city with the arrival on beat 3, sixteenth hats and a pulse hook for the
// replay, an eighth/sixteenth snare build, a one-beat break with three stamps, and one big closing hit. At 16 bars it is exactly
// uk-beat's plan; longer films get more cities and a longer replay, shorter ones drop the cities first.

/** the section of every bar for a film of `bars` bars (see the header) */
export function railPlan(bars) {
  const B = Math.max(0, Math.floor(bars));
  if (B === 0) return [];
  if (B === 1) return ['end'];
  const tail = B >= 5 ? ['build', 'break', 'end'] : B >= 3 ? ['break', 'end'] : ['end'];
  const M = B - 1 - tail.length, replay = M >= 6 ? Math.max(1, Math.round(M / 4)) : 0, S = M - replay;
  const jumps = S >= 4 ? Math.max(1, Math.round(S / 4.5)) : 0, grooves = S - jumps, each = jumps ? Math.max(0, Math.floor((grooves - 4) / jumps)) : 0;
  const L0 = grooves - jumps * each;
  // the first city: three slams, plain grooves, the photo-burst bar, a fill into the first jump
  const first = L0 <= 0 ? [] : L0 === 1 ? ['g1fill'] : L0 === 2 ? ['arc', 'g1fill'] : ['arc', ...Array(Math.max(0, L0 - 3)).fill('g1'), 'food', 'g1fill'];
  const legs = [];
  for (let j = 0; j < jumps; j++) legs.push('jump', ...(j < jumps - 1 ? (each ? [...Array(each - 1).fill('g2'), 'g2fill'] : []) : Array(each).fill('g2')));
  return ['open', ...first, ...legs, ...Array(replay).fill('g3'), ...tail];
}
const PROG = [1, 6, 3, 7];
// a two-bar hook in scale degrees (eighth notes; 0 = rest)
const HOOK = [5, 0, 5, 8, 7, 0, 5, 3, 5, 0, 5, 8, 10, 9, 8, 7];

/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'rail-beat',
  label: '車站節拍',
  doc: '120 BPM 小調電子節拍：半速開場重拍、四拍底鼓、換城市時抽鼓上升再重拍抵達、回放段十六分音符鈸與脈衝主旋律、小鼓推進、斷拍後一記重拍收尾；依小節數自動排段落；對拍快剪、旅行節奏剪輯、多城市旅行',
  defaults: { bpm: 120, key: 'Am' },
  swing: 0,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan = 0, midi, dur) => out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    const plan = railPlan(c.bars), sec = (b) => plan[b] ?? 'g1';
    const hit = (t, big = 1) => { push(t, 'kick', 1, 0); push(t, 'crash', 0.75 * big, 0.15); push(t, 'thunk', 0.9 * big, 0); };
    const stab = (t, deg, v = 0.5, len = c.beat * 0.45) => c.chordOn(deg, { octave: 4 }).forEach((m, k) => push(t + k * 0.004, 'stab', v, -0.25 + k * 0.25, m, len));
    const bassLine = (b, deg, from = 0, to = 4, full = false) => {
      const root = c.scaleNote(deg, 2);
      for (let s = from * 2; s < to * 2; s++) {
        const on = s % 2 === 1 || full;
        if (!on) continue;
        push(c.at(b, s / 2), 'bass', s % 2 ? 0.8 : 0.9, 0, s % 4 === 3 && full ? root + 12 : root, c.beat * 0.42);
      }
    };
    const four = (b, from = 0, to = 4, v = 0.95) => { for (let q = from; q < to; q++) push(c.at(b, q), 'kick', v, 0); };
    const backbeat = (b, from = 0, to = 4) => { for (const q of [1, 3]) if (q >= from && q < to) { push(c.at(b, q), 'clap', 0.7, 0.05); push(c.at(b, q), 'snare', 0.45, -0.05); } };
    const hats = (b, n, from = 0, to = 4, v = 0.42) => {
      for (let s = from * n; s < to * n; s++) push(c.at(b, s / n), 'hat', v * (s % (n / 2 || 1) === 0 ? 0.75 : 1) * (n === 4 && s % 2 ? 0.7 : 1), -0.3);
    };
    const arp = (b, deg, v = 0.32) => { const ch = c.chordOn(deg, { octave: 5 }); for (let s = 0; s < 16; s++) push(c.at(b, s / 4), 'pluck', v * (s % 4 === 0 ? 1 : 0.7), 0.3 - (s % 3) * 0.2, ch[[0, 1, 2, 1][s % 4]], c.beat * 0.5); };
    const hook = (b, half) => { for (let s = 0; s < 8; s++) { const d = HOOK[half * 8 + s]; if (d) push(c.at(b, s / 2), 'lead', 0.42, 0.1, c.scaleNote(d, 4), c.beat * 0.42); } };
    const riser = (b, from, len, v = 0.6) => push(c.at(b, from), 'riser', v, 0, undefined, len);

    for (let b = 0; b < c.bars; b++) {
      const kind = sec(b), deg = PROG[b % 4], t0 = c.at(b, 0);
      if (kind === 'end') {
        // the strongest hit: kick, crash, stamp, sub and a wide A-minor stab, left to ring
        hit(t0, 1.2);
        push(t0, 'sub', 0.95, 0, c.scaleNote(1, 1), c.beat * 4);
        c.chordOn(1, { octave: 3 }).concat(c.chordOn(1, { octave: 4 })).forEach((m, k) => push(t0 + k * 0.003, 'stab', 0.5, -0.4 + k * 0.16, m, c.beat * 3));
        push(t0, 'openHat', 0.5, -0.3);
        continue;
      }
      if (kind === 'open') {
        hit(t0, 1);
        push(t0, 'sub', 0.8, 0, c.scaleNote(deg, 1), c.bar);
        push(c.at(b, 2), 'kick', 0.85, 0); push(c.at(b, 2), 'snare', 0.55, 0); push(c.at(b, 2), 'clap', 0.5, 0);
        hats(b, 2, 0, 4, 0.3);
        stab(c.at(b, 0), deg, 0.45, c.beat * 1.5);
        continue;
      }
      if (kind === 'arc') {
        // three slams for the three bands, then a lift into the groove
        for (const q of [0, 1, 2]) { push(c.at(b, q), 'kick', 1, 0); push(c.at(b, q), 'thunk', 0.85, 0); stab(c.at(b, q), deg, 0.42); }
        push(t0, 'crash', 0.5, 0.2);
        hats(b, 2, 0, 4, 0.32);
        push(c.at(b, 3), 'snare', 0.4, 0); push(c.at(b, 3.5), 'snare', 0.55, 0);
        riser(b, 2, c.beat * 2, 0.35);
        continue;
      }
      if (kind === 'jump') {
        // drums out for two beats (the map), riser, arrival with a crash on beat 3
        riser(b, 0, c.beat * 2, 0.7);
        push(t0, 'sub', 0.6, 0, c.scaleNote(deg, 1), c.beat * 2);
        for (let s = 0; s < 4; s++) push(c.at(b, s / 2), 'blip', 0.28 + s * 0.06, 0.2, c.scaleNote(5 + s, 5), 0.09);
        hit(c.at(b, 2), 1);
        four(b, 3, 4); backbeat(b, 2, 4); hats(b, 2, 2, 4, 0.4); bassLine(b, deg, 2, 4);
        stab(c.at(b, 2), deg, 0.5); stab(c.at(b, 3.5), deg, 0.4);
        continue;
      }
      // grooves
      const lv = kind === 'g3' || kind === 'build' || kind === 'break' ? 3 : kind.startsWith('g2') ? 2 : 1;
      const stop = kind === 'break' ? 2 : 4;   // the break: last two beats without drums
      four(b, 0, stop); backbeat(b, 0, stop);
      hats(b, lv >= 3 ? 4 : 2, 0, stop, lv >= 3 ? 0.36 : 0.4);
      if (lv >= 2) for (let q = 0; q < stop; q++) push(c.at(b, q + 0.5), 'openHat', 0.22, -0.3);
      bassLine(b, deg, 0, stop, lv >= 2);
      for (const q of [0, 1.5, 2.5]) if (q < stop) stab(c.at(b, q), deg, lv >= 3 ? 0.4 : 0.36);
      if (lv >= 2) arp(b, deg, lv >= 3 ? 0.26 : 0.22);
      if (lv >= 3 && kind !== 'break') hook(b, b % 2);
      if (kind === 'food') for (let q = 0; q < 4; q++) push(c.at(b, q), 'blip', 0.5, 0.25, c.scaleNote(8 + (q % 2) * 2, 5), 0.1);
      if (kind === 'g1fill') { for (let s = 0; s < 4; s++) push(c.at(b, 3 + s / 4), 'snare', 0.35 + s * 0.12, 0); push(c.at(b, 1), 'blip', 0.5, 0.25, c.scaleNote(8, 5), 0.1); }
      if (kind === 'g2fill') for (let s = 0; s < 4; s++) push(c.at(b, 3 + s / 4), 'tom', 0.55 + s * 0.08, -0.3 + s * 0.2, [57, 53, 50, 45][s], c.beat * 0.4);
      if (kind === 'build') { for (let s = 0; s < 8; s++) push(c.at(b, s / 2), 'snare', 0.25 + s * 0.05, 0); riser(b, 2, c.beat * 2, 0.4); }
      if (kind === 'break') {
        for (let s = 0; s < 8; s++) push(c.at(b, s / 4), 'snare', 0.4 + s * 0.04, 0);
        // the three stamps on half beats, a sixteenth roll and the riser into the last hit
        for (let i = 0; i < 3; i++) { push(c.at(b, 2 + i * 0.5), 'thunk', 1, 0); push(c.at(b, 2 + i * 0.5), 'blip', 0.55, 0.2, c.scaleNote(5 + i * 2, 5), 0.12); }
        for (let s = 0; s < 8; s++) push(c.at(b, 2 + s / 4), 'snare', 0.3 + s * 0.07, 0);
        riser(b, 2, c.beat * 2, 0.75);
        push(c.at(b, 2), 'sub', 0.5, 0, c.scaleNote(5, 1), c.beat * 2);
      }
    }
    return out;
  },
  voices: {
    // a bright detuned saw stab (additive, so it is clean), short decay
    stab: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), d = Math.max(0.08, e.dur ?? 0.22), n = Math.floor(sr * (d + 0.12)), out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.min(1, t / 0.004) * Math.exp(-t * (3.2 / d)) * (t > d ? Math.exp(-(t - d) * 30) : 1);
        let v = 0;
        for (let h = 1; h <= 9; h++) v += (Math.sin(2 * Math.PI * f * h * t) + Math.sin(2 * Math.PI * f * 1.006 * h * t)) / (h * 1.3);
        out[i] = env * v * 0.22;
      }
      return out;
    },
    // a square-ish pulse lead with a little vibrato-free bite
    lead: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), d = e.dur ?? 0.2, n = Math.floor(sr * (d + 0.08)), out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.min(1, t / 0.005) * Math.exp(-t * 4) * (t > d ? Math.exp(-(t - d) * 40) : 1);
        let v = 0;
        for (let h = 1; h <= 9; h += 2) v += Math.sin(2 * Math.PI * f * h * t) / h;
        out[i] = env * v * 0.5;
      }
      return out;
    },
    // a short high sine blip (photo flashes, map ticks)
    blip: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), n = Math.floor(sr * 0.14), out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr; out[i] = Math.exp(-t * 38) * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)); }
      return out;
    },
    // crash cymbal: bright noise, first difference for a high-pass, long decay
    crash: (sr, r) => {
      const n = Math.floor(sr * 1.6), out = new Float32Array(n);
      let prev = 0;
      for (let i = 0; i < n; i++) { const t = i / sr, x = r() * 2 - 1; out[i] = (x - prev) * 0.5 * Math.exp(-t * 2.6) * Math.min(1, t / 0.002); prev = x; }
      return out;
    },
    // the ticket stamp: a falling low thud with a click on top
    thunk: (sr, r) => {
      const n = Math.floor(sr * 0.25), out = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, f = 55 + 110 * Math.exp(-t * 30);
        ph += (2 * Math.PI * f) / sr;
        out[i] = Math.sin(ph) * Math.exp(-t * 14) * 0.9 + (t < 0.006 ? (r() * 2 - 1) * (1 - t / 0.006) * 0.6 : 0);
      }
      return out;
    },
    // noise riser: gets louder and brighter over its length, cut off right at the end (the hit takes over)
    riser: (sr, r, e) => {
      const d = e.dur ?? 1, n = Math.floor(sr * d), out = new Float32Array(n);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const p = i / n, x = r() * 2 - 1, a = 0.02 + 0.5 * p * p;
        lp += a * (x - lp);
        out[i] = (x - lp * 0.6) * 0.15 * p * p * (p > 0.97 ? (1 - p) / 0.03 : 1) + lp * 0.35 * p;
      }
      return out;
    },
  },
};
