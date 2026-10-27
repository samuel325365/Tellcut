// Hijaz route (from the chili-history film's spice-route): a low drone (root + fifth) under an oud-like pluck on the Hijaz scale
// (1 b2 3 4 5 b6 b7 — in D: D Eb F# G A Bb C), a breathy flute, frame drum dum/tek and a shaker. The original changed density at its
// five chapter times and wrote its sound effects (stamps, page turns, sizzle, pour, fire…) into the score; here the density follows
// the arrangement (hijazPlan) and the sound effects are gone — place common.page / common.sizzle / common.pour… with c.sfx.
//   open    the opening bars: drum hits, the oud every other bar
//   sparse  the first layer: oud on the beats, a long flute note, a soft dum (the original's "Americas" chapter)
//   full    the second: the whole oud cell, frame drum and shaker (the sea route)
//   rich    the third: the same with a pad (landing)
//   hush    a breath about 70 % in once the film is 16 bars or more: only the drone and a bell (the "pain" chapter)
//   return  after it (or the outro bar): the theme with flute and drums
// and it closes on the major chord of the Hijaz tonic, rolled once over the drone.

const HIJAZ = [0, 1, 4, 5, 7, 8, 10];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// ---- small DSP helpers for the voices
function lp(x, f, sr) { const a = Math.exp((-2 * Math.PI * f) / sr); let y = 0; for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; x[i] = y; } return x; }
function bp(x, f, q, sr) {
  const w = (2 * Math.PI * f) / sr, al = Math.sin(w) / (2 * q), b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * Math.cos(w), a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
const noise = (n, r) => { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = r() * 2 - 1; return x; };

/** the section of every bar (see the header); `role` / `layers` are the arrangement's */
export function hijazPlan(bars, role, layers) {
  const last = bars - 1, plan = Array.from({ length: bars }, (_, b) => (b === last ? 'end' : role(b) === 'intro' ? 'open' : ['sparse', 'sparse', 'full', 'rich'][layers(b)]));
  let hush = -1;
  if (bars >= 16) {
    const len = Math.max(2, Math.round(bars * 0.1)), start = Math.min(Math.round(bars * 0.72), last - 2 - len);
    for (let b = start; b < start + len; b++) plan[b] = 'hush';
    hush = start + len;
  }
  for (let b = hush >= 0 ? hush : last - 1; b < last; b++) if (hush >= 0 || role(b) === 'outro') plan[b] = 'return';
  return plan;
}

/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'hijaz-route',
  label: '香料航線',
  doc: '中東／絲路味：低音持續音（主音＋五度）上的希賈茲音階烏德琴撥弦、長笛、框鼓 dum/tek 與沙鈴（84 BPM），依片長由疏到滿、長片在七成處只剩嗡聲與鈴、最後回主題收在大和弦；歷史、地圖、航海、香料、古文明、市集的解說片',
  defaults: { bpm: 84, key: 'D' },
  // the notes it plays, above the key's root: the Hijaz scale (the key only names the root)
  scale: HIJAZ,
  swing: 0.06,
  build(c) {
    const out = [];
    const push = (t, inst, vel, pan = 0, midi, dur) => { if (t >= 0) out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) }); };
    const D = 48 + c.key.root - (c.key.root > 6 ? 12 : 0);
    const note = (deg, oct = 0) => D + HIJAZ[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + oct);
    const plan = hijazPlan(c.bars, c.role, c.layers), last = c.bars - 1, bar = c.bar, beat = c.beat;
    // melodic cells (scale degrees from 0, 8 eighths; null = rest)
    const cells = [
      [0, null, 1, 2, 3, null, 2, 1],
      [4, null, 3, 2, 1, 2, 1, 0],
      [4, 5, 4, 3, 2, null, 1, 2],
      [7, null, 6, 5, 4, 5, 4, null],
      [2, 3, 4, null, 3, 2, 1, 0],
    ];
    const VEL = { open: 0.5, sparse: 0.55, full: 0.7, rich: 0.62, hush: 0, return: 0.6 };
    for (let b = 0; b < last; b++) {
      const t0 = c.at(b, 0), s = plan[b], fill = c.role(b) === 'fill';
      // the drone, two bars at a time (and fresh where a section starts), never past the closing bar
      if (b % 2 === 0 || plan[b - 1] !== s) {
        const len = bar * Math.min(2, last - b) * 1.1;
        push(t0, 'drone', s === 'hush' ? 0.75 : 0.55, 0, D - 12, len);
        if (s !== 'hush') push(t0, 'drone', 0.32, 0, D - 5, len);
      }
      const cell = cells[(b + (s === 'full' ? 1 : 0)) % cells.length], v = VEL[s];
      if (v > 0 && !(s === 'open' && b % 2 === 1)) cell.forEach((d, i) => {
        if (d === null || (s === 'sparse' && i % 2 === 1)) return;
        push(t0 + i * beat / 2, 'oud', v * (i % 2 ? 0.8 : 1), -0.25 + (i % 3) * 0.2, note(d, 1), beat * 1.1);
      });
      // a long flute note every other bar in the sparse and return sections (and now and then in a long rich one)
      if ((s === 'sparse' || s === 'return' || (s === 'rich' && b % 8 < 2)) && b % 2 === 0) push(t0, 'flute', 0.32, 0.2, note(cell[0] ?? 4, 2), bar * Math.min(1.6, last - b));
      // frame drum
      if (s === 'open') for (const [bt, inst, vel] of [[0, 'dum', 0.9], [2, 'dum', 0.7], [3, 'tek', 0.5]]) push(t0 + bt * beat, inst, vel, inst === 'tek' ? 0.2 : 0);
      if (s === 'sparse') for (const bt of [0, 2]) push(t0 + bt * beat, 'dum', bt ? 0.4 : 0.55, 0);
      if (s === 'full' || s === 'rich' || s === 'return') {
        const pat = [[0, 'dum', 0.9], [1.5, 'tek', 0.45], [2, 'tek', 0.6], [2.5, 'dum', 0.65], [3.5, 'tek', 0.4]];
        for (const [bt, inst, vel] of pat) if (!(fill && bt >= 3)) push(t0 + bt * beat, inst, vel, inst === 'tek' ? 0.2 : 0);
        if (fill) for (let i = 0; i < 4; i++) push(t0 + (3 + i / 4) * beat, 'tek', 0.3 + i * 0.1, 0.2);
        for (let i = 0; i < 8; i++) push(t0 + i * beat / 2, 'shaker', i % 2 ? 0.28 : 0.18, 0.35);
      }
      if (s === 'rich' && b % 2 === 0) for (const d of [0, 2, 4]) push(t0, 'pad', 0.18, d - 2 > 0 ? 0.2 : -0.2, note(d, 0), bar * Math.min(2, last - b));
      if (s === 'hush' && b % 2 === 1) push(t0 + beat, 'bell', 0.32, 0.15, note([4, 1, 5, 2][b % 4], 2), beat * 3);
    }
    // the closing chord: the major chord on the Hijaz tonic, rolled once over the drone
    const tE = c.at(last, 0);
    [D - 12, D, D + 4, D + 7, D + 12, D + 16].forEach((m, k) => push(tE + k * 0.06, k < 2 ? 'drone' : 'oud', 0.6, -0.3 + k * 0.12, m, k < 2 ? bar * 1.2 : 3));
    push(tE, 'dum', 1, 0);
    return out;
  },
  voices: {
    drone: (sr, r, e) => {
      const f = mtof(e.midi), n = Math.floor(sr * (e.dur ?? 4)), out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.min(1, t / 0.8) * Math.min(1, (n - i) / (sr * 1.0));
        const trem = 1 + 0.12 * Math.sin(2 * Math.PI * 0.23 * t);
        let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * t + h * 0.7) / (h * h * 0.6 + 0.4);
        out[i] = env * trem * v * 0.28;
      }
      return lp(out, 1400, sr);
    },
    oud: (sr, r, e) => {
      // Karplus–Strong with a darker loop
      const f = mtof(e.midi), n = Math.floor(sr * Math.min(2.5, e.dur ?? 1)), P = Math.max(2, Math.round(sr / f)), buf = new Float32Array(P), out = new Float32Array(n);
      for (let i = 0; i < P; i++) buf[i] = (r() * 2 - 1) * (1 - i / P * 0.3);
      let idx = 0, last = 0;
      for (let i = 0; i < n; i++) { const y = buf[idx], nxt = buf[(idx + 1) % P]; const v = 0.5 * (y + nxt) * 0.994; buf[idx] = v; idx = (idx + 1) % P; last = 0.7 * last + 0.3 * y; out[i] = last * Math.min(1, (n - i) / (sr * 0.05)); }
      return lp(out, 3200, sr);
    },
    flute: (sr, r, e) => {
      const f = mtof(e.midi), n = Math.floor(sr * (e.dur ?? 2)), out = new Float32Array(n), br = noise(n, r);
      lp(br, 2500, sr);
      for (let i = 0; i < n; i++) { const t = i / sr, env = Math.min(1, t / 0.25) * Math.min(1, (n - i) / (sr * 0.5)), vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5 * t) * Math.min(1, t / 0.6); out[i] = env * (0.6 * Math.sin(2 * Math.PI * f * vib * t) + 0.15 * Math.sin(4 * Math.PI * f * vib * t) + 0.06 * br[i]); }
      return out;
    },
    dum: (sr, r) => {
      const n = Math.floor(sr * 0.5), out = new Float32Array(n), x = noise(n, r); lp(x, 600, sr);
      for (let i = 0; i < n; i++) { const t = i / sr, f = 70 + 40 * Math.exp(-t * 30); out[i] = Math.exp(-t * 7) * Math.sin(2 * Math.PI * f * t) * 0.9 + x[i] * Math.exp(-t * 40) * 0.5; }
      return out;
    },
    tek: (sr, r) => {
      const n = Math.floor(sr * 0.18), x = noise(n, r); bp(x, 2400, 1.2, sr);
      for (let i = 0; i < n; i++) x[i] *= Math.exp(-(i / sr) * 38) * 1.4;
      return x;
    },
  },
};
