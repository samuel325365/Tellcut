// The Cut API: music beats, narration and generated music, sound effects and sound files, the music level.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject } from '@tellcut/engine';
import { Cut } from './cut.ts';
import { base, fresh, items, silentWav } from './cut-test-kit.ts';

test('beatLen measures to the n-th next beat of the music; bestSegments spreads picks over the scenes', () => {
  const c = fresh();
  c.music('song');
  expect(c.beatLen(4)).toBe(2.25);              // first beat at 0.25, four beats later 2.25
  c.at(2.25);
  expect(c.beatLen(2)).toBe(1);
  expect(c.bestSegments('v', { count: 2, minLen: 2, maxLen: 3 })).toEqual([[2.3, 5.3], [7.3, 9.7]]);
  expect(() => fresh().beatLen()).toThrow(/music\(\)/);
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

  // showcase films (spec 2026-10-30 part 2): bilingual captions from the narration's gloss
  test('a scene with a gloss: each phrase carries its translation and voiceCaptions puts it under the line', async () => {
    const c = fresh(), scenes = [{ id: 's1', text: 'Import the folder, pick a preset.', gloss: ['匯入資料夾', '選個片型'] }, { id: 's2', text: 'Done.' }];
    await withVoice(c, scenes);
    writeFileSync(join(c.dir, 'narration.json'), JSON.stringify({ scenes }));
    const v = c.voice('s1');
    expect(v.phrases.map((p) => p.gloss)).toEqual(['匯入資料夾', '選個片型']);
    const caps = c.voiceCaptions(v, { color: '#ffe0a0' }), got = items(c, 'text').filter((i) => caps.includes(i.id)).map((i) => i.params);
    expect(got.map((p) => [p.text, p.gloss, p.glossSize, p.glossColor])).toEqual([['Import the folder', '匯入資料夾', 0.75, '#ffe0a0'], ['pick a preset', '選個片型', 0.75, '#ffe0a0']]);
    const [small] = c.voiceCaptions(v, { glossSize: 0.6 });
    expect(items(c, 'text').find((i) => i.id === small)!.params).toMatchObject({ glossSize: 0.6, glossColor: '#ffffff' });
    // on a paper style the line is ink: the gloss is left to the caption, which prints it in the line's ink (or in the outline given)
    const [bubble, inked] = [c.voiceCaptions(v, { style: 'bubble' })[0], c.voiceCaptions(v, { style: 'ticket', outline: '#302010' })[0]];
    expect(items(c, 'text').find((i) => i.id === bubble)!.params).not.toHaveProperty('glossColor');
    expect(items(c, 'text').find((i) => i.id === inked)!.params).toMatchObject({ glossColor: '#302010' });
    // a scene without one: no gloss at all
    const [plain] = c.voiceCaptions(c.voice('s2', { at: 5 }));
    expect(items(c, 'text').find((i) => i.id === plain)!.params).not.toHaveProperty('gloss');
  });

  test('voiceCaptions with a block that has no gloss parameter refuses a scene with a translation instead of dropping it', async () => {
    const c = fresh(), scenes = [{ id: 's1', text: 'Import the folder.', gloss: ['匯入資料夾'] }, { id: 's2', text: 'Done.' }];
    await withVoice(c, scenes);
    writeFileSync(join(c.dir, 'narration.json'), JSON.stringify({ scenes }));
    const v = c.voice('s1');
    expect(() => c.voiceCaptions(v, { type: 'core.caption' })).toThrow(/core\.caption.*gloss.*common\.caption/);
    expect(items(c, 'text')).toHaveLength(0);
    // a scene with no translation: any caption block will do; a project's own fx is not second-guessed
    expect(c.voiceCaptions(c.voice('s2', { at: 5 }), { type: 'core.caption' })).toHaveLength(1);
    expect(c.voiceCaptions(v, { type: 'fx.mycap' })).toHaveLength(1);
  });

  test('a scene is placed even when another scene’s gloss is wrong; the wrong one says what is wrong', async () => {
    const c = fresh(), scenes = [{ id: 's1', text: 'Hello.' }, { id: 's2', text: 'One, two.' }];
    await withVoice(c, scenes);
    writeFileSync(join(c.dir, 'narration.json'), JSON.stringify({ scenes: [scenes[0], { ...scenes[1], gloss: ['一二'] }] }));
    expect(c.voice('s1').phrases.map((p) => p.text)).toEqual(['Hello']);
    expect(() => c.voice('s2')).toThrow(/gloss 有 1 行/);
  });

  test('a gloss over a voice made before its phrases were cut this way asks for npm run voice, which cuts them anew', async () => {
    const c = fresh(), scenes = [{ id: 's1', text: 'Go to github.com now.', gloss: ['到 github.com'] }];
    await withVoice(c, scenes);
    writeFileSync(join(c.dir, 'narration.json'), JSON.stringify({ scenes }));
    const f = join(c.dir, 'media', 'voice', 's1.json'), info = JSON.parse(readFileSync(f, 'utf8'));
    writeFileSync(f, JSON.stringify({ ...info, phrases: [{ text: 'Go to github', t0: 0, t1: 0.5 }, { text: 'com now', t0: 0.5, t1: 1 }] }));
    expect(() => c.voice('s1')).toThrow(/npm run voice -- \S+ s1 /);
    // running it again (no --force) cuts the phrases the way they are cut now, from the same audio
    await withVoice(c, scenes);
    expect(c.voice('s1').phrases.map((p) => [p.text, p.gloss])).toEqual([['Go to github.com now', '到 github.com']]);
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
