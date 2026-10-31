// The Cut API and speech: finding words, bleeps and their stickers, speech and voice captions (karaoke, chunks, speakers, fixes).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTimes } from '@tellcut/engine';
import { Cut } from './cut.ts';
import { base, inv, fresh, items } from './cut-test-kit.ts';

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
