import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject, resolveTimes, settle } from '@tellcut/engine';
import { checkFrame, Cut, editedSinceCut } from './cut.ts';
import type { Inventory } from './inventory.ts';
import { secs } from './speech.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
const base = () => parseProject({ version: 1, meta: { name: 't', width: 1920, height: 1080, fps: 30, duration: 60, plugins: [], mix: MIX },
  sources: { v: { path: 'v.mp4', duration: 10, width: 1920, height: 1080, kind: 'video', audio: true }, ph: { path: 'p.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' } },
  media: { song: { path: 'song.wav' } }, grids: [], tracks: [] });
const inv = (dir: string): Inventory => ({ id: 't', dir, project: base(), chapters: [], photoSheets: [], overview: [],
  sources: [{ id: 'v', kind: 'video', duration: 10, width: 1920, height: 1080, orientation: 'landscape', audio: true, speech: '', sheets: [],
    segments: [[0, 2], [2, 7], [7, 10]], transcript: { language: 'zh', segments: [{ start: 1, end: 2.5, text: '大家好' }, { start: 6, end: 8, text: '出發' }] } }],
  music: [{ id: 'song', duration: 30, beats: { bpm: 120, offset: 0.25, beats: Array.from({ length: 60 }, (_, i) => 0.25 + i * 0.5) } }] });
const fresh = () => { const dir = mkdtempSync(join(tmpdir(), 'cut-')); return new Cut(base(), inv(dir), dir); };
const items = (c: Cut, track: string) => c.p.tracks.find((t) => t.id === track)!.items as any[];

test('clips and photos go one after another on the main track; a clip brings its own sound along', () => {
  const c = fresh();
  const a = c.clip('v', { from: 1, len: 2 });
  const b = c.photo('ph', { len: 3 });
  expect(items(c, 'v1').map((i) => [i.id, i.source, i.in, i.start, i.end])).toEqual([[a, 'v', 1, 0, 2], [b, 'ph', 0, 2, 5]]);
  expect(items(c, 'v1')[1].crop).toEqual({ from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.1 } });
  expect(items(c, 'orig').map((i) => [i.source, i.in, i.start, i.end, i.parent])).toEqual([['v', 1, 0, 2, a]]);
  expect(c.time).toBe(5);
});

test('a re-run starts from what the script sets: an old theme, fx list and unused generated narration/music are gone; imported music stays', async () => {
  const make = () => {
    const dir = mkdtempSync(join(tmpdir(), 'cut-')), p = base();
    p.meta.theme = { palette: { accent: '#ff0000' } } as any;
    p.meta.fx = ['fx/old.js'];
    p.media['voice-s1'] = { path: 'media/voice/s1.wav', duration: 3 } as any;
    p.media['score-lofi'] = { path: 'media/score-lofi.wav', duration: 30 } as any;
    return new Cut(p, inv(dir), dir);
  };
  const c = make();
  expect([c.p.meta.theme, c.p.meta.fx]).toEqual([undefined, undefined]);
  c.clip('v', { from: 0, len: 2 });
  expect(Object.keys((await c.save()).media)).toEqual(['song']);
  // a score made by npm run score and used through c.music() stays
  const d = make();
  d.clip('v', { from: 0, len: 2 });
  d.music('score-lofi');
  expect(Object.keys((await d.save()).media).sort()).toEqual(['score-lofi', 'song']);
});

test('an English word is found as a whole word (case and punctuation aside), not inside another', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  i.sources[0].transcript = { language: 'en', segments: [{ start: 0, end: 4, text: 'This class is ASS! Oh my god', words: [
    { start: 0, end: 0.4, word: ' This' }, { start: 0.4, end: 1, word: ' class' }, { start: 1, end: 1.3, word: ' is' },
    { start: 1.3, end: 2, word: ' ASS!' }, { start: 2.5, end: 2.8, word: ' Oh' }, { start: 2.8, end: 3, word: ' my' }, { start: 3, end: 3.6, word: ' god' }] }] };
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 5 });
  expect(c.wordTimes(id, 'ass')).toEqual([[1.3, 2]]);
  expect(c.wordTimes(id, 'my god')).toEqual([[2.8, 3.6]]);
});

test('English that Whisper split into pieces in a Chinese transcript is still found, whole words only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  i.sources[0].transcript = { language: 'zh', segments: [{ start: 0, end: 4, text: '我在Google上面看到ASMR', words: [
    { start: 0, end: 0.5, word: '我在' }, { start: 0.5, end: 0.8, word: 'Go' }, { start: 0.8, end: 1.2, word: 'ogle' }, { start: 1.2, end: 1.8, word: '上面' },
    { start: 1.8, end: 2.4, word: '看到' }, { start: 2.4, end: 2.7, word: 'AS' }, { start: 2.7, end: 3.1, word: 'MR' }] }] };
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 5 });
  expect(c.wordTimes(id, 'Google')).toEqual([[0.5, 1.2]]);
  expect(c.wordTimes(id, 'asmr')).toEqual([[2.4, 3.1]]);
  expect(c.wordTimes(id, 'go')).toEqual([]);                                   // only the start of "Google"
});

test('camera shake lands on the clip playing then, in its own seconds; across a cut both clips shake', () => {
  const c = fresh();
  const a = c.clip('v', { from: 0, len: 2 }), b = c.clip('v', { from: 2, len: 2 });
  c.shake(0.5);
  c.shake(1.8, { dur: 0.5, px: 30 });
  const clip = (id: string) => items(c, 'v1').find((i) => i.id === id);
  expect(clip(a).shake).toEqual([{ at: 0.5, dur: 0.4, px: 24, hz: 18 }, { at: 1.8, dur: 0.5, px: 30, hz: 18 }]);
  expect(clip(b).shake).toEqual([{ at: -0.2, dur: 0.5, px: 30, hz: 18 }]);
  expect(() => c.shake(10)).toThrow('沒有影片片段');
});

test('a photo given to clip() keeps the crop it was asked for (a recipe shot with a focus)', () => {
  const c = fresh(), crop = { from: { x: 0.3, y: 0.4, zoom: 1 }, to: { x: 0.3, y: 0.4, zoom: 1.05 } };
  const id = c.clip('ph', { len: 2, crop });
  expect(items(c, 'v1').find((i) => i.id === id).crop).toEqual(crop);
});

test('a bleep and its sticker ride on the clip: they stay on the word when the clip moves', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 2 });
  const id = c.clip('v', { from: 0, len: 4 });                                // 大家好 is said 1–2.5 s into it
  const [[a]] = c.censorSpeech(id, '大家');
  const attached = c.p.tracks.flatMap((t) => t.items as any[]).filter((i) => i.type === 'common.beep' || i.type === 'common.censor').sort((x, y) => x.type.localeCompare(y.type));
  expect(attached.map((i) => [i.type, i.parent])).toEqual([['common.beep', id], ['common.censor', id]]);
  const t0 = resolveTimes(c.p);
  expect(attached.map((i) => t0.get(i.id)!.start)).toEqual([a, a]);
  (items(c, 'v1').find((i) => i.id === id) as any).start += 3;                // the clip moves 3 s later
  const t1 = resolveTimes(c.p);
  expect(attached.map((i) => t1.get(i.id)!.start)).toEqual([a + 3, a + 3]);
});

test('censorSpeech with an emoji for the sticker: that emoji, on the clip, instead of the 消音 label', () => {
  const c = fresh();
  const id = c.clip('v', { from: 0, len: 4 });
  c.censorSpeech(id, '大家', { sticker: '🤐' });
  const all = c.p.tracks.flatMap((t) => t.items as any[]);
  expect(all.some((i) => i.type === 'common.censor')).toBe(false);
  expect(all.filter((i) => i.type === 'common.emoji').map((i) => [i.params.char, i.parent])).toEqual([['🤐', id]]);
});

test('a dissolve overlaps the previous clip by its length (linked to the overlap)', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 2 });
  c.clip('v', { from: 5, len: 2, transition: { type: 'dissolve', dur: 0.5 } });
  expect(items(c, 'v1').map((i) => [i.start, i.end])).toEqual([[0, 2], [1.5, 3.5]]);
});

test('beatLen measures to the n-th next beat of the music; bestSegments spreads picks over the scenes', () => {
  const c = fresh();
  c.music('song');
  expect(c.beatLen(4)).toBe(2.25);              // first beat at 0.25, four beats later 2.25
  c.at(2.25);
  expect(c.beatLen(2)).toBe(1);
  expect(c.bestSegments('v', { count: 2, minLen: 2, maxLen: 3 })).toEqual([[2.3, 5.3], [7.3, 9.7]]);
  expect(() => fresh().beatLen()).toThrow(/music\(\)/);
});

test('texts go on the text track; speech becomes captions attached to the clip; the end card comes last', () => {
  const c = fresh();
  c.title('京都', { at: 0, len: 3 });
  const a = c.clip('v', { from: 0, len: 4 });
  const caps = c.speechCaptions(a);
  c.endCard(['感謝觀看', '小明']);
  const t = items(c, 'text');
  expect(t.map((i) => [i.type, i.start, i.end, i.parent ?? null])).toEqual([
    ['core.title', 0, 3, null], ['core.caption', 1, 2.5, a], ['core.endCard', 4, 9, null],
  ]);
  expect([caps.length, t[1].params.text, t[2].params.text]).toEqual([1, '大家好', '感謝觀看\n小明']);
});

test('save: the length follows the edit, music fades at the end, a beat grid, a valid file with history; edits since are noticed', async () => {
  const c = fresh();
  writeFileSync(join(c.dir, 'project.json'), JSON.stringify(base()));
  c.music('song', { fadeOut: 2 });
  c.clip('v', { from: 0, len: 6 });
  const p = await c.save();
  expect(p.meta.duration).toBe(6);
  expect((p.tracks.find((t) => t.id === 'music')!.items as any[]).map((i) => [i.media, i.start, i.end, i.fadeOut])).toEqual([['song', 0, 6, 2]]);
  expect(p.grids).toEqual([{ id: 'music', at: 0.25, bpm: 120 }]);
  expect(JSON.parse(readFileSync(join(c.dir, 'project.json'), 'utf8')).meta.duration).toBe(6);
  expect(readdirSync(join(c.dir, '.history')).some((f) => f.endsWith('_cut.json'))).toBe(true);
  expect(editedSinceCut(c.dir)).toBe(false);
  writeFileSync(join(c.dir, 'project.json'), JSON.stringify({ ...p, meta: { ...p.meta, name: 'edited' } }));
  expect(editedSinceCut(c.dir)).toBe(true);
  expect(existsSync(join(c.dir, 'cache', 'cut-state.json'))).toBe(true);
});

test('a first cut has a magnetic main track and music that ends with the film', async () => {
  const c = fresh();
  c.music('song');
  c.clip('v', { from: 0, len: 2 });
  c.clip('v', { from: 5, len: 2 });
  const p = await c.save();
  expect((p.tracks.find((t) => t.id === 'v1') as any).magnetic).toBe(true);
  expect((p.tracks.find((t) => t.id === 'music')!.items[0] as any).toEnd).toBe(true);
  expect(p.media.song.duration).toBe(30);   // inv(): the song is 30 s
  expect(items(c, 'v1').map((i) => [i.start, i.end])).toEqual([[0, 2], [2, 4]]);
});

test('a cut that leaves gaps on the main track saves it as not magnetic, so the first edit in the editor moves nothing', async () => {
  // the brand recipe's way: 3D overlays sit over a gap in the main track, the logo after the last clip
  const c = fresh();
  c.clip('v', { from: 0, len: 2 });
  c.at(5);
  c.clip('v', { from: 5, len: 2 });
  c.effect('common.headline', { at: 2, len: 3, text: 'over the gap' });
  c.sfx('common.impact', { at: 8, len: 1 });
  const p = await c.save();
  expect((p.tracks.find((t) => t.id === 'v1') as any).magnetic).toBeUndefined();
  expect(c.notes.join('\n')).toMatch(/主軌有 1 個空檔/);
  // the editor runs settle after every command: a volume change must leave every item where it was
  const after = structuredClone(p), sfx = after.tracks.find((t) => t.id === 'sfx')!.items[0] as any;
  sfx.gain = -20;
  settle(p, after);
  const at = (q: typeof p) => q.tracks.flatMap((t) => (t.items as any[]).map((i) => [i.id, i.start, i.end]));
  expect(at(after)).toEqual(at(p));
});

test('fx registers a project-local module once; effect puts any item type on the text track', () => {
  const c = fresh();
  c.fx('fx/ring.js').fx('fx/ring.js');
  const id = c.effect('fx.ring', { at: 1, len: 2, color: '#fff' });
  expect(c.p.meta.fx).toEqual(['fx/ring.js']);
  expect(items(c, 'text').map((i) => [i.id, i.type, i.start, i.end, i.params])).toEqual([[id, 'fx.ring', 1, 3, { color: '#fff' }]]);
  expect(c.p.meta.fx).toEqual(['fx/ring.js']);
});

test('theme sets only the fields given, group by group', () => {
  const c = fresh();
  c.theme({ palette: { accent: '#0af' }, radius: 12 }).theme({ palette: { hl: '#ff0' }, safe: { bottom: 0.25 } });
  expect(c.p.meta.theme).toEqual({ palette: { accent: '#0af', hl: '#ff0' }, radius: 12, safe: { bottom: 0.25 } });
});

test('sfx makes the sound track when needed; an effect with layer top goes on its own track above the text', () => {
  const c = fresh();
  c.effect('core.flash', { at: 0, len: 1 });
  const s = c.sfx('common.beep', { at: 1, len: 0.6, dur: 0.6 });
  const f = c.effect('common.film', { at: 0, len: 5, layer: 'top', grain: 0.3 });
  const ids = c.p.tracks.map((t) => t.id);
  expect(ids.indexOf('top')).toBe(ids.indexOf('text') + 1);
  expect(ids[ids.length - 1]).toBe('sfx');
  expect(items(c, 'sfx').map((i) => [i.id, i.type, i.start, i.end, i.params, i.gain])).toEqual([[s, 'common.beep', 1, 1.6, { dur: 0.6 }, -8]]);
  expect(items(c, 'top').map((i) => [i.id, i.type, i.params])).toEqual([[f, 'common.film', { grain: 0.3 }]]);
  c.sfx('common.pop', { at: 2 }); c.effect('common.film', { at: 0, len: 1, layer: 'top' });
  expect(c.p.tracks.filter((t) => t.id === 'sfx' || t.id === 'top')).toHaveLength(2);   // the tracks are made once
  expect(c.time).toBe(0);
  expect(parseProject(c.p).tracks.length).toBe(c.p.tracks.length);
});

test('a gallery handle where a type id belongs is refused with the id it stands for', () => {
  const c = fresh();
  expect(() => c.effect('MRK-03', { at: 0, len: 1 })).toThrow(/MRK-03 是圖鑑代號.*c\.effect\('common\.stamp'/);
  expect(() => c.sfx('sfx-hit-2', { at: 0 })).toThrow(/c\.sfx\('common\.pop'/);
  expect(() => c.effect('ZZZ-09', { at: 0, len: 1 })).toThrow(/也沒有這個代號/);
});

/** a 16-bit mono WAV of `sec` seconds of silence at `sr` */
const silentWav = (sec: number, sr = 48000) => {
  const n = Math.round(sec * sr), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
};
test('sfxFile puts a project sound file on the sound-effect track that sfx uses: its own length, never ducked, a clear error when missing', async () => {
  const c = fresh();
  mkdirSync(join(c.dir, 'media', 'sfx'), { recursive: true });
  writeFileSync(join(c.dir, 'media', 'sfx', 'ding.wav'), silentWav(0.75));
  writeFileSync(join(c.dir, 'media', 'sfx', 'pop.wav'), silentWav(0.2, 44100));
  c.clip('v', { from: 0, len: 4 });                                           // speech at 1–2.5: the music ducks there
  c.music('song');
  const beep = c.sfx('common.beep', { at: 0.5, len: 0.3, dur: 0.3 });
  const a = c.sfxFile('media/sfx/ding.wav', { at: 1.2 });
  const b = c.sfxFile('./media/sfx/pop.wav', { at: 1.5, gain: -12 });
  const d = c.sfxFile('media\\sfx\\ding.wav', { at: 3, len: 0.4 });
  const e = c.sfxFile('media/sfx/ding.wav', { at: 3.5, len: 9 });             // never longer than the file
  expect(c.p.tracks.filter((t) => t.kind === 'sfx').map((t) => t.id)).toEqual(['sfx']);   // one shared track
  expect(items(c, 'sfx').map((i) => [i.id, i.type, i.label ?? null, i.start, i.end, i.params, i.gain])).toEqual([
    [beep, 'common.beep', null, 0.5, 0.8, { dur: 0.3 }, -8],
    [a, 'core.file', 'ding', 1.2, 1.95, { path: 'media/sfx/ding.wav' }, -8],
    [b, 'core.file', 'pop', 1.5, 1.7, { path: 'media/sfx/pop.wav' }, -12],
    [d, 'core.file', 'ding', 3, 3.4, { path: 'media/sfx/ding.wav' }, -8],
    [e, 'core.file', 'ding', 3.5, 4.25, { path: 'media/sfx/ding.wav' }, -8],
  ]);
  expect(c.time).toBe(4);                                                     // the cursor stays where the clips put it
  expect(() => c.sfxFile('media/sfx/nope.wav', { at: 1 })).toThrow(/找不到音效檔 media\/sfx\/nope\.wav/);
  expect(() => c.sfxFile('../elsewhere.wav', { at: 1 })).toThrow(/專案資料夾裡的相對路徑/);
  expect(() => c.sfxFile(join(c.dir, 'media', 'sfx', 'ding.wav'), { at: 1 })).toThrow(/相對路徑/);
  const p = await c.save();
  const music = p.tracks.find((t) => t.id === 'music')!.items[0] as any, sounds = p.tracks.find((t) => t.id === 'sfx')!.items as any[];
  expect(music.envelope?.length).toBeGreaterThan(0);                          // the music ducks under the speech…
  expect(sounds.every((i) => i.envelope === undefined)).toBe(true);           // …the sound effects do not
  expect(p.tracks.find((t) => t.id === 'sfx')).toMatchObject({ kind: 'sfx', name: 'SFX', gain: 0 });
});

test('bleepOut removes the original sound for that stretch only, leaving the picture and the sound around it', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 6 });
  c.bleepOut({ at: 2, len: 1 });
  const orig = items(c, 'orig').map((i) => [i.start, i.end]);
  expect(orig).toEqual([[0, 2], [3, 6]]);
  expect(items(c, 'v1').map((i) => [i.start, i.end])).toEqual([[0, 6]]);
  const none = fresh();
  expect(() => none.bleepOut({ at: 1, len: 1 })).not.toThrow();       // no sound track items: nothing to do
});

test('bleepOut still cuts the sound out when the word is less than a frame from the edge of its clip', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 6 });
  c.bleepOut({ at: 0.02, len: 1 });
  expect(items(c, 'orig').map((i) => [i.start, i.end])).toEqual([[1.02, 6]]);
  const d = fresh();
  d.clip('v', { from: 0, len: 6 });
  d.bleepOut({ at: 5, len: 0.98 });
  expect(items(d, 'orig').map((i) => [i.start, i.end])).toEqual([[0, 5]]);
});

test('a Chinese word is not found across two sentences', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  i.sources[0].transcript = { language: 'zh', segments: [{ start: 1, end: 2.5, text: '大家好' }, { start: 6, end: 8, text: '嗎出發' }] };
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 10 });
  expect(c.wordTimes(id, '好嗎')).toEqual([]);
  expect(c.wordTimes(id, '家好')).toHaveLength(1);
});

test('voiceCaptions: a short phrase stays up at least 0.6 s but never over the next one', () => {
  const c = fresh();
  const caps = c.voiceCaptions({ id: 'x', start: 0, end: 2, phrases: [{ text: '嗨', t0: 0, t1: 0.2 }, { text: '你好', t0: 0.4, t1: 1 }, { text: '再見', t0: 1.1, t1: 1.3 }] });
  const t = resolveTimes(c.p), span = caps.map((id) => [t.get(id)!.start, t.get(id)!.end]);
  expect(span).toEqual([[0, 0.4], [0.4, 1.1], [1.1, 1.7]]);
});

test('panel puts clips in a rounded frame and save adds the backdrop under and the border over the picture', async () => {
  const c = fresh();
  c.panel({ frame: [0.05, 0.2, 0.9, 0.5], radius: 20 });
  const a = c.clip('v', { from: 0, len: 2 });
  const b = c.photo('ph', { len: 2 });
  expect(items(c, 'v1').map((i) => [i.id, i.frame, i.radius])).toEqual([[a, [0.05, 0.2, 0.9, 0.5], 20], [b, [0.05, 0.2, 0.9, 0.5], 20]]);
  const p = await c.save();
  const ids = p.tracks.map((t) => t.id);
  expect(ids[0]).toBe('bg');
  expect(ids[ids.indexOf('v1') + 1]).toBe('panel');
  expect((p.tracks[0].items[0] as any)).toMatchObject({ type: 'common.backdrop', start: 0, end: 4 });
  expect((p.tracks.find((t) => t.id === 'panel')!.items[0] as any).params).toMatchObject({ x: 0.05, y: 0.2, w: 0.9, h: 0.5, radius: 20 });
});

test('panel can leave the backdrop or the border out, and without panel nothing changes', async () => {
  const c = fresh();
  c.panel({ backdrop: false, border: { shadow: 0 } });
  c.clip('v', { from: 0, len: 2 });
  const p = await c.save();
  expect(p.tracks.map((t) => t.id)).not.toContain('bg');
  expect((p.tracks.find((t) => t.id === 'panel')!.items[0] as any).params.shadow).toBe(0);
  const plain = fresh();
  plain.clip('v', { from: 0, len: 2 });
  expect(items(plain, 'v1')[0].frame).toEqual([0, 0, 1, 1]);        // the full frame, as ever
  expect((await plain.save()).tracks.map((t) => t.id)).toEqual(['v1', 'text', 'music', 'orig']);
});

test('effect takes a transform for the item, on the text track and on the top layer alike', () => {
  const c = fresh();
  const a = c.effect('common.caption', { at: 0, len: 1, text: 'x', transform: { x: 0, y: -0.1, scale: 1 } });
  const b = c.effect('common.film', { at: 0, len: 1, layer: 'top', transform: { x: 0.1, y: 0, scale: 1 } });
  expect(items(c, 'text').find((i) => i.id === a).transform).toMatchObject({ x: 0, y: -0.1, scale: 1 });
  expect(items(c, 'text').find((i) => i.id === a).params).toEqual({ text: 'x' });
  expect(items(c, 'top')[0]).toMatchObject({ id: b, transform: { x: 0.1, y: 0, scale: 1 } });
  expect(() => parseProject(c.p)).not.toThrow();
});

test('avoidBurned crops a clip so the footage\'s own caption stays out of the frame, while that stretch has one or is close to one', () => {
  const c = fresh();
  c.inv.sources[0].burned = { version: 1, step: 1, frames: 10, caption: { share: 0.5, rect: [0.08, 0.86, 0.84, 0.12], spans: [[1, 3]] } };
  const a = c.clip('v', { from: 1.5, len: 1, avoidBurned: true });        // source 1.5–2.5 s: inside the caption span
  const near = c.clip('v', { from: 4.5, len: 1, avoidBurned: true });     // 1.5 s after it: likely a line the 1-a-second detection missed
  const b = c.clip('v', { from: 7, len: 2, avoidBurned: true });          // source 7–9 s: 4 s away, no caption then
  const d = c.clip('v', { from: 1.5, len: 1 });                            // not asked: untouched
  const crop = (id: string) => items(c, 'v1').find((i) => i.id === id).crop;
  expect(crop(a).from.zoom).toBeGreaterThan(1.1);
  expect(crop(a).to.zoom).toBeGreaterThan(1.1);
  expect(crop(near).from.zoom).toBeGreaterThan(1.1);
  expect(crop(b).from.zoom).toBe(1);
  expect(crop(d).from.zoom).toBe(1);
});

describe('narration and generated music', () => {
  const withVoice = async (c: Cut, scenes: Array<{ id: string; text: string }>) => {
    const { fakeTts, parseNarration, renderVoice } = await import('@tellcut/media-node');
    await renderVoice({ dir: c.dir, narration: parseNarration({ scenes }), tts: fakeTts() });
  };

  test('voice puts a scene on the narration track and gives its phrases on the timeline; voiceCaptions makes one caption per phrase', async () => {
    const c = fresh();
    await withVoice(c, [{ id: 's1', text: '第一句話，第二句。' }]);
    const v = c.voice('s1', { at: 2 });
    expect(v.start).toBe(2);
    expect(v.phrases.map((p) => p.text)).toEqual(['第一句話', '第二句']);
    expect(v.phrases[0].t0).toBe(2);
    expect(items(c, 'voice')).toHaveLength(1);
    expect(c.p.media['voice-s1'].path).toBe('media/voice/s1.wav');
    const caps = c.voiceCaptions(v, { style: 'bubble' });
    expect(items(c, 'text').filter((i) => caps.includes(i.id)).map((i) => [i.type, i.params.text, i.params.style])).toEqual([['common.caption', '第一句話', 'bubble'], ['common.caption', '第二句', 'bubble']]);
    expect(c.time).toBe(0);                                                  // the cursor stays for the pictures
    expect(() => c.voice('nope')).toThrow('npm run voice');
  });

  test('score composes music to the film at save: it reaches the end, its first beat is the grid, and it dips under the narration', async () => {
    const c = fresh();
    await withVoice(c, [{ id: 'a', text: '一二三四五六' }, { id: 'b', text: '七八' }]);
    c.clip('v', { from: 0, len: 9 });
    c.voice('a', { at: 1 });
    c.voice('b', { at: 3 });                                                 // less than a second after the first ends: one dip, not two
    c.score('lofi', { seed: 2 });
    const p = await c.save();
    const music = p.tracks.find((t) => t.id === 'music')!.items as any[];
    expect(music).toHaveLength(1);
    expect(music[0].media).toBe('score-lofi');
    expect(music[0].end).toBeCloseTo(9, 3);
    expect(p.media['score-lofi'].duration!).toBeGreaterThanOrEqual(9);
    expect(p.grids).toEqual([{ id: 'music', at: 0, bpm: 78 }]);
    // the narration (1 s on, the clip's "大家好" inside it) and then the clip's own "出發" at 6–8 s
    expect(music[0].envelope.map((x: number[]) => x[1])).toEqual([0, -10, -10, 0, 0, -10, -10, 0]);
    expect(music[0].envelope[1][0]).toBeCloseTo(1, 3);
    expect(music[0].envelope[5][0]).toBeCloseTo(6, 3);
    expect(p.tracks.find((t) => t.id === 'voice')!.items).toHaveLength(2);
  });

  test('speech in the clips ducks the music too, unless speech: false; dip() drops it, the lower level wins', async () => {
    const c = fresh();
    c.clip('v', { from: 0, len: 9 });
    c.score('lofi', { seed: 2 });
    c.dip(4, { len: 1, db: -18 });
    const env = (await c.save()).tracks.find((t) => t.id === 'music')!.items[0] as any;
    // 大家好 1–2.5, the dip 4–5, 出發 6–8
    expect(env.envelope).toEqual([[0.75, 0], [1, -10], [2.5, -10], [2.75, 0], [3.75, 0], [4, -18], [5, -18], [5.25, 0], [5.75, 0], [6, -10], [8, -10], [8.25, 0]]);
    const d = fresh();
    d.clip('v', { from: 0, len: 9 });
    d.score('lofi', { seed: 2 }).duck(-10, { speech: false });
    expect(((await d.save()).tracks.find((t) => t.id === 'music')!.items[0] as any).envelope).toBeUndefined();
    const e = fresh();
    e.clip('v', { from: 0, len: 9 });
    e.score('lofi', { seed: 2 });
    e.dip(2, { len: 2, db: -18 });                                          // over the end of 大家好: -18 wins there
    const ee = ((await e.save()).tracks.find((t) => t.id === 'music')!.items[0] as any).envelope as number[][];
    expect(ee).toEqual([[0.75, 0], [1, -10], [1.75, -10], [2, -18], [4, -18], [4.25, 0], [5.75, 0], [6, -10], [8, -10], [8.25, 0]]);
  });

  test('duck(false) leaves the music alone; music() and score() are one or the other', async () => {
    const c = fresh();
    await withVoice(c, [{ id: 'a', text: '一二三' }]);
    c.clip('v', { from: 0, len: 5 });
    c.voice('a', { at: 1 });
    c.score('tech').duck(false);
    expect(() => c.music('song')).toThrow('選一個');
    const p = await c.save();
    expect((p.tracks.find((t) => t.id === 'music')!.items[0] as any).envelope).toBeUndefined();
    const d = fresh();
    d.music('song');
    expect(() => d.score('lofi')).toThrow('選一個');
  });
});

test('beatLen works with generated music before it exists: beats from 0 at the style tempo', () => {
  const c = fresh();
  c.score('tech');                                                           // 124 BPM
  expect(c.beatLen(4)).toBeCloseTo((4 * 60) / 124, 4);
  const d = fresh();
  d.score('my-own-style');
  expect(() => d.beatLen(4)).toThrow('給 bpm');
  const e = fresh();
  e.score('my-own-style', { bpm: 90 });
  expect(e.beatLen(2)).toBeCloseTo(120 / 90, 4);
});

test('a background block given to c.effect goes under the video, not on the text track', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 4 });
  const id = c.effect('common.ambient', { at: 0, len: 4, stops: '0:0, 2:1' });
  const ids = c.p.tracks.map((t) => t.id);
  expect(ids.indexOf('bgfx')).toBeLessThan(ids.indexOf('v1'));
  expect(items(c, 'bgfx').map((i) => i.id)).toEqual([id]);
  expect(items(c, 'text').some((i) => i.id === id)).toBe(false);
});

test("layer: 'under' puts a project's own fx under the video too; its kind alone does not", () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 4 });
  const paper = c.effect('fx.paper', { at: 0, len: 4, layer: 'under' });
  const card = c.effect('fx.card', { at: 0, len: 2 });
  expect(items(c, 'bgfx').map((i) => i.id)).toEqual([paper]);
  expect(items(c, 'text').map((i) => i.id)).toEqual([card]);
  expect(() => c.effect('fx.paper', { at: 0, len: 1, layer: 'under', follow: 'face' })).toThrow(/背景.*follow/);
  expect(() => c.effect('common.ambient', { at: 0, len: 1, layer: 'top' })).toThrow("不能給 layer: 'top'");
  expect(() => c.effect('fx.paper', { at: 0, len: 1, layer: 'bottom' as 'under' })).toThrow("layer 只能是 'top' 或 'under'");
});

test('the default panel frame fits the film shape: a 16:9 picture in a 16:9 film, the tall layout in a 9:16 one', () => {
  const wide = fresh();                                                          // base() is 1920×1080
  wide.panel();
  const a = wide.clip('v', { from: 0, len: 2 });
  const f = items(wide, 'v1').find((i) => i.id === a).frame as number[];
  expect(f).toEqual([0.1, 0.06, 0.8, 0.8]);
  expect((f[2] * 1920) / (f[3] * 1080)).toBeCloseTo(16 / 9, 2);
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), p = base();
  p.meta.width = 1080; p.meta.height = 1920;
  const tall = new Cut(p, inv(dir), dir);
  tall.panel();
  const b = tall.clip('v', { from: 0, len: 2 });
  expect(items(tall, 'v1').find((i) => i.id === b).frame).toEqual([0.04, 0.18, 0.92, 0.56]);
});

test("beatLen works with a project's own music style without a bpm: the style's own default is used", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-'));
  writeFileSync(join(dir, 'project.json'), JSON.stringify(base()));
  (await import('node:fs')).mkdirSync(join(dir, 'score'));
  writeFileSync(join(dir, 'score', 'mine.js'), `export default { id: 'mine', label: '自己的', doc: '測試', defaults: { bpm: 96, key: 'Dm' },
    build(ctx) { const out = []; for (let b = 0; b < ctx.bars; b++) out.push({ t: ctx.at(b, 0), inst: 'kick', vel: 0.9, pan: 0 }); return out; } };\n`);
  const c = await Cut.open(dir, { transcribe: false });
  c.score('mine');
  expect(c.beatLen(4)).toBeCloseTo(2.5, 6);                                         // 4 beats at 96 BPM
  expect(() => c.score('nope') && c.beatLen(4)).toThrow('nope');
});

test('a background block given a transform or asked to follow a face says it cannot (it fills the frame under the video)', () => {
  const c = fresh();
  expect(() => c.effect('common.ambient', { at: 0, len: 2, transform: { x: 0.1, y: 0, scale: 1 } })).toThrow(/背景.*transform/);
  expect(() => c.effect('common.ambient', { at: 0, len: 2, follow: 'mouth' })).toThrow(/背景.*follow/);
  expect(() => c.effect('common.ambient', { at: 0, len: 2 })).not.toThrow();
});

test("panel backdrop 'blur': under each clip its own picture fills the frame, blurred and dimmed, riding on the clip", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), p = base();
  p.meta.width = 1080; p.meta.height = 1920;                                       // a landscape source in a portrait film
  const c = new Cut(p, inv(dir), dir);
  c.panel({ backdrop: 'blur' });
  c.effect('common.ambient', { at: 0, len: 5 });                                  // a full-screen background of the film's own
  const a = c.clip('v', { from: 1, len: 2 }), b = c.clip('v', { from: 5, len: 3 });
  const s = await c.save();
  const under = s.tracks.find((t) => t.id === 'bgv')!, at = (id: string) => s.tracks.findIndex((t) => t.id === id);
  // over every background, under the clips
  expect([under.kind, at('bgfx') < at('bgv'), at('bgv') < at('v1')]).toEqual(['video', true, true]);
  const items = under.items as any[];
  expect(items.map((i) => [i.parent, i.source, i.in, i.start, i.end, i.frame])).toEqual([[a, 'v', 1, 0, 2, [0, 0, 1, 1]], [b, 'v', 5, 0, 3, [0, 0, 1, 1]]]);
  expect(items[0].defocus.px).toBeGreaterThan(20);
  expect(items[0].opacity).toBeLessThan(1);
  expect(s.tracks.flatMap((t) => t.items as any[]).some((i) => i.type === 'common.backdrop')).toBe(false);
  expect(resolveTimes(s).get(items[1].id)!.start).toBe(2);
});

test('speechCaptions karaoke: each caption gets the times its words are said, as steps of visible characters', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  i.sources[0].transcript = { language: 'zh', segments: [{ start: 2, end: 3.6, text: '大家好歡迎', words: [{ start: 2, end: 2.6, word: '大家' }, { start: 2.6, end: 3, word: '好' }, { start: 3.1, end: 3.6, word: '歡迎' }] }] };
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 1, len: 5 });
  const [cap] = c.speechCaptions(id, { type: 'common.caption', karaoke: true });
  const it = items(c, 'text').find((x) => x.id === cap);
  expect(it.params.words).toEqual([[0, 2], [0.6, 3], [1.1, 5]]);                 // caption starts at film 1 (source 2)
  // a fixed word changes the length: the steps follow by proportion, ending on the last character
  const [cap2] = c.speechCaptions(id, { type: 'common.caption', karaoke: true, fix: { 歡迎: '歡迎光臨' } });
  expect(items(c, 'text').find((x) => x.id === cap2).params.words.at(-1)).toEqual([1.1, 7]);
});

test('speechCaptions speakers: who says each sentence (source seconds) colours its caption', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 10 });       // sentences at 1–2.5 and 6–8
  const caps = c.speechCaptions(id, { type: 'common.caption', speakers: [[0, 4, 1], [5, 9, 2]], names: ['', '阿明', '小華'] });
  expect(caps.map((cid) => items(c, 'text').find((x) => x.id === cid).params).map((p: any) => [p.speaker, p.name])).toEqual([[1, '阿明'], [2, '小華']]);
});

test('speechCaptions karaoke with English words: spaces do not count, the steps land on word ends', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  i.sources[0].transcript = { language: 'en', segments: [{ start: 0, end: 2, text: 'This is sushi', words: [{ start: 0, end: 0.5, word: ' This' }, { start: 0.5, end: 0.8, word: ' is' }, { start: 0.8, end: 2, word: ' sushi' }] }] };
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 5 });
  const [cap] = c.speechCaptions(id, { type: 'common.caption', karaoke: true });
  // 13 visible characters (spaces too); each step ends on its word's last letter
  expect(items(c, 'text').find((x) => x.id === cap).params.words).toEqual([[0, 4], [0.5, 7], [0.8, 13]]);
});

test('speechCaptions karaoke on a long English sentence: short words do not drag the steps off the word ends', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  const said = ['we', 'just', 'had', 'to', 'go', 'and', 'buy', 'a', 'really', 'big', 'pizza'];
  i.sources[0].transcript = { language: 'en', segments: [{ start: 0, end: 4, text: said.join(' '), words: said.map((w, k) => ({ start: k * 0.3, end: k * 0.3 + 0.3, word: ` ${w}` })) }] };
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 5 });
  const [cap] = c.speechCaptions(id, { type: 'common.caption', karaoke: true });
  // seen 2026-10-24 (italy-vlog-clip): "w|e stumbled", the step one letter late and two words lit at once
  const ends = said.map((_, k) => said.slice(0, k + 1).join(' ').length);
  expect(items(c, 'text').find((x) => x.id === cap).params.words.map((w: number[]) => w[1])).toEqual(ends);
});

test('speechCaptions chunk: a sentence becomes captions of a few words each, timed by their words; a lone last word joins the one before', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  const said = ['this', 'is', 'actually', 'the', 'cheapest', 'room', 'yes'];
  i.sources[0].transcript = { language: 'en', segments: [{ start: 1, end: 4.6, text: said.join(' '), words: said.map((w, k) => ({ start: 1 + k * 0.5, end: 1.4 + k * 0.5, word: ` ${w}` })) }] };
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 6 });
  const caps = c.speechCaptions(id, { type: 'common.caption', karaoke: true, chunk: 3 }).map((cid) => items(c, 'text').find((x) => x.id === cid));
  // seen 2026-10-24 (marrakesh-clip): asked for 2–4 words a caption, the agent still put whole 9-word sentences in one
  expect(caps.map((x) => x.params.text)).toEqual(['this is actually', 'the cheapest room yes']);
  expect(caps.map((x) => [x.start, Math.round((x.end - x.start) * 1e6) / 1e6])).toEqual([[1, 1.5], [2.5, 2.1]]);   // each from its first word; the last to the sentence's end
  expect(caps[1].params.words).toEqual([[0, 3], [0.5, 12], [1, 17], [1.5, 21]]);             // karaoke inside the piece, from its own start
  // Chinese words join without spaces
  i.sources[0].transcript = { language: 'zh', segments: [{ start: 0, end: 2, text: '大家好歡迎光臨', words: [{ start: 0, end: 0.4, word: '大家' }, { start: 0.4, end: 0.8, word: '好' }, { start: 0.8, end: 1.3, word: '歡迎' }, { start: 1.3, end: 2, word: '光臨' }] }] };
  const c2 = new Cut(base(), i, dir), id2 = c2.clip('v', { from: 0, len: 6 });
  expect(c2.speechCaptions(id2, { type: 'common.caption', chunk: 2 }).map((cid) => items(c2, 'text').find((x) => x.id === cid).params.text)).toEqual(['大家好', '歡迎光臨']);
});

test('speechCaptions chunk never cuts a censored, highlighted or fixed word in two: the cut moves past it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  const zh = (said: string[]) => ({ language: 'zh', segments: [{ start: 0, end: said.length * 0.4, text: said.join(''), words: said.map((w, k) => ({ start: k * 0.4, end: k * 0.4 + 0.4, word: w })) }] });
  const texts = (c: Cut, ids: string[]) => ids.map((cid) => items(c, 'text').find((x) => x.id === cid).params.text);
  // Whisper gives Chinese one character a word: chunk 3 cut 幹你娘 into 幹 | 你娘, and neither caption bleeped it
  i.sources[0].transcript = zh(['我', '說', '幹', '你', '娘', '啦', '好', '嗎']);
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 6 });
  expect(texts(c, c.speechCaptions(id, { type: 'common.caption', chunk: 3, censor: ['幹你娘'] }))).toEqual(['我說{幹你娘}', '啦好嗎']);
  i.sources[0].transcript = zh(['這', '是', '肉', '蔥', '蛋', '餅']);
  const c2 = new Cut(base(), i, dir), id2 = c2.clip('v', { from: 0, len: 6 });
  expect(texts(c2, c2.speechCaptions(id2, { type: 'common.caption', chunk: 3, fix: { 肉蔥: '肉鬆' }, highlight: ['蛋餅'] }))).toEqual(['這是肉鬆', '【蛋餅】']);
});

test('speechCaptions chunk keeps Chinese unspaced next to an English word in the same sentence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  const said = ['我們', '要', '去', ' Tokyo', '玩', '三', '天'];
  i.sources[0].transcript = { language: 'zh', segments: [{ start: 0, end: 2.8, text: '我們要去 Tokyo玩三天', words: said.map((w, k) => ({ start: k * 0.4, end: k * 0.4 + 0.4, word: w })) }] };
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 6 });
  expect(c.speechCaptions(id, { type: 'common.caption', chunk: 3 }).map((cid) => items(c, 'text').find((x) => x.id === cid).params.text)).toEqual(['我們要去', 'Tokyo玩三天']);
});

test('speechCaptions fix / censor / highlight on English words: whole words only, any case; an empty fix drops the word', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  i.sources[0].transcript = { language: 'en', segments: [{ start: 0, end: 3, text: "i think it is in venice did i say yes did", words: [] }] };
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 5 });
  // seen 2026-10-24: fix { i: 'I' } turned every i into I ("thInk", "venIce") and then venice / did no longer matched
  const [cap] = c.speechCaptions(id, { type: 'common.caption', fix: { i: 'I', venice: 'Venice', yes: '', did: '' }, highlight: ['is'], censor: ['in'] });
  expect(items(c, 'text').find((x) => x.id === cap).params.text).toBe('I think it 【is】 {in} Venice I say');
  // Chinese stays a plain replacement anywhere in the text
  i.sources[0].transcript = { language: 'zh', segments: [{ start: 0, end: 3, text: '肉蔥好吃', words: [] }] };
  const c2 = new Cut(base(), i, dir), id2 = c2.clip('v', { from: 0, len: 5 });
  const [cap2] = c2.speechCaptions(id2, { type: 'common.caption', fix: { 肉蔥: '肉鬆' } });
  expect(items(c2, 'text').find((x) => x.id === cap2).params.text).toBe('肉鬆好吃');
});

test('polaroid freezes the moment playing at `at`: its source and source second, a shutter, both riding on the clip', () => {
  const c = fresh();
  c.clip('v', { from: 1, len: 3 });
  const b = c.clip('v', { from: 5, len: 4, speed: 2 });                           // film 3–5, source 5–9
  const id = c.polaroid({ at: 4, caption: '最棒的一刻', len: 2 });
  const it = items(c, 'text').find((x) => x.id === id);
  expect([it.type, it.parent, it.params.source, it.params.t, it.params.caption]).toEqual(['common.polaroid', b, 'v', 7, '最棒的一刻']);
  const shutter = items(c, 'sfx').find((x) => x.type === 'common.shutter');
  expect([shutter.parent, shutter.start]).toEqual([b, 1]);
  expect(() => c.polaroid({ at: 30 })).toThrow('沒有片段');
});

describe('tighten (pauses in talk shortened on the word times)', () => {
  const talk = (segments: any[]) => { const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir); i.sources[0].transcript = { language: 'zh', segments }; return new Cut(base(), i, dir); };
  const A = { start: 1, end: 2, text: '大家好', words: [{ start: 1, end: 1.4, word: '大家' }, { start: 1.4, end: 2, word: '好' }] };
  const B = { start: 3.5, end: 4.6, text: '我們出發', words: [{ start: 3.5, end: 4, word: '我們' }, { start: 4.1, end: 4.6, word: '出發' }] };

  test('silences longer than maxGap shrink to keep: before the first word, between words, after the last; the sound is cut with the picture', async () => {
    const c = talk([A, B]), id = c.clip('v', { from: 0, len: 10 });
    const ids = c.tighten(id);
    expect(items(c, "v1").some((i) => i.id === id)).toBe(false);   // the head pause was the start of the clip: the pieces are new
    expect(items(c, 'v1').map((i) => [i.in, i.start, i.end])).toEqual([[0.85, 0, 1.3], [3.35, 1.3, 2.7]]);
    expect(items(c, 'orig').map((i) => [i.parent, i.in, i.start, i.end])).toEqual([[ids[0], 0.85, 0, 1.3], [ids[1], 3.35, 0, 1.4]]);
    expect(items(c, 'orig').every((i) => i.fadeIn >= 0.03 && i.fadeOut >= 0.03)).toBe(true);
    expect(c.time).toBe(2.7);
    expect(c.notes.join()).toContain('3 個停頓');
    // the rest of the script goes on from the new end
    c.clip('v', { from: 0, len: 1 });
    expect(items(c, 'v1').at(-1).start).toBe(2.7);
    await c.save();
  });

  test('a short pause stays; no transcript or no speech leaves the clip alone with a note', () => {
    const c = talk([B]), id = c.clip('v', { from: 3.5, len: 1.1 });
    expect(c.tighten(id)).toEqual([id]);
    expect(items(c, 'v1').map((i) => [i.in, i.end])).toEqual([[3.5, 1.1]]);
    const none = talk([A]), n = none.clip('v', { from: 5, len: 3 });
    expect(none.tighten(n)).toEqual([n]);
    expect(none.notes.join()).toContain('沒有講話');
  });

  test('only the newest clip, before anything hangs on it', () => {
    const c = talk([A, B]), a = c.clip('v', { from: 0, len: 5 });
    c.clip('v', { from: 5, len: 2 });
    expect(() => c.tighten(a)).toThrow('最新的一段');
    const d = talk([A, B]), b = d.clip('v', { from: 0, len: 5 });
    d.speechCaptions(b);
    expect(() => d.tighten(b)).toThrow('先 tighten');
  });

  test('review fixes: an effect laid over the clip keeps the film long enough; a dissolve into the clip stays; the camera move runs on across the joins', async () => {
    const c = talk([A, B]);
    c.effect('common.slam', { at: 0, len: 8, text: '開場' });
    c.tighten(c.clip('v', { from: 0, len: 10 }));
    expect((await c.save()).meta.duration).toBe(8);
    const d = talk([A, B]);
    d.clip('v', { from: 5, len: 3, sound: false });
    d.tighten(d.clip('v', { from: 0, len: 10, transition: { type: 'dissolve', dur: 0.5 } }));
    const v = items(d, 'v1');
    expect(v[1].transitionIn).toEqual({ type: 'dissolve', dur: 0.5 });
    expect(v[1].start).toBe(2.5);                                                   // still on the overlap
    const e = talk([A, B]), ids = e.tighten(e.clip('v', { from: 0, len: 10, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.27 } } }));
    const [p1, p2] = ids.map((id) => items(e, 'v1').find((i) => i.id === id));
    expect([p1.crop.from.zoom, p2.crop.to.zoom]).toEqual([1, 1.27]);
    expect(p1.crop.to.zoom).toBeCloseTo(p2.crop.from.zoom, 6);                       // no jump at the join
  });

  test('captions over the pieces: each sentence once, on the piece it starts in; a sentence across a join is one caption', () => {
    const c = talk([A, B]), ids = c.tighten(c.clip('v', { from: 0, len: 10 }));
    c.speechCaptions(ids, { karaoke: true, type: 'common.caption' });
    expect(items(c, 'text').map((i) => [i.parent, i.start, i.end, i.params.text, i.params.words])).toEqual([
      [ids[0], 0.15, 1.15, '大家好', [[0, 2], [0.4, 3]]],
      [ids[1], 0.15, 1.25, '我們出發', [[0, 2], [0.6, 4]]],
    ]);
    const d = talk([{ start: 1, end: 4.6, text: '大家好我們出發', words: [...A.words, ...B.words] }]), jd = d.tighten(d.clip('v', { from: 0, len: 10 }));
    d.speechCaptions(jd);
    expect(items(d, 'text').map((i) => [i.parent, i.start, i.end])).toEqual([[jd[0], 0.15, 2.55]]);
    expect(d.wordTimes(jd, '出發')).toEqual([[2.05, 2.55]]);
  });
});

test('clip and photo take a frame of their own (a window of a postcard or a TV), even inside a panel layout', () => {
  const c = fresh();
  c.panel();
  const a = c.clip('v', { from: 0, len: 2, frame: [0.1, 0.2, 0.5, 0.3] });
  const b = c.photo('ph', { len: 1, frame: [0, 0, 0.5, 0.5] });
  const d = c.clip('v', { from: 3, len: 1 });
  const v1 = items(c, 'v1');
  expect(v1.find((i) => i.id === a).frame).toEqual([0.1, 0.2, 0.5, 0.3]);
  expect(v1.find((i) => i.id === a).radius).toBeUndefined();
  expect(v1.find((i) => i.id === b).frame).toEqual([0, 0, 0.5, 0.5]);
  expect(v1.find((i) => i.id === d).frame).not.toEqual([0.1, 0.2, 0.5, 0.3]);   // the panel's frame again
});

test('bands: a landscape shot as three cinemascope bands stacked in a tall film, one a beat, ending together, without sound', () => {
  const c = fresh();
  c.p.meta.width = 1080; c.p.meta.height = 1920;
  c.clip('v', { from: 0, len: 1 });
  const crop = { from: { x: 0.5, y: 0.4, zoom: 2 }, to: { x: 0.5, y: 0.4, zoom: 2.1 } };
  const ids = c.bands('v', { len: 2, from: [0.5, 3.2, 9.5], crops: [crop, crop, crop] });
  expect(ids).toHaveLength(3);
  expect(c.time).toBe(3);
  const at = (id: string) => c.p.tracks.flatMap((t) => (t.items as any[]).map((i) => ({ ...i, track: t.id }))).find((i) => i.id === id);
  const [a, b, d] = ids.map(at);
  expect([a.track, b.track, d.track]).toEqual(['v1', 'v2', 'v3']);
  expect([a.start, b.start, d.start]).toEqual([1, 1.5, 2]);
  expect([a.end, b.end, d.end]).toEqual([3, 3, 3]);
  // 1080 × 400 bands, 20 px apart, centred
  expect(a.frame[3] * 1920).toBeCloseTo(400, 0);
  expect(b.frame[1] - (a.frame[1] + a.frame[3])).toBeCloseTo(20 / 1920, 6);
  expect(a.frame[1] + (d.frame[1] + d.frame[3])).toBeCloseTo(1, 4);
  expect(d.in).toBe(9);   // pulled back so the band does not run past the end of the 10 s source
  expect(items(c, 'orig').some((i) => i.parent === a.id)).toBe(false);
  expect(['v2', 'v3'].map((id) => c.p.tracks.find((x) => x.id === id)!.name)).toEqual(['Layer 2', 'Layer 3']);
  // the tracks sit right above the main track, in order
  expect(c.p.tracks.map((t) => t.id).slice(0, 3)).toEqual(['v1', 'v2', 'v3']);
  expect(parseProject(c.p)).toBeTruthy();
});

test('view: one camera cut into virtual ones — the crop centred where asked, refused when it shows a watermark or the burned captions', () => {
  const c = fresh();
  c.p.meta.width = 1080; c.p.meta.height = 1920;
  const frame: [number, number, number, number] = [0, 0.104, 1, 0.396];
  const crop = c.view('v', { at: [0.7, 0.4], zoom: 1.5, frame });
  expect(crop.zoom).toBe(1.5);
  const id = c.clip('v', { from: 0, len: 2, crop: { from: crop, to: c.view('v', { at: [0.7, 0.4], zoom: 1.55, frame }) }, frame });
  expect(items(c, 'v1').find((i) => i.id === id).crop.from).toEqual(crop);
  expect(() => c.view('v', { at: [0.1, 0.1], zoom: 2, frame, keepOut: [[0, 0, 0.3, 0.108]], what: '浮水印' })).toThrow(/禁區/);
  // the inventory found a burned caption row at 86–95 %: a view down there is refused unless burned: false
  (c.inv.sources[0] as any).burned = { version: 1, step: 1, frames: 10, caption: { share: 0.5, rect: [0.08, 0.86, 0.84, 0.09], spans: [[0, 5]] } };
  expect(() => c.view('v', { at: [0.5, 0.8], zoom: 1.6, frame })).toThrow(/燒進去的字幕/);
  expect(() => c.view('v', { at: [0.5, 0.8], zoom: 1.6, frame, burned: false })).not.toThrow();
  expect(() => c.view('v', { at: [0.5, 0.4], zoom: 1.6, frame })).not.toThrow();
});

test('a frame is fractions of the screen: pixels, an empty or an off-screen frame throw; some bleed is fine', () => {
  expect(() => checkFrame([80, 300, 920, 1100], 'c.panel')).toThrow(/c\.panel 的 frame \[80, 300, 920, 1100\] 看起來是像素/);
  expect(() => checkFrame([0.1, 0.1, 0, 0.5], 'c.clip')).toThrow(/寬、高要大於 0/);
  expect(() => checkFrame([1.1, 0.1, 0.3, 0.3], 'c.clip')).toThrow(/整個在畫面外/);
  expect(() => checkFrame([-0.02, 0.1, 1.04, 0.6], 'c.clip')).not.toThrow();
  expect(() => checkFrame(undefined, 'c.clip')).not.toThrow();
});

test('new projects get English track names', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 2 });
  expect(c.p.tracks.map((t) => [t.id, t.name])).toEqual([['v1', 'Main'], ['text', 'Text'], ['music', 'Music'], ['orig', 'Source']]);
});

test('speechCaptions chunk by the transcript’s language: a preset gives Chinese (a character a word) its own size', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir);
  const by = { zh: 4, '*': 2 };
  const said = (language: string, ws: string[]) => ({ language, segments: [{ start: 0, end: ws.length * 0.4, text: ws.join(''), words: ws.map((w, k) => ({ start: k * 0.4, end: k * 0.4 + 0.4, word: w })) }] });
  const texts = (c: Cut, ids: string[]) => ids.map((cid) => items(c, 'text').find((x) => x.id === cid).params.text);
  i.sources[0].transcript = said('zh', ['今', '天', '天', '氣', '真', '好', '我', '們']);
  const c = new Cut(base(), i, dir), id = c.clip('v', { from: 0, len: 6 });
  expect(texts(c, c.speechCaptions(id, { type: 'common.caption', chunk: by }))).toEqual(['今天天氣', '真好我們']);
  i.sources[0].transcript = said('en', [' we', ' took', ' a', ' train', ' to', ' rome']);
  const c2 = new Cut(base(), i, dir), id2 = c2.clip('v', { from: 0, len: 6 });
  expect(texts(c2, c2.speechCaptions(id2, { type: 'common.caption', chunk: by }))).toEqual(['we took', 'a train', 'to rome']);   // not listed: '*'
  const c3 = new Cut(base(), i, dir), id3 = c3.clip('v', { from: 0, len: 6 });
  expect(texts(c3, c3.speechCaptions(id3, { type: 'common.caption', chunk: { zh: 4 } }))).toEqual(['we took a train to rome']);   // neither: whole sentences
});

// c.dolly (spec 2026-10-25-brand-preset §6.2-2): a seamless 3D push-in before or pull-out after a clip
test("c.dolly in sits just before the clip and starts the source len seconds earlier with the clip's first crop and grade", () => {
  const c = fresh();
  c.at(2);
  const v = c.clip('v', { from: 4, len: 3, crop: { from: { x: 0.4, y: 0.5, zoom: 1.2 }, to: { x: 0.6, y: 0.5, zoom: 1 } } });
  (items(c, 'v1').find((i) => i.id === v) as any).grade = 'warm';
  const id = c.dolly(v, { dir: 'in', len: 1.2 });
  const it = c.p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === id);
  expect([it.type, it.start, it.end]).toEqual(['common.dolly', 0.8, 2]);
  expect(it.params).toEqual({ source: 'v', from: 2.8, dir: 'in', x: 0.4, y: 0.5, zoom: 1.2, grade: 'warm' });
});

test('c.dolly out sits just after the clip and carries on the source from where the clip stops, with its last crop', () => {
  const c = fresh();
  const v = c.clip('v', { from: 1, len: 3, crop: { from: { x: 0.4, y: 0.5, zoom: 1.2 }, to: { x: 0.6, y: 0.45, zoom: 1.05 } } });
  const id = c.dolly(v, { dir: 'out', len: 2, tilt: 24 });
  const it = c.p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === id);
  expect([it.start, it.end]).toEqual([3, 5]);
  expect(it.params).toEqual({ source: 'v', from: 4, dir: 'out', x: 0.6, y: 0.45, zoom: 1.05, grade: '', tilt: 24 });
});

test('c.dolly refuses what cannot hand over seamlessly', () => {
  const c = fresh();
  c.at(3);
  const fast = c.clip('v', { from: 1, len: 2, speed: 2 });
  expect(() => c.dolly(fast, { dir: 'in', len: 1 })).toThrow('c.dolly 只接速度 1 的片段');
  const boxed = c.clip('v', { from: 4, len: 2, frame: [0.1, 0.1, 0.8, 0.8] as any });
  expect(() => c.dolly(boxed, { dir: 'out', len: 1 })).toThrow(/滿版/);
  const early = c.clip('v', { from: 0.5, len: 2 });
  expect(() => c.dolly(early, { dir: 'in', len: 1 })).toThrow(/少了 0\.5 秒/);
  const late = c.clip('v', { from: 8, len: 1.5 });
  expect(() => c.dolly(late, { dir: 'out', len: 1 })).toThrow(/少了 0\.5 秒/);
  const pic = c.photo('ph', { len: 2 });
  const id = c.dolly(pic, { dir: 'out', len: 1 });
  expect(c.p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === id).params).toMatchObject({ source: 'ph', from: 0 });
  expect(() => c.dolly('nope', { dir: 'in', len: 1 })).toThrow(/nope/);
});

test('c.dolly refuses a clip whose picture is not the plain source at the handoff', () => {
  const c = fresh();
  c.at(3);
  const set = (id: string, k: string, v: unknown) => { (items(c, 'v1').find((i) => i.id === id) as any)[k] = v; };
  const cases: Array<[string, unknown, RegExp]> = [['opacity', 0.8, /opacity/], ['freezeAt', 0.5, /freezeAt/], ['defocus', { from: 0, to: 0.5, px: 6 }, /defocus/],
    ['shake', [{ at: 0.2, dur: 0.3, px: 8, hz: 18 }], /shake/]];
  for (const [k, v, re] of cases) {
    const id = c.clip('v', { from: 4, len: 1 });
    set(id, k, v);
    expect(() => c.dolly(id, { dir: 'in', len: 1 })).toThrow(re);
    expect(() => c.dolly(id, { dir: 'out', len: 1 })).toThrow(/接不乾淨/);
  }
  // a dissolve or slide into the clip shows the clip before at the push-in's end; at its end (out) it is long over
  const dissolve = c.clip('v', { from: 4, len: 2 });
  set(dissolve, 'transitionIn', { type: 'dissolve', dur: 0.5 });
  expect(() => c.dolly(dissolve, { dir: 'in', len: 1 })).toThrow(/轉場（dissolve）/);
  expect(() => c.dolly(dissolve, { dir: 'out', len: 1 })).not.toThrow();
  const cut = c.clip('v', { from: 4, len: 1 });
  set(cut, 'transitionIn', { type: 'cut', dur: 0 });
  expect(() => c.dolly(cut, { dir: 'in', len: 1 })).not.toThrow();
});

test('c.dolly in too near the start of the film says the clip needs len seconds before it', () => {
  const c = fresh();
  c.at(0.5);
  const v = c.clip('v', { from: 4, len: 2 });
  expect(() => c.dolly(v, { dir: 'in', len: 1.2 })).toThrow(/前面不夠 1\.2 秒.*最多 0\.5/);
  expect(c.p.tracks.find((t) => t.id === 'dolly')).toBeUndefined();
  expect(c.p.tracks.flatMap((t) => t.items as any[]).find((i) => i.type === 'common.dolly')).toBeUndefined();
  expect(() => c.dolly(v, { dir: 'in', len: 0.5 })).not.toThrow();
});

test('c.dolly goes on its own track above the main video and below the text, so earlier titles stay on top', () => {
  const c = fresh();
  c.at(2);
  const v = c.clip('v', { from: 4, len: 3 });
  const title = c.title('We are Tellcut', { at: 1, len: 2 });
  const d = c.dolly(v, { dir: 'in', len: 1 });
  const ids = c.p.tracks.map((t) => t.id), on = (id: string) => c.p.tracks.find((t) => (t.items as any[]).some((i) => i.id === id))!.id;
  expect(on(d)).toBe('dolly');
  expect(ids.indexOf('dolly')).toBeGreaterThan(ids.indexOf('v1'));
  expect(ids.indexOf('dolly')).toBeLessThan(ids.indexOf(on(title)));
});


// c.level (brand plan 5): the music's level over the whole film, with dips and ducking still lower where they say
test('c.level shapes the music over the film; dips still go lower where they say', async () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 9 });
  c.score('lofi', { seed: 2 });
  c.duck(false);
  c.level([[0, 0.8], [4, 0.55], [8, 1]]);
  c.dip(5, { len: 1, db: -18 });
  const p = await c.save();
  const env = (p.tracks.find((t) => t.id === 'music')!.items as any[])[0].envelope as Array<[number, number]>;
  const at = (t: number) => { let v = env[0][1]; for (const [x, y] of env) if (x <= t + 1e-9) v = y; return v; };
  expect(at(0)).toBeCloseTo(20 * Math.log10(0.8), 1);
  expect(at(4)).toBeCloseTo(20 * Math.log10(0.55), 1);
  expect(at(8)).toBeCloseTo(0, 1);
  expect(at(5.5)).toBeLessThan(-17);
  // smooth between points: more than the two ends between 0 and 4
  expect(env.filter(([x]) => x > 0 && x < 4).length).toBeGreaterThanOrEqual(3);
});

test('c.level refuses points out of order or a gain over 1.5', () => {
  const c = fresh();
  expect(() => c.level([[2, 1], [1, 0.5]])).toThrow(/順序/);
  expect(() => c.level([[0, 2]])).toThrow(/1\.5/);
});

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
