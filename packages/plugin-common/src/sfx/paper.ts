// The common sound effects of paper and desks: a shutter, typing, pages, cards, a receipt printer, tearing, scribbling, tape.
import { clamp, rng, type SfxType } from '@tellcut/engine';
import { TAU, fade, zeros, mixIn, hiss, lowpass, highpass, normalize, lp1, hp1, play, num, SHORT, LONG } from './synth.ts';
import { renderTick } from './alert.ts';

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

export const shutterSfx: SfxType = { type: 'common.shutter', label: '快門', category: 'paper', doc: '相機快門「喀嚓」；定格、拍照、拍立得',
  params: [], duration: () => 0.18, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderShutter(c.sampleRate)) };
export const typingSfx: SfxType = { type: 'common.typing', label: '打字', category: 'paper', doc: '一段鍵盤打字聲，長度可調；文字一個字一個字出現、搜尋、留言',
  params: [num('dur', '長度 (s)', 1.5, 0.2, 10)],
  duration: (p) => p.dur, lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderTyping(c.sampleRate, p.dur)) };
export const pageSfx: SfxType = { type: 'common.page', label: '翻頁', category: 'paper', doc: '紙張翻頁的沙沙聲；換步驟、換卡片、翻開下一頁；配 common.notecard',
  params: [], duration: () => 0.42, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderPage(c.sampleRate), 0.1) };
export const slideSfx: SfxType = { type: 'common.slide', label: '紙卡滑入', category: 'paper', doc: '一張卡片在一疊紙上滑過去、最後輕輕落定；明信片、卡片、照片滑進畫面；配 common.postcard／common.frame',
  params: [], duration: () => 1.1, lookback: LONG, synth: (c, b, at) => play(c, b, at, renderSlide(c.sampleRate), 0.1) };
export const flipSfx: SfxType = { type: 'common.flip', label: '卡片翻面', category: 'paper', doc: '桌上一張卡片翻過來：兩下紙和空氣的拍動、再落定；翻到背面、換一面；配 common.postcard／common.frame',
  params: [], duration: () => 0.8, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderFlip(c.sampleRate), 0.1) };
export const printSfx: SfxType = { type: 'common.print', label: '印字', category: 'paper', doc: '熱感應收據機印字的嗡嗡聲（印字頭加步進馬達），長度可調；每印一行一聲；配 common.printer',
  params: [num('dur', '長度 (s)', 0.34, 0.05, 3)], duration: (p) => Math.max(0.05, p.dur), lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderPrint(c.sampleRate, p.dur)) };
export const clunkSfx: SfxType = { type: 'common.clunk', label: '切紙喀', category: 'paper', doc: '收據機切紙刀／送紙卡榫的一聲「喀」；新的一段、換一家店、機器動作',
  params: [], duration: () => 0.16, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderClunk(c.sampleRate)) };
export const tearSfx: SfxType = { type: 'common.tear', label: '撕紙', category: 'paper', doc: '把一張紙「嘶啦」撕下來；撕收據、撕日曆、撕掉重來；配 common.printer 的 tearAt',
  params: [], duration: () => 0.55, lookback: SHORT, synth: (c, b, at) => play(c, b, at, renderTear(c.sampleRate), 0.1) };
export const scribbleSfx: SfxType = { type: 'common.scribble', label: '筆刷', category: 'paper', doc: '筆在紙上寫字、畫線的沙沙聲（長度、每秒幾筆可調；crayon: 蠟筆，較粗較顆粒）；手寫字、畫圈、打勾、塗鴉；配 common.handwrite／common.pen（跟 common.scratch 刮唱片不同）',
  params: [num('dur', '長度 (s)', 0.6, 0.1, 6), num('strokes', '每秒幾筆', 5, 1, 14, 0.5), { key: 'crayon', label: '蠟筆', type: 'bool', default: false }],
  duration: (p) => Math.max(0.1, p.dur), lookback: LONG, synth: (c, b, at, p) => play(c, b, at, renderScribble(c.sampleRate, p.dur, p.strokes, !!p.crayon)) };
export const tapeSfx: SfxType = { type: 'common.tape', label: '撕膠帶', category: 'paper', doc: '從膠帶捲撕下一段「嘶—」再按上去的一下（press 關掉就只有撕）；貼標籤、貼紙條、貼照片；跟 common.tear（整張紙撕下來）不同',
  params: [{ key: 'press', label: '撕完按上去', type: 'bool', default: true }], duration: (p) => (p.press ? 0.42 : 0.32), lookback: SHORT, synth: (c, b, at, p) => play(c, b, at, renderTape(c.sampleRate, !!p.press)) };
