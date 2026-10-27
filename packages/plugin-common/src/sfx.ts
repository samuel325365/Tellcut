// The common sound effects (toolkit phase 2b): each is a pure function from a sample rate and its params to samples — the same
// samples every time — played through the bus. beep pairs with common.censor.
import { clamp, rng, type ParamDef, type SfxType } from '@tellcut/engine';

const TAU = Math.PI * 2;
const fade = (x: Float32Array, sr: number, ms = 5) => {
  const n = Math.min(Math.floor((ms / 1000) * sr), x.length >> 1);
  for (let i = 0; i < n; i++) { x[i] *= i / n; x[x.length - 1 - i] *= i / n; }
  return x;
};

/** a sine of `freq` Hz for `dur` s: the TV bleep */
export function renderBeep(sr: number, dur: number, freq = 1000): Float32Array {
  const x = new Float32Array(Math.max(1, Math.round(dur * sr)));
  for (let i = 0; i < x.length; i++) x[i] = 0.45 * Math.sin((TAU * freq * i) / sr);
  return fade(x, sr);
}

/** State-variable bandpass over noise whose centre goes from `f0` to `f1` (exponentially) while a bell-shaped (or rising) envelope shapes the level. */
function sweep(sr: number, dur: number, seed: number, f0: number, f1: number, q: number, env: (p: number) => number): Float32Array {
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

/** a bright sweep of light (the brand spike's shing): high-passed noise dying fast under a falling high sine, gently panned */
export function renderShing(sr: number, dur = 1.2, seed = 7): Float32Array {
  const n = Math.max(1, Math.round(dur * sr)), x = new Float32Array(n), r = rng(seed);
  let prev = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, v = r() * 2 - 1, hp = v - prev;
    prev = v;
    ph += (TAU * (6000 * Math.exp(-t * 5) + 1400)) / sr;
    x[i] = hp * 0.5 * Math.exp(-t * 14) + Math.sin(ph) * 0.18 * Math.exp(-t * 6);
  }
  // brought to a peak of 0.8 whatever the noise did
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < n; i++) x[i] *= 0.8 / m;
  return fade(x, sr, 3);
}

/** a breath of air (the spike's breath before the wall): low-passed noise that swells in and out; bright 0–1 opens the filter */
export function renderAir(sr: number, dur = 1.6, bright = 0.5, seed = 11): Float32Array {
  const n = Math.max(1, Math.round(dur * sr)), x = new Float32Array(n), r = rng(seed);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n, cut = (0.015 + 0.2 * clamp(bright)) * (0.3 + Math.sin(p * Math.PI) ** 2);
    lp += Math.min(1, cut) * (r() * 2 - 1 - lp);
    x[i] = lp * Math.sin(p * Math.PI) ** 1.5;
  }
  // a peak of 0.7 whatever the filter left
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < n; i++) x[i] *= 0.7 / m;
  return fade(x, sr, 8);
}

export const renderWhoosh = (sr: number, dur: number, seed = 1) => sweep(sr, dur, seed, 350, 3800, 2.2, (p) => Math.sin(Math.PI * p) ** 1.5);

export function renderRiser(sr: number, dur: number, seed = 1): Float32Array {
  const x = sweep(sr, dur, seed, 220, 7000, 2.5, (p) => p ** 2.2);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const p = i / x.length;
    ph += (TAU * (200 * Math.pow(6, p))) / sr;           // a tone climbing from 200 Hz to 1.2 kHz under the noise
    x[i] = x[i] + 0.25 * Math.sin(ph) * p ** 1.8;
  }
  // the noise and the tone add up past full scale at the top: clipping there was heard as distortion, so the whole sound is
  // scaled to a -3 dBFS peak instead (its loudest stretch then sits with the whoosh and the air)
  return normalize(x, 0.7);
}

/** a low thud: a sine falling from 140 to 38 Hz, a short noise burst on top, a long soft tail */
export function renderImpact(sr: number, seed = 1): Float32Array {
  const n = Math.round(1.4 * sr), x = new Float32Array(n), r = rng(seed);
  let ph = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (TAU * (38 + 102 * Math.exp(-t * 18))) / sr;
    lp += 0.12 * ((r() * 2 - 1) - lp);
    x[i] = clamp(0.9 * Math.sin(ph) * Math.exp(-t * 3.2) + 0.7 * lp * Math.exp(-t * 40), -1, 1);
  }
  return fade(x, sr, 2);
}

/** a bubble pop: a sine falling from `pitch` Hz to a third of it in a tenth of a second */
export function renderPop(sr: number, pitch = 700): Float32Array {
  const n = Math.round(0.12 * sr), x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (TAU * pitch * (0.33 + 0.67 * Math.exp(-t * 40))) / sr;
    x[i] = 0.7 * Math.sin(ph) * Math.exp(-t * 32);
  }
  return fade(x, sr, 1);
}

/** the thump of a stamp landing: a short low sine falling from 110 to 50 Hz; `paper` (the uk-postcard postmark): a rubber stamp on a
 *  card on a wooden desk instead — a thump falling from 155 to 95 Hz, a 210 Hz knock and a short papery click, 0.45 s */
export function renderThud(sr: number, paper = false): Float32Array {
  if (paper) {
    const n = Math.round(0.45 * sr), x = new Float32Array(n), r = rng(7), l1 = lp1(sr, 0.35), h1 = hp1(sr, 0.9);
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = 95 + 60 * Math.exp(-t * 40);
      x[i] = Math.exp(-t * 18) * Math.sin(TAU * f * t) * 0.9 + Math.exp(-t * 26) * Math.sin(TAU * 210 * t) * 0.25 + Math.exp(-t * 90) * h1(l1(r() * 2 - 1)) * 0.7;
    }
    return fade(normalize(x, 0.89), sr, 1.5);
  }
  const n = Math.round(0.35 * sr), x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; ph += (TAU * (50 + 60 * Math.exp(-t * 30))) / sr; x[i] = 0.9 * Math.sin(ph) * Math.exp(-t * 11); }
  return fade(x, sr, 1.5);
}

/** a dry click */
export function renderTick(sr: number, seed = 1): Float32Array {
  const n = Math.round(0.04 * sr), x = new Float32Array(n), r = rng(seed);
  let prev = 0;
  for (let i = 0; i < n; i++) { const v = r() * 2 - 1; x[i] = 0.6 * (v - prev) * Math.exp(-(i / sr) * 160); prev = v; }
  return fade(x, sr, 0.5);
}

/** partials of a struck bell: [frequency ratio, level, decay per second] */
function bell(x: Float32Array, sr: number, at: number, f: number, gain: number, partials: Array<[number, number, number]>) {
  const i0 = Math.round(at * sr);
  for (let i = i0; i < x.length; i++) {
    const t = (i - i0) / sr;
    let v = 0;
    for (const [r, a, d] of partials) v += a * Math.sin(TAU * f * r * t) * Math.exp(-t * d);
    x[i] += gain * v * Math.min(1, t * 2000);   // a 0.5 ms attack: no click
  }
}

/** a clear bell 叮: a high fundamental with a bright inharmonic overtone, ringing out */
export function renderDing(sr: number, pitch = 1568): Float32Array {
  const x = new Float32Array(Math.round(1.2 * sr));
  bell(x, sr, 0, pitch, 0.5, [[1, 1, 4], [2.76, 0.35, 9], [5.4, 0.12, 16]]);
  return fade(x, sr, 3);
}

/** a wrong-answer buzz: two short low square-ish tones, the second lower */
export function renderError(sr: number): Float32Array {
  const x = new Float32Array(Math.round(0.55 * sr));
  for (const [a, b, f] of [[0, 0.22, 220], [0.27, 0.52, 165]] as const) {
    for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) {
      const t = i / sr - a, s = Math.sin(TAU * f * t);
      x[i] = 0.4 * Math.tanh(3 * s) * Math.min(1, t * 400, (b - a - t) * 400);
    }
  }
  return x;
}

/** a camera shutter: two dry clicks a short moment apart, with a breath of noise between */
export function renderShutter(sr: number, seed = 3): Float32Array {
  const x = new Float32Array(Math.round(0.18 * sr)), r = rng(seed);
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    lp += 0.35 * ((r() * 2 - 1) - lp);
    const click = (t0: number) => (t >= t0 ? Math.exp(-(t - t0) * 260) : 0);
    x[i] = clamp(0.95 * lp * (click(0) + 0.8 * click(0.075)) + 0.12 * lp * Math.exp(-t * 25), -1, 1);
  }
  return fade(x, sr, 0.5);
}

/** keys typed for `dur` s: clicks at a typist's uneven pace (about 9 a second), some louder */
export function renderTyping(sr: number, dur: number, seed = 5): Float32Array {
  const x = new Float32Array(Math.max(1, Math.round(dur * sr))), r = rng(seed);
  for (let t = 0.02; t < dur - 0.03; t += 0.07 + r() * 0.09) {
    const key = renderTick(sr, Math.floor(r() * 1000) + 1), g = 0.6 + r() * 0.5, i0 = Math.round(t * sr);
    for (let i = 0; i < key.length && i0 + i < x.length; i++) x[i0 + i] += g * key[i];
  }
  for (let i = 0; i < x.length; i++) x[i] = clamp(x[i], -1, 1);
  return fade(x, sr, 1);
}

/** a till 鏘鏘: the drawer's click, then two bright bells; `coins` (the food-receipt total) adds the drawer's thump and coins rattling */
export function renderCash(sr: number, coins = false): Float32Array {
  const x = new Float32Array(Math.round(1.1 * sr)), click = renderTick(sr, 9);
  if (coins) {
    const r = rng(9);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      if (t < 0.1) x[i] += Math.exp(-t * 30) * 0.5 * Math.sin(TAU * 95 * t);
      if (t > 0.12 && t < 0.6) x[i] += (r() * 2 - 1) * Math.exp(-(t - 0.12) * 7) * (Math.sin(TAU * 31 * t) > 0.6 ? 0.4 : 0.05);
    }
  }
  for (let i = 0; i < click.length; i++) x[i] += 1.3 * click[i];
  bell(x, sr, 0.06, 2093, 0.32, [[1, 1, 6], [2.4, 0.4, 12]]);
  bell(x, sr, 0.17, 2637, 0.32, [[1, 1, 5], [2.4, 0.4, 11]]);
  for (let i = 0; i < x.length; i++) x[i] = clamp(x[i], -1, 1);
  return fade(x, sr, 3);
}

// ---------- from the baking shorts (2026-10-19): sin-meter sounds and the recipe card's page and xylophone ----------
type Buf = Float32Array;
const zeros = (sr: number, sec: number): Buf => new Float32Array(Math.max(1, Math.ceil(sec * sr)));
const mixIn = (sr: number, dst: Buf, src: Buf, at = 0, g = 1) => { const o = Math.round(at * sr); for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * g; };
/** a wave with a frequency curve f(t) and an envelope e(t) */
function osc(sr: number, sec: number, f: (t: number) => number, e: (t: number) => number, shape: 'sin' | 'sq' | 'saw' = 'sin'): Buf {
  const b = zeros(sr, sec); let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / sr; ph += (TAU * f(t)) / sr;
    const w = shape === 'sin' ? Math.sin(ph) : shape === 'sq' ? (Math.sin(ph) >= 0 ? 0.6 : -0.6) : (((ph / TAU) % 1) * 2 - 1) * 0.6;
    b[i] = w * e(t);
  }
  return b;
}
function hiss(sr: number, sec: number, seed: number, e: (t: number) => number): Buf { const r = rng(seed), b = zeros(sr, sec); for (let i = 0; i < b.length; i++) b[i] = (r() * 2 - 1) * e(i / sr); return b; }
/** one-pole low-pass (the cutoff may move), and the high-pass left over */
function lowpass(sr: number, b: Buf, fc: (t: number) => number): Buf { const o = new Float32Array(b.length); let y = 0; for (let i = 0; i < b.length; i++) { const a = 1 - Math.exp((-TAU * fc(i / sr)) / sr); y += a * (b[i] - y); o[i] = y; } return o; }
function highpass(sr: number, b: Buf, fc: number): Buf { const l = lowpass(sr, b, () => fc); return b.map((v, i) => v - l[i]) as Buf; }
const decay = (k: number, a = 0.002) => (t: number) => Math.min(1, t / a) * Math.exp(-k * t);
function normalize(b: Buf, peak: number): Buf { let m = 0; for (const v of b) m = Math.max(m, Math.abs(v)); const g = m > 0 ? peak / m : 1; for (let i = 0; i < b.length; i++) b[i] *= g; return b; }

/** the air going out: a tone sliding down from 660 to 280 Hz with a breath of noise (something that "does not count") */
export function renderDeflate(sr: number): Float32Array {
  const b = zeros(sr, 0.45);
  mixIn(sr, b, osc(sr, 0.4, (t) => 660 - 380 * Math.min(1, t / 0.35), (t) => Math.min(1, t / 0.01) * Math.exp(-5 * t)), 0, 0.7);
  mixIn(sr, b, lowpass(sr, hiss(sr, 0.3, 7, (t) => Math.exp(-10 * t)), () => 700), 0, 0.15);
  return fade(normalize(b, 0.6), sr, 2);
}

/** a record scratch: a buzzy tone dragged up and back with grit */
export function renderScratch(sr: number): Float32Array {
  const d = 0.42, b = zeros(sr, d), f = (t: number) => 180 + 900 * Math.sin(Math.min(1, t / d) * Math.PI * 1.5) ** 2;
  mixIn(sr, b, lowpass(sr, osc(sr, d, f, (t) => Math.min(1, t / 0.01) * (1 - t / d)), () => 3000), 0, 0.7);
  mixIn(sr, b, lowpass(sr, hiss(sr, d, 10, (t) => (1 - t / d) * (0.5 + 0.5 * Math.sin(t * 90))), (t) => 800 + 3000 * Math.sin(Math.min(1, t / d) * Math.PI)), 0, 0.6);
  return fade(normalize(b, 0.8), sr, 2);
}

/** a dashboard starting up: a servo whirring up and down over a low hum, with ticks */
export function renderPowerUp(sr: number): Float32Array {
  const d = 0.85, b = zeros(sr, d);
  mixIn(sr, b, osc(sr, d, (t) => 220 + 900 * Math.sin(Math.PI * Math.min(1, t / 0.8)), (t) => Math.min(1, t / 0.04) * (1 - t / d) * 0.6, 'saw'), 0, 0.5);
  mixIn(sr, b, osc(sr, d, () => 55, (t) => (1 - t / d) * 0.4), 0, 0.4);
  for (let k = 0; k < 10; k++) mixIn(sr, b, highpass(sr, hiss(sr, 0.012, 20 + k, decay(300)), 3000), k * 0.08, 0.35);
  return fade(normalize(lowpass(sr, b, () => 4000), 0.7), sr, 2);
}

/** danger beeps: `beeps` short square tones at 1.25 kHz, one every 0.2 s */
export function renderAlarm(sr: number, beeps = 3): Float32Array {
  const n = Math.max(1, Math.round(beeps)), b = zeros(sr, n * 0.2 + 0.02);
  for (let k = 0; k < n; k++) mixIn(sr, b, osc(sr, 0.12, () => 1250, (t) => Math.min(1, t / 0.004, (0.11 - t) / 0.004) * (t < 0.11 ? 1 : 0), 'sq'), k * 0.2, 0.5);
  return normalize(lowpass(sr, b, () => 5000), 0.6);
}

/** something blowing up: a boom, a falling sub and a shower of glass shards */
export function renderExplode(sr: number): Float32Array {
  const b = zeros(sr, 2.6);
  mixIn(sr, b, lowpass(sr, hiss(sr, 2.4, 11, (t) => Math.min(1, t / 0.005) * Math.exp(-2.2 * t)), (t) => 2500 * Math.exp(-t * 3) + 120), 0, 1);
  mixIn(sr, b, osc(sr, 2.0, (t) => 70 * Math.exp(-t * 2) + 32, decay(1.8)), 0, 1);
  const r = rng(12);
  for (let k = 0; k < 34; k++) { const at = 0.03 + r() * 0.7, f = 2500 + r() * 6000, dk = 16 + r() * 20, g = 0.12 + r() * 0.1; mixIn(sr, b, osc(sr, 0.35, () => f, decay(dk)), at, g); }
  mixIn(sr, b, highpass(sr, hiss(sr, 0.9, 13, (t) => Math.exp(-5 * t)), 4000), 0.02, 0.35);
  return fade(normalize(b, 0.95), sr, 5);
}

/** a tape spun forward: a whine rising from 300 Hz to 2.5 kHz over `dur` seconds */
export function renderFastForward(sr: number, dur = 0.6): Float32Array {
  const d = Math.max(0.1, dur), b = lowpass(sr, osc(sr, d, (t) => 300 + 2200 * (t / d) ** 2, (t) => Math.min(1, t / 0.03) * (1 - (t / d) ** 4), 'saw'), () => 3500);
  return fade(normalize(b, 0.55), sr, 2);
}

/** a page turning: band-limited noise in two soft swells */
export function renderPage(sr: number, seed = 3): Float32Array {
  const x = zeros(sr, 0.42), r = rng(seed);
  let a = 0, c = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, env = Math.exp(-Math.pow((t - 0.09) / 0.05, 2)) * 0.8 + Math.exp(-Math.pow((t - 0.24) / 0.09, 2));
    const w = r() * 2 - 1; a += (w - a) * 0.35; c += (a - c) * 0.5;
    x[i] = (a - c * 0.6) * env;
  }
  return fade(normalize(x, 0.6), sr, 2);
}

/** a short wooden xylophone note at `pitch` Hz (a tick off a list, a step done) */
export function renderXylo(sr: number, pitch = 880): Float32Array {
  const x = zeros(sr, 0.16);
  for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] = 0.6 * Math.min(1, t * 2000) * Math.exp(-t * 38) * (0.75 * Math.sin(TAU * pitch * t) + 0.25 * Math.sin(TAU * pitch * 3.93 * t) * Math.exp(-t * 60)); }
  return fade(x, sr, 1);
}

// one-pole filters written for 48 kHz (the uk-postcard sounds), the same at any rate
const lp1 = (sr: number, a48: number) => { const a = 1 - Math.pow(1 - a48, 48000 / sr); let y = 0; return (x: number) => (y += a * (x - y)); };
const hp1 = (sr: number, a48: number) => { const a = Math.pow(a48, 48000 / sr); let y = 0, px = 0; return (x: number) => { y = a * (y + x - px); px = x; return y; }; };

/** a card sliding over a pile of cards: soft band-limited friction that swells and fades, then a light tap as it lands (1.1 s) */
export function renderSlide(sr: number): Float32Array {
  const n = Math.round(1.1 * sr), x = new Float32Array(n), r = rng(12345), l1 = lp1(sr, 0.18), l2 = lp1(sr, 0.25), h1 = hp1(sr, 0.97), l3 = lp1(sr, 0.18);
  for (let i = 0; i < n; i++) {
    const t = i / sr, env = t < 0.85 ? Math.sin(Math.PI * Math.min(1, t / 0.85)) ** 2 : 0, grain = 0.6 + 0.4 * Math.sin(t * TAU * 23 + Math.sin(t * 40));
    x[i] = h1(l2(l1(r() * 2 - 1))) * env * grain * 0.8;
    const tt = t - 0.82;
    if (tt > 0) x[i] += Math.exp(-tt * 60) * (0.5 * Math.sin(TAU * 180 * tt) + 0.25 * l3(r() * 2 - 1));
  }
  return fade(normalize(x, 0.89), sr, 2);
}

/** a card turned over on a desk: two quick flutters of air and paper, and the card settling (0.8 s) */
export function renderFlip(sr: number): Float32Array {
  const n = Math.round(0.8 * sr), x = new Float32Array(n), r = rng(54321), l1 = lp1(sr, 0.12), l2 = lp1(sr, 0.2), h1 = hp1(sr, 0.985);
  for (let i = 0; i < n; i++) {
    const t = i / sr, a = Math.exp(-(((t - 0.18) / 0.09) ** 2)), b = Math.exp(-(((t - 0.42) / 0.12) ** 2)) * 0.8;
    x[i] = h1(l2(l1(r() * 2 - 1))) * (a + b) * (0.7 + 0.3 * Math.sin(t * TAU * 31));
    const tt = t - 0.5;
    if (tt > 0) x[i] += Math.exp(-tt * 50) * Math.sin(TAU * 150 * tt) * 0.3;
  }
  return fade(normalize(x, 0.89), sr, 2);
}

// ---------- from the food-receipt and food-deep shorts (2026-10-19): the receipt printer's sounds and the queue machine's chime ----------
/** a thermal print head and its stepper: a buzzing 190 Hz gate over bright noise, `dur` seconds */
export function renderPrint(sr: number, dur = 0.34): Float32Array {
  const d = Math.max(0.05, dur), x = zeros(sr, d), r = rng(3), h1 = hp1(sr, 0.9);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, env = Math.min(1, t / 0.006) * Math.min(1, (d - t) / 0.04);
    const gate = (Math.sin(TAU * 190 * t) > -0.2 ? 1 : 0.25) * (0.75 + 0.25 * Math.sin(TAU * 23 * t));
    x[i] = h1(env * gate * (0.55 * (r() * 2 - 1) + 0.3 * Math.sin(TAU * 760 * t)));
  }
  return fade(normalize(x, 0.7), sr, 2);
}

/** a paper cutter / feed latch: a short falling knock with a click on its front (0.16 s) */
export function renderClunk(sr: number): Float32Array {
  const x = zeros(sr, 0.16), r = rng(5);
  for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] = Math.exp(-t * 38) * 0.8 * Math.sin(TAU * 140 * (1 - t * 1.5) * t) + (t < 0.008 ? (r() * 2 - 1) * 0.7 : 0); }
  return fade(normalize(x, 0.85), sr, 1);
}

/** paper torn off: a crackling burst of noise that fades over half a second */
export function renderTear(sr: number): Float32Array {
  const d = 0.55, x = zeros(sr, d), r = rng(13), l1 = lp1(sr, 0.5), h1 = hp1(sr, 0.95);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, env = Math.min(1, t / 0.02) * Math.max(0, 1 - t / d), crackle = Math.sin(TAU * (40 + 60 * t) * t) > 0.3 ? 1 : 0.35;
    x[i] = h1(l1(env * crackle * (r() * 2 - 1) * (0.8 + 0.2 * r())));
  }
  return fade(normalize(x, 0.85), sr, 2);
}

/** a roll-down shutter: steel slats rattling down, a thump at the bottom (0.65 s) */
export function renderRattle(sr: number): Float32Array {
  const d = 0.65, x = zeros(sr, d), r = rng(17), l1 = lp1(sr, 0.35);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, env = Math.min(1, t / 0.03) * Math.max(0, 1 - t / d), tick = (t * 26) % 1 < 0.18 ? 1 : 0.3;
    x[i] = l1(env * tick * (r() * 2 - 1) * 0.8 + (t > 0.55 ? Math.exp(-(t - 0.55) * 40) * 0.7 * Math.sin(TAU * 110 * t) : 0));
  }
  return fade(normalize(x, 0.85), sr, 2);
}

/** the queue machine's 叮咚: two clean chimes, `high` then `low` Hz, 0.32 s apart (A5 → F5) */
export function renderDingDong(sr: number, high = 880, low = 698.46): Float32Array {
  const x = zeros(sr, 1.95);
  const chime = (at: number, f: number, g: number, len: number) => {
    const i0 = Math.round(at * sr), n = Math.round(len * sr);
    for (let i = 0; i < n && i0 + i < x.length; i++) {
      const t = i / sr, env = Math.min(1, t / 0.004) * Math.exp(-t * 3.2);
      x[i0 + i] += g * env * (0.62 * Math.sin(TAU * f * t) + 0.22 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 6) + 0.1 * Math.sin(TAU * f * 3.01 * t) * Math.exp(-t * 9));
    }
  };
  chime(0, high, 1, 1.2); chime(0.32, low, 0.95, 1.6);
  return fade(normalize(x, 0.8), sr, 3);
}

// ---------- the sound pack (2026-10-21): sounds the fd-* food shorts and earlier films each synthesised again on their own ----------
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], pentatonic: [0, 2, 4, 7, 9] } as const;
export type ScaleName = keyof typeof SCALES;
/** `pitch` moved `step` notes up (negative: down) the scale it is the root of; step 0 is `pitch` itself */
export function scaleStep(pitch: number, step = 0, scale: ScaleName = 'major'): number {
  const s = SCALES[scale] ?? SCALES.major, n = Math.round(step || 0), oct = Math.floor(n / s.length);
  return pitch * 2 ** (oct + s[n - oct * s.length] / 12);
}
/** a pulse wave (the 8-bit square) of `f` Hz with duty `duty`, an envelope e(t) */
function pulse(sr: number, sec: number, f: number, duty: number, e: (t: number) => number): Buf {
  const b = zeros(sr, sec); let ph = 0;
  for (let i = 0; i < b.length; i++) { const t = i / sr; ph += f / sr; b[i] = ((ph % 1) < duty ? 1 : -1) * Math.min(1, t / 0.002) * e(t); }
  return b;
}
/** a band-pass biquad (constant peak gain) at `f` Hz */
function bandpass(sr: number, x: Buf, f: number, q: number): Buf {
  const w = (TAU * f) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al, a1 = -2 * Math.cos(w), a2 = 1 - al, o = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = (al * x[i] - al * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y; }
  return o;
}
const ARPEGGIO = [0, 4, 7, 12, 16, 19, 24, 28];

/** a sparkle: `notes` bell notes running up a major arpeggio from `pitch`, `gap` s apart, with a high shimmer; `chip`: 8-bit pulse notes instead
 *  (fd-tangyuan's chime, fd-ice's and parenting-brain's sparkle, fd-hakka's closing chime; chip from fd-gacha) */
export function renderChime(sr: number, notes = 4, pitch = 1568, gap = 0.07, chip = false): Float32Array {
  const n = Math.max(1, Math.min(8, Math.round(notes))), x = zeros(sr, (n - 1) * gap + (chip ? 0.35 : 1.2));
  for (let k = 0; k < n; k++) {
    const f = pitch * 2 ** (ARPEGGIO[k] / 12);
    if (chip) mixIn(sr, x, pulse(sr, 0.3, f, 0.125, (t) => Math.exp(-t * 30)), k * gap, 0.3);
    else bell(x, sr, k * gap, f, Math.max(0.35, 0.8 - k * 0.08), [[1, 1, 4.5], [2.76, 0.3, 6.75], [5.4, 0.1, 9]]);
  }
  if (!chip) mixIn(sr, x, highpass(sr, hiss(sr, 0.6, 16, (t) => Math.exp(-6 * t) * (0.6 + 0.4 * Math.sin(t * 160))), 6000), 0.02, 0.12);
  return fade(normalize(x, 0.7), sr, 3);
}

/** a pen on paper for `dur` s, `strokes` strokes a second whose loudness follows the pen's speed; `crayon`: grainier, wider and scrubbier
 *  (fd-map's ballpoint, fd-hakka's marker circles; crayon from fd-tangyuan) */
export function renderScribble(sr: number, dur = 0.6, strokes = 5, crayon = false): Float32Array {
  const d = Math.max(0.1, dur), r = rng(crayon ? 31 : 9), env = (t: number) => Math.min(1, t / 0.02) * Math.min(1, (d - t) / 0.05);
  if (crayon) {
    const x = hiss(sr, d, 30, (t) => (0.55 + 0.45 * Math.abs(Math.sin(Math.PI * strokes * t))) * env(t) * (0.8 + 0.4 * r()));
    return fade(normalize(lowpass(sr, highpass(sr, x, 1200), () => 4200), 0.7), sr, 2);
  }
  const l1 = lp1(sr, 0.35), h1 = hp1(sr, 0.93), x = zeros(sr, d);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, speed = Math.sin(Math.PI * ((t * strokes) % 1)) ** 0.7;
    x[i] = h1(l1(env(t) * speed * (r() * 2 - 1) * (0.55 + 0.45 * Math.sin(TAU * 37 * t))));
  }
  return fade(normalize(x, 0.6), sr, 2);
}

/** `steps` footsteps `gap` s apart, the feet a little apart in pitch: a wooden floor (two short knocks and a scuff), or `soft` cartoon taps
 *  (fd-tangyuan's step; soft from fd-boss) */
export function renderFootstep(sr: number, steps = 4, gap = 0.3, soft = false): Float32Array {
  const n = Math.max(1, Math.min(16, Math.round(steps))), x = zeros(sr, (n - 1) * gap + 0.2);
  for (let k = 0; k < n; k++) {
    const left = k % 2 === 0, at = k * gap;
    if (soft) { const [a, b] = left ? [520, 200] : [600, 230]; mixIn(sr, x, osc(sr, 0.12, (t) => a * Math.exp(-t * 25) + b, decay(40, 0.001)), at, 1); continue; }
    const f = left ? 760 : 820, step = zeros(sr, 0.15);
    for (const [r, a, dk] of [[1, 0.6, 38], [2.4, 0.33, 57], [3.9, 0.23, 76]]) mixIn(sr, step, osc(sr, 0.15, () => f * r, decay(dk)), 0, a);
    mixIn(sr, x, step, at, 0.8);
    mixIn(sr, x, lowpass(sr, hiss(sr, 0.03, 60 + k, decay(120)), () => 1500), at, 0.4);
  }
  return fade(normalize(x, 0.7), sr, 2);
}

/** a strip of tape pulled off the roll (a raspy, sticky rip) and, with `press`, pressed down with a soft tap (fd-tangyuan, fd-map) */
export function renderTape(sr: number, press = true): Float32Array {
  const x = zeros(sr, press ? 0.42 : 0.32);
  const rip = hiss(sr, 0.32, 71, (t) => (t < 0.22 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 160)) : Math.exp(-40 * (t - 0.22))) * Math.min(1, t / 0.01));
  mixIn(sr, x, lowpass(sr, highpass(sr, rip, 1500), () => 6500), 0, 1);
  if (press) {
    const r = rng(14), tap = zeros(sr, 0.12);
    for (let i = 0; i < tap.length; i++) { const t = i / sr; tap[i] = Math.exp(-t * 40) * (0.8 * Math.sin(TAU * 120 * t) + 0.4 * (r() * 2 - 1)) * Math.min(1, t * 2000); }
    mixIn(sr, x, lowpass(sr, tap, () => 1800), 0.28, 0.35);
  }
  return fade(normalize(x, 0.6), sr, 2);
}

/** a spoon touching a porcelain bowl: a bright inharmonic ring; `glass`: an ice cube knocking a glass and settling, three knocks
 *  (fd-tangyuan's clink; glass from fd-ice) */
export function renderClink(sr: number, glass = false): Float32Array {
  if (glass) {
    const x = zeros(sr, 0.9), r = rng(4242);
    for (const [at, a] of [[0, 1], [0.075, 0.45], [0.16, 0.18]]) {
      bell(x, sr, at, 1, a, [[2093 * (1 + at * 0.03), 0.5, 9], [3371 * (1 + at * 0.03), 0.42, 12], [5210 * (1 + at * 0.03), 0.3, 16], [7930 * (1 + at * 0.03), 0.18, 22], [1220 * (1 + at * 0.03), 0.15, 14]]);
      const i0 = Math.round(at * sr), m = Math.round(0.005 * sr);
      for (let i = 0; i < m; i++) x[i0 + i] += (r() * 2 - 1) * 0.5 * a * (1 - i / m);
    }
    return fade(normalize(x, 0.75), sr, 3);
  }
  const x = zeros(sr, 1.1);
  bell(x, sr, 0, 2380, 1, [[1, 0.6, 5.5], [1.47, 0.35, 8.25], [2.09, 0.3, 11], [2.72, 0.2, 13.75], [3.86, 0.12, 16.5]]);
  mixIn(sr, x, highpass(sr, hiss(sr, 0.01, 41, decay(400)), 3000), 0, 0.6);
  return fade(normalize(x, 0.75), sr, 3);
}

/** `drops` water drops `gap` s apart: the classic "bloop", a short sine sweeping up from `pitch` Hz (fd-ice's plip) */
export function renderDrip(sr: number, drops = 1, gap = 0.35, pitch = 650): Float32Array {
  const n = Math.max(1, Math.min(12, Math.round(drops))), x = zeros(sr, (n - 1) * gap + 0.22), lean = [1, 0.89, 1.07, 0.94, 1.12, 0.97];
  for (let k = 0; k < n; k++) {
    const p = pitch * lean[k % lean.length];
    mixIn(sr, x, osc(sr, 0.22, (t) => p * (1 + 2.15 * Math.min(1, t / 0.05) ** 1.5), (t) => Math.exp(-t * 28) * Math.min(1, t / 0.002)), k * gap, k ? 0.85 : 1);
  }
  return fade(normalize(x, 0.6), sr, 2);
}

/** a cartoon spring: a tone wobbling around a pitch that jumps up from `pitch`, the wobble slowing (fd-boss's boing) */
export function renderBoing(sr: number, pitch = 180): Float32Array {
  const x = zeros(sr, 0.62), base = (t: number) => pitch * (1 + 1.444 * Math.min(1, t / 0.08));
  mixIn(sr, x, osc(sr, 0.62, (t) => base(t) * (1 + 0.22 * Math.sin(TAU * (28 - 22 * t) * t) * Math.exp(-3 * t)), (t) => Math.min(1, t / 0.005) * Math.exp(-4.2 * t)), 0, 1);
  mixIn(sr, x, osc(sr, 0.62, (t) => 2 * base(t), (t) => Math.min(1, t / 0.005) * Math.exp(-9 * t)), 0, 0.2);
  return fade(normalize(x, 0.8), sr, 2);
}

/** an arcade coin: a metallic tick and two pulse notes, `pitch` then a fourth above (B5 → E6) (fd-gacha) */
export function renderCoin(sr: number, pitch = 987.77): Float32Array {
  const x = zeros(sr, 0.42), r = rng(12345);
  let hold = 0, acc = 0;
  for (let i = 0; i < Math.round(0.03 * sr); i++) { acc += 16000 / sr; if (acc >= 1) { acc -= 1; hold = r() * 2 - 1; } x[i] += hold * Math.exp(-(i / sr) * 8 / 0.03) * 0.25; }
  mixIn(sr, x, pulse(sr, 0.07, pitch, 0.25, (t) => Math.exp(-t * 6 / 0.07)), 0, 0.22);
  mixIn(sr, x, pulse(sr, 0.33, pitch * 2 ** (5 / 12), 0.25, (t) => Math.exp(-t * 7 / 0.33)), 0.07, 0.24);
  return fade(normalize(x, 0.7), sr, 3);
}

/** an 8-bit fanfare: the major arpeggio from `pitch` up an octave, then the whole chord over a low root (fd-gacha) */
export function renderFanfare(sr: number, pitch = 523.25): Float32Array {
  const x = zeros(sr, 1.3), chord = [0, 4, 7, 12].map((s) => pitch * 2 ** (s / 12));
  chord.forEach((f, i) => mixIn(sr, x, pulse(sr, 0.15, f, 0.25, (t) => Math.exp(-t * 6 / 0.15)), i * 0.09, 0.16));
  chord.forEach((f) => mixIn(sr, x, pulse(sr, 0.85, f, 0.25, (t) => Math.exp(-t * 3 / 0.85)), 0.38, 0.08));
  let ph = 0;
  const bass = zeros(sr, 0.85);
  for (let i = 0; i < bass.length; i++) { const t = i / sr; ph += pitch / 4 / sr; const p = ph % 1; bass[i] = (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) * Math.min(1, t / 0.002) * Math.exp(-t * 3 / 0.85); }
  mixIn(sr, x, bass, 0.38, 0.3);
  return fade(normalize(x, 0.75), sr, 4);
}

/** a wood block knocked `knocks` times `gap` s apart at `pitch` Hz: low, a door; high, a temple block 木魚 (parenting-brain's knock) */
export function renderKnock(sr: number, knocks = 2, gap = 0.16, pitch = 820): Float32Array {
  const n = Math.max(1, Math.min(12, Math.round(knocks))), x = zeros(sr, (n - 1) * gap + 0.3);
  for (let k = 0; k < n; k++) {
    const h1 = hp1(sr, 0.6), r = rng(77 + k), one = zeros(sr, 0.3);
    for (let i = 0; i < one.length; i++) { const t = i / sr; one[i] = Math.exp(-t * 38) * (Math.sin(TAU * pitch * t) + 0.4 * Math.sin(TAU * pitch * 1.634 * t)) * Math.min(1, t * 4000) + 0.3 * Math.exp(-t * 200) * h1(r() * 2 - 1); }
    mixIn(sr, x, one, k * gap, k === n - 1 && n > 1 ? 0.85 : 1);
  }
  return fade(normalize(x, 0.75), sr, 2);
}

/** a cartoon baby's cry, "wa-aah" `times` times: a nasal tone gliding up from `pitch` and back with a vibrato, softened (parenting-brain) */
export function renderCry(sr: number, times = 2, pitch = 520): Float32Array {
  const n = Math.max(1, Math.min(6, Math.round(times))), x = zeros(sr, n * 0.75), l = lp1(sr, 0.12);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, k = (t % 0.75) / 0.7, on = k <= 1 ? 1 : 0;
    const f = pitch * (1 + 0.5 * Math.sin(Math.PI * Math.min(1, k) * 0.8)) + 18 * Math.sin(TAU * 7 * t);
    ph += f / sr;
    const env = on * Math.sin(Math.PI * Math.min(1, k)) ** 0.6, s = (m: number) => Math.sin(TAU * m * ph);
    x[i] = l(env * (s(1) + 0.5 * s(2) + 0.3 * s(3) + 0.15 * s(4)));
  }
  return fade(normalize(x, 0.6), sr, 3);
}

/** oil in a hot pan for `dur` s: a bright hiss with crackling spits (chili-history's sizzle) */
export function renderSizzle(sr: number, dur = 1.6): Float32Array {
  const d = Math.max(0.2, dur), r = rng(91), raw = zeros(sr, d);
  for (let i = 0; i < raw.length; i++) raw[i] = r() * 2 - 1;
  const x = highpass(sr, raw, 3500), n = x.length;
  for (let i = 0; i < n; i++) { const t = i / sr, env = Math.min(1, t / 0.08) * Math.min(1, (n - i) / (sr * 0.4)); x[i] *= env * (0.35 + (r() < 0.02 ? 2.5 : 0)); }
  return fade(normalize(x, 0.6), sr, 3);
}

/** pouring water for `dur` s: noise through a narrow band around 700 Hz, gently wobbling (chili-history's pour) */
export function renderPour(sr: number, dur = 1.6): Float32Array {
  const d = Math.max(0.2, dur), x = bandpass(sr, hiss(sr, d, 92, () => 1), 700, 2), n = x.length;
  for (let i = 0; i < n; i++) { const t = i / sr, env = Math.min(1, t / 0.15) * Math.min(1, (n - i) / (sr * 0.4)); x[i] *= env * (0.7 + 0.3 * Math.sin(TAU * 9 * t)); }
  return fade(normalize(x, 0.6), sr, 3);
}

/** wings beating `flaps` times `gap` s apart: soft low puffs of air (chili-history's flap) */
export function renderFlap(sr: number, flaps = 5, gap = 0.09): Float32Array {
  const n = Math.max(1, Math.min(20, Math.round(flaps))), x = zeros(sr, (n - 1) * gap + 0.08);
  for (let k = 0; k < n; k++) {
    const one = lowpass(sr, hiss(sr, 0.08, 93 + k, () => 1), () => 900);
    for (let i = 0; i < one.length; i++) one[i] *= Math.sin((Math.PI * i) / one.length);
    mixIn(sr, x, one, k * gap, 1 - 0.25 * (k / Math.max(1, n - 1)));
  }
  return fade(normalize(x, 0.7), sr, 2);
}

/** a tape winding in a camcorder or cassette deck for `dur` s: a soft band of noise over a slowly rising motor hum (wedding-short's whirr) */
export function renderWhirr(sr: number, dur = 0.5): Float32Array {
  const d = Math.max(0.2, dur), x = zeros(sr, d), r = rng(94), hold = Math.max(0.05, d - 0.25);
  let lp = 0, lp2 = 0, ph = 0;
  const a1 = 1 - Math.pow(1 - 0.12, 48000 / sr), a2 = 1 - Math.pow(1 - 0.3, 48000 / sr);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, w = r() * 2 - 1; lp += (w - lp) * a1; lp2 += (lp - lp2) * a2;
    ph += (180 + 160 * (t / d)) / sr;
    const env = Math.min(1, t / 0.05) * (t < hold ? 1 : Math.exp(-(t - hold) * 9));
    x[i] = ((lp - lp2) * 0.9 + Math.sin(TAU * ph) * 0.12) * env;
  }
  return fade(normalize(x, 0.6), sr, 3);
}

// ---------- the phone and the camcorder (2026-10-23): sounds t2-notify, t2-line, t2-reels and uk-dv each synthesised on their own ----------
/** the camcorder's beeps: rec, two short 3.1 kHz chirps 0.13 s apart (recording starts); end, three 2.3 kHz ones 0.32 s apart (tape end,
 *  battery low) (uk-dv) */
export function renderCamBeep(sr: number, kind: 'rec' | 'end' = 'rec'): Float32Array {
  const [times, f, len] = kind === 'end' ? [[0, 0.32, 0.64], 2300, 0.12] as const : [[0, 0.13], 3100, 0.07] as const;
  const x = zeros(sr, times[times.length - 1] + len + 0.05);
  const env = (t: number) => Math.max(0, Math.min(1, t / 0.004, (len - t) / 0.012));
  for (const t0 of times) { mixIn(sr, x, osc(sr, len, () => f, env), t0, 0.4); mixIn(sr, x, osc(sr, len, () => 2 * f, env), t0, 0.06); }
  return fade(normalize(x, 0.5), sr, 1);
}

/** a phone vibrating on a table, `pulses` times: a 158 Hz motor (a squared sine with its octave) rattling, 0.24 s on, 0.1 s off (t2-notify) */
export function renderBuzz(sr: number, pulses = 2): Float32Array {
  const n = Math.max(1, Math.min(8, Math.round(pulses))), x = zeros(sr, n * 0.34 - 0.1 + 0.02), r = rng(4242);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, u = t % 0.34, on = u < 0.24 && t < n * 0.34 ? 1 : 0;
    const env = on * Math.min(1, u * 60, (0.24 - u) * 200), m = Math.sin(TAU * 158 * t), sq = Math.sign(m) * 0.35 + m * 0.65;
    x[i] = env * (sq * 0.7 + Math.sin(TAU * 316 * t) * 0.2 + (r() * 2 - 1) * 0.12 * Math.abs(m));
  }
  return fade(normalize(lowpass(sr, x, () => 2400), 0.6), sr, 2);   // the table takes the edge off
}

/** a message sent: a short tone swooping up from 520 Hz to 1.15 kHz with a puff of air on its front (t2-line) */
export function renderSend(sr: number): Float32Array {
  const x = zeros(sr, 0.2);
  mixIn(sr, x, osc(sr, 0.12, (t) => 520 * Math.pow(1150 / 520, t / 0.12), (t) => Math.min(1, t / 0.004) * Math.exp(-(t / 0.12) * 4)), 0, 0.8);
  mixIn(sr, x, lowpass(sr, hiss(sr, 0.02, 21, (t) => Math.min(1, t / 0.002) * Math.exp(-(t / 0.02) * 6)), () => 5000), 0, 0.3);
  return fade(normalize(x, 0.7), sr, 1);
}

/** a message received: two soft notes, `pitch` then a fifth above 0.09 s later (A5 → E6) (t2-line) */
export function renderRecv(sr: number, pitch = 880): Float32Array {
  const x = zeros(sr, 0.6);
  for (const [at, f, len] of [[0, pitch, 0.35], [0.09, pitch * 1.5, 0.45]]) {
    const e = (t: number) => Math.min(1, t / 0.004) * Math.exp(-(t / len) * 6);
    mixIn(sr, x, osc(sr, len, () => f, e), at, 0.6); mixIn(sr, x, osc(sr, len, () => 2 * f, e), at, 0.09);
  }
  return fade(normalize(x, 0.6), sr, 2);
}

/** muted: two notes falling, G5 then C5 (a notification silenced, turned off, shushed) (t2-notify) */
export function renderHush(sr: number): Float32Array {
  const x = zeros(sr, 0.45);
  for (const [at, f, len] of [[0, 784, 0.15], [0.15, 523, 0.3]] as const) mixIn(sr, x, osc(sr, len, () => f, (t) => Math.min(1, t * 300) * Math.exp(-t * 9) * Math.min(1, (len - t) / 0.01)), at, 1);
  return fade(normalize(x, 0.45), sr, 2);
}

/** a tape rewinding for `dur` s: a noise sweep from bright to dull with a whine falling from 900 Hz, swelling and fading (t2-reels) */
export function renderRewind(sr: number, dur = 0.7): Float32Array {
  const d = Math.max(0.2, dur), x = zeros(sr, d), r = rng(95);
  let lp = 0, ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, u = t / d, a = 1 - Math.pow(1 - (0.05 + 0.6 * (1 - u) ** 2), 48000 / sr), e = Math.sin(Math.PI * Math.min(1, u)) ** 1.5;
    lp += a * ((r() * 2 - 1) - lp); ph += (900 - 700 * u) / sr;
    x[i] = 0.7 * e * lp + 0.12 * e * Math.sin(TAU * ph);
  }
  return fade(normalize(x, 0.6), sr, 3);
}

type Bus = { out: AudioNode; verb: AudioNode; noise: AudioBuffer };
/** play `x` at `at` through the bus; `send` is how much goes to the reverb too */
/** a boxing-ring bell (the podcast-versus short's score): a hard strike of inharmonic partials with a long shimmer, `strikes` times
 *  `gap` s apart (ding-ding); `pitch` is the fundamental (E6 by default) */
export function renderRingBell(sr: number, strikes = 2, gap = 0.28, pitch = 1318.51): Float32Array {
  const n = Math.max(1, Math.round(strikes)), x = zeros(sr, (n - 1) * gap + 1.4);
  for (let i = 0; i < n; i++) bell(x, sr, i * gap, pitch, i ? 0.75 : 1, [[1, 1, 2.2], [2.32, 0.55, 3.5], [4.25, 0.32, 5.5], [6.8, 0.18, 8]]);
  return fade(normalize(x, 0.85), sr, 3);
}

function play(ctx: BaseAudioContext, bus: Bus, at: number, x: Float32Array, send = 0) {
  const buf = ctx.createBuffer(1, x.length, ctx.sampleRate);
  buf.getChannelData(0).set(x);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(bus.out);
  if (send > 0) { const g = ctx.createGain(); g.gain.value = send; src.connect(g); g.connect(bus.verb); }
  src.start(at);
}

const num = (key: string, label: string, def: number, min: number, max: number, step = 0.05): ParamDef => ({ key, label, type: 'number', min, max, step, default: def });
const SHORT = 0.05, LONG = 4;
/** a note on a scale whose root is the sound's pitch (ding, xylo): step 0 is the pitch itself */
const STEP: ParamDef[] = [num('step', '音階第幾級（0＝主音）', 0, -14, 21, 1), { key: 'scale', label: '音階', type: 'enum', options: ['major', 'pentatonic'], default: 'major' }];
const n2 = (p: Record<string, any>, k: string) => Math.max(1, Math.round(p[k]));

export const commonSfx: SfxType[] = [
  { type: 'common.beep', label: '消音嗶聲', category: 'alert', doc: '1 kHz 的電視消音嗶聲，長度對齊被消音的字；配 common.censor 貼紙；kind rec 是攝影機開始錄影的「嗶嗶」兩聲短高音、end 是帶子快用完／沒電的三聲（這兩種不看長度和頻率；DV、家庭錄影帶、配 common.film 的 vhs）',
    params: [num('dur', '長度 (s)', 0.5, 0.05, 3), num('freq', '頻率 (Hz)', 1000, 300, 3000, 10),
      { key: 'kind', label: '種類（bleep 消音嗶聲、rec 攝影機開始錄影、end 帶子快用完）', type: 'enum', options: ['bleep', 'rec', 'end'], default: 'bleep' }],
    duration: (p) => (p.kind === 'rec' ? 0.25 : p.kind === 'end' ? 0.81 : p.dur), lookback: SHORT,
    synth: (c, b, at, p) => play(c, b, at, p.kind === 'rec' || p.kind === 'end' ? renderCamBeep(c.sampleRate, p.kind) : renderBeep(c.sampleRate, p.dur, p.freq)) },
  { type: 'common.whoosh', label: '咻', category: 'move', doc: '一聲掃過的風切聲；轉場、元素飛入飛出',
    params: [num('dur', '長度 (s)', 0.5, 0.1, 3)],
    duration: (p) => p.dur, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderWhoosh(c.sampleRate, p.dur), 0.2) },
  { type: 'common.impact', label: '重擊', category: 'hit', doc: '低頻的一記重擊加長尾；爆字落地、標題出現、轉折',
    params: [], duration: () => 1.4, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderImpact(c.sampleRate), 0.25) },
  { type: 'common.shing', label: '光掃過', category: 'chime', doc: '一道光掃過的亮聲（高頻的沙沙聲加一個往下滑的高音）；商標落定、光掃過字、揭曉的瞬間',
    params: [num('len', '長度 (s)', 1.2, 0.3, 3)], duration: (p) => p.len, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderShing(c.sampleRate, p.len), 0.2) },
  { type: 'common.air', label: '一口氣', category: 'move', doc: '一口空氣聲，慢慢起來再收掉；畫面打開、牆出現、段落之間的呼吸；bright 越大越亮',
    params: [num('len', '長度 (s)', 1.6, 0.4, 6), num('bright', '亮度（0 悶、1 亮）', 0.5, 0, 1, 0.05)],
    duration: (p) => p.len, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderAir(c.sampleRate, p.len, p.bright), 0.15) },
  { type: 'common.riser', label: '上升音', category: 'move', doc: '越來越高、越來越大的上升音，結束在高點；轉折或揭曉之前的鋪陳',
    params: [num('dur', '長度 (s)', 2.5, 0.5, 8)],
    duration: (p) => p.dur, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderRiser(c.sampleRate, p.dur), 0.2) },
  { type: 'common.pop', label: '啵', category: 'hit', doc: '短短的氣泡「啵」；貼紙、表情、小元素彈出',
    params: [num('pitch', '音高 (Hz)', 700, 200, 2000, 10)],
    duration: () => 0.12, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderPop(c.sampleRate, p.pitch)) },
  { type: 'common.thud', label: '悶響', category: 'hit', doc: '短而低的一聲悶響，像印章蓋下去；配 common.stamp；paper: 橡皮章蓋在桌上的紙卡（多一聲木頭敲擊和紙聲），配 common.postmark／common.postcard',
    params: [{ key: 'paper', label: '蓋在紙卡上（木桌、紙聲）', type: 'bool', default: false }], duration: (p) => (p.paper ? 0.45 : 0.35), lookback: SHORT,
    synth: (c, b, at, p) => play(c, b, at, renderThud(c.sampleRate, !!p.paper), 0.1) },
  { type: 'common.tick', label: '滴答', category: 'alert', doc: '一下乾淨的點擊聲；數數、進度、打字、逐字出現',
    params: [], duration: () => 0.04, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderTick(c.sampleRate)) },
  { type: 'common.ding', label: '叮', category: 'chime', doc: '清脆的一聲叮；答對、重點出現、靈光一閃。一連串叮聲要一階一階往上：同一個 pitch（主音）、step 0、1、2…（scale: major 大調／pentatonic 五聲）',
    params: [num('pitch', '音高 (Hz)', 1568, 600, 4000, 10), ...STEP],
    duration: () => 1.2, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderDing(c.sampleRate, scaleStep(p.pitch, p.step, p.scale)), 0.15) },
  { type: 'common.error', label: '錯誤音', category: 'alert', doc: '兩聲低沉的「嗶嗶」；答錯、失敗、NG',
    params: [], duration: () => 0.55, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderError(c.sampleRate)) },
  { type: 'common.shutter', label: '快門', category: 'paper', doc: '相機快門「喀嚓」；定格、拍照、拍立得',
    params: [], duration: () => 0.18, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderShutter(c.sampleRate)) },
  { type: 'common.typing', label: '打字', category: 'paper', doc: '一段鍵盤打字聲，長度可調；文字一個字一個字出現、搜尋、留言',
    params: [num('dur', '長度 (s)', 1.5, 0.2, 10)],
    duration: (p) => p.dur, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderTyping(c.sampleRate, p.dur)) },
  { type: 'common.cash', label: '收銀', category: 'chime', doc: '收銀機「鏘鏘」；價錢、省錢、賺錢、花大錢；coins 加上抽屜彈開和銅板聲（合計、結帳）',
    params: [{ key: 'coins', label: '抽屜和銅板聲', type: 'bool', default: false }], duration: () => 1.1, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderCash(c.sampleRate, !!p.coins), 0.15) },
  { type: 'common.deflate', label: '洩氣', category: 'alert', doc: '「噗～」往下滑的洩氣聲；不算數、失望、只動一點點、冷場',
    params: [], duration: () => 0.45, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderDeflate(c.sampleRate), 0.1) },
  { type: 'common.scratch', label: '刮唱片', category: 'move', doc: '唱片被刮停的「嘰——」；氣氛急轉、打斷、「等一下」的笑點',
    params: [], duration: () => 0.42, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderScratch(c.sampleRate)) },
  { type: 'common.powerup', label: '開機掃描', category: 'move', doc: '儀表開機：伺服馬達轉上去再轉回來，帶一串滴答；計量表、機器啟動、掃描',
    params: [], duration: () => 0.85, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderPowerUp(c.sampleRate), 0.1) },
  { type: 'common.alarm', label: '警報', category: 'alert', doc: '短促的「嗶、嗶、嗶」警報（聲數可調）；危險、快爆表、倒數最後幾秒',
    params: [num('beeps', '幾聲', 3, 1, 12, 1)], duration: (p) => Math.max(1, Math.round(p.beeps)) * 0.2 + 0.02, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderAlarm(c.sampleRate, p.beeps)) },
  { type: 'common.explode', label: '爆炸＋玻璃碎', category: 'hit', doc: '轟的一聲爆炸、低頻下墜，再一陣玻璃碎片；爆表、搞砸、大揭曉；配 common.burst 的 blast',
    params: [], duration: () => 2.6, lookback: LONG, synth: (c, b, at) => play(c, b, at, renderExplode(c.sampleRate), 0.25) },
  { type: 'common.ffwd', label: '快轉', category: 'move', doc: '錄音帶快轉的「咻～」往上爬；時間快轉、跳過等待；配 common.timelapse',
    params: [num('dur', '長度 (s)', 0.6, 0.2, 3)], duration: (p) => p.dur, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderFastForward(c.sampleRate, p.dur)) },
  { type: 'common.page', label: '翻頁', category: 'paper', doc: '紙張翻頁的沙沙聲；換步驟、換卡片、翻開下一頁；配 common.notecard',
    params: [], duration: () => 0.42, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderPage(c.sampleRate), 0.1) },
  { type: 'common.slide', label: '紙卡滑入', category: 'paper', doc: '一張卡片在一疊紙上滑過去、最後輕輕落定；明信片、卡片、照片滑進畫面；配 common.postcard／common.frame',
    params: [], duration: () => 1.1, lookback: LONG, synth: (c, b, at) => play(c, b, at, renderSlide(c.sampleRate), 0.1) },
  { type: 'common.flip', label: '卡片翻面', category: 'paper', doc: '桌上一張卡片翻過來：兩下紙和空氣的拍動、再落定；翻到背面、換一面；配 common.postcard／common.frame',
    params: [], duration: () => 0.8, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderFlip(c.sampleRate), 0.1) },
  { type: 'common.xylo', label: '木琴', category: 'chime', doc: '一聲短短的木琴；清單打勾、一項一項出現（同一個 pitch 當主音、step 0、1、2… 一階一階往上，scale: major／pentatonic；或直接換 pitch 排成小旋律）',
    params: [num('pitch', '音高 (Hz)', 880, 200, 4000, 10), ...STEP], duration: () => 0.16, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderXylo(c.sampleRate, scaleStep(p.pitch, p.step, p.scale)), 0.15) },
  { type: 'common.print', label: '印字', category: 'paper', doc: '熱感應收據機印字的嗡嗡聲（印字頭加步進馬達），長度可調；每印一行一聲；配 common.printer',
    params: [num('dur', '長度 (s)', 0.34, 0.05, 3)], duration: (p) => Math.max(0.05, p.dur), lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderPrint(c.sampleRate, p.dur)) },
  { type: 'common.clunk', label: '切紙喀', category: 'paper', doc: '收據機切紙刀／送紙卡榫的一聲「喀」；新的一段、換一家店、機器動作',
    params: [], duration: () => 0.16, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderClunk(c.sampleRate)) },
  { type: 'common.tear', label: '撕紙', category: 'paper', doc: '把一張紙「嘶啦」撕下來；撕收據、撕日曆、撕掉重來；配 common.printer 的 tearAt',
    params: [], duration: () => 0.55, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderTear(c.sampleRate), 0.1) },
  { type: 'common.rattle', label: '鐵捲門', category: 'move', doc: '鐵捲門拉下來的「嘩啦啦」加到底的一聲；打烊、收工、結束；配 common.rolldoor',
    params: [], duration: () => 0.65, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderRattle(c.sampleRate), 0.15) },
  { type: 'common.dingdong', label: '叮咚', category: 'alert', doc: '叫號機的「叮咚」兩聲（高音到低音，預設 A5→F5）；換號、下一位、換段落、到站；配 common.digits 的 led',
    params: [num('high', '第一聲 (Hz)', 880, 200, 3000, 1), num('low', '第二聲 (Hz)', 698.46, 200, 3000, 1)], duration: () => 1.95, lookback: SHORT,
    synth: (c, b, at, p) => play(c, b, at, renderDingDong(c.sampleRate, p.high, p.low), 0.2) },
  { type: 'common.ringbell', label: '擂台鈴', category: 'alert', doc: '拳擊擂台的鈴「叮、叮」（聲數可調）：硬敲一下加長長的金屬餘韻；回合開始、對決、片頭 VS、比賽結束；配 common.versus 的回合卡',
    params: [num('strikes', '幾聲', 2, 1, 6, 1), num('gap', '間隔 (s)', 0.28, 0.1, 1, 0.01), num('pitch', '音高 (Hz)', 1318.51, 300, 3000, 1)],
    duration: (p) => (Math.max(1, Math.round(p.strikes)) - 1) * p.gap + 1.4, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderRingBell(c.sampleRate, p.strikes, p.gap, p.pitch), 0.2) },
  // ---- the sound pack (2026-10-21)
  { type: 'common.chime', label: '閃光叮鈴', category: 'chime', doc: '叮鈴鈴往上爬的閃光（鐵琴分解和弦，音數、起音、間隔可調；chip: 8-bit 方波）；亮晶晶、變好看、揭曉、魔法、稀有款；配 common.sparkle 畫面',
    params: [num('notes', '幾個音', 4, 1, 8, 1), num('pitch', '起音 (Hz)', 1568, 300, 4000, 10), num('gap', '間隔 (s)', 0.07, 0.03, 0.3, 0.01), { key: 'chip', label: '8-bit 方波', type: 'bool', default: false }],
    duration: (p) => (Math.min(8, n2(p, 'notes')) - 1) * p.gap + (p.chip ? 0.35 : 1.2), lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderChime(c.sampleRate, p.notes, p.pitch, p.gap, !!p.chip), 0.15) },
  { type: 'common.coin', label: '投幣', category: 'chime', doc: '8-bit 遊戲的投幣「叮鈴↑」（方波兩音，音高可調）；投幣、得分、拿到東西、扭蛋、集點',
    params: [num('pitch', '音高 (Hz)', 987.77, 300, 3000, 1)], duration: () => 0.42, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderCoin(c.sampleRate, p.pitch), 0.1) },
  { type: 'common.fanfare', label: '過關號角', category: 'chime', doc: '8-bit 過關號角：四個音往上、再一個大和弦（主音可調）；完成、集滿、獲勝、解鎖、片尾',
    params: [num('pitch', '主音 (Hz)', 523.25, 200, 1500, 1)], duration: () => 1.3, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderFanfare(c.sampleRate, p.pitch), 0.15) },
  { type: 'common.knock', label: '敲木頭', category: 'hit', doc: '敲木頭「叩叩」（次數、間隔、音高可調；低一點像敲門、高一點像木魚）；敲門、提醒、一下一下數、禪意',
    params: [num('knocks', '幾下', 2, 1, 12, 1), num('gap', '間隔 (s)', 0.16, 0.06, 1, 0.01), num('pitch', '音高 (Hz)', 820, 200, 2500, 10)],
    duration: (p) => (Math.min(12, n2(p, 'knocks')) - 1) * p.gap + 0.3, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderKnock(c.sampleRate, p.knocks, p.gap, p.pitch), 0.1) },
  { type: 'common.boing', label: '彈簧', category: 'hit', doc: '彈簧「啵嚶～」的卡通彈跳（音高可調）；跳起來、彈出來、Q 彈、搞笑的反彈',
    params: [num('pitch', '音高 (Hz)', 180, 80, 800, 5)], duration: () => 0.62, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderBoing(c.sampleRate, p.pitch)) },
  { type: 'common.footstep', label: '腳步', category: 'move', doc: '一串腳步聲（步數、間隔可調，左右腳音高不同；soft: 軟軟的卡通腳步，預設是木地板）；走進畫面、走到下一間、偷偷靠近',
    params: [num('steps', '幾步', 4, 1, 16, 1), num('gap', '間隔 (s)', 0.3, 0.1, 1, 0.01), { key: 'soft', label: '卡通軟腳步', type: 'bool', default: false }],
    duration: (p) => (Math.min(16, n2(p, 'steps')) - 1) * p.gap + 0.2, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderFootstep(c.sampleRate, p.steps, p.gap, !!p.soft), 0.1) },
  { type: 'common.flap', label: '拍翅膀', category: 'move', doc: '翅膀「啪啪啪」拍動（次數、間隔可調）；鳥飛走、飛進畫面、紙片翻飛',
    params: [num('flaps', '幾下', 5, 1, 20, 1), num('gap', '間隔 (s)', 0.09, 0.04, 0.5, 0.01)],
    duration: (p) => (Math.min(20, n2(p, 'flaps')) - 1) * p.gap + 0.08, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderFlap(c.sampleRate, p.flaps, p.gap)) },
  { type: 'common.whirr', label: '捲帶', category: 'move', doc: '錄影帶／卡帶捲動的「嘰嚕嚕」馬達聲（長度可調）；換帶、倒帶、回到過去、老錄影帶；配 common.film',
    params: [num('dur', '長度 (s)', 0.5, 0.2, 4)], duration: (p) => Math.max(0.2, p.dur), lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderWhirr(c.sampleRate, p.dur)) },
  { type: 'common.scribble', label: '筆刷', category: 'paper', doc: '筆在紙上寫字、畫線的沙沙聲（長度、每秒幾筆可調；crayon: 蠟筆，較粗較顆粒）；手寫字、畫圈、打勾、塗鴉；配 common.handwrite／common.pen（跟 common.scratch 刮唱片不同）',
    params: [num('dur', '長度 (s)', 0.6, 0.1, 6), num('strokes', '每秒幾筆', 5, 1, 14, 0.5), { key: 'crayon', label: '蠟筆', type: 'bool', default: false }],
    duration: (p) => Math.max(0.1, p.dur), lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderScribble(c.sampleRate, p.dur, p.strokes, !!p.crayon)) },
  { type: 'common.tape', label: '撕膠帶', category: 'paper', doc: '從膠帶捲撕下一段「嘶—」再按上去的一下（press 關掉就只有撕）；貼標籤、貼紙條、貼照片；跟 common.tear（整張紙撕下來）不同',
    params: [{ key: 'press', label: '撕完按上去', type: 'bool', default: true }], duration: (p) => (p.press ? 0.42 : 0.32), lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderTape(c.sampleRate, !!p.press)) },
  { type: 'common.clink', label: '湯匙碰碗', category: 'life', doc: '湯匙碰瓷碗「叮」的清脆一聲（glass: 冰塊碰玻璃杯，叮叮叮三下）；吃東西、攪拌、喝湯、冰飲、乾杯',
    params: [{ key: 'glass', label: '冰塊碰玻璃杯', type: 'bool', default: false }], duration: (p) => (p.glass ? 0.9 : 1.1), lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderClink(c.sampleRate, !!p.glass), 0.1) },
  { type: 'common.drip', label: '水滴', category: 'life', doc: '水滴「咚～」往上滑的一聲（滴數、間隔、音高可調）；滴水、流汗、冒出一個念頭、慢慢累積',
    params: [num('drops', '幾滴', 1, 1, 12, 1), num('gap', '間隔 (s)', 0.35, 0.1, 2, 0.01), num('pitch', '音高 (Hz)', 650, 200, 2000, 10)],
    duration: (p) => (Math.min(12, n2(p, 'drops')) - 1) * p.gap + 0.22, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderDrip(c.sampleRate, p.drops, p.gap, p.pitch), 0.15) },
  { type: 'common.sizzle', label: '油煎', category: 'life', doc: '熱油下鍋「滋滋～」的油煎聲，帶油爆的劈啪（長度可調）；煎、炸、炒、下鍋、熱騰騰',
    params: [num('dur', '長度 (s)', 1.6, 0.2, 8)], duration: (p) => Math.max(0.2, p.dur), lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderSizzle(c.sampleRate, p.dur)) },
  { type: 'common.pour', label: '倒水', category: 'life', doc: '倒水、倒飲料的「嘩～」水流聲（長度可調）；倒茶、倒湯、加醬汁、裝滿',
    params: [num('dur', '長度 (s)', 1.6, 0.2, 8)], duration: (p) => Math.max(0.2, p.dur), lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderPour(c.sampleRate, p.dur), 0.1) },
  { type: 'common.cry', label: '嬰兒哭', category: 'life', doc: '卡通的嬰兒哭聲「哇～啊～」（聲數、音高可調，柔和不刺耳）；嬰兒、育兒、崩潰、哭哭',
    params: [num('times', '幾聲', 2, 1, 6, 1), num('pitch', '音高 (Hz)', 520, 250, 1000, 5)],
    duration: (p) => Math.min(6, n2(p, 'times')) * 0.75, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderCry(c.sampleRate, p.times, p.pitch), 0.1) },
  // ---- the phone and the camcorder (2026-10-23)
  { type: 'common.buzz', label: '手機震動', category: 'alert', doc: '手機放在桌上震動的「嗡—嗡—」（次數可調）；來電、通知、訊息進來、被已讀不回、心裡一震；配 common.touch',
    params: [num('pulses', '震幾下', 2, 1, 8, 1)], duration: (p) => Math.min(8, n2(p, 'pulses')) * 0.34 - 0.08, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderBuzz(c.sampleRate, p.pulses)) },
  { type: 'common.send', label: '送出訊息', category: 'move', doc: '聊天訊息送出的「咻↑」短短往上滑的一聲；傳訊息、留言送出、按下送出、發文',
    params: [], duration: () => 0.2, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderSend(c.sampleRate), 0.05) },
  { type: 'common.recv', label: '收到訊息', category: 'chime', doc: '收到訊息的輕輕兩聲「叮咚↑」（第二聲高五度，音高可調）；新訊息、對方回覆、通知跳出來；跟 common.dingdong（叫號機往下的兩聲）不同',
    params: [num('pitch', '第一聲 (Hz)', 880, 300, 2500, 1)], duration: () => 0.6, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderRecv(c.sampleRate, p.pitch), 0.1) },
  { type: 'common.hush', label: '靜音', category: 'alert', doc: '往下掉的兩個音「嘟↓嘟」：通知被關掉、靜音、按掉鬧鐘、拒接、不想理；跟 common.deflate（洩氣滑音）、common.error（答錯）不同',
    params: [], duration: () => 0.45, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderHush(c.sampleRate)) },
  { type: 'common.rewind', label: '倒帶', category: 'move', doc: '錄影帶倒帶的「嘰嚕嚕↓」：雜訊從亮掃到悶、一條往下掉的尖音（長度可調）；倒帶、回到過去、重來一次、回顧；跟 common.ffwd（快轉往上爬）相反',
    params: [num('dur', '長度 (s)', 0.7, 0.2, 3)], duration: (p) => Math.max(0.2, p.dur), lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderRewind(c.sampleRate, p.dur), 0.1) },
];
