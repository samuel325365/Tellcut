import { withDefaults } from '@tellcut/engine';
import { SFX_CATEGORY } from '@tellcut/protocol';
import { renderAir, renderShing } from './sfx/index.ts';
import { renderBuzz, renderCamBeep, renderHush, renderRecv, renderRewind, renderSend, commonSfx, renderBoing, renderChime, renderClink, renderCoin, renderCry, renderDrip, renderThunder, renderFanfare, renderFlap, renderFootstep, renderKnock, renderPour, renderScribble, renderSizzle, renderTape, scaleStep, renderRingBell, renderFlip, renderSlide, renderAlarm, renderBeep, renderPrint, renderClunk, renderTear, renderRattle, renderDingDong, renderCash, renderDeflate, renderExplode, renderFastForward, renderPage, renderPowerUp, renderScratch, renderXylo, renderDing, renderError, renderImpact, renderPop, renderRiser, renderShutter, renderThud, renderTick, renderTyping, renderWhoosh } from './sfx/index.ts';

const SR = 48000;
const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x: Float32Array, a = 0, b = x.length) => Math.sqrt(x.slice(a, b).reduce((s, v) => s + v * v, 0) / Math.max(1, b - a));
const crossings = (x: Float32Array) => { let n = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++; return n; };

test('the beep is a 1 kHz tone of the asked length that starts and ends without a click', () => {
  const x = renderBeep(SR, 0.5);
  expect(x.length).toBe(0.5 * SR);
  expect(crossings(x) / 2 / 0.5).toBeGreaterThan(980);
  expect(crossings(x) / 2 / 0.5).toBeLessThan(1020);
  expect(Math.abs(x[0])).toBeLessThan(0.01);
  expect(Math.abs(x[x.length - 1])).toBeLessThan(0.01);
});

test('every generator makes sound within range and repeats exactly', () => {
  const all: Array<[string, () => Float32Array]> = [
    ['whoosh', () => renderWhoosh(SR, 0.5)], ['riser', () => renderRiser(SR, 2)], ['impact', () => renderImpact(SR)], ['pop', () => renderPop(SR)], ['thud', () => renderThud(SR)], ['tick', () => renderTick(SR)],
  ];
  for (const [name, f] of all) {
    const a = f(), b = f();
    expect(peak(a), name).toBeGreaterThan(0.1);
    expect(peak(a), name).toBeLessThanOrEqual(1);
    expect([...a.slice(0, 500)], name).toEqual([...b.slice(0, 500)]);
    expect(a.every(Number.isFinite), name).toBe(true);
  }
  expect([...renderWhoosh(SR, 0.5, 1).slice(0, 300)]).not.toEqual([...renderWhoosh(SR, 0.5, 2).slice(0, 300)]);
});

test('shapes: the riser grows, the impact dies away, the whoosh peaks in the middle', () => {
  const r = renderRiser(SR, 2);
  expect(rms(r, r.length * 0.8 | 0)).toBeGreaterThan(rms(r, 0, r.length * 0.2 | 0) * 3);
  const i = renderImpact(SR);
  expect(rms(i, 0, SR * 0.2 | 0)).toBeGreaterThan(rms(i, SR * 1 | 0) * 5);
  const w = renderWhoosh(SR, 0.6), n = w.length;
  expect(rms(w, n * 0.4 | 0, n * 0.6 | 0)).toBeGreaterThan(rms(w, 0, n * 0.1 | 0) * 3);
});

test('the sound effects: ids, lengths from their params, and a buffer played at the asked time', () => {
  expect(commonSfx.map((s) => s.type)).toEqual(['beep', 'whoosh', 'impact', 'shing', 'air', 'riser', 'pop', 'thud', 'tick', 'ding', 'error', 'shutter', 'typing', 'cash', 'deflate', 'scratch', 'powerup', 'alarm', 'explode', 'ffwd', 'page', 'slide', 'flip', 'xylo', 'print', 'clunk', 'tear', 'rattle', 'dingdong', 'ringbell',
    'chime', 'coin', 'fanfare', 'knock', 'boing', 'footstep', 'flap', 'whirr', 'scribble', 'tape', 'clink', 'drip', 'sizzle', 'pour', 'cry', 'thunder', 'buzz', 'send', 'recv', 'hush', 'rewind'].map((n) => `common.${n}`));
  for (const s of commonSfx) expect(s.doc, s.type).toBeTruthy();
  const by = (n: string) => commonSfx.find((s) => s.type === `common.${n}`)!;
  expect(by('beep').duration({ dur: 0.7, freq: 1000 })).toBe(0.7);
  expect(by('riser').duration({ dur: 3 })).toBe(3);
  const log: string[] = [], node = () => ({ connect: (n: any) => n });
  const ctx: any = {
    sampleRate: SR,
    createBuffer: (_c: number, n: number) => { log.push(`buffer ${n}`); return { getChannelData: () => new Float32Array(n) }; },
    createBufferSource: () => ({ ...node(), start: (t: number) => log.push(`start ${t}`) }),
    createGain: () => ({ ...node(), gain: { value: 0 } }),
  };
  by('beep').synth(ctx, { out: node(), verb: node(), noise: null } as any, 1.25, { dur: 0.5, freq: 1000 });
  expect(log).toEqual([`buffer ${0.5 * SR}`, 'start 1.25']);
});

test('the everyday sounds: ding rings and fades, error is two low buzzes, shutter is a short double click, typing lasts as long as asked, cash rings after a click', () => {
  const all: Array<[string, () => Float32Array]> = [['ding', () => renderDing(SR)], ['error', () => renderError(SR)], ['shutter', () => renderShutter(SR)], ['typing', () => renderTyping(SR, 1.5)], ['cash', () => renderCash(SR)]];
  for (const [name, f] of all) {
    const a = f(), b = f();
    expect(peak(a), name).toBeGreaterThan(0.1);
    expect(peak(a), name).toBeLessThanOrEqual(1);
    expect([...a.slice(0, 2000)], name).toEqual([...b.slice(0, 2000)]);
    expect(a.every(Number.isFinite), name).toBe(true);
  }
  const d = renderDing(SR);
  expect(rms(d, 0, SR * 0.1 | 0)).toBeGreaterThan(rms(d, d.length - (SR * 0.1 | 0)) * 4);   // rings out
  expect(crossings(d.slice(0, SR * 0.2 | 0)) / 2 / 0.2).toBeGreaterThan(1000);              // a high bell
  const e = renderError(SR);
  expect(crossings(e) / 2 / (e.length / SR)).toBeLessThan(400);                              // low
  expect(renderShutter(SR).length).toBeLessThan(SR * 0.3);
  expect(renderTyping(SR, 1.5).length).toBe(1.5 * SR);
  const by = (n: string) => commonSfx.find((s) => s.type === `common.${n}`)!;
  expect(by('typing').duration({ dur: 2 })).toBe(2);
});

test('the sounds from the baking shorts: in range, the same every time, and shaped as named', () => {
  const all: Array<[string, () => Float32Array]> = [['deflate', () => renderDeflate(SR)], ['scratch', () => renderScratch(SR)], ['powerup', () => renderPowerUp(SR)], ['alarm', () => renderAlarm(SR)],
    ['explode', () => renderExplode(SR)], ['ffwd', () => renderFastForward(SR)], ['page', () => renderPage(SR)], ['xylo', () => renderXylo(SR)]];
  for (const [name, f] of all) {
    const a = f(), b = f();
    expect(peak(a), name).toBeGreaterThan(0.1);
    expect(peak(a), name).toBeLessThanOrEqual(1);
    expect([...a.slice(0, 3000)], name).toEqual([...b.slice(0, 3000)]);
    expect(a.every(Number.isFinite), name).toBe(true);
  }
  const by = (n: string) => commonSfx.find((s) => s.type === `common.${n}`)!;
  // the alarm: one beep per 0.2 s, silence between; its length follows the count
  const al = renderAlarm(SR, 4);
  expect(al.length).toBe(Math.ceil(0.82 * SR));
  expect(rms(al, SR * 0.15 | 0, SR * 0.19 | 0)).toBeLessThan(0.01);
  expect(by('alarm').duration({ beeps: 4 })).toBeCloseTo(0.82, 6);
  // the explosion dies away; the fast forward rises in pitch
  const ex = renderExplode(SR);
  expect(rms(ex, 0, SR * 0.3 | 0)).toBeGreaterThan(rms(ex, SR * 2 | 0) * 5);
  const ff = renderFastForward(SR, 0.6), n = ff.length;
  expect(crossings(ff.slice(n * 0.6 | 0, n * 0.8 | 0))).toBeGreaterThan(crossings(ff.slice(0, n * 0.2 | 0)) * 2);
  expect(by('ffwd').duration({ dur: 1 })).toBe(1);
  // the xylophone sounds at its pitch
  expect(crossings(renderXylo(SR, 880).slice(0, SR * 0.05 | 0)) / 2 / 0.05).toBeGreaterThan(700);
});

test('the paper sounds from the uk-postcard short: slide, flip and the stamp on a card (thud paper), each in range and the same every time', () => {
  const all: Array<[string, () => Float32Array]> = [['slide', () => renderSlide(SR)], ['flip', () => renderFlip(SR)], ['thud paper', () => renderThud(SR, true)]];
  for (const [name, f] of all) {
    const a = f(), b = f();
    expect(peak(a), name).toBeGreaterThan(0.5);
    expect(peak(a), name).toBeLessThanOrEqual(1);
    expect([...a.slice(0, 3000)], name).toEqual([...b.slice(0, 3000)]);
    expect(a.every(Number.isFinite), name).toBe(true);
  }
  const by = (n: string) => commonSfx.find((s) => s.type === `common.${n}`)!;
  expect(renderSlide(SR).length).toBe(Math.round(1.1 * SR));
  expect(by('slide').duration({})).toBe(1.1);
  expect(by('flip').duration({})).toBe(0.8);
  // the stamp on paper is longer and brighter than the plain thud, which stays as it was
  expect(by('thud').duration({ paper: true })).toBe(0.45);
  expect(by('thud').duration({ paper: false })).toBe(0.35);
  expect(renderThud(SR).length).toBe(Math.round(0.35 * SR));
  expect(crossings(renderThud(SR, true).slice(0, SR * 0.05 | 0))).toBeGreaterThan(crossings(renderThud(SR).slice(0, SR * 0.05 | 0)));
  // the flip: two flutters, quiet between them and the landing; the slide swells to the middle of its rub
  const fl = renderFlip(SR);
  expect(rms(fl, SR * 0.15 | 0, SR * 0.21 | 0)).toBeGreaterThan(rms(fl, SR * 0.7 | 0) * 3);
  const sl = renderSlide(SR);
  expect(rms(sl, SR * 0.35 | 0, SR * 0.5 | 0)).toBeGreaterThan(rms(sl, 0, SR * 0.05 | 0) * 3);
  // the same sound at another sample rate (the filters were written for 48 kHz)
  const s44 = renderSlide(44100);
  expect(s44.length).toBe(Math.round(1.1 * 44100));
  expect(peak(s44)).toBeGreaterThan(0.5);
});

test('the receipt printer and queue machine sounds (food-receipt, food-deep): in range, the same every time, shaped as named', () => {
  const all: Array<[string, () => Float32Array]> = [['print', () => renderPrint(SR)], ['clunk', () => renderClunk(SR)], ['tear', () => renderTear(SR)], ['rattle', () => renderRattle(SR)],
    ['dingdong', () => renderDingDong(SR)], ['cash coins', () => renderCash(SR, true)]];
  for (const [name, f] of all) {
    const a = f(), b = f();
    expect(peak(a), name).toBeGreaterThan(0.3);
    expect(peak(a), name).toBeLessThanOrEqual(1);
    expect([...a.slice(0, 3000)], name).toEqual([...b.slice(0, 3000)]);
    expect(a.every(Number.isFinite), name).toBe(true);
  }
  const by = (n: string) => commonSfx.find((s) => s.type === `common.${n}`)!;
  // the print buzz lasts as asked; the plain cash is as it was, the coins add a rattle after the bells start
  expect(renderPrint(SR, 0.8).length).toBe(Math.ceil(0.8 * SR));
  expect(by('print').duration({ dur: 0.8 })).toBe(0.8);
  expect([...renderCash(SR, false)]).toEqual([...renderCash(SR)]);
  expect(rms(renderCash(SR, true), SR * 0.2 | 0, SR * 0.4 | 0)).toBeGreaterThan(rms(renderCash(SR), SR * 0.2 | 0, SR * 0.4 | 0));
  // the ding-dong: the high chime first, the low one from 0.32 s
  const dd = renderDingDong(SR), hz = (a: number, b: number) => crossings(dd.slice(a * SR | 0, b * SR | 0)) / 2 / (b - a);
  expect(hz(0.05, 0.25)).toBeGreaterThan(hz(0.5, 0.7) * 1.1);
  expect(by('dingdong').duration({})).toBe(1.95);
  // the shutter rattle ends in a thump; the tear fades out
  const tr = renderTear(SR);
  expect(rms(tr, 0, SR * 0.15 | 0)).toBeGreaterThan(rms(tr, SR * 0.45 | 0) * 2);
  expect(renderClunk(SR).length).toBe(Math.ceil(0.16 * SR));
});

test('the ring bell (podcast-versus): strikes as many times as asked, gap apart, the same every time', () => {
  const one = renderRingBell(SR, 1), two = renderRingBell(SR), b = renderRingBell(SR);
  expect([...two.slice(0, 4000)]).toEqual([...b.slice(0, 4000)]);
  expect(peak(two)).toBeGreaterThan(0.3);
  expect(peak(two)).toBeLessThanOrEqual(1);
  expect(two.every(Number.isFinite)).toBe(true);
  expect(one.length).toBe(Math.ceil(1.4 * SR));
  expect(two.length).toBe(Math.ceil(1.68 * SR));
  // the second strike: louder just after 0.28 s than just before it
  expect(rms(two, SR * 0.285 | 0, SR * 0.3 | 0)).toBeGreaterThan(rms(two, SR * 0.26 | 0, SR * 0.275 | 0));
  const by = commonSfx.find((s) => s.type === 'common.ringbell')!;
  expect(by.duration({ strikes: 3, gap: 0.3 })).toBeCloseTo(2, 6);
  expect(by.duration({ strikes: 2, gap: 0.28, pitch: 1318.51 })).toBeCloseTo(1.68, 6);
});

// ---------- the sound pack (2026-10-21) ----------
const hzOf = (x: Float32Array, a: number, b: number) => crossings(x.slice(a * SR | 0, b * SR | 0)) / 2 / (b - a);
/** the buffer a sound effect plays with its defaults (and `params` over them), through a stand-in audio context */
function played(type: string, params: Record<string, unknown> = {}): Float32Array {
  const s = commonSfx.find((x) => x.type === type)!;
  let out = new Float32Array(0);
  const node = () => ({ connect: (n: any) => n });
  const ctx: any = { sampleRate: SR, createBuffer: (_c: number, n: number) => { out = new Float32Array(n); return { getChannelData: () => out }; },
    createBufferSource: () => ({ ...node(), start: () => {} }), createGain: () => ({ ...node(), gain: { value: 0 } }) };
  s.synth(ctx, { out: node(), verb: node(), noise: null } as any, 0, withDefaults(s.params, params));
  return out;
}
const PACK = ['chime', 'coin', 'fanfare', 'knock', 'boing', 'footstep', 'flap', 'whirr', 'scribble', 'tape', 'clink', 'drip', 'sizzle', 'pour', 'cry', 'thunder'];

test('every common sound effect has a doc and a category the gallery and the catalog know', () => {
  for (const s of commonSfx) {
    expect(s.doc, s.type).toBeTruthy();
    expect(Object.keys(SFX_CATEGORY), s.type).toContain(s.category);
  }
});

test('the sound pack: each one in range, finite, the same every time, as long as its duration says (with its defaults and with other params)', () => {
  const other: Record<string, Record<string, unknown>> = { chime: { notes: 6, chip: true }, knock: { knocks: 4, gap: 0.3 }, footstep: { steps: 2, soft: true }, flap: { flaps: 3 },
    whirr: { dur: 1.5 }, scribble: { dur: 1.2, crayon: true }, tape: { press: false }, clink: { glass: true }, drip: { drops: 3 }, sizzle: { dur: 0.6 }, pour: { dur: 3 }, cry: { times: 3 }, thunder: { seed: 8 },
    coin: { pitch: 600 }, fanfare: { pitch: 392 }, boing: { pitch: 300 } };
  for (const n of PACK) for (const params of [{}, other[n]]) {
    const type = `common.${n}`, a = played(type, params), b = played(type, params), s = commonSfx.find((x) => x.type === type)!;
    const what = `${n} ${JSON.stringify(params)}`;
    expect(peak(a), what).toBeGreaterThan(0.3);
    expect(peak(a), what).toBeLessThanOrEqual(1);
    expect(a.every(Number.isFinite), what).toBe(true);
    expect([...a.slice(0, 4000)], what).toEqual([...b.slice(0, 4000)]);
    expect(Math.abs(a.length / SR - s.duration(withDefaults(s.params, params))), what).toBeLessThan(2 / SR);
    // no click at either end
    expect(Math.abs(a[0]), what).toBeLessThan(0.02);
    expect(Math.abs(a[a.length - 1]), what).toBeLessThan(0.02);
  }
  // the same sound at another rate
  expect(renderScribble(44100, 0.6).length).toBe(Math.ceil(0.6 * 44100));
  expect(peak(renderClink(44100))).toBeGreaterThan(0.3);
});

test('the sound pack is shaped as named: notes climb, counts are heard, drops rise, the sizzle is bright and the pour is not', () => {
  // the chime runs up: its last note is higher than its first; the chip one is pulses (a square has many crossings) and short
  const ch = renderChime(SR, 4, 1568, 0.1);
  expect(hzOf(ch, 0.31, 0.36)).toBeGreaterThan(hzOf(ch, 0.01, 0.06) * 1.5);
  expect(renderChime(SR, 4, 1568, 0.07, true).length).toBeLessThan(renderChime(SR).length);
  // counted sounds: a beat at each hit, quiet between (knocks, footsteps, flaps, drops)
  const onsets = (x: Float32Array, at: number[], win = 0.02) => at.map((t) => rms(x, t * SR | 0, (t + win) * SR | 0) > rms(x, (t - 0.03) * SR | 0, (t - 0.01) * SR | 0) * 2);
  expect(onsets(renderKnock(SR, 3, 0.25), [0.25, 0.5])).toEqual([true, true]);
  expect(onsets(renderFootstep(SR, 3, 0.3), [0.3, 0.6])).toEqual([true, true]);
  expect(onsets(renderFlap(SR, 3, 0.15), [0.15, 0.3])).toEqual([true, true]);
  expect(onsets(renderDrip(SR, 3, 0.4), [0.4, 0.8])).toEqual([true, true]);
  // the two feet are not the same knock
  const fs = renderFootstep(SR, 2, 0.3);
  expect([...fs.slice(0, 2000)]).not.toEqual([...fs.slice(0.3 * SR | 0, (0.3 * SR | 0) + 2000)]);
  // a drop sweeps up; the boing jumps up from its pitch; the coin's second note is a fourth above the first
  const dr = renderDrip(SR);
  expect(hzOf(dr, 0.06, 0.1)).toBeGreaterThan(hzOf(dr, 0, 0.02) * 1.8);
  const bo = renderBoing(SR, 180);
  expect(hzOf(bo, 0.15, 0.3)).toBeGreaterThan(300);
  const co = renderCoin(SR);
  expect(hzOf(co, 0.1, 0.2) / hzOf(co, 0.035, 0.065)).toBeCloseTo(2 ** (5 / 12), 1);
  // the fanfare holds its chord after the run
  const ff = renderFanfare(SR);
  expect(rms(ff, 0.5 * SR | 0, 0.7 * SR | 0)).toBeGreaterThan(0.05);
  // the sizzle is all high hiss, the pour sits low; the whirr hums under its noise
  expect(hzOf(renderSizzle(SR, 1), 0.3, 0.6)).toBeGreaterThan(3000);
  expect(hzOf(renderPour(SR, 1), 0.3, 0.6)).toBeLessThan(2500);
  // the bowl rings long, the ice in a glass knocks three times and settles
  const bowl = renderClink(SR), ice = renderClink(SR, true);
  expect(bowl.length).toBe(Math.ceil(1.1 * SR));
  expect(rms(ice, 0.076 * SR | 0, 0.086 * SR | 0)).toBeGreaterThan(rms(ice, 0.064 * SR | 0, 0.074 * SR | 0));
  // the tape is a short rip (and a press), not the long paper tear
  expect(renderTape(SR, false).length).toBe(Math.ceil(0.32 * SR));
  expect(rms(renderTape(SR), 0.28 * SR | 0, 0.32 * SR | 0)).toBeGreaterThan(rms(renderTape(SR, false), 0.28 * SR | 0, 0.32 * SR | 0));
  // the cry: "wa-aah" twice, a breath between; its pitch follows the param
  const cr = renderCry(SR, 2);
  expect(rms(cr, 0.71 * SR | 0, 0.74 * SR | 0)).toBeLessThan(rms(cr, 0.3 * SR | 0, 0.4 * SR | 0) * 0.2);
  expect(hzOf(renderCry(SR, 1, 700), 0.3, 0.4)).toBeGreaterThan(hzOf(renderCry(SR, 1, 400), 0.3, 0.4) * 1.4);
  // the pen's strokes: louder in mid-stroke than between strokes; the crayon is another sound
  const pen = renderScribble(SR, 1, 4);
  expect(rms(pen, 0.33 * SR | 0, 0.42 * SR | 0)).toBeGreaterThan(rms(pen, 0.49 * SR | 0, 0.51 * SR | 0) * 1.5);
  expect([...renderScribble(SR, 1, 4, true).slice(2000, 3000)]).not.toEqual([...pen.slice(2000, 3000)]);
});

test('ding and xylo climb a scale one step at a time from their pitch (the root); with no step they sound exactly as before', () => {
  expect(scaleStep(1568)).toBe(1568);
  expect(scaleStep(440, 1)).toBeCloseTo(440 * 2 ** (2 / 12), 9);
  expect(scaleStep(440, 2)).toBeCloseTo(440 * 2 ** (4 / 12), 9);
  expect(scaleStep(440, 7)).toBeCloseTo(880, 9);
  expect(scaleStep(440, 9)).toBeCloseTo(880 * 2 ** (4 / 12), 9);
  expect(scaleStep(440, -1)).toBeCloseTo(440 * 2 ** (-1 / 12), 9);
  expect(scaleStep(440, 3, 'pentatonic')).toBeCloseTo(440 * 2 ** (7 / 12), 9);
  expect(scaleStep(440, 5, 'pentatonic')).toBeCloseTo(880, 9);
  expect(scaleStep(440, 1.4)).toBeCloseTo(scaleStep(440, 1), 9);                  // whole steps
  // the defaults are the old sound, sample for sample
  expect([...played('common.ding')]).toEqual([...renderDing(SR)]);
  expect([...played('common.xylo')]).toEqual([...renderXylo(SR)]);
  expect([...played('common.ding', { pitch: 1200 })]).toEqual([...renderDing(SR, 1200)]);
  // step 4 of C major from 1046.5 Hz is G (×1.498)
  expect([...played('common.ding', { pitch: 1046.5, step: 4 })]).toEqual([...renderDing(SR, 1046.5 * 2 ** (7 / 12))]);
  expect([...played('common.xylo', { pitch: 880, step: 2, scale: 'pentatonic' })]).toEqual([...renderXylo(SR, 880 * 2 ** (4 / 12))]);
  const d = commonSfx.find((s) => s.type === 'common.ding')!;
  expect(d.params.map((p) => p.key)).toEqual(['pitch', 'step', 'scale']);
});

test('the phone and camcorder sounds: in range, the same every time, as long as their duration says, and shaped as named', () => {
  const cases: Array<[string, Record<string, unknown>]> = [['common.buzz', {}], ['common.buzz', { pulses: 3 }], ['common.send', {}], ['common.recv', {}], ['common.recv', { pitch: 600 }],
    ['common.hush', {}], ['common.rewind', {}], ['common.rewind', { dur: 1.5 }], ['common.beep', { kind: 'rec' }], ['common.beep', { kind: 'end' }]];
  for (const [type, params] of cases) {
    const a = played(type, params), b = played(type, params), s = commonSfx.find((x) => x.type === type)!, what = `${type} ${JSON.stringify(params)}`;
    expect(peak(a), what).toBeGreaterThan(0.3);
    expect(peak(a), what).toBeLessThanOrEqual(1);
    expect(a.every(Number.isFinite), what).toBe(true);
    expect([...a.slice(0, 4000)], what).toEqual([...b.slice(0, 4000)]);
    expect(Math.abs(a.length / SR - s.duration(withDefaults(s.params, params))), what).toBeLessThan(2 / SR);
    expect(Math.abs(a[0]), what).toBeLessThan(0.02);
    expect(Math.abs(a[a.length - 1]), what).toBeLessThan(0.02);
  }
  // the bleep is unchanged by the new kind param
  expect([...played('common.beep')]).toEqual([...renderBeep(SR, 0.5, 1000)]);
  // buzz: silent between its pulses, a low motor in them
  const bz = renderBuzz(SR, 2);
  expect(rms(bz, 0.26 * SR | 0, 0.32 * SR | 0)).toBeLessThan(rms(bz, 0.05 * SR | 0, 0.2 * SR | 0) * 0.05);
  expect(hzOf(bz, 0.05, 0.2)).toBeLessThan(700);
  // send rises; hush falls; recv's second note is higher
  expect(hzOf(renderSend(SR), 0.08, 0.11)).toBeGreaterThan(hzOf(renderSend(SR), 0.005, 0.03) * 1.3);
  expect(hzOf(renderHush(SR), 0.2, 0.3)).toBeLessThan(hzOf(renderHush(SR), 0.02, 0.12) * 0.8);
  expect(hzOf(renderRecv(SR), 0.3, 0.4)).toBeGreaterThan(hzOf(renderRecv(SR), 0.02, 0.08) * 1.2);
  // rewind swells in the middle; the camcorder beeps are high and short, rec two of them, end three
  const rw = renderRewind(SR, 0.7);
  expect(rms(rw, 0.3 * SR | 0, 0.4 * SR | 0)).toBeGreaterThan(rms(rw, 0, 0.03 * SR | 0) * 3);
  const rec = renderCamBeep(SR, 'rec');
  expect(hzOf(rec, 0.01, 0.06)).toBeGreaterThan(2500);
  expect(rms(rec, 0.085 * SR | 0, 0.12 * SR | 0)).toBeLessThan(rms(rec, 0.01 * SR | 0, 0.06 * SR | 0) * 0.05);
  expect(renderCamBeep(SR, 'end').length).toBeGreaterThan(rec.length * 3);
});


// brand plan 5: the spike's light sweep and breath of air
test('shing and air: the asked length, within range, the same samples every time, air brighter with bright', () => {
  for (const [name, f] of [['shing', () => renderShing(SR, 1.2)], ['air', () => renderAir(SR, 1.6, 0.5)]] as Array<[string, () => Float32Array]>) {
    const a = f(), b = f();
    expect(a.length, name).toBe(Math.round((name === 'shing' ? 1.2 : 1.6) * SR));
    expect(peak(a), name).toBeGreaterThan(0.05);
    expect(peak(a), name).toBeLessThanOrEqual(1);
    expect([...a.slice(0, 800)], name).toEqual([...b.slice(0, 800)]);
  }
  expect(crossings(renderAir(SR, 1.6, 1))).toBeGreaterThan(crossings(renderAir(SR, 1.6, 0)));
  // the air swells in and out: quiet at both ends, loudest in the middle
  const air = renderAir(SR, 1.6, 0.5), n = air.length;
  expect(rms(air, n * 0.45, n * 0.55)).toBeGreaterThan(3 * rms(air, 0, n * 0.05));
  const types = commonSfx.map((s) => s.type);
  expect(types).toEqual(expect.arrayContaining(['common.shing', 'common.air']));
  expect(commonSfx.find((s) => s.type === 'common.air')!.duration({ len: 2 })).toBe(2);
});

test('the riser (SFX-MOV-02) never clips and its loudest stretch sits with the other moves', () => {
  const sr = 48000;
  const loudest = (x: Float32Array) => { const w = Math.round(0.4 * sr); let best = 0, acc = 0; for (let i = 0; i < x.length; i++) { acc += x[i] * x[i]; if (i >= w) acc -= x[i - w] * x[i - w]; best = Math.max(best, acc / Math.min(i + 1, w)); } return 10 * Math.log10(best); };
  for (const d of [0.5, 1.6, 2.5, 8]) {
    const x = renderRiser(sr, d);
    expect(x.filter((v) => Math.abs(v) >= 0.99).length, `${d} s`).toBe(0);
    expect(20 * Math.log10(peak(x)), `${d} s`).toBeLessThanOrEqual(-3);
    if (d >= 1.6) expect(loudest(x), `${d} s`).toBeGreaterThan(-18);   // still heard as a build, not lost under the music
    expect(loudest(x), `${d} s`).toBeLessThan(-12);
  }
});

test('thunder (katie-sweet16): a low rumble that rolls away, the same for a seed, another roll for another seed', () => {
  const a = renderThunder(SR, 3), n = a.length;
  expect(n).toBe(Math.ceil(3.2 * SR));
  expect([...renderThunder(SR, 3).slice(0, 4000)]).toEqual([...a.slice(0, 4000)]);
  expect([...renderThunder(SR, 4).slice(20000, 20100)]).not.toEqual([...a.slice(20000, 20100)]);
  // loud early, rolled away by the end
  expect(rms(a, 0, n * 0.25 | 0)).toBeGreaterThan(rms(a, n * 0.75 | 0, n) * 3);
  // low: far fewer zero crossings than white noise would have (about one in two samples)
  expect(crossings(a.slice(SR, 2 * SR))).toBeLessThan(SR * 0.05);
  // at another rate it keeps its length and level
  expect(renderThunder(44100).length).toBe(Math.ceil(3.2 * 44100));
  expect(peak(renderThunder(44100))).toBeGreaterThan(0.3);
});
