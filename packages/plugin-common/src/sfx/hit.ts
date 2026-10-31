// The common sound effects that hit: thuds, pops, explosions, knocks, a cartoon spring.
import { clamp, rng, type SfxType } from '@tellcut/engine';
import { TAU, fade, zeros, mixIn, osc, hiss, lowpass, highpass, decay, normalize, lp1, hp1, play, num, SHORT, n2, LONG } from './synth.ts';

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

/** a cartoon spring: a tone wobbling around a pitch that jumps up from `pitch`, the wobble slowing (fd-boss's boing) */
export function renderBoing(sr: number, pitch = 180): Float32Array {
  const x = zeros(sr, 0.62), base = (t: number) => pitch * (1 + 1.444 * Math.min(1, t / 0.08));
  mixIn(sr, x, osc(sr, 0.62, (t) => base(t) * (1 + 0.22 * Math.sin(TAU * (28 - 22 * t) * t) * Math.exp(-3 * t)), (t) => Math.min(1, t / 0.005) * Math.exp(-4.2 * t)), 0, 1);
  mixIn(sr, x, osc(sr, 0.62, (t) => 2 * base(t), (t) => Math.min(1, t / 0.005) * Math.exp(-9 * t)), 0, 0.2);
  return fade(normalize(x, 0.8), sr, 2);
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

export const impactSfx: SfxType = { type: 'common.impact', label: '重擊', category: 'hit', doc: '低頻的一記重擊加長尾；爆字落地、標題出現、轉折',
  params: [], duration: () => 1.4, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderImpact(c.sampleRate), 0.25) };
export const popSfx: SfxType = { type: 'common.pop', label: '啵', category: 'hit', doc: '短短的氣泡「啵」；貼紙、表情、小元素彈出',
  params: [num('pitch', '音高 (Hz)', 700, 200, 2000, 10)],
  duration: () => 0.12, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderPop(c.sampleRate, p.pitch)) };
export const thudSfx: SfxType = { type: 'common.thud', label: '悶響', category: 'hit', doc: '短而低的一聲悶響，像印章蓋下去；配 common.stamp；paper: 橡皮章蓋在桌上的紙卡（多一聲木頭敲擊和紙聲），配 common.postmark／common.postcard',
  params: [{ key: 'paper', label: '蓋在紙卡上（木桌、紙聲）', type: 'bool', default: false }], duration: (p) => (p.paper ? 0.45 : 0.35), lookback: SHORT,
  synth: (c, b, at, p) => play(c, b, at, renderThud(c.sampleRate, !!p.paper), 0.1) };
export const explodeSfx: SfxType = { type: 'common.explode', label: '爆炸＋玻璃碎', category: 'hit', doc: '轟的一聲爆炸、低頻下墜，再一陣玻璃碎片；爆表、搞砸、大揭曉；配 common.burst 的 blast',
  params: [], duration: () => 2.6, lookback: LONG, synth: (c, b, at) => play(c, b, at, renderExplode(c.sampleRate), 0.25) };
export const knockSfx: SfxType = { type: 'common.knock', label: '敲木頭', category: 'hit', doc: '敲木頭「叩叩」（次數、間隔、音高可調；低一點像敲門、高一點像木魚）；敲門、提醒、一下一下數、禪意',
  params: [num('knocks', '幾下', 2, 1, 12, 1), num('gap', '間隔 (s)', 0.16, 0.06, 1, 0.01), num('pitch', '音高 (Hz)', 820, 200, 2500, 10)],
  duration: (p) => (Math.min(12, n2(p, 'knocks')) - 1) * p.gap + 0.3, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderKnock(c.sampleRate, p.knocks, p.gap, p.pitch), 0.1) };
export const boingSfx: SfxType = { type: 'common.boing', label: '彈簧', category: 'hit', doc: '彈簧「啵嚶～」的卡通彈跳（音高可調）；跳起來、彈出來、Q 彈、搞笑的反彈',
  params: [num('pitch', '音高 (Hz)', 180, 80, 800, 5)], duration: () => 0.62, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderBoing(c.sampleRate, p.pitch)) };
