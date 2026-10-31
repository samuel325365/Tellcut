// The Cut API: what the sample films wrote around it.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cut } from './cut.ts';
import { secs } from './speech.ts';
import { base, inv, fresh, items } from './cut-test-kit.ts';

// review 4, promotion A (2026-10-26): what the four sample films (amber-podcast, seoul-bbq, todo-vlog, katie-sweet16) wrote around the Cut API
describe('Cut API from the sample films', () => {
  /** English words from `at`, `step` apart, each said for 80 % of its step */
  const said = (at: number, text: string, step = 0.5) => {
    const ws = text.split(' ');
    return { start: at, end: at + (ws.length - 1) * step + step * 0.8, text: ` ${text}`, words: ws.map((w, k) => ({ start: at + k * step, end: at + k * step + step * 0.8, word: ` ${w}` })) };
  };
  const withSpeech = (segments: any[]) => { const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir); i.sources[0].transcript = { language: 'en', segments }; return new Cut(base(), i, dir); };
  const caps = (c: Cut, ids: string[]) => ids.map((cid) => items(c, 'text').find((x) => x.id === cid)).map((x) => [x.params.text, x.start, Math.round((x.end - x.start) * 1e3) / 1e3]);

  test('speechCaptions shows only the words the clip plays: a sentence the in or out point cuts keeps the part inside; drop leaves fillers out', () => {
    // amber-podcast built its own captions: "Ideally", "Um" came along from outside the clip (TODO, cause in the sentence's whole text)
    const c = withSpeech([said(0, 'Ideally we take the train to Rome')]);       // the words' middles: 0.2, 0.7, 1.2 … 3.2
    const id = c.clip('v', { from: 1, len: 2 });
    expect(caps(c, c.speechCaptions(id))).toEqual([['take the train to', 0, 1.9]]);
    const d = withSpeech([said(0, 'um so we go uh home')]);
    const jd = d.clip('v', { from: 0, len: 5 });
    expect(caps(d, d.speechCaptions(jd, { drop: ['UM', 'uh'] }))).toEqual([['so we go home', 0.5, 2.4]]);
  });

  test('speechCaptions breaks at a pause, at a change of speaker and (chunked) after a sentence; maxChars caps a caption; two are never up at once', () => {
    const c = withSpeech([{ start: 0, end: 4, text: ' we got there and it rained', words: [
      { start: 0, end: 0.4, word: ' we' }, { start: 0.5, end: 0.9, word: ' got' }, { start: 1, end: 1.4, word: ' there' },
      { start: 2.6, end: 3, word: ' and' }, { start: 3.1, end: 3.5, word: ' it' }, { start: 3.6, end: 4, word: ' rained' }] }]);
    const id = c.clip('v', { from: 0, len: 5 });
    expect(caps(c, c.speechCaptions(id, { pause: 0.6 }))).toEqual([['we got there', 0, 1.8], ['and it rained', 2.6, 1.4]]);   // the first stays 0.4 s past its last word
    const two = withSpeech([said(0, 'are you here? yes I am')]);
    const jt = two.clip('v', { from: 0, len: 5 });
    expect(caps(two, two.speechCaptions(jt, { speakers: [[0, 1.45, 2], [1.45, 5, 1]] })).map((x) => x[0])).toEqual(['are you here?', 'yes I am']);
    const s = withSpeech([said(0, 'Hi there. This is Rome')]);
    const js = s.clip('v', { from: 0, len: 5 });
    expect(caps(s, s.speechCaptions(js, { chunk: 10 })).map((x) => x[0])).toEqual(['Hi there.', 'This is Rome']);
    expect(caps(s, s.speechCaptions(js)).map((x) => x[0])).toEqual(['Hi there. This is Rome']);       // not chunked: the sentence as Whisper gave it
    const m = withSpeech([said(0, 'this is actually the cheapest room')]);
    const jm = m.clip('v', { from: 0, len: 5 });
    expect(caps(m, m.speechCaptions(jm, { maxChars: 12 })).map((x) => x[0])).toEqual(['this is', 'actually the', 'cheapest', 'room']);   // a lone last word joins only within maxChars
    const o = withSpeech([said(0, 'one two three four'), said(1.2, 'five six')]);                         // Whisper's sentences overlap
    const jo = o.clip('v', { from: 0, len: 5 });
    expect(caps(o, o.speechCaptions(jo))).toEqual([['one two three four', 0, 1.2], ['five six', 1.2, 0.9]]);
  });

  test('c.lines: hand-written captions timed in the source, as m:ss too; hold keeps them up until the next, never past the clip; a line outside is an error', () => {
    const c = fresh(), id = c.clip('v', { from: 1, len: 6 });                  // source 1–7 at film 0–6
    const ids = c.lines(id, [['0:02', '0:04', 'Found it!'], [5, 6.5, 'Very bouncy.', { speaker: 2 }]], { type: 'common.caption', hold: 0.7 });
    const its = ids.map((x) => items(c, 'text').find((i) => i.id === x));
    expect(its.map((i) => [i.type, i.parent, i.params.text, i.start, Math.round((i.end - i.start) * 1e3) / 1e3])).toEqual([['common.caption', id, 'Found it!', 1, 2.7], ['common.caption', id, 'Very bouncy.', 4, 2]]);
    expect(its[1].params.speaker).toBe(2);
    expect(() => c.lines(id, [[8, 9, 'later']])).toThrow(/不在片段裡/);
    expect(() => c.lines(id, [['1:7x', 3, 'x']])).toThrow(/看不懂/);
  });

  test('c.filmTime: where a source moment plays, over one clip or the pieces of one; outside them is an error', () => {
    const c = fresh(), a = c.clip('v', { from: 0, len: 2 }), b = c.clip('v', { from: 5, len: 2 });
    expect([c.filmTime([a, b], 5.5), c.filmTime([a, b], '0:01'), c.filmTime([a, b], 3)]).toEqual([2.5, 1, 2]);   // 3 s was left out: the next piece's start
    expect(() => c.filmTime(a, 9)).toThrow(/不在片段裡/);
  });

  test('c.audio: a J-cut — the source sound alone at a film time, the cursor stays; it ducks the music like a clip sound', async () => {
    const c = fresh();
    c.clip('v', { from: 0, len: 3, sound: false });
    const id = c.audio('v', { from: 5, len: 2, at: 2 });                     // 出發 is said at source 6–8: film 3–4
    expect(c.time).toBe(3);
    expect(items(c, 'orig').map((i) => [i.id, i.in, i.start, i.end, i.parent])).toEqual([[id, 5, 2, 4, undefined]]);
    c.score('lofi', { seed: 2 });
    const env = ((await c.save()).tracks.find((t) => t.id === 'music')!.items[0] as any).envelope as number[][];
    expect(env.find(([, db]) => db === -10)?.[0]).toBeCloseTo(3, 3);
    expect(() => fresh().audio('ph', { from: 0, len: 1 })).toThrow(/沒有聲音/);
  });

  test("c.clip's short crop (x, y, zoom; to; push) and a from written m:ss", () => {
    const c = fresh();
    c.clip('v', { from: '0:01.5', len: 1, crop: { x: 0.4, push: 1.05 } });
    c.clip('v', { from: 3, len: 1, crop: { x: 0.3, zoom: 1.2, to: { x: 0.5 } } });
    expect(items(c, 'v1').map((i) => [i.in, i.crop])).toEqual([
      [1.5, { from: { x: 0.4, y: 0.5, zoom: 1 }, to: { x: 0.4, y: 0.5, zoom: 1.05 } }],
      [3, { from: { x: 0.3, y: 0.5, zoom: 1.2 }, to: { x: 0.5, y: 0.5, zoom: 1.2 } }]]);
    expect(() => c.clip('v', { from: 0, len: 1, crop: { zoom: 0 } })).toThrow(/crop\.zoom/);
  });

  test('ducking: a clip sound at -20 dB or lower (room tone under a montage) does not duck; a clip can say true, false or its own dB', async () => {
    // todo-vlog turned ducking off and drew the curve by hand: its muted b-roll's transcript flattened the montage
    const env = async (f: (c: Cut) => void) => { const c = fresh(); f(c); c.score('lofi', { seed: 2 }); return ((await c.save()).tracks.find((t) => t.id === 'music')!.items[0] as any).envelope as number[][] | undefined; };
    expect(await env((c) => c.clip('v', { from: 0, len: 9, gain: -20 }))).toBeUndefined();
    expect(new Set((await env((c) => c.clip('v', { from: 0, len: 9, gain: -20, duck: true })))!.map(([, db]) => db))).toEqual(new Set([0, -10]));
    expect(await env((c) => c.clip('v', { from: 0, len: 9, duck: false }))).toBeUndefined();
    expect(new Set((await env((c) => { c.clip('v', { from: 0, len: 9, duck: -6 }); c.duck(false); }))!.map(([, db]) => db))).toEqual(new Set([0, -6]));
    // the pieces tighten() makes of a clip keep its duck
    expect(await env((c) => { const id = c.clip('v', { from: 0, len: 9, duck: false }); c.tighten(id); })).toBeUndefined();
  });

  test('c.beats: a length in beats of the music', () => {
    const c = fresh();
    expect(() => c.beats(2)).toThrow(/score/);
    c.music('song');                                                          // 120 BPM
    expect(c.beats(3)).toBe(1.5);
    const d = fresh();
    d.score('lofi');                                                         // 78 BPM
    expect(d.beats(2)).toBe(1.538462);
    expect(() => fresh().score('lofi', { cues: { lift: 'x' as any } })).toThrow(/cues\.lift/);
  });

  test('secs reads seconds and m:ss / h:mm:ss', () => {
    expect([secs(83.5), secs('1:23.5'), secs('1:02:03'), secs(' 90 ')]).toEqual([83.5, 83.5, 3723, 90]);
    expect(() => secs('1:75')).toThrow(/看不懂/);
  });
});
