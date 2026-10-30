import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeTts, type TranscribeProvider } from './providers/index.ts';
import { parseNarration, phraseParts, phrasesOf, ratePercent, renderVoice, voiceFiles, voiceFor, wordsFromTranscript } from './voice.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'voice-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const narr = (extra: object = {}) => parseNarration({ voices: { fake: 'v1' }, rate: '+6%', pron: { 一行: '一航' }, scenes: [{ id: 's1', text: '一行一行寫，好嗎？' }, { id: 's2', text: '第二句。' }], ...extra });

test('narration.json: the old "+6%" speed and a plain number both read as percent; bad files say what is wrong', () => {
  expect(ratePercent('+6%')).toBe(6);
  expect(ratePercent('-10%')).toBe(-10);
  expect(ratePercent(8)).toBe(8);
  expect(ratePercent(undefined)).toBe(0);
  expect(narr().scenes).toHaveLength(2);
  expect(() => parseNarration({ scenes: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] })).toThrow('重複');
  expect(() => parseNarration({ scenes: [{ id: '../x', text: 'x' }] })).toThrow('場景 id');
  expect(() => parseNarration({ scenes: [] })).toThrow('narration.json');
});

test('a voice name belongs to its engine: the old voice is for edge, voices names each engine, a scene may override', () => {
  const n = parseNarration({ voice: 'edge-v', voices: { engine2: 'voice-two' }, scenes: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y', voice: 'special' }] });
  expect(voiceFor(n, n.scenes[0], 'edge')).toBe('edge-v');
  expect(voiceFor(n, n.scenes[0], 'engine2')).toBe('voice-two');
  expect(voiceFor(n, n.scenes[0], 'unknown')).toBeUndefined();
  expect(voiceFor(n, n.scenes[1], 'engine2')).toBe('special');
});

test('phrases are cut at punctuation and timed by the words (the numbers of an earlier Seattle scene)', () => {
  const words = [
    { text: '七月', t: 0.097, d: 0.401 }, { text: '十四', t: 0.51, d: 0.354 }, { text: '號', t: 0.923, d: 0.2 }, { text: '早上', t: 1.147, d: 0.342 }, { text: '十點', t: 1.512, d: 0.472 },
    { text: '，', t: 1.984, d: 0.01 }, { text: '我', t: 2.22, d: 0.2 }, { text: '從', t: 2.42, d: 0.2 }, { text: '台北', t: 2.62, d: 0.4 }, { text: '起飛', t: 3.02, d: 0.32 },
  ];
  expect(phrasesOf('七月十四號早上十點，我從台北起飛。', words)).toEqual([
    { text: '七月十四號早上十點', t0: 0.097, t1: 1.984 }, { text: '我從台北起飛', t0: 2.22, t1: 3.34 },
  ]);
  expect(phrasesOf('一二——三四。', [{ text: '一二', t: 0, d: 1 }, { text: '三四', t: 1.5, d: 1 }]).map((p) => p.text)).toEqual(['一二', '三四']);
});

test('a phrase counts only the characters the spoken words can hold: a single dash and quotes take no word', () => {
  expect(phrasesOf('我—你好，再見', [{ text: '我', t: 0, d: 1 }, { text: '你好', t: 1, d: 2 }, { text: '再見', t: 3, d: 1 }])).toEqual([
    { text: '我—你好', t0: 0, t1: 3 }, { text: '再見', t0: 3, t1: 4 },
  ]);
  expect(phrasesOf('他說「好」，走吧', [{ text: '他說', t: 0, d: 1 }, { text: '好', t: 1, d: 0.5 }, { text: '走吧', t: 2, d: 1 }])).toEqual([
    { text: '他說「好」', t0: 0, t1: 1.5 }, { text: '走吧', t0: 2, t1: 3 },
  ]);
  expect(phrasesOf('He said "go", then left.', [{ text: 'He', t: 0, d: 0.2 }, { text: 'said', t: 0.2, d: 0.3 }, { text: 'go', t: 0.5, d: 0.2 }, { text: 'then', t: 1, d: 0.2 }, { text: 'left', t: 1.2, d: 0.3 }]))
    .toEqual([{ text: 'He said "go"', t0: 0, t1: 0.7 }, { text: 'then left', t0: 1, t1: 1.5 }]);
});

test('word times from a transcript: the written characters are laid over the heard words by position', () => {
  const w = wordsFromTranscript('你好世界', [{ start: 0, end: 1, word: '你好' }, { start: 1, end: 3, word: '世界' }]);
  expect(w.map((x) => x.text)).toEqual(['你', '好', '世', '界']);
  expect(w.map((x) => x.t)).toEqual([0, 0.5, 1, 2]);
  expect(wordsFromTranscript('你好', [])).toEqual([]);
});

test('renderVoice speaks each scene, swaps pronunciations for the engine only, and writes the files', async () => {
  const tts = fakeTts(), out = await renderVoice({ dir, narration: narr(), tts });
  expect(tts.calls.map((c) => [c.text, c.voice, c.rate])).toEqual([['一航一航寫，好嗎？', 'v1', 6], ['第二句。', 'v1', 6]]);
  expect(Object.keys(out)).toEqual(['s1', 's2']);
  expect(out.s1.text).toBe('一行一行寫，好嗎？');                       // the captions keep what was written
  expect(out.s1.phrases.map((p) => p.text)).toEqual(['一行一行寫', '好嗎']);
  expect(out.s1.phrases[0].t0).toBe(0);
  expect(out.s1.dur).toBeGreaterThan(1);
  const f = voiceFiles(dir, 's1');
  expect(readFileSync(f.wav).subarray(0, 4).toString()).toBe('RIFF');
  expect(JSON.parse(readFileSync(f.info, 'utf8')).engine).toBe('fake');
});

test('a scene that did not change is not spoken again; a change in text, voice, speed or engine is; force and only work', async () => {
  const run = async (narration: ReturnType<typeof narr>, extra: object = {}) => { const tts = fakeTts(); await renderVoice({ dir, narration, tts, ...extra }); return tts.calls.map((c) => c.text); };
  expect(await run(narr())).toHaveLength(2);
  expect(await run(narr())).toEqual([]);
  expect(await run(narr({ scenes: [{ id: 's1', text: '一行一行寫，好嗎？' }, { id: 's2', text: '改了。' }] }))).toEqual(['改了。']);
  expect(JSON.parse(readFileSync(voiceFiles(dir, 's2').info, 'utf8')).text).toBe('改了。');             // the old info file really was replaced (regression: atomic() kept it)
  expect(await run(narr({ rate: 12 }))).toHaveLength(2);
  expect(await run(narr({ rate: 12, voices: { fake: 'v2' } }))).toHaveLength(2);
  // the text did not change, so what is on disk is replaced only when the engine, voice or speed did
  expect(JSON.parse(readFileSync(voiceFiles(dir, 's1').info, 'utf8')).key).toBeTruthy();
  expect(await run(narr({ rate: 12, voices: { fake: 'v2' } }), { force: true })).toHaveLength(2);
  expect(await run(narr({ rate: 12, voices: { fake: 'v2' } }), { only: ['s2'], force: true })).toHaveLength(1);
});

test('an engine without word times is timed from a transcript; with nothing to transcribe with it says so', async () => {
  const heard: TranscribeProvider = {
    id: 'heard', label: 'h', online: false, async check() { return { ok: true, detail: '' }; },
    async transcribe(_src, out) { writeFileSync(out, JSON.stringify({ language: 'zh', segments: [{ start: 0, end: 2, text: '', words: [{ start: 0, end: 1, word: '你好' }, { start: 1, end: 2, word: '世界' }] }] })); },
  };
  const n = parseNarration({ scenes: [{ id: 'a', text: '你好，世界。' }] });
  const out = await renderVoice({ dir, narration: n, tts: fakeTts({ words: false }), transcribe: heard });
  expect(out.a.phrases).toEqual([{ text: '你好', t0: 0, t1: 1 }, { text: '世界', t0: 1, t1: 2 }]);
  const lonely = mkdtempSync(join(tmpdir(), 'voice2-'));
  try { await expect(renderVoice({ dir: lonely, narration: n, tts: fakeTts({ words: false }) })).rejects.toThrow('沒有逐字時間'); } finally { rmSync(lonely, { recursive: true, force: true }); }
  expect(existsSync(voiceFiles(dir, 'a').info)).toBe(true);
});

test('the narration\u2019s pitch reaches the engine and is part of what decides a scene is still good', async () => {
  const run = async (narration: ReturnType<typeof narr>) => { const tts = fakeTts(); await renderVoice({ dir, narration, tts }); return tts.calls.map((c) => c.pitch); };
  expect(await run(narr())).toEqual([undefined, undefined]);
  expect(await run(narr({ pitch: '+5Hz' }))).toEqual(['+5Hz', '+5Hz']);
  expect(await run(narr({ pitch: '+5Hz' }))).toEqual([]);
  expect(await run(narr())).toHaveLength(2);
});

test('word times from a transcript: its temp file is removed, and a segment without words is no crash', async () => {
  const heard: TranscribeProvider = {
    id: 'heard', label: 'h', online: false, async check() { return { ok: true, detail: '' }; },
    async transcribe(_src, out) { writeFileSync(out, JSON.stringify({ language: 'zh', segments: [{ start: 0, end: 0.5, text: '' }, { start: 0, end: 2, text: '', words: [{ start: 0, end: 1, word: '你好' }, { start: 1, end: 2, word: '世界' }] }] })); },
  };
  const out = await renderVoice({ dir, narration: parseNarration({ scenes: [{ id: 'a', text: '你好，世界。' }] }), tts: fakeTts({ words: false }), transcribe: heard });
  expect(out.a.phrases).toEqual([{ text: '你好', t0: 0, t1: 1 }, { text: '世界', t0: 1, t1: 2 }]);
  expect(existsSync(`${voiceFiles(dir, 'a').info}.heard.json`)).toBe(false);
});

// showcase films (spec 2026-10-30 part 2): English narration and bilingual captions
test('an English point, comma or colon splits a phrase only before a space or the end: a web address and a number stay whole', () => {
  expect(phraseParts('Go to github.com/samuel325365/Tellcut. It is free, 3.5 MB.')).toEqual(['Go to github.com/samuel325365/Tellcut', 'It is free', '3.5 MB']);
  expect(phraseParts('Wait... what? Node.js:  yes')).toEqual(['Wait', 'what', 'Node.js', 'yes']);
  expect(phraseParts('你好，世界。好')).toEqual(['你好', '世界', '好']);
  expect(phraseParts('一二——三四')).toEqual(['一二', '三四']);
  expect(phraseParts('A—B')).toEqual(['A—B']);
});

test('a scene’s gloss has one translation per caption phrase; a count that differs lists the phrases', () => {
  const scene = { id: 's01', text: 'Import the folder, pick a preset.' };
  expect(parseNarration({ scenes: [{ ...scene, gloss: ['匯入資料夾', '選個片型'] }] }).scenes[0].gloss).toEqual(['匯入資料夾', '選個片型']);
  expect(parseNarration({ scenes: [scene] }).scenes[0].gloss).toBeUndefined();
  expect(() => parseNarration({ scenes: [{ ...scene, gloss: ['匯入資料夾，選個片型'] }] }))
    .toThrow(/2 句.*1 行[\s\S]*1\. Import the folder[\s\S]*2\. pick a preset/);
});
