// The common sound effects that chime: bells, a till, a xylophone, sparkles, 8-bit coins and fanfares, a message received.
import { clamp, rng, type SfxType } from '@tellcut/engine';
import { TAU, fade, bell, zeros, mixIn, osc, hiss, highpass, normalize, scaleStep, pulse, ARPEGGIO, play, num, SHORT, STEP, n2 } from './synth.ts';
import { renderTick } from './alert.ts';

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

/** a clear bell 叮: a high fundamental with a bright inharmonic overtone, ringing out */
export function renderDing(sr: number, pitch = 1568): Float32Array {
  const x = new Float32Array(Math.round(1.2 * sr));
  bell(x, sr, 0, pitch, 0.5, [[1, 1, 4], [2.76, 0.35, 9], [5.4, 0.12, 16]]);
  return fade(x, sr, 3);
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

/** a short wooden xylophone note at `pitch` Hz (a tick off a list, a step done) */
export function renderXylo(sr: number, pitch = 880): Float32Array {
  const x = zeros(sr, 0.16);
  for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] = 0.6 * Math.min(1, t * 2000) * Math.exp(-t * 38) * (0.75 * Math.sin(TAU * pitch * t) + 0.25 * Math.sin(TAU * pitch * 3.93 * t) * Math.exp(-t * 60)); }
  return fade(x, sr, 1);
}

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

/** a message received: two soft notes, `pitch` then a fifth above 0.09 s later (A5 → E6) (t2-line) */
export function renderRecv(sr: number, pitch = 880): Float32Array {
  const x = zeros(sr, 0.6);
  for (const [at, f, len] of [[0, pitch, 0.35], [0.09, pitch * 1.5, 0.45]]) {
    const e = (t: number) => Math.min(1, t / 0.004) * Math.exp(-(t / len) * 6);
    mixIn(sr, x, osc(sr, len, () => f, e), at, 0.6); mixIn(sr, x, osc(sr, len, () => 2 * f, e), at, 0.09);
  }
  return fade(normalize(x, 0.6), sr, 2);
}

export const shingSfx: SfxType = { type: 'common.shing', label: '光掃過', category: 'chime', doc: '一道光掃過的亮聲（高頻的沙沙聲加一個往下滑的高音）；商標落定、光掃過字、揭曉的瞬間',
  params: [num('len', '長度 (s)', 1.2, 0.3, 3)], duration: (p) => p.len, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderShing(c.sampleRate, p.len), 0.2) };
export const dingSfx: SfxType = { type: 'common.ding', label: '叮', category: 'chime', doc: '清脆的一聲叮；答對、重點出現、靈光一閃。一連串叮聲要一階一階往上：同一個 pitch（主音）、step 0、1、2…（scale: major 大調／pentatonic 五聲）',
  params: [num('pitch', '音高 (Hz)', 1568, 600, 4000, 10), ...STEP],
  duration: () => 1.2, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderDing(c.sampleRate, scaleStep(p.pitch, p.step, p.scale)), 0.15) };
export const cashSfx: SfxType = { type: 'common.cash', label: '收銀', category: 'chime', doc: '收銀機「鏘鏘」；價錢、省錢、賺錢、花大錢；coins 加上抽屜彈開和銅板聲（合計、結帳）',
  params: [{ key: 'coins', label: '抽屜和銅板聲', type: 'bool', default: false }], duration: () => 1.1, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderCash(c.sampleRate, !!p.coins), 0.15) };
export const xyloSfx: SfxType = { type: 'common.xylo', label: '木琴', category: 'chime', doc: '一聲短短的木琴；清單打勾、一項一項出現（同一個 pitch 當主音、step 0、1、2… 一階一階往上，scale: major／pentatonic；或直接換 pitch 排成小旋律）',
  params: [num('pitch', '音高 (Hz)', 880, 200, 4000, 10), ...STEP], duration: () => 0.16, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderXylo(c.sampleRate, scaleStep(p.pitch, p.step, p.scale)), 0.15) };
export const chimeSfx: SfxType = { type: 'common.chime', label: '閃光叮鈴', category: 'chime', doc: '叮鈴鈴往上爬的閃光（鐵琴分解和弦，音數、起音、間隔可調；chip: 8-bit 方波）；亮晶晶、變好看、揭曉、魔法、稀有款；配 common.sparkle 畫面',
  params: [num('notes', '幾個音', 4, 1, 8, 1), num('pitch', '起音 (Hz)', 1568, 300, 4000, 10), num('gap', '間隔 (s)', 0.07, 0.03, 0.3, 0.01), { key: 'chip', label: '8-bit 方波', type: 'bool', default: false }],
  duration: (p) => (Math.min(8, n2(p, 'notes')) - 1) * p.gap + (p.chip ? 0.35 : 1.2), lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderChime(c.sampleRate, p.notes, p.pitch, p.gap, !!p.chip), 0.15) };
export const coinSfx: SfxType = { type: 'common.coin', label: '投幣', category: 'chime', doc: '8-bit 遊戲的投幣「叮鈴↑」（方波兩音，音高可調）；投幣、得分、拿到東西、扭蛋、集點',
  params: [num('pitch', '音高 (Hz)', 987.77, 300, 3000, 1)], duration: () => 0.42, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderCoin(c.sampleRate, p.pitch), 0.1) };
export const fanfareSfx: SfxType = { type: 'common.fanfare', label: '過關號角', category: 'chime', doc: '8-bit 過關號角：四個音往上、再一個大和弦（主音可調）；完成、集滿、獲勝、解鎖、片尾',
  params: [num('pitch', '主音 (Hz)', 523.25, 200, 1500, 1)], duration: () => 1.3, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderFanfare(c.sampleRate, p.pitch), 0.15) };
export const recvSfx: SfxType = { type: 'common.recv', label: '收到訊息', category: 'chime', doc: '收到訊息的輕輕兩聲「叮咚↑」（第二聲高五度，音高可調）；新訊息、對方回覆、通知跳出來；跟 common.dingdong（叫號機往下的兩聲）不同',
  params: [num('pitch', '第一聲 (Hz)', 880, 300, 2500, 1)], duration: () => 0.6, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderRecv(c.sampleRate, p.pitch), 0.1) };
