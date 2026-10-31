// The common sound effects of movement: whooshes, air, risers, scratches, tapes winding, footsteps, wings, a message sent.
import { clamp, rng, type SfxType } from '@tellcut/engine';
import { TAU, fade, sweep, zeros, mixIn, osc, hiss, lowpass, highpass, decay, normalize, lp1, play, num, SHORT, n2, LONG } from './synth.ts';

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

/** a tape spun forward: a whine rising from 300 Hz to 2.5 kHz over `dur` seconds */
export function renderFastForward(sr: number, dur = 0.6): Float32Array {
  const d = Math.max(0.1, dur), b = lowpass(sr, osc(sr, d, (t) => 300 + 2200 * (t / d) ** 2, (t) => Math.min(1, t / 0.03) * (1 - (t / d) ** 4), 'saw'), () => 3500);
  return fade(normalize(b, 0.55), sr, 2);
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

/** a message sent: a short tone swooping up from 520 Hz to 1.15 kHz with a puff of air on its front (t2-line) */
export function renderSend(sr: number): Float32Array {
  const x = zeros(sr, 0.2);
  mixIn(sr, x, osc(sr, 0.12, (t) => 520 * Math.pow(1150 / 520, t / 0.12), (t) => Math.min(1, t / 0.004) * Math.exp(-(t / 0.12) * 4)), 0, 0.8);
  mixIn(sr, x, lowpass(sr, hiss(sr, 0.02, 21, (t) => Math.min(1, t / 0.002) * Math.exp(-(t / 0.02) * 6)), () => 5000), 0, 0.3);
  return fade(normalize(x, 0.7), sr, 1);
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

export const whooshSfx: SfxType = { type: 'common.whoosh', label: '咻', category: 'move', doc: '一聲掃過的風切聲；轉場、元素飛入飛出',
  params: [num('dur', '長度 (s)', 0.5, 0.1, 3)],
  duration: (p) => p.dur, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderWhoosh(c.sampleRate, p.dur), 0.2) };
export const airSfx: SfxType = { type: 'common.air', label: '一口氣', category: 'move', doc: '一口空氣聲，慢慢起來再收掉；畫面打開、牆出現、段落之間的呼吸；bright 越大越亮',
  params: [num('len', '長度 (s)', 1.6, 0.4, 6), num('bright', '亮度（0 悶、1 亮）', 0.5, 0, 1, 0.05)],
  duration: (p) => p.len, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderAir(c.sampleRate, p.len, p.bright), 0.15) };
export const riserSfx: SfxType = { type: 'common.riser', label: '上升音', category: 'move', doc: '越來越高、越來越大的上升音，結束在高點；轉折或揭曉之前的鋪陳',
  params: [num('dur', '長度 (s)', 2.5, 0.5, 8)],
  duration: (p) => p.dur, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderRiser(c.sampleRate, p.dur), 0.2) };
export const scratchSfx: SfxType = { type: 'common.scratch', label: '刮唱片', category: 'move', doc: '唱片被刮停的「嘰——」；氣氛急轉、打斷、「等一下」的笑點',
  params: [], duration: () => 0.42, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderScratch(c.sampleRate)) };
export const powerupSfx: SfxType = { type: 'common.powerup', label: '開機掃描', category: 'move', doc: '儀表開機：伺服馬達轉上去再轉回來，帶一串滴答；計量表、機器啟動、掃描',
  params: [], duration: () => 0.85, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderPowerUp(c.sampleRate), 0.1) };
export const ffwdSfx: SfxType = { type: 'common.ffwd', label: '快轉', category: 'move', doc: '錄音帶快轉的「咻～」往上爬；時間快轉、跳過等待；配 common.timelapse',
  params: [num('dur', '長度 (s)', 0.6, 0.2, 3)], duration: (p) => p.dur, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderFastForward(c.sampleRate, p.dur)) };
export const rattleSfx: SfxType = { type: 'common.rattle', label: '鐵捲門', category: 'move', doc: '鐵捲門拉下來的「嘩啦啦」加到底的一聲；打烊、收工、結束；配 common.rolldoor',
  params: [], duration: () => 0.65, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderRattle(c.sampleRate), 0.15) };
export const footstepSfx: SfxType = { type: 'common.footstep', label: '腳步', category: 'move', doc: '一串腳步聲（步數、間隔可調，左右腳音高不同；soft: 軟軟的卡通腳步，預設是木地板）；走進畫面、走到下一間、偷偷靠近',
  params: [num('steps', '幾步', 4, 1, 16, 1), num('gap', '間隔 (s)', 0.3, 0.1, 1, 0.01), { key: 'soft', label: '卡通軟腳步', type: 'bool', default: false }],
  duration: (p) => (Math.min(16, n2(p, 'steps')) - 1) * p.gap + 0.2, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderFootstep(c.sampleRate, p.steps, p.gap, !!p.soft), 0.1) };
export const flapSfx: SfxType = { type: 'common.flap', label: '拍翅膀', category: 'move', doc: '翅膀「啪啪啪」拍動（次數、間隔可調）；鳥飛走、飛進畫面、紙片翻飛',
  params: [num('flaps', '幾下', 5, 1, 20, 1), num('gap', '間隔 (s)', 0.09, 0.04, 0.5, 0.01)],
  duration: (p) => (Math.min(20, n2(p, 'flaps')) - 1) * p.gap + 0.08, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderFlap(c.sampleRate, p.flaps, p.gap)) };
export const whirrSfx: SfxType = { type: 'common.whirr', label: '捲帶', category: 'move', doc: '錄影帶／卡帶捲動的「嘰嚕嚕」馬達聲（長度可調）；換帶、倒帶、回到過去、老錄影帶；配 common.film',
  params: [num('dur', '長度 (s)', 0.5, 0.2, 4)], duration: (p) => Math.max(0.2, p.dur), lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderWhirr(c.sampleRate, p.dur)) };
export const sendSfx: SfxType = { type: 'common.send', label: '送出訊息', category: 'move', doc: '聊天訊息送出的「咻↑」短短往上滑的一聲；傳訊息、留言送出、按下送出、發文',
  params: [], duration: () => 0.2, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderSend(c.sampleRate), 0.05) };
export const rewindSfx: SfxType = { type: 'common.rewind', label: '倒帶', category: 'move', doc: '錄影帶倒帶的「嘰嚕嚕↓」：雜訊從亮掃到悶、一條往下掉的尖音（長度可調）；倒帶、回到過去、重來一次、回顧；跟 common.ffwd（快轉往上爬）相反',
  params: [num('dur', '長度 (s)', 0.7, 0.2, 3)], duration: (p) => Math.max(0.2, p.dur), lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderRewind(c.sampleRate, p.dur), 0.1) };
