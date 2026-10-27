import { createHash } from 'node:crypto';
import { readWav } from '../wav.ts';
import { arrangement, chordOn, composeEvents, encodeWav16, generateScore, inKey, parseKey, scaleNote, STYLES, type Inst } from './index.ts';
import { rng } from './synth.ts';

const PITCHED = new Set<Inst>(['pluck', 'marimba', 'bell', 'epiano', 'bass', 'sub', 'pad', 'pulse', 'tom']);
const hash = (a: Float32Array) => createHash('sha1').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');

test('keys: C major and A minor give the notes they should, and a bad name says how to write one', () => {
  expect(chordOn(parseKey('C'), 1)).toEqual([60, 64, 67]);
  expect(chordOn(parseKey('Am'), 1, { octave: 3 })).toEqual([57, 60, 64]);
  expect(chordOn(parseKey('Am'), 5, { octave: 3, seventh: true })).toEqual([64, 67, 71, 74]);       // E minor seventh on the fifth step
  expect(scaleNote(parseKey('G'), 1, 2)).toBe(43);
  expect(scaleNote(parseKey('C'), 8, 4)).toBe(72);                                                  // a step past the seventh is the next octave
  expect(parseKey('F#m')).toMatchObject({ root: 6, minor: true });
  expect(parseKey('Bb').root).toBe(10);
  expect(() => parseKey('H')).toThrow('C、F#、Am');
  expect(inKey(parseKey('C'), 61)).toBe(false);
  expect(inKey(parseKey('C'), 64)).toBe(true);
});

test('the arrangement: an opening, a fill every fourth bar, one outro bar and a closing bar; layers only grow', () => {
  const a = arrangement(12), roles = Array.from({ length: 12 }, (_, i) => a.role(i));
  expect(roles).toEqual(['intro', 'intro', 'loop', 'fill', 'loop', 'loop', 'loop', 'fill', 'loop', 'loop', 'outro', 'end']);
  const lv = Array.from({ length: 12 }, (_, i) => a.layers(i));
  expect(lv[0]).toBe(0);
  expect(Math.max(...lv)).toBe(2);                                                                  // twelve bars: two layers join the opening
  expect(Math.max(...Array.from({ length: 20 }, (_, i) => arrangement(20).layers(i)))).toBe(3);
  expect(lv.slice(2, 10).every((v, i, s) => i === 0 || v >= s[i - 1])).toBe(true);
  expect(Array.from({ length: 4 }, (_, i) => arrangement(4).role(i))).toEqual(['loop', 'loop', 'loop', 'end']);
});

test('a style reads the moments the cut gave it (ctx.cues), and gets {} when none were', () => {
  const seen: unknown[] = [];
  const style = { ...STYLES.lofi, id: 'cue-test', build(ctx: any) { seen.push(ctx.cues); return []; } };
  composeEvents(style, { bpm: 90, key: 'C', bars: 4, rng: rng(1), cues: { lift: 12.5 } });
  composeEvents(style, { bpm: 90, key: 'C', bars: 4, rng: rng(1) });
  expect(seen).toEqual([{ lift: 12.5 }, {}]);
});

describe.each(Object.keys(STYLES))('style %s', (id) => {
  const style = STYLES[id], bars = 12, beat = 60 / style.defaults.bpm;
  const events = composeEvents(style, { bpm: style.defaults.bpm, key: style.defaults.key, bars, rng: rng(5) });

  test('plays on the beat grid, in its key, inside its bars, starting at the first beat', () => {
    expect(events[0].t).toBeCloseTo(0, 3);
    expect(events.every((e, i) => i === 0 || e.t >= events[i - 1].t)).toBe(true);
    expect(events.every((e) => e.t >= 0 && e.t < bars * beat * 4)).toBe(true);
    const key = parseKey(style.defaults.key);
    expect(events.filter((e) => PITCHED.has(e.inst) && e.midi !== undefined && e.inst !== 'sub').every((e) => inKey(key, e.midi!))).toBe(true);
    // every hit sits on a sixteenth of a beat, or a swing offset / strum roll of a few hundredths of a second after one
    const off = events.map((e) => { const r = ((e.t / (beat / 4)) % 1 + 1) % 1; return Math.min(r, 1 - r) * (beat / 4); });
    expect(Math.max(...off.filter((v) => v < beat / 8))).toBeLessThan(0.1);
  });

  test('has drums or a pulse that the others do not, ends on a chord alone, and uses more instruments as layers join', () => {
    const last = events.filter((e) => e.t >= (bars - 1) * beat * 4 - 1e-6);
    expect(last.some((e) => ['kick', 'snare', 'clap', 'hat', 'shaker'].includes(e.inst))).toBe(false);
    expect(last.length).toBeGreaterThanOrEqual(3);
    const kinds = (a: number, b: number) => new Set(events.filter((e) => e.t >= a * beat * 4 && e.t < b * beat * 4).map((e) => e.inst)).size;
    expect(kinds(8, 10)).toBeGreaterThanOrEqual(kinds(0, 2));
  });
});

test('the same seed gives the same sound, another seed another one; the level and peak are set', () => {
  const a = generateScore({ style: 'playful', length: 12, seed: 3 }), b = generateScore({ style: 'playful', length: 12, seed: 3 }), c = generateScore({ style: 'playful', length: 12, seed: 4 });
  expect(hash(a.L)).toBe(hash(b.L));
  expect(hash(a.L)).not.toBe(hash(c.L));
  let peak = 0, sum = 0;
  for (let i = 0; i < a.L.length; i++) { peak = Math.max(peak, Math.abs(a.L[i]), Math.abs(a.R[i])); sum += a.L[i] ** 2 + a.R[i] ** 2; }
  expect(peak).toBeLessThanOrEqual(0.95);
  expect(peak).toBeGreaterThan(0.3);
  const db = 10 * Math.log10(sum / (2 * a.L.length));
  expect(db).toBeGreaterThan(-21);
  expect(db).toBeLessThan(-17);
  expect(Math.abs(a.L[a.L.length - 1])).toBeLessThan(1e-3);                                            // the end is faded, not cut
  expect(a.L.every(Number.isFinite)).toBe(true);
});

test('length becomes whole bars (at least four), the closing chord rings after the last bar, the info says where the bars are', () => {
  const s = generateScore({ style: 'lofi', length: 30, seed: 1 }), bar = (60 / 78) * 4;
  expect(s.info.bars).toBe(Math.round(30 / bar));
  expect(s.info.duration).toBeCloseTo(s.info.bars * bar + 1.6, 2);
  expect(s.info.barStarts[1]).toBeCloseTo(bar, 3);
  expect(s.info.roles[s.info.bars - 1]).toBe('end');
  expect(generateScore({ style: 'tech', length: 2 }).info.bars).toBe(4);
  expect(Math.abs(s.L.length - s.info.duration * s.info.sampleRate)).toBeLessThan(s.info.sampleRate * 0.002);     // the duration is rounded to the millisecond
});

test('bad requests say what is wrong', () => {
  expect(() => generateScore({ style: 'nope', length: 10 })).toThrow('pluck');
  expect(() => generateScore({ style: 'lofi', length: 10, bpm: 300 })).toThrow('40–200');
  expect(() => generateScore({ style: 'lofi', length: 10, key: 'X' })).toThrow('看不懂調性');
});

test('the wav bytes read back as stereo 16-bit of the same length', () => {
  const s = generateScore({ style: 'pluck', length: 6, seed: 1 }), w = readWav(encodeWav16(s.L, s.R, s.info.sampleRate));
  expect([w.channels, w.sampleRate, w.frames]).toEqual([2, 44100, s.L.length]);
  expect(Math.abs(w.data[0][20000] - s.L[20000])).toBeLessThan(1 / 16000);
});

test('writeScore puts the wav and its info in the project and registers the music; a second one of the same name replaces it', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { writeScore } = await import('./write.ts');
  const dir = mkdtempSync(join(tmpdir(), 'score-'));
  try {
    const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } };
    writeFileSync(join(dir, 'project.json'), JSON.stringify({ version: 1, meta: { name: 't', width: 100, height: 100, fps: 30, duration: 4, plugins: [], mix: MIX }, sources: {}, media: {}, grids: [], tracks: [] }));
    const a = writeScore(dir, { style: 'lofi', length: 8, name: 'chill' });
    expect(a.mediaId).toBe('score-chill');
    const p = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
    expect(p.media['score-chill']).toEqual({ path: 'media/score-chill.wav', duration: a.info.duration });
    expect(existsSync(join(dir, 'media', 'score-chill.wav'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'media', 'score-chill.json'), 'utf8')).style).toBe('lofi');
    const b = writeScore(dir, { style: 'tech', length: 8, name: 'chill' });
    expect(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).media['score-chill'].duration).toBe(b.info.duration);
    expect(() => writeScore(join(dir, 'none'), { style: 'lofi', length: 8 })).toThrow('project.json');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
