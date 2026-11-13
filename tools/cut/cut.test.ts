// The Cut API (cut.ts): clips and photos on the main track, texts, effects and their tracks, theme, params, handles.
// Other topics are in cut-*.test.ts (speech, save, audio, framing, tighten, samples); their shared fixture in cut-test-kit.ts.
import { parseProject } from '@tellcut/engine';
import { flatlayClip } from '@tellcut/plugin-common';
import { fresh, items } from './cut-test-kit.ts';

test('clips and photos go one after another on the main track; a clip brings its own sound along', () => {
  const c = fresh();
  const a = c.clip('v', { from: 1, len: 2 });
  const b = c.photo('ph', { len: 3 });
  expect(items(c, 'v1').map((i) => [i.id, i.source, i.in, i.start, i.end])).toEqual([[a, 'v', 1, 0, 2], [b, 'ph', 0, 2, 5]]);
  expect(items(c, 'v1')[1].crop).toEqual({ from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.1 } });
  expect(items(c, 'orig').map((i) => [i.source, i.in, i.start, i.end, i.parent])).toEqual([['v', 1, 0, 2, a]]);
  expect(c.time).toBe(5);
  // the sound's fades are 0.1 s, at most a quarter of a short clip; footage without sound brings none
  const short = c.clip('v', { from: 3, len: 0.2 });
  expect(items(c, 'orig').find((i) => i.parent === short)).toMatchObject({ fadeIn: 0.05, fadeOut: 0.05 });
  expect(items(c, 'orig').find((i) => i.parent === a)).toMatchObject({ fadeIn: 0.1, fadeOut: 0.1 });
  const mute = fresh();
  mute.p.sources.v.audio = false;
  mute.clip('v', { from: 0, len: 2 });
  expect(items(mute, 'orig')).toEqual([]);
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

test('a dissolve overlaps the previous clip by its length (linked to the overlap)', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 2 });
  c.clip('v', { from: 5, len: 2, transition: { type: 'dissolve', dur: 0.5 } });
  expect(items(c, 'v1').map((i) => [i.start, i.end])).toEqual([[0, 2], [1.5, 3.5]]);
});

test('texts go on the text track (c.title a common.heading, speech common.caption captions attached to the clip); the end card comes last', () => {
  const c = fresh();
  c.title('京都', { at: 0, len: 3 });
  const a = c.clip('v', { from: 0, len: 4 });
  const caps = c.speechCaptions(a);
  c.endCard(['感謝觀看', '小明']);
  const t = items(c, 'text');
  expect(t.map((i) => [i.type, i.start, i.end, i.parent ?? null])).toEqual([
    ['common.heading', 0, 3, null], ['common.caption', 1, 2.5, a], ['common.outro', 4, 9, null],
  ]);
  expect([caps.length, t[1].params.text, t[2].params]).toEqual([1, '大家好', { look: 'credits', lines: '感謝觀看\n小明' }]);
});

test('c.lowerThird makes a common.heading in the lower-bar template and c.endCard a common.outro of credits (the core blocks are old)', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 4 });
  c.lowerThird('伏見稻荷', '京都', { at: 1, len: 2 });
  c.lowerThird('嵐山', '', { at: 3, size: 6 });
  c.endCard(['謝謝', '小明'], { len: 3, stagger: 0.4 });
  const t = items(c, 'text');
  expect(t.map((i) => [i.type, i.start, i.end, i.params])).toEqual([
    ['common.heading', 1, 3, { text: '伏見稻荷', sub: '京都', template: 'lower-bar' }],
    ['common.heading', 3, 6, { text: '嵐山', template: 'lower-bar', size: 6 }],
    ['common.outro', 6, 9, { look: 'credits', lines: '謝謝\n小明', beat: 0.4 }],
  ]);
  expect(c.notes).toEqual([]);
  // a param of the old blocks the new ones lack is named, not dropped without a word
  c.lowerThird('x', 'y', { background: '#000' });
  expect(c.notes.some((n) => n.includes('c.lowerThird') && n.includes('background'))).toBe(true);
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

test('block params named like an option of c.effect / c.sfx (at, who, len) go in params: {…}, which wins over the loose keys', () => {
  const c = fresh();
  const pencil = c.effect('common.progress', { at: 1, len: 4, mode: 'pencil', dots: 3, params: { at: '0.5,1.5,2.5,3.5' } });
  const quote = c.effect('common.quote', { at: 2, len: 2, text: 'hi', params: { who: 'a coach', text: 'hello' } });
  const shing = c.sfx('common.shing', { at: 3, len: 2, params: { len: 1.5 } });
  const byId = (id: string) => c.p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === id);
  expect([byId(pencil).start, byId(pencil).end, byId(pencil).params]).toEqual([1, 5, { mode: 'pencil', dots: 3, at: '0.5,1.5,2.5,3.5' }]);
  expect(byId(quote).params).toEqual({ text: 'hello', who: 'a coach' });
  expect([byId(shing).start, byId(shing).end, byId(shing).params]).toEqual([3, 5, { len: 1.5 }]);
  expect(() => c.effect('common.progress', { len: 1, params: 'at=1' as any })).toThrow(/params 要是物件/);
  // a script without params: {…} works as before
  expect(byId(c.effect('common.slam', { at: 0, len: 1, text: 'x' })).params).toEqual({ text: 'x' });
});

test('a gallery handle where a type id belongs is refused with the id it stands for', () => {
  const c = fresh();
  expect(() => c.effect('MRK-03', { at: 0, len: 1 })).toThrow(/MRK-03 是圖鑑代號.*c\.effect\('common\.stamp'/);
  expect(() => c.sfx('sfx-hit-2', { at: 0 })).toThrow(/c\.sfx\('common\.pop'/);
  expect(() => c.effect('ZZZ-09', { at: 0, len: 1 })).toThrow(/也沒有這個代號/);
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

test('new projects get English track names', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 2 });
  expect(c.p.tracks.map((t) => [t.id, t.name])).toEqual([['v1', 'Main'], ['text', 'Text'], ['music', 'Music'], ['orig', 'Source']]);
});

test('a time or a length that is not a number is refused at the call that got it, named; a song started past its end too', async () => {
  const c: any = fresh();
  c.clip('v', { len: 3 });
  expect(() => c.effect('common.caption', { at: 1, text: 'hi' })).toThrow("c.effect('common.caption') 的 len 要是數字，現在是 undefined");
  expect(() => c.title('hi', { at: 1, len: '2' })).toThrow('c.title 的 len 要是數字，現在是 "2"');
  expect(() => c.caption('hi', { at: Number('x'), len: 1 })).toThrow('c.caption 的 at 要是數字，現在是 NaN');
  expect(() => c.sfx('common.beep', { at: -1 })).toThrow("c.sfx('common.beep') 的 at 不能小於 0");
  expect(() => c.photo('ph', { len: 0 })).toThrow("c.photo('ph') 的 len 要大於 0");
  expect(() => c.clip('v', {})).toThrow("c.clip('v') 的 len 要是數字");
  expect(() => c.at(Number('x'))).toThrow('c.at 的時間 要是數字');
  expect(() => c.music('song', { from: 40 })).toThrow("c.music('song') 的 from 40 秒超過這首歌的長度（30 秒）");
  expect(() => c.music('song', { fadeIn: -1 })).toThrow('fadeIn 不能小於 0');
  // nothing refused reached the timeline or the film's length: it still saves, 3 s long
  expect(items(c, 'text')).toEqual([]);
  c.facesProvider = { id: 'none', check: async () => ({ ok: true }), detect: async () => [] };
  expect((await c.save()).meta.duration).toBe(3);
});

test("flatlayClip places the object's footage under the desk", () => {
  const c = fresh();
  const objects = JSON.stringify([{ kind: 'postcard', shot: 'v|2', at: 0.3 }, { kind: 'polaroid', shot: 'v|3|0.4,0.5,1.1', at: 1.5 }]);
  const id = c.effect('common.flatlay', { at: 4, len: 6, objects });
  const clip = c.flatlayClip(id, 1);
  const want = flatlayClip({ objects }, 1, 1920, 1080, 1920, 1080, 6)!;
  const v = items(c, 'v1').find((i) => i.id === clip);
  expect([v.source, v.in, v.start, v.end]).toEqual(['v', 3, 5.5, 10]);
  expect(v.crop).toEqual({ from: want.crop, to: want.crop });
  expect(items(c, 'orig').some((i) => i.parent === clip)).toBe(true);
  expect(() => c.flatlayClip(id, 1)).toThrow('擋住');
  expect(() => c.flatlayClip(id, 5)).toThrow('第 5 樣');
  // a shot near the end of its footage: the clip stops where the 10 s source does
  const d = fresh();
  const late = JSON.stringify([{ kind: 'postcard', shot: 'v|9', at: 0.3 }]);
  const lid = d.effect('common.flatlay', { at: 0, len: 6, objects: late });
  expect(flatlayClip({ objects: late }, 0, 1920, 1080, 1920, 1080, 6)!.len).toBeGreaterThan(1);
  const lclip = d.flatlayClip(lid, 0), lv = items(d, 'v1').find((i) => i.id === lclip);
  expect([lv.in, lv.start, lv.end]).toEqual([9, 0.3, 1.3]);
});

test('flatlayClip ends where the block says the object has left the desk, not at the item\'s end', () => {
  const c = fresh();
  const objects = JSON.stringify([{ kind: 'polaroid', shot: 'v|3', at: 1, exit: 'left', exitAt: 3 }]);
  const id = c.effect('common.flatlay', { at: 2, len: 6, objects });
  const want = flatlayClip({ objects }, 0, 1920, 1080, 1920, 1080, 6)!;
  const clip = c.flatlayClip(id, 0), v = items(c, 'v1').find((i) => i.id === clip);
  expect(want.len).toBeLessThan(6 - 1);   // the exit is over before the item ends
  expect([v.in, v.start, v.end]).toEqual([3, 3, +(3 + want.len).toFixed(6)]);
});
