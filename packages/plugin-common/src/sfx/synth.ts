// The pieces the common sound effects are made of: oscillators, noise, filters, envelopes, a bell, scales, and play() through the bus.
import { rng, type ParamDef } from '@tellcut/engine';

export const TAU = Math.PI * 2;

export const fade = (x: Float32Array, sr: number, ms = 5) => {
  const n = Math.min(Math.floor((ms / 1000) * sr), x.length >> 1);
  for (let i = 0; i < n; i++) { x[i] *= i / n; x[x.length - 1 - i] *= i / n; }
  return x;
};

/** State-variable bandpass over noise whose centre goes from `f0` to `f1` (exponentially) while a bell-shaped (or rising) envelope shapes the level. */
export function sweep(sr: number, dur: number, seed: number, f0: number, f1: number, q: number, env: (p: number) => number): Float32Array {
  const n = Math.max(1, Math.round(dur * sr)), x = new Float32Array(n), r = rng(seed);
  let low = 0, band = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n, f = f0 * Math.pow(f1 / f0, p), c = 2 * Math.sin((Math.PI * f) / sr);
    const input = r() * 2 - 1;
    low += c * band;
    const high = input - low - band / q;
    band += c * high;
    x[i] = band * env(p) * 0.9;
  }
  return fade(x, sr, 8);
}

/** partials of a struck bell: [frequency ratio, level, decay per second] */
export function bell(x: Float32Array, sr: number, at: number, f: number, gain: number, partials: Array<[number, number, number]>) {
  const i0 = Math.round(at * sr);
  for (let i = i0; i < x.length; i++) {
    const t = (i - i0) / sr;
    let v = 0;
    for (const [r, a, d] of partials) v += a * Math.sin(TAU * f * r * t) * Math.exp(-t * d);
    x[i] += gain * v * Math.min(1, t * 2000);   // a 0.5 ms attack: no click
  }
}

type Buf = Float32Array;

export const zeros = (sr: number, sec: number): Buf => new Float32Array(Math.max(1, Math.ceil(sec * sr)));

export const mixIn = (sr: number, dst: Buf, src: Buf, at = 0, g = 1) => { const o = Math.round(at * sr); for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * g; };

/** a wave with a frequency curve f(t) and an envelope e(t) */
export function osc(sr: number, sec: number, f: (t: number) => number, e: (t: number) => number, shape: 'sin' | 'sq' | 'saw' = 'sin'): Buf {
  const b = zeros(sr, sec); let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / sr; ph += (TAU * f(t)) / sr;
    const w = shape === 'sin' ? Math.sin(ph) : shape === 'sq' ? (Math.sin(ph) >= 0 ? 0.6 : -0.6) : (((ph / TAU) % 1) * 2 - 1) * 0.6;
    b[i] = w * e(t);
  }
  return b;
}

export function hiss(sr: number, sec: number, seed: number, e: (t: number) => number): Buf { const r = rng(seed), b = zeros(sr, sec); for (let i = 0; i < b.length; i++) b[i] = (r() * 2 - 1) * e(i / sr); return b; }

/** one-pole low-pass (the cutoff may move), and the high-pass left over */
export function lowpass(sr: number, b: Buf, fc: (t: number) => number): Buf { const o = new Float32Array(b.length); let y = 0; for (let i = 0; i < b.length; i++) { const a = 1 - Math.exp((-TAU * fc(i / sr)) / sr); y += a * (b[i] - y); o[i] = y; } return o; }

export function highpass(sr: number, b: Buf, fc: number): Buf { const l = lowpass(sr, b, () => fc); return b.map((v, i) => v - l[i]) as Buf; }

export const decay = (k: number, a = 0.002) => (t: number) => Math.min(1, t / a) * Math.exp(-k * t);

export function normalize(b: Buf, peak: number): Buf { let m = 0; for (const v of b) m = Math.max(m, Math.abs(v)); const g = m > 0 ? peak / m : 1; for (let i = 0; i < b.length; i++) b[i] *= g; return b; }

// one-pole filters written for 48 kHz (the uk-postcard sounds), the same at any rate
export const lp1 = (sr: number, a48: number) => { const a = 1 - Math.pow(1 - a48, 48000 / sr); let y = 0; return (x: number) => (y += a * (x - y)); };

export const hp1 = (sr: number, a48: number) => { const a = Math.pow(a48, 48000 / sr); let y = 0, px = 0; return (x: number) => { y = a * (y + x - px); px = x; return y; }; };

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], pentatonic: [0, 2, 4, 7, 9] } as const;

export type ScaleName = keyof typeof SCALES;

/** `pitch` moved `step` notes up (negative: down) the scale it is the root of; step 0 is `pitch` itself */
export function scaleStep(pitch: number, step = 0, scale: ScaleName = 'major'): number {
  const s = SCALES[scale] ?? SCALES.major, n = Math.round(step || 0), oct = Math.floor(n / s.length);
  return pitch * 2 ** (oct + s[n - oct * s.length] / 12);
}

/** a pulse wave (the 8-bit square) of `f` Hz with duty `duty`, an envelope e(t) */
export function pulse(sr: number, sec: number, f: number, duty: number, e: (t: number) => number): Buf {
  const b = zeros(sr, sec); let ph = 0;
  for (let i = 0; i < b.length; i++) { const t = i / sr; ph += f / sr; b[i] = ((ph % 1) < duty ? 1 : -1) * Math.min(1, t / 0.002) * e(t); }
  return b;
}

/** a band-pass biquad (constant peak gain) at `f` Hz */
export function bandpass(sr: number, x: Buf, f: number, q: number): Buf {
  const w = (TAU * f) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al, a1 = -2 * Math.cos(w), a2 = 1 - al, o = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = (al * x[i] - al * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y; }
  return o;
}

export const ARPEGGIO = [0, 4, 7, 12, 16, 19, 24, 28];

type Bus = { out: AudioNode; verb: AudioNode; noise: AudioBuffer };

/** play `x` at `at` through the bus; `send` is how much goes to the reverb too */
export function play(ctx: BaseAudioContext, bus: Bus, at: number, x: Float32Array, send = 0) {
  const buf = ctx.createBuffer(1, x.length, ctx.sampleRate);
  buf.getChannelData(0).set(x);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(bus.out);
  if (send > 0) { const g = ctx.createGain(); g.gain.value = send; src.connect(g); g.connect(bus.verb); }
  src.start(at);
}

export const num = (key: string, label: string, def: number, min: number, max: number, step = 0.05): ParamDef => ({ key, label, type: 'number', min, max, step, default: def });

export const SHORT = 0.05, LONG = 4;

/** a note on a scale whose root is the sound's pitch (ding, xylo): step 0 is the pitch itself */
export const STEP: ParamDef[] = [num('step', '音階第幾級（0＝主音）', 0, -14, 21, 1), { key: 'scale', label: '音階', type: 'enum', options: ['major', 'pentatonic'], default: 'major' }];

export const n2 = (p: Record<string, any>, k: string) => Math.max(1, Math.round(p[k]));
