// The common sound effects of everyday life: a spoon on a bowl, drips, sizzling, pouring, a baby crying, distant thunder.
import { rng, type SfxType } from '@tellcut/engine';
import { TAU, fade, bell, zeros, mixIn, osc, hiss, highpass, decay, normalize, lp1, bandpass, play, num, SHORT, n2, LONG } from './synth.ts';

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

/** distant thunder (the katie-sweet16 short's fx.thunder): brown noise through two low-passes (about 300 and 450 Hz) swelling in over
 *  0.08 s and rolling away over 3 s with a slow wobble, a soft crack of raw noise in the first third of a second; `seed` picks the roll */
export function renderThunder(sr: number, seed = 3): Float32Array {
  const x = zeros(sr, 3.2), r = rng(Math.max(1, Math.round(seed)) * 7919 + 13), k = (f: number) => 1 - Math.exp((-TAU * f) / sr);
  const k1 = k(306), k2 = k(458), leak = Math.exp((-TAU * 150) / sr);
  let b = 0, lp = 0, lp2 = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, w = r() * 2 - 1;
    b = b * leak + w * 0.02;                     // brown-ish noise
    lp += (b - lp) * k1; lp2 += (lp - lp2) * k2;
    const env = Math.min(1, t / 0.08) * Math.exp(-t * 1.1) * (1 + 0.5 * Math.sin(t * 7.3) * Math.exp(-t * 0.8));
    const crack = t < 0.35 ? w * 0.0133 * Math.exp(-t * 14) : 0;
    x[i] = (lp2 + crack) * env;
  }
  return fade(normalize(x, 0.85), sr, 20);
}

export const clinkSfx: SfxType = { type: 'common.clink', label: '湯匙碰碗', category: 'life', doc: '湯匙碰瓷碗「叮」的清脆一聲（glass: 冰塊碰玻璃杯，叮叮叮三下）；吃東西、攪拌、喝湯、冰飲、乾杯',
  params: [{ key: 'glass', label: '冰塊碰玻璃杯', type: 'bool', default: false }], duration: (p) => (p.glass ? 0.9 : 1.1), lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderClink(c.sampleRate, !!p.glass), 0.1) };
export const dripSfx: SfxType = { type: 'common.drip', label: '水滴', category: 'life', doc: '水滴「咚～」往上滑的一聲（滴數、間隔、音高可調）；滴水、流汗、冒出一個念頭、慢慢累積',
  params: [num('drops', '幾滴', 1, 1, 12, 1), num('gap', '間隔 (s)', 0.35, 0.1, 2, 0.01), num('pitch', '音高 (Hz)', 650, 200, 2000, 10)],
  duration: (p) => (Math.min(12, n2(p, 'drops')) - 1) * p.gap + 0.22, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderDrip(c.sampleRate, p.drops, p.gap, p.pitch), 0.15) };
export const sizzleSfx: SfxType = { type: 'common.sizzle', label: '油煎', category: 'life', doc: '熱油下鍋「滋滋～」的油煎聲，帶油爆的劈啪（長度可調）；煎、炸、炒、下鍋、熱騰騰',
  params: [num('dur', '長度 (s)', 1.6, 0.2, 8)], duration: (p) => Math.max(0.2, p.dur), lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderSizzle(c.sampleRate, p.dur)) };
export const pourSfx: SfxType = { type: 'common.pour', label: '倒水', category: 'life', doc: '倒水、倒飲料的「嘩～」水流聲（長度可調）；倒茶、倒湯、加醬汁、裝滿',
  params: [num('dur', '長度 (s)', 1.6, 0.2, 8)], duration: (p) => Math.max(0.2, p.dur), lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderPour(c.sampleRate, p.dur), 0.1) };
export const crySfx: SfxType = { type: 'common.cry', label: '嬰兒哭', category: 'life', doc: '卡通的嬰兒哭聲「哇～啊～」（聲數、音高可調，柔和不刺耳）；嬰兒、育兒、崩潰、哭哭',
  params: [num('times', '幾聲', 2, 1, 6, 1), num('pitch', '音高 (Hz)', 520, 250, 1000, 5)],
  duration: (p) => Math.min(6, n2(p, 'times')) * 0.75, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderCry(c.sampleRate, p.times, p.pitch), 0.1) };
export const thunderSfx: SfxType = { type: 'common.thunder', label: '遠雷', category: 'life', doc: '遠處的雷聲：開頭輕輕一聲裂響，接著低沉的隆隆聲滾開約三秒（seed 換一種滾法）；暴風雨、天色變暗、壞消息、閃電；配 common.ambient 的 sky 天色和它的閃電',
  params: [num('seed', '種子（換一種滾法）', 3, 1, 999, 1)], duration: () => 3.2, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderThunder(c.sampleRate, p.seed), 0.2) };
