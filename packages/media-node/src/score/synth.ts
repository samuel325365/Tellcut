// The score generator's instruments (toolkit phase 3): each returns one mono note or hit as samples. Anything random takes the seeded `rng`
// it is given, so a score renders to the same samples every time.
export type Rng = () => number;

/** Park-Miller, the same generator the engine uses for particles. */
export function rng(seed: number): Rng {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const TAU = Math.PI * 2;
const fadeEnd = (x: Float32Array, n: number) => { const k = Math.min(n, x.length); for (let i = 0; i < k; i++) x[x.length - 1 - i] *= i / k; return x; };
function onePoleLP(x: Float32Array, sr: number, cutoff: number) {
  const a = Math.exp((-TAU * cutoff) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; x[i] = y; }
  return x;
}

/** Karplus–Strong plucked string. */
export function pluck(sr: number, r: Rng, freq: number, dur = 1.2, bright = 0.5): Float32Array {
  const n = Math.floor(dur * sr), out = new Float32Array(n), p = Math.max(2, Math.round(sr / freq)), buf = new Float32Array(p);
  for (let i = 0; i < p; i++) buf[i] = r() * 2 - 1;
  onePoleLP(buf, sr, 2000 + bright * 6000);
  const damp = 0.996 - (1 - bright) * 0.004;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const a = buf[idx], b = buf[(idx + 1) % p];
    out[i] = a;
    buf[idx] = (a + b) * 0.5 * damp;
    idx = (idx + 1) % p;
  }
  return fadeEnd(out, Math.floor(0.03 * sr));
}

/** Marimba: a few inharmonic partials with quick decays. */
export function marimba(sr: number, freq: number, dur = 0.7, vel = 1): Float32Array {
  const n = Math.floor(dur * sr), out = new Float32Array(n), parts = [[1, 1, 6], [3.93, 0.35, 18], [9.2, 0.12, 40]];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (const [ratio, a, d] of parts) v += a * Math.sin(TAU * freq * ratio * t) * Math.exp(-d * t);
    out[i] = v * Math.min(1, t / 0.002) * vel * 0.6;
  }
  return fadeEnd(out, Math.floor(0.01 * sr));
}

/** Bell / glockenspiel. */
export function bell(sr: number, freq: number, dur = 1.5, vel = 1): Float32Array {
  const n = Math.floor(dur * sr), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = (Math.sin(TAU * freq * t) * Math.exp(-3 * t) + 0.4 * Math.sin(TAU * freq * 2.76 * t) * Math.exp(-9 * t) + 0.2 * Math.sin(TAU * freq * 5.4 * t) * Math.exp(-16 * t)) * Math.min(1, t / 0.001) * vel * 0.35;
  }
  return fadeEnd(out, Math.floor(0.02 * sr));
}

/** Electric piano: two-operator FM whose brightness falls as the note rings. */
export function epiano(sr: number, freq: number, dur = 1.6, vel = 1): Float32Array {
  const n = Math.floor(dur * sr), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr, idx = 1.6 * Math.exp(-3.5 * t) + 0.25;
    const mod = Math.sin(TAU * freq * t) * idx;
    out[i] = (Math.sin(TAU * freq * t + mod) * Math.exp(-1.6 * t) + 0.12 * Math.sin(TAU * freq * 2 * t) * Math.exp(-5 * t)) * Math.min(1, t / 0.004) * vel * 0.5;
  }
  return fadeEnd(out, Math.floor(0.04 * sr));
}

/** Round plucky bass. */
export function bass(sr: number, freq: number, dur = 0.4, vel = 1): Float32Array {
  const n = Math.floor(dur * sr), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += freq / sr;
    const s = Math.sin(TAU * ph) + 0.25 * Math.sin(2 * TAU * ph) + 0.1 * Math.sin(3 * TAU * ph);
    out[i] = s * Math.min(1, t / 0.004) * Math.exp(-3.2 * t) * vel * 0.55;
  }
  return fadeEnd(out, Math.floor(0.01 * sr));
}

/** Long bass note with almost no decay (a drone or a held root). */
export function sub(sr: number, freq: number, dur = 2, vel = 1): Float32Array {
  const n = Math.floor(dur * sr), out = new Float32Array(n), a = Math.floor(0.05 * sr);
  for (let i = 0; i < n; i++) out[i] = Math.sin((TAU * freq * i) / sr) * Math.min(1, i / a) * vel * 0.5;
  return fadeEnd(out, Math.floor(0.2 * sr));
}

/** Slow pad: a few detuned sawtooth voices (summed as harmonics, so they cannot alias), soft attack and release. */
export function pad(sr: number, freq: number, dur = 3, vel = 1, bright = 0.4): Float32Array {
  const n = Math.floor(dur * sr), out = new Float32Array(n), harm = Math.max(2, Math.min(14, Math.floor(1800 / freq))), det = [0.994, 1, 1.006];
  const atk = Math.min(0.7, dur * 0.3) * sr, rel = Math.min(1.0, dur * 0.4) * sr;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (const d of det) for (let h = 1; h <= harm; h++) v += Math.sin(TAU * freq * d * h * t) / Math.pow(h, 1.3 - bright * 0.6);
    const env = Math.min(1, i / atk) * Math.min(1, (n - i) / rel);
    out[i] = (v / det.length) * env * vel * 0.16;
  }
  return out;
}

/** Tech pulse: a band-limited square-ish note whose brightness snaps shut. */
export function pulse(sr: number, freq: number, dur = 0.18, vel = 1): Float32Array {
  const n = Math.floor(dur * sr), out = new Float32Array(n), harm = Math.max(1, Math.min(9, Math.floor(3500 / freq)));
  for (let i = 0; i < n; i++) {
    const t = i / sr, open = Math.exp(-22 * t);
    let v = 0;
    for (let h = 1; h <= harm; h += 2) v += (Math.sin(TAU * freq * h * t) / h) * (h === 1 ? 1 : open);
    out[i] = v * Math.min(1, t / 0.002) * Math.exp(-6 * t) * vel * 0.5;
  }
  return fadeEnd(out, Math.floor(0.008 * sr));
}

export function kick(sr: number, r: Rng, vel = 1): Float32Array {
  const n = Math.floor(0.42 * sr), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (46 + 120 * Math.exp(-t * 28)) / sr;
    out[i] = (Math.sin(TAU * ph) * Math.exp(-t * 7.5) + (t < 0.004 ? (r() * 2 - 1) * 0.3 : 0)) * vel * 0.9;
  }
  return fadeEnd(out, Math.floor(0.01 * sr));
}

export function snare(sr: number, r: Rng, vel = 1, soft = false): Float32Array {
  const n = Math.floor(0.22 * sr), out = new Float32Array(n);
  let ph = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += 190 / sr;
    lp += (soft ? 0.25 : 0.6) * ((r() * 2 - 1) - lp);
    out[i] = (lp * Math.exp(-t * (soft ? 22 : 17)) * 0.8 + Math.sin(TAU * ph) * Math.exp(-t * 30) * 0.4) * vel * 0.6;
  }
  return fadeEnd(out, Math.floor(0.01 * sr));
}

export function clap(sr: number, r: Rng, vel = 1): Float32Array {
  const n = Math.floor(0.2 * sr), out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, burst = [0, 0.011, 0.023].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) * 70) : 0), 0);
    lp += 0.5 * ((r() * 2 - 1) - lp);
    out[i] = lp * (burst * 0.4 + Math.exp(-t * 18) * 0.35) * vel * 0.7;
  }
  return fadeEnd(out, Math.floor(0.01 * sr));
}

export function hat(sr: number, r: Rng, vel = 1, open = false): Float32Array {
  const n = Math.floor((open ? 0.2 : 0.06) * sr), out = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, v = r() * 2 - 1;
    out[i] = (v - prev) * Math.exp(-t * (open ? 14 : 55)) * vel * 0.35;
    prev = v;
  }
  return fadeEnd(out, Math.floor(0.005 * sr));
}

export function shaker(sr: number, r: Rng, vel = 1): Float32Array {
  const n = Math.floor(0.09 * sr), out = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, v = r() * 2 - 1;
    out[i] = (v - prev) * Math.min(1, t / 0.012) * Math.exp(-t * 40) * vel * 0.3;
    prev = v;
  }
  return fadeEnd(out, Math.floor(0.005 * sr));
}

/** Soft low tom / timpani-like hit (cinematic accents). */
export function tom(sr: number, freq: number, vel = 1): Float32Array {
  const n = Math.floor(1.1 * sr), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (freq * (1 + 0.5 * Math.exp(-t * 18))) / sr;
    out[i] = Math.sin(TAU * ph) * Math.exp(-t * 3.5) * vel * 0.8;
  }
  return fadeEnd(out, Math.floor(0.05 * sr));
}
