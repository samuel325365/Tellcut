// The common sound effects that alert: bleeps, ticks, wrong answers, alarms, chimes of a queue or a boxing ring, a phone buzzing.
import { rng, type SfxType } from '@tellcut/engine';
import { TAU, fade, bell, zeros, mixIn, osc, hiss, lowpass, normalize, play, num, SHORT, n2 } from './synth.ts';

/** a sine of `freq` Hz for `dur` s: the TV bleep */
export function renderBeep(sr: number, dur: number, freq = 1000): Float32Array {
  const x = new Float32Array(Math.max(1, Math.round(dur * sr)));
  for (let i = 0; i < x.length; i++) x[i] = 0.45 * Math.sin((TAU * freq * i) / sr);
  return fade(x, sr);
}

/** a dry click */
export function renderTick(sr: number, seed = 1): Float32Array {
  const n = Math.round(0.04 * sr), x = new Float32Array(n), r = rng(seed);
  let prev = 0;
  for (let i = 0; i < n; i++) { const v = r() * 2 - 1; x[i] = 0.6 * (v - prev) * Math.exp(-(i / sr) * 160); prev = v; }
  return fade(x, sr, 0.5);
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

/** the air going out: a tone sliding down from 660 to 280 Hz with a breath of noise (something that "does not count") */
export function renderDeflate(sr: number): Float32Array {
  const b = zeros(sr, 0.45);
  mixIn(sr, b, osc(sr, 0.4, (t) => 660 - 380 * Math.min(1, t / 0.35), (t) => Math.min(1, t / 0.01) * Math.exp(-5 * t)), 0, 0.7);
  mixIn(sr, b, lowpass(sr, hiss(sr, 0.3, 7, (t) => Math.exp(-10 * t)), () => 700), 0, 0.15);
  return fade(normalize(b, 0.6), sr, 2);
}

/** danger beeps: `beeps` short square tones at 1.25 kHz, one every 0.2 s */
export function renderAlarm(sr: number, beeps = 3): Float32Array {
  const n = Math.max(1, Math.round(beeps)), b = zeros(sr, n * 0.2 + 0.02);
  for (let k = 0; k < n; k++) mixIn(sr, b, osc(sr, 0.12, () => 1250, (t) => Math.min(1, t / 0.004, (0.11 - t) / 0.004) * (t < 0.11 ? 1 : 0), 'sq'), k * 0.2, 0.5);
  return normalize(lowpass(sr, b, () => 5000), 0.6);
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

/** muted: two notes falling, G5 then C5 (a notification silenced, turned off, shushed) (t2-notify) */
export function renderHush(sr: number): Float32Array {
  const x = zeros(sr, 0.45);
  for (const [at, f, len] of [[0, 784, 0.15], [0.15, 523, 0.3]] as const) mixIn(sr, x, osc(sr, len, () => f, (t) => Math.min(1, t * 300) * Math.exp(-t * 9) * Math.min(1, (len - t) / 0.01)), at, 1);
  return fade(normalize(x, 0.45), sr, 2);
}

/** a boxing-ring bell (the podcast-versus short's score): a hard strike of inharmonic partials with a long shimmer, `strikes` times
 *  `gap` s apart (ding-ding); `pitch` is the fundamental (E6 by default) */
export function renderRingBell(sr: number, strikes = 2, gap = 0.28, pitch = 1318.51): Float32Array {
  const n = Math.max(1, Math.round(strikes)), x = zeros(sr, (n - 1) * gap + 1.4);
  for (let i = 0; i < n; i++) bell(x, sr, i * gap, pitch, i ? 0.75 : 1, [[1, 1, 2.2], [2.32, 0.55, 3.5], [4.25, 0.32, 5.5], [6.8, 0.18, 8]]);
  return fade(normalize(x, 0.85), sr, 3);
}

export const beepSfx: SfxType = { type: 'common.beep', label: '消音嗶聲', category: 'alert', doc: '1 kHz 的電視消音嗶聲，長度對齊被消音的字；配 common.censor 貼紙；kind rec 是攝影機開始錄影的「嗶嗶」兩聲短高音、end 是帶子快用完／沒電的三聲（這兩種不看長度和頻率；DV、家庭錄影帶、配 common.film 的 vhs）',
  params: [num('dur', '長度 (s)', 0.5, 0.05, 3), num('freq', '頻率 (Hz)', 1000, 300, 3000, 10),
    { key: 'kind', label: '種類（bleep 消音嗶聲、rec 攝影機開始錄影、end 帶子快用完）', type: 'enum', options: ['bleep', 'rec', 'end'], default: 'bleep' }],
  duration: (p) => (p.kind === 'rec' ? 0.25 : p.kind === 'end' ? 0.81 : p.dur), lookback: SHORT,
  synth: (c, b, at, p) => play(c, b, at, p.kind === 'rec' || p.kind === 'end' ? renderCamBeep(c.sampleRate, p.kind) : renderBeep(c.sampleRate, p.dur, p.freq)) };
export const tickSfx: SfxType = { type: 'common.tick', label: '滴答', category: 'alert', doc: '一下乾淨的點擊聲；數數、進度、打字、逐字出現',
  params: [], duration: () => 0.04, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderTick(c.sampleRate)) };
export const errorSfx: SfxType = { type: 'common.error', label: '錯誤音', category: 'alert', doc: '兩聲低沉的「嗶嗶」；答錯、失敗、NG',
  params: [], duration: () => 0.55, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderError(c.sampleRate)) };
export const deflateSfx: SfxType = { type: 'common.deflate', label: '洩氣', category: 'alert', doc: '「噗～」往下滑的洩氣聲；不算數、失望、只動一點點、冷場',
  params: [], duration: () => 0.45, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderDeflate(c.sampleRate), 0.1) };
export const alarmSfx: SfxType = { type: 'common.alarm', label: '警報', category: 'alert', doc: '短促的「嗶、嗶、嗶」警報（聲數可調）；危險、快爆表、倒數最後幾秒',
  params: [num('beeps', '幾聲', 3, 1, 12, 1)], duration: (p) => Math.max(1, Math.round(p.beeps)) * 0.2 + 0.02, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderAlarm(c.sampleRate, p.beeps)) };
export const dingdongSfx: SfxType = { type: 'common.dingdong', label: '叮咚', category: 'alert', doc: '叫號機的「叮咚」兩聲（高音到低音，預設 A5→F5）；換號、下一位、換段落、到站；配 common.digits 的 led',
  params: [num('high', '第一聲 (Hz)', 880, 200, 3000, 1), num('low', '第二聲 (Hz)', 698.46, 200, 3000, 1)], duration: () => 1.95, lookback: SHORT,
  synth: (c, b, at, p) => play(c, b, at, renderDingDong(c.sampleRate, p.high, p.low), 0.2) };
export const ringbellSfx: SfxType = { type: 'common.ringbell', label: '擂台鈴', category: 'alert', doc: '拳擊擂台的鈴「叮、叮」（聲數可調）：硬敲一下加長長的金屬餘韻；回合開始、對決、片頭 VS、比賽結束；配 common.versus 的回合卡',
  params: [num('strikes', '幾聲', 2, 1, 6, 1), num('gap', '間隔 (s)', 0.28, 0.1, 1, 0.01), num('pitch', '音高 (Hz)', 1318.51, 300, 3000, 1)],
  duration: (p) => (Math.max(1, Math.round(p.strikes)) - 1) * p.gap + 1.4, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderRingBell(c.sampleRate, p.strikes, p.gap, p.pitch), 0.2) };
export const buzzSfx: SfxType = { type: 'common.buzz', label: '手機震動', category: 'alert', doc: '手機放在桌上震動的「嗡—嗡—」（次數可調）；來電、通知、訊息進來、被已讀不回、心裡一震；配 common.touch',
  params: [num('pulses', '震幾下', 2, 1, 8, 1)], duration: (p) => Math.min(8, n2(p, 'pulses')) * 0.34 - 0.08, lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderBuzz(c.sampleRate, p.pulses)) };
export const hushSfx: SfxType = { type: 'common.hush', label: '靜音', category: 'alert', doc: '往下掉的兩個音「嘟↓嘟」：通知被關掉、靜音、按掉鬧鐘、拒接、不想理；跟 common.deflate（洩氣滑音）、common.error（答錯）不同',
  params: [], duration: () => 0.45, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderHush(c.sampleRate)) };
