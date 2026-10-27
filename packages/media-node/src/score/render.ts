// Score → sound (toolkit phase 3): events become samples, a little room is added, the level is set, and the result is the same every time.
import * as S from './synth.ts';
import { mtof } from './theory.ts';
import { arrangement, composeEvents, STYLES, type Inst, type ScoreEvent, type Style } from './styles.ts';

export interface ScoreInfo {
  style: string; bpm: number; key: string; seed: number; bars: number; sampleRate: number;
  /** length in seconds including the last chord ringing out */
  duration: number;
  /** where the bars start (s) and what each does: intro, loop, fill, outro, end */
  barStarts: number[]; roles: string[];
}
export interface Score { info: ScoreInfo; L: Float32Array; R: Float32Array; events: ScoreEvent[] }

/** how much of each instrument goes to the reverb */
const SEND: Partial<Record<Inst, number>> = { pad: 0.45, bell: 0.4, epiano: 0.28, marimba: 0.22, pluck: 0.2, tom: 0.3, snare: 0.12, softSnare: 0.2, clap: 0.2, sub: 0.02, bass: 0.02, kick: 0.01, hat: 0.05, openHat: 0.1, shaker: 0.05, pulse: 0.1 };
const TONAL = new Set<Inst>(['marimba', 'bell', 'epiano', 'bass', 'sub', 'pad', 'pulse', 'tom']);

function voice(sr: number, r: S.Rng, e: ScoreEvent, style: Style): Float32Array {
  const own = style.voices?.[e.inst];
  if (own) return own(sr, r, e, S);                              // the style's own instrument
  const f = e.midi !== undefined ? mtof(e.midi) : 0, d = e.dur;
  switch (e.inst) {
    case 'pluck': return S.pluck(sr, r, f, Math.min(d ?? 1.2, 2.5), 0.55);
    case 'marimba': return S.marimba(sr, f, Math.min(d ?? 0.7, 1.2));
    case 'bell': return S.bell(sr, f, Math.min(d ?? 1.5, 3));
    case 'epiano': return S.epiano(sr, f, Math.min(d ?? 1.6, 4));
    case 'bass': return S.bass(sr, f, Math.min(d ?? 0.4, 1.5));
    case 'sub': return S.sub(sr, f, d ?? 2);
    case 'pad': return S.pad(sr, f, d ?? 3, 1, 0.4);
    case 'pulse': return S.pulse(sr, f, Math.min(d ?? 0.18, 0.5));
    case 'tom': return S.tom(sr, f);
    case 'kick': return S.kick(sr, r);
    case 'snare': return S.snare(sr, r);
    case 'softSnare': return S.snare(sr, r, 1, true);
    case 'clap': return S.clap(sr, r);
    case 'hat': return S.hat(sr, r);
    case 'openHat': return S.hat(sr, r, 1, true);
    case 'shaker': return S.shaker(sr, r);
    default: throw new Error(`風格「${style.id}」用了沒有定義的樂器「${e.inst}」（內建的樂器，或寫在 voices 裡的）`);
  }
}

/** A small Schroeder room (four combs and two allpasses per side) on a mono send, returned as a stereo wet signal. */
function room(sr: number, send: Float32Array): { L: Float32Array; R: Float32Array } {
  const k = sr / 44100, side = (delays: number[], gain: number) => {
    const out = new Float32Array(send.length);
    for (const dl of delays) {
      const d = Math.round(dl * k), buf = new Float32Array(d);
      let idx = 0, lp = 0;
      for (let i = 0; i < send.length; i++) {
        const y = buf[idx];
        lp += 0.35 * (y - lp);                                    // the room darkens as it rings
        buf[idx] = send[i] + lp * 0.8;
        idx = (idx + 1) % d;
        out[i] += y * gain;
      }
    }
    for (const dl of [225, 556]) {
      const d = Math.round(dl * k), buf = new Float32Array(d);
      let idx = 0;
      for (let i = 0; i < out.length; i++) { const b = buf[idx], x = out[i]; const y = -x + b; buf[idx] = x + b * 0.5; idx = (idx + 1) % d; out[i] = y; }
    }
    return out;
  };
  return { L: side([1557, 1617, 1491, 1422], 0.25), R: side([1580, 1640, 1520, 1445], 0.25) };
}

export interface ScoreOptions {
  style: string;
  /** styles beyond the built-in five (a project's own, or the library's), by id */
  styles?: Record<string, Style>;
  bpm?: number; key?: string; length: number; seed?: number; sampleRate?: number;
  /** exactly this many bars (instead of as many as fit `length`) */
  bars?: number;
  /** moments of the film the style may answer (StyleCtx.cues), film seconds by name */
  cues?: Record<string, number>;
}

/** Compose and render a score of about `length` seconds (whole bars; the last chord rings a little longer). */
export function generateScore(o: ScoreOptions): Score {
  const all = { ...STYLES, ...(o.styles ?? {}) }, style = all[o.style];
  if (!style) throw new Error(`沒有「${o.style}」這個配樂風格；有：${Object.keys(all).join('、')}`);
  const sr = o.sampleRate ?? 44100, bpm = o.bpm ?? style.defaults.bpm, key = o.key ?? style.defaults.key, seed = o.seed ?? 1;
  if (!(bpm >= 40 && bpm <= 200)) throw new Error(`速度 ${bpm} BPM 不在 40–200 之間`);
  const bar = (60 / bpm) * 4, bars = Math.max(4, o.bars ?? Math.round(o.length / bar)), tail = 1.6, seconds = bars * bar + tail;
  const r = S.rng(seed * 7919 + 13);
  const events = composeEvents(style, { bpm, key, bars, rng: r, cues: o.cues });
  const n = Math.ceil(seconds * sr), L = new Float32Array(n), R = new Float32Array(n), send = new Float32Array(n);
  const cache = new Map<string, Float32Array>();
  const noise = S.rng(seed * 104729 + 7);
  for (const e of events) {
    const ck = `${e.inst}|${e.midi}|${e.dur?.toFixed(3)}`;
    const own = !!style.voices?.[e.inst], tonal = TONAL.has(e.inst) || (own && e.midi !== undefined);
    let sig = tonal ? cache.get(ck) : undefined;
    if (!sig) { sig = voice(sr, tonal ? r : noise, e, style); if (tonal) cache.set(ck, sig); }
    const at = Math.round(e.t * sr), gl = e.vel * Math.cos(((e.pan + 1) * Math.PI) / 4) * Math.SQRT2, gr = e.vel * Math.sin(((e.pan + 1) * Math.PI) / 4) * Math.SQRT2, snd = SEND[e.inst as Inst] ?? (own ? 0.15 : 0.05);
    for (let i = 0; i < sig.length && at + i < n; i++) { const v = sig[i]; L[at + i] += v * gl; R[at + i] += v * gr; send[at + i] += v * e.vel * snd; }
  }
  const wet = room(sr, send);
  for (let i = 0; i < n; i++) { L[i] += wet.L[i]; R[i] += wet.R[i]; }
  // master: a one-pole high-pass for rumble, level to about -19 dBFS RMS, soft clip, fade the last third of a second
  let hl = 0, hr = 0, sum = 0;
  const a = Math.exp((-2 * Math.PI * 28) / sr);
  for (let i = 0; i < n; i++) { hl = (1 - a) * L[i] + a * hl; hr = (1 - a) * R[i] + a * hr; L[i] -= hl; R[i] -= hr; sum += L[i] * L[i] + R[i] * R[i]; }
  const rms = Math.sqrt(sum / (2 * n)) || 1e-4, g = 0.112 / rms, fade = Math.floor(0.33 * sr);
  for (let i = 0; i < n; i++) {
    const f = i > n - fade ? (n - i) / fade : 1;
    L[i] = (Math.tanh(L[i] * g * 1.1) / 1.1) * f;
    R[i] = (Math.tanh(R[i] * g * 1.1) / 1.1) * f;
  }
  const roles = Array.from({ length: bars }, (_, i) => arrangement(bars).role(i));
  return { info: { style: o.style, bpm, key, seed, bars, sampleRate: sr, duration: +seconds.toFixed(3), barStarts: Array.from({ length: bars }, (_, i) => +(i * bar).toFixed(4)), roles }, L, R, events };
}

/** 16-bit stereo PCM WAV bytes. */
export function encodeWav16(L: Float32Array, R: Float32Array, sampleRate: number): Buffer {
  const n = L.length, data = Buffer.alloc(n * 4), h = Buffer.alloc(44);
  for (let i = 0; i < n; i++) { data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), i * 4); data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), i * 4 + 2); }
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
